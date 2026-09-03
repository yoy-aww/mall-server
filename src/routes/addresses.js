const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('./auth');

function ok(res, data) { res.json({ success: true, data }); }
function fail(res, msg, status = 400) { res.status(status).json({ success: false, error: msg }); }

// GET /api/addresses — 当前用户的地址列表
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM addresses WHERE userId = ? ORDER BY isDefault DESC, createdAt DESC').all(req.user.id);
  ok(res, rows);
});

// POST /api/addresses — 新增地址
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { label, receiverName, receiverPhone, province, city, address, isDefault } = req.body;
  if (!receiverName || !receiverPhone || !address) return fail(res, '收件人、手机、地址为必填');

  const id = 'addr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  if (isDefault) {
    db.prepare('UPDATE addresses SET isDefault = 0 WHERE userId = ?').run(req.user.id);
  }

  db.prepare(
    'INSERT INTO addresses (id, userId, label, receiverName, receiverPhone, province, city, address, isDefault) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.user.id, label || '默认', receiverName, receiverPhone, province || '', city || '', address, isDefault ? 1 : 0);

  ok(res, { id });
});

// PUT /api/addresses/:id — 更新地址
router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM addresses WHERE id = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!existing) return fail(res, '地址不存在', 404);

  const { label, receiverName, receiverPhone, province, city, address, isDefault } = req.body;

  if (isDefault && !existing.isDefault) {
    db.prepare('UPDATE addresses SET isDefault = 0 WHERE userId = ?').run(req.user.id);
  }

  db.prepare(
    `UPDATE addresses SET label=?, receiverName=?, receiverPhone=?, province=?, city=?, address=?, isDefault=? WHERE id=?`
  ).run(
    label ?? existing.label, receiverName ?? existing.receiverName,
    receiverPhone ?? existing.receiverPhone, province ?? existing.province,
    city ?? existing.city, address ?? existing.address,
    isDefault !== undefined ? (isDefault ? 1 : 0) : existing.isDefault,
    req.params.id
  );
  ok(res, { id: req.params.id });
});

// DELETE /api/addresses/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM addresses WHERE id = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!existing) return fail(res, '地址不存在', 404);

  const result = db.prepare('DELETE FROM addresses WHERE id = ?').run(req.params.id);
  ok(res, { deleted: req.params.id });
});

module.exports = router;
