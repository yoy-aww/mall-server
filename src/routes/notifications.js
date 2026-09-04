const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('./auth');
const { verifyToken } = require('../auth');

function ok(res, data) { res.json({ success: true, data }); }
function fail(res, msg, status = 400) { res.status(status).json({ success: false, error: msg }); }

// ========== SSE 连接管理 ==========

/** @type {Map<string, Set<import('http').ServerResponse>>} */
const clients = new Map(); // userId -> Set<res>

// GET /api/notifications/stream — SSE 实时推送
// EventSource 不支持自定义 header，所以用 query 参数传 auth
router.get('/stream', (req, res) => {
  const token = req.query.auth;
  if (!token) return fail(res, '未登录', 401);
  const userId = verifyToken(token);
  if (!userId) return fail(res, '登录已过期', 401);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);

  req.on('close', () => {
    const set = clients.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) clients.delete(userId);
    }
  });
});

/**
 * 向指定用户推送通知事件（从 orders.js 等路由调用）
 * @param {string} userId
 * @param {object} notification 通知对象
 */
function push(userId, notification) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const msg = `data: ${JSON.stringify({ type: 'notification', notification })}\n\n`;
  for (const res of set) {
    try { res.write(msg); } catch { /* 写入失败忽略，下次 close 清理 */ }
  }
}

// GET /api/notifications — 当前用户的消息列表（含未读计数）
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const list = db.prepare('SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC').all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) as cnt FROM notifications WHERE userId = ? AND read = 0').get(req.user.id).cnt;
  ok(res, { list, unread });
});

// PUT /api/notifications/:id/read — 标已读
router.put('/:id/read', requireAuth, (req, res) => {
  const db = getDb();
  const n = db.prepare('SELECT * FROM notifications WHERE id = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!n) return fail(res, '消息不存在', 404);
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
  ok(res, { id: req.params.id, read: 1 });
});

// PUT /api/notifications/all/read — 全部已读
router.put('/all/read', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET read = 1 WHERE userId = ?').run(req.user.id);
  ok(res, { read: true });
});

module.exports = router;
module.exports.push = push;

// ========== Admin endpoints ==========

// GET /api/notifications/admin-list — 管理员查看所有通知（含用户信息）
router.get('/admin-list', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return fail(res, '无权限', 403);
  const db = getDb();
  const list = db.prepare(`
    SELECT n.*, u.username, u.nickname
    FROM notifications n
    LEFT JOIN users u ON n.userId = u.id
    ORDER BY n.createdAt DESC
  `).all();
  ok(res, list);
});

// DELETE /api/notifications/:id — 管理员删除通知
router.delete('/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return fail(res, '无权限', 403);
  const db = getDb();
  const result = db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return fail(res, '通知不存在', 404);
  ok(res, { deleted: req.params.id });
});
