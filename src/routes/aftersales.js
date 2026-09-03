const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('./auth');

function ok(res, data) { res.json({ success: true, data }); }
function fail(res, msg, status = 400) { res.status(status).json({ success: false, error: msg }); }
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return fail(res, '无权限', 403);
  next();
}

function rowTo(r) {
  if (!r) return null;
  return {
    ...r,
    items: r.items ? JSON.parse(r.items) : [],
    images: r.images ? JSON.parse(r.images) : [],
    handleReason: r.handleReason || undefined,
    handledAt: r.handledAt || undefined,
  };
}

// GET /api/aftersales — 当前用户售后列表
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM aftersales WHERE userId = ? ORDER BY createdAt DESC').all(req.user.id);
  ok(res, rows.map(rowTo));
});

// GET /api/aftersales/admin — 管理员售后列表
router.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM aftersales ORDER BY createdAt DESC').all();
  ok(res, rows.map(rowTo));
});

// GET /api/aftersales/:id — 详情
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM aftersales WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, '售后不存在', 404);
  ok(res, rowTo(row));
});

// POST /api/aftersales — 申请售后（需登录）
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { orderId, items, reason, description, images } = req.body;
  if (!orderId || !items || !reason) return fail(res, '订单号、商品、原因为必填');

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(orderId, req.user.id);
  if (!order) return fail(res, '订单不存在或无权操作', 404);
  const allowed = ['paid', 'shipped', 'delivered', 'completed'];
  if (!allowed.includes(order.status)) return fail(res, `订单状态为 ${order.status}，不可申请售后`);

  const id = 'aft_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  db.prepare(
    'INSERT INTO aftersales (id, orderId, userId, orderStatus, items, reason, description, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, orderId, req.user.id, order.status, JSON.stringify(items), reason, description || '', JSON.stringify(images || []));

  ok(res, { id });
});

// PUT /api/aftersales/:id/status — 管理员处理（审核）
router.put('/:id/status', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM aftersales WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '售后不存在', 404);

  const { status, handleReason } = req.body;
  const valid = ['approved', 'rejected'];
  if (!valid.includes(status)) return fail(res, `无效状态: ${status}`);

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('UPDATE aftersales SET status = ?, handleReason = ?, handledAt = ? WHERE id = ?')
    .run(status, handleReason || '', now, req.params.id);

  // 审核通过 → 恢复库存
  if (status === 'approved') {
    const items = existing.items ? JSON.parse(existing.items) : [];
    db.transaction(() => {
      for (const item of items) {
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.productId);
      }
    })();
  }

  ok(res, { id: req.params.id, status, handledAt: now });
});

// DELETE /api/aftersales/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM aftersales WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return fail(res, '售后不存在', 404);
  ok(res, { deleted: req.params.id });
});

module.exports = router;
