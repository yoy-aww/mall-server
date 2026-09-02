const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

function ok(res, data) { res.json({ success: true, data }); }
function fail(res, msg, status = 400) { res.status(status).json({ success: false, error: msg }); }

// 行 → 订单对象
function rowToOrder(row) {
  if (!row) return null;
  return {
    ...row,
    items: row.items ? JSON.parse(row.items) : [],
    paidAt: row.paidAt || undefined,
    shippedAt: row.shippedAt || undefined,
    remark: row.remark || undefined,
  };
}

// GET /api/orders — 所有订单（按创建时间倒序）
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM orders ORDER BY createdAt DESC').all();
  ok(res, rows.map(rowToOrder));
});

// GET /api/orders/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, '订单不存在', 404);
  ok(res, rowToOrder(row));
});

// PUT /api/orders/:id/status — 更新订单状态
router.put('/:id/status', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '订单不存在', 404);

  const { status } = req.body;
  const valid = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'completed'];
  if (!valid.includes(status)) return fail(res, `无效状态: ${status}`);

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let paidAt = existing.paidAt;
  let shippedAt = existing.shippedAt;

  if (status === 'paid' && !paidAt) paidAt = now;
  if (status === 'shipped' && !shippedAt) shippedAt = now;

  db.prepare(
    'UPDATE orders SET status=?, paidAt=?, shippedAt=? WHERE id=?'
  ).run(status, paidAt, shippedAt, req.params.id);
  ok(res, { id: req.params.id, status });
});

// PUT /api/orders/:id — 更新订单（如发货信息）
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '订单不存在', 404);

  const { status, receiverName, receiverPhone, shippingAddress, remark } = req.body;

  let paidAt = existing.paidAt;
  let shippedAt = existing.shippedAt;
  if (status === 'paid' && !paidAt) {
    paidAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  if (status === 'shipped' && !shippedAt) {
    shippedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  db.prepare(
    `UPDATE orders SET status=?, receiverName=?, receiverPhone=?, shippingAddress=?, remark=?, paidAt=?, shippedAt=? WHERE id=?`
  ).run(
    status ?? existing.status,
    receiverName ?? existing.receiverName,
    receiverPhone ?? existing.receiverPhone,
    shippingAddress ?? existing.shippingAddress,
    remark ?? existing.remark,
    paidAt,
    shippedAt,
    req.params.id
  );
  ok(res, { id: req.params.id });
});

// DELETE /api/orders/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return fail(res, '订单不存在', 404);
  ok(res, { deleted: req.params.id });
});

module.exports = router;
