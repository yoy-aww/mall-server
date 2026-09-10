/**
 * RAG 问答代理 —— 商城前端浮窗的入口。
 *
 * 为什么走代理：RAG 服务的租户 API key 是凭据，不能暴露给浏览器。
 * 前端只调本服务的 /api/rag/*，由后端持有 key 转发到 RAG 服务。
 */
const express = require('express');
const router = express.Router();

const RAG_BASE = process.env.RAG_BASE_URL || 'http://localhost:8000';
const RAG_API_KEY = process.env.RAG_API_KEY || '';
const TIMEOUT_MS = 180000; // 对齐 RAG 端 LLM_TIMEOUT，问答可能慢

async function proxy(req, res, path) {
  const headers = { 'Content-Type': 'application/json' };
  if (RAG_API_KEY) headers['X-API-Key'] = RAG_API_KEY;
  try {
    const resp = await fetch(`${RAG_BASE}${path}`, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    res.status(resp.status).json(data);
  } catch (e) {
    res.status(502).json({ success: false, error: `RAG 服务不可达: ${e.message}` });
  }
}

// POST /api/rag/ask — 智能问答
router.post('/ask', (req, res) => proxy(req, res, '/ask'));

// POST /api/rag/search — 纯检索
router.post('/search', (req, res) => proxy(req, res, '/search'));

module.exports = router;
