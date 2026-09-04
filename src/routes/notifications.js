const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('./auth');

function ok(res, data) { res.json({ success: true, data }); }
function fail(res, msg, status = 400) { res.status(status).json({ success: false, error: msg }); }

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
