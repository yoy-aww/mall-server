/**
 * RAG 问答 —— 本地商品库检索 + LLM 生成。
 *
 * 前端浮窗只调 /api/rag/*。这里做两件事：
 *   1. 检索：用问题关键词在本地 SQLite 商品表打分，取 top-N 作为上下文。
 *   2. 生成：把上下文喂给 OpenAI 兼容 LLM（sensenova chat/completions），
 *      让它输出 {answer, product_ids, sources}，契约与前端 RagWidget 对齐。
 *
 * LLM 不可用时降级为"纯检索"：answer 给一段兜底文案，但仍返回商品推荐，
 * 保证浮窗永远有内容。
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// ---- LLM 配置（OpenAI 兼容 chat/completions）----
const LLM_BASE = process.env.LLM_API_BASE || 'https://token.sensenova.cn/v1/chat/completions';
const LLM_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'sensenova-6.8-flash-lite';
const LLM_TIMEOUT_MS = 60000;

// 检索规模
const TOP_K = 5;

// ---------- 1) 检索 ----------
function tokenize(q) {
  // 简单按 CJK 字 + 拉丁单词切分，去常见虚词，取去重 token
  const raw = String(q || '')
    .toLowerCase()
    .replace(/[，。！？、？！,.\n\t]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const stop = new Set(['的', '了', '有', '什么', '哪些', '怎么', '如何', '吗', '呢', '啊', '和', '与', 'a', 'the', 'is', 'do', 'i', 'what', 'which', 'how', 'can']);
  const toks = new Set();
  for (const w of raw) {
    if (stop.has(w)) continue;
    toks.add(w);
    // CJK 逐字切分（中文搜索词常是 2~4 字）
    for (const ch of w) {
      if (/[\u4e00-\u9fff]/.test(ch)) toks.add(ch);
    }
  }
  return [...toks];
}

function retrieve(question, topK = TOP_K) {
  const db = getDb();
  const toks = tokenize(question);
  const rows = db.prepare("SELECT * FROM products WHERE enabled = 1").all();
  const scored = rows.map(p => {
    const tags = safeTags(p.tags);
    const hay = [p.name, p.description || '', tags.join(' '), p.id].join(' ').toLowerCase();
    let score = 0;
    for (const t of toks) {
      if (!t) continue;
      if (p.name.toLowerCase().includes(t)) score += 5;   // 名称命中权重最高
      if (tags.some(x => x.toLowerCase().includes(t))) score += 3; // 标签命中
      if ((p.description || '').toLowerCase().includes(t)) score += 2; // 描述命中
      if (hay.includes(t)) score += 1; // 兜底全字段
    }
    // 少量随机性，避免同分结果死板
    return { p, score: score + Math.random() * 0.5 };
  }).sort((a, b) => b.score - a.score);

  // 没有命中任何 token 时（比如"有什么商品推荐"），返回热度/新上的前几
  const best = scored[0];
  const hit = best && best.score > 0.6;
  if (!hit) return rows.slice(0, topK); // 直接给前 N 个在售商品
  return scored.slice(0, topK).map(x => x.p);
}

function safeTags(s) {
  try { return Array.isArray(s) ? s : (s ? JSON.parse(s) : []); } catch { return []; }
}

function price(p) {
  return p.discountedPrice != null ? p.discountedPrice : p.originalPrice;
}

// ---------- 2) LLM 生成 ----------
async function llmAsk(question, ctxProducts) {
  const context = ctxProducts.map((p, i) =>
    `[${i + 1}] id=${p.id} 名称=${p.name} 价格=${price(p)}元 标签=${safeTags(p.tags).join('/')} 描述=${(p.description || '').slice(0, 80)}`
  ).join('\n');

  const system = `你是商城智能客服。下面是当前在售商品（编号 1~${ctxProducts.length}）：
${context}

请基于这些商品回答用户问题。要求：
- 只推荐上面列表里的商品，用它们的真实 id。
- 语气友好、简洁，中文。
- 若用户问非商品类问题（运费/退换货/订单等），可简要说明并建议查看对应页面。
- 严格输出 JSON，不要多余文字，格式：
{"answer":"给用户的完整回答","product_ids":["要推荐的商品id",...],"sources":[{"doc":"商品名","text":"引用到的商品说明或标签"}]}`;

  const resp = await fetch(LLM_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LLM_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: question },
      ],
      temperature: 0.3,
      max_tokens: 512,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!resp.ok) throw new Error(`LLM ${resp.status}`);
  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content || '';
  // 容错解析：可能带 ```json 包裹或前后说明文字
  const m = raw.match(/\{[\s\S]*\}/);
  let parsed = null;
  if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = null; } }
  if (!parsed) return { answer: raw.trim(), product_ids: [], sources: [] };
  return {
    answer: parsed.answer || raw.trim(),
    product_ids: Array.isArray(parsed.product_ids) ? parsed.product_ids : [],
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
  };
}

// ---------- 3) 路由 ----------
router.post('/ask', async (req, res) => {
  const question = String(req.body?.question || '').trim() || '有什么商品推荐';
  const ctx = retrieve(question);

  // 用 ctx 的 id 兜底，确保即使 LLM 没给也一定有商品
  const fallbackIds = ctx.map(p => p.id);

  try {
    const r = await llmAsk(question, ctx);
    // LLM 返回的商品 id 校验：只保留确实存在的
    const validIds = r.product_ids.filter(id => ctx.some(p => p.id === id));
    res.json({
      success: true,
      answer: r.answer || defaultAnswer(ctx),
      sources: r.sources || ctx.map(p => ({ doc: p.name, text: (p.description || safeTags(p.tags).join('、')).slice(0, 80) })),
      product_ids: validIds.length ? validIds : fallbackIds,
    });
  } catch (e) {
    // 降级：纯检索结果，保证永远有商品
    res.json({
      success: true,
      degraded: true,
      answer: defaultAnswer(ctx),
      sources: ctx.map(p => ({ doc: p.name, text: (p.description || safeTags(p.tags).join('、')).slice(0, 80) })),
      product_ids: fallbackIds,
    });
  }
});

// 纯检索也暴露出来（管理后台/调试用）
router.post('/search', (req, res) => {
  const question = String(req.body?.question || req.body?.q || '').trim();
  const ctx = retrieve(question);
  res.json({
    success: true,
    data: ctx.map(p => ({
      id: p.id, name: p.name, image: p.image,
      price: price(p), tags: safeTags(p.tags), description: p.description || '',
    })),
  });
});

function defaultAnswer(ctx) {
  if (!ctx.length) return '目前暂时没有合适的商品推荐，看看其他分类吧～';
  const top = ctx.slice(0, 3).map(p => p.name).join('、');
  return `根据你的需求，给你推荐这几款：${top}。点开卡片看看细节吧～`;
}

module.exports = router;
