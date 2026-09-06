const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('./auth');
const { verifySseTicket, issueSseTicket, SSE_TICKET_TTL_MS } = require('../auth');

function ok(res, data) { res.json({ success: true, data }); }
function fail(res, msg, status = 400) { res.status(status).json({ success: false, error: msg }); }

// ========== SSE 连接管理 ==========

/** @type {Map<string, Set<import('http').ServerResponse>>} */
const clients = new Map(); // userId -> Set<res>

// POST /api/notifications/ticket — 用长期 token 换一次性 SSE ticket（默认 60 秒）
// EventSource 不能带自定义 header，直接把 Bearer token 放 query 会进 access log，
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

  // 设置 SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // 发送已有未读通知
  const unread = db.prepare('SELECT * FROM notifications WHERE userId = ? AND isRead = 0 ORDER BY createdAt DESC LIMIT 20').all(userId);
  for (const n of unread) {
    res.write(`event: notification\ndata: ${JSON.stringify(n)}\n\n`);
  }
  res.write(`event: hello\ndata: ${JSON.stringify({ userId, ts: Date.now() })}\n\n`);

  // 注册到连接池
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);

  // 心跳（每 30s）
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  // 客户端断开
  req.on('close', () => {
    clearInterval(heartbeat);
    const set = clients.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) clients.delete(userId);
    }
  });
});

// GET /api/notifications — 通知列表（分页）
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { limit = 20, offset = 0 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 20, 100);
  const off = Math.max(parseInt(offset, 10) || 0, 0);

  const rows = db.prepare(
    'SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?'
  ).all(req.user.id, lim, off);
  const total = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE userId = ?').get(req.user.id).c;
  const unreadCount = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE userId = ? AND isRead = 0').get(req.user.id).c;

  ok(res, { list: rows, total, unreadCount, limit: lim, offset: off });
});

// POST /api/notifications/:id/read
router.post('/:id/read', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?')
    .run(req.params.id, req.user.id);
  ok(res, { id: req.params.id });
});

// POST /api/notifications/read-all
router.post('/read-all', requireAuth, (req, res) => {
  const db = getDb();
  const result = db.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0')
    .run(req.user.id);
  ok(res, { count: result.changes });
});

// POST /api/notifications/mark-read — 同 read-all（兼容旧路径）
router.post('/mark-read', requireAuth, (req, res) => {
  const db = getDb();
  const result = db.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0')
    .run(req.user.id);
  ok(res, { count: result.changes });
});

// ========== 广播函数（供其他路由调用） ==========

function broadcast(event, data) {
  if (!clients.size) return;
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, set] of clients) {
    for (const res of set) {
      try { res.write(message); } catch { /* ignore */ }
    }
  }
}

// 直接把 router 作为默认导出，附加 broadcast 函数供外部调用
router.broadcast = broadcast;
router.SSE_TICKET_TTL_MS = SSE_TICKET_TTL_MS;
module.exports = router;
