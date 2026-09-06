const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth, requireAdmin } = require('./auth');
const { verifySseTicket, issueSseTicket, SSE_TICKET_TTL_MS } = require('../auth');
const sse = require('../utils/notification');
const { parsePaging } = require('../utils/paging');

function ok(res, data) { res.json({ success: true, data }); }
function fail(res, msg, status = 400) { res.status(status).json({ success: false, error: msg }); }

const VALID_TYPES = ['system', 'order', 'promotion', 'aftersale', 'review'];

// ==================== SSE ticket / stream ====================

// POST /api/notifications/ticket — 用长期 token 换一次性 SSE ticket（默认 60 秒）
// EventSource 不能带自定义 header，直接把 Bearer token 塞 query 会进 access log，
// 所以先 POST 一次换短 ticket，EventSource 只带这个短 ticket。
router.post('/ticket', requireAuth, (req, res) => {
  const { ticket, ttlMs } = issueSseTicket(req.user.id);
  ok(res, { ticket, ttlMs });
});

// GET /api/notifications/stream — SSE 实时推送
// EventSource 用一次性 ticket 认证（?ticket=sse_xxx）
router.get('/stream', (req, res) => {
  const ticket = req.query.ticket;
  if (!ticket) return fail(res, '缺少 ticket', 401);
  const userId = verifySseTicket(ticket);
  if (!userId) return fail(res, 'ticket 无效或已过期', 401);

  const db = getDb();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // 发送已有未读通知
  const unread = db.prepare(
    'SELECT * FROM notifications WHERE userId = ? AND isRead = 0 ORDER BY createdAt DESC LIMIT 20'
  ).all(userId);
  for (const n of unread) {
    res.write(`event: notification\ndata: ${JSON.stringify(n)}\n\n`);
  }
  res.write(`event: hello\ndata: ${JSON.stringify({ userId, ts: Date.now() })}\n\n`);

  sse.register(userId, res);

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sse.unregister(userId, res);
  });
});

// ==================== 本人通知 ====================

// GET /api/notifications — 通知列表（分页 + 高级过滤）
// 支持 query: limit, offset, page, type, unread (0/1), q (搜 title/content)
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const p = parsePaging(req.query);

  const clauses = ['userId = ?'];
  const params = [req.user.id];

  if (req.query.type && VALID_TYPES.includes(req.query.type)) {
    clauses.push('type = ?');
    params.push(req.query.type);
  }
  if (req.query.unread === '1' || req.query.unread === 'true') {
    clauses.push('isRead = 0');
  } else if (req.query.unread === '0' || req.query.unread === 'false') {
    clauses.push('isRead = 1');
  }
  if (req.query.q) {
    clauses.push('(title LIKE ? OR content LIKE ?)');
    params.push(`%${req.query.q}%`, `%${req.query.q}%`);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;

  const rows = db.prepare(
    `SELECT * FROM notifications ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`
  ).all(...params, ...p.params);
  const total = db.prepare(`SELECT COUNT(*) as c FROM notifications ${where}`).get(...params).c;
  const unreadCount = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE userId = ? AND isRead = 0')
    .get(req.user.id).c;

  ok(res, { list: rows, unreadCount, pagination: p.toMeta(total) });
});

// GET /api/notifications/:id — 单条详情（同时置为已读，如果未读）
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM notifications WHERE id = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!row) return fail(res, '通知不存在', 404);
  if (!row.isRead) {
    db.prepare('UPDATE notifications SET isRead = 1 WHERE id = ?').run(req.params.id);
    row.isRead = 1;
  }
  ok(res, row);
});

// POST /api/notifications/:id/read — 单条标记已读
router.post('/:id/read', requireAuth, (req, res) => {
  const db = getDb();
  const r = db.prepare('UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ? AND isRead = 0')
    .run(req.params.id, req.user.id);
  ok(res, { id: req.params.id, changed: r.changes > 0 });
});

// POST /api/notifications/:id/unread — 单条标记未读（撤销误点）
router.post('/:id/unread', requireAuth, (req, res) => {
  const db = getDb();
  const r = db.prepare('UPDATE notifications SET isRead = 0 WHERE id = ? AND userId = ?')
    .run(req.params.id, req.user.id);
  if (r.changes === 0) return fail(res, '通知不存在', 404);
  ok(res, { id: req.params.id });
});

// DELETE /api/notifications/:id — 删除单条
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const r = db.prepare('DELETE FROM notifications WHERE id = ? AND userId = ?').run(req.params.id, req.user.id);
  if (r.changes === 0) return fail(res, '通知不存在', 404);
  ok(res, { deleted: req.params.id });
});

// POST /api/notifications/read-all — 全部标记已读
// 支持 ?type=xxx 只清指定类型的未读
router.post('/read-all', requireAuth, (req, res) => {
  const db = getDb();
  let r;
  if (req.query.type && VALID_TYPES.includes(req.query.type)) {
    r = db.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0 AND type = ?')
      .run(req.user.id, req.query.type);
  } else {
    r = db.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0')
      .run(req.user.id);
  }
  ok(res, { count: r.changes });
});

// POST /api/notifications/mark-read — 兼容旧路径
router.post('/mark-read', requireAuth, (req, res) => {
  const db = getDb();
  const r = db.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0').run(req.user.id);
  ok(res, { count: r.changes });
});

// ==================== 管理员 ====================

// GET /api/notifications/global — 全局通知（管理员，跨用户）
// query: userId, type, unread, q, limit, page/offset
router.get('/global', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const p = parsePaging(req.query);

  const clauses = [];
  const params = [];
  if (req.query.userId) { clauses.push('userId = ?'); params.push(req.query.userId); }
  if (req.query.type && VALID_TYPES.includes(req.query.type)) { clauses.push('type = ?'); params.push(req.query.type); }
  if (req.query.unread === '1' || req.query.unread === 'true') clauses.push('isRead = 0');
  if (req.query.q) {
    clauses.push('(title LIKE ? OR content LIKE ?)');
    params.push(`%${req.query.q}%`, `%${req.query.q}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = db.prepare(
    `SELECT * FROM notifications ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`
  ).all(...params, ...p.params);
  const total = db.prepare(`SELECT COUNT(*) as c FROM notifications ${where}`).get(...params).c;

  ok(res, { list: rows, pagination: p.toMeta(total) });
});

// POST /api/notifications/broadcast — 广播通知给指定用户或所有人（管理员）
// body: { userId?, userIds?, title, content, type?, relatedId? }
//   userIds 优先于 userId；两者都不传则广播给所有用户
router.post('/broadcast', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { title, content, type = 'system', relatedId = '', userId, userIds } = req.body || {};
  if (!title || !content) return fail(res, 'title 和 content 为必填');
  if (!VALID_TYPES.includes(type)) return fail(res, `无效 type: ${type}（可选 ${VALID_TYPES.join('/')}）`);

  // 解析目标用户列表
  let targets = [];
  if (Array.isArray(userIds) && userIds.length) {
    targets = userIds;
  } else if (userId) {
    targets = [userId];
  } else {
    // 广播给所有未禁用用户
    targets = db.prepare("SELECT id FROM users WHERE disabled = 0").all().map(u => u.id);
  }
  if (targets.length === 0) return fail(res, '没有可推送的目标用户');

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const nidPrefix = Date.now().toString(36);
  const insert = db.prepare(
    'INSERT INTO notifications (id, userId, type, title, content, relatedId, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
  );
  const ssePayloads = [];

  db.transaction(() => {
    for (const uid of targets) {
      const nid = `n_${nidPrefix}_${Math.random().toString(36).slice(2, 6)}`;
      insert.run(nid, uid, type, title, content, relatedId, now);
      ssePayloads.push({ userId: uid, notification: { id: nid, userId: uid, type, title, content, relatedId, isRead: 0, createdAt: now } });
    }
  })();

  let delivered = 0;
  for (const p of ssePayloads) {
    try { delivered += sse.pushNotification(p.userId, p.notification); } catch { /* ignore */ }
  }

  ok(res, {
    sent: targets.length,
    deliveredToLiveSse: delivered,
    createdAt: now,
  });
});

// 兼容旧调用点
router.broadcast = sse.broadcast;
router.pushNotification = sse.pushNotification;
router.SSE_TICKET_TTL_MS = SSE_TICKET_TTL_MS;

module.exports = router;
