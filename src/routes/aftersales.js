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

// 分页参数解析：GET ?page=1&limit=20
// 不传则不分页，保持向后兼容
function parsePagination(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
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

// GET /api/aftersales — 当前用户售后列表（支持 ?page=&limit=）
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { page, limit, offset } = parsePagination(req);
  const usePage = req.query.page || req.query.limit;
  const total = db.prepare('SELECT COUNT(*) as total FROM aftersales WHERE userId = ?').get(req.user.id).total;

  let rows;
  if (usePage) {
    rows = db.prepare('SELECT * FROM aftersales WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?').all(req.user.id, limit, offset);
  } else {
    rows = db.prepare('SELECT * FROM aftersales WHERE userId = ? ORDER BY createdAt DESC').all(req.user.id);
  }

  if (usePage) ok(res, { list: rows.map(rowTo), total, page, limit });
  else ok(res, rows.map(rowTo));
});

// GET /api/aftersales/admin — 管理员售后列表（支持 ?page=&limit=&status=）
router.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { page, limit, offset } = parsePagination(req);
  const usePage = req.query.page || req.query.limit;

  let where = '1=1';
  const params = [];
  if (req.query.status) { where += ' AND status = ?'; params.push(req.query.status); }

  const total = db.prepare(`SELECT COUNT(*) as total FROM aftersales WHERE ${where}`).get(...params).total;
  let rows;
  if (usePage) {
    rows = db.prepare(`SELECT * FROM aftersales WHERE ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  } else {
    rows = db.prepare(`SELECT * FROM aftersales WHERE ${where} ORDER BY createdAt DESC`).all(...params);
  }

  if (usePage) ok(res, { list: rows.map(rowTo), total, page, limit });
  else ok(res, rows.map(rowTo));
});

// GET /api/aftersales/:id — 详情（仅本人或管理员）
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM aftersales WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, '售后不存在', 404);
  if (row.userId !== req.user.id && req.user.role !== 'admin') return fail(res, '无权限', 403);
  ok(res, rowTo(row));
});

// POST /api/aftersales — 申请售后（需登录）
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { orderId, items, reason, description, images } = req.body;
  if (!orderId || !reason) return fail(res, '订单号、原因为必填');

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(orderId, req.user.id);
  if (!order) return fail(res, '订单不存在或无权操作', 404);
  const allowed = ['paid', 'shipped', 'delivered', 'completed'];
  if (!allowed.includes(order.status)) return fail(res, `订单状态为 ${order.status}，不可申请售后`);

  // items 未传则从订单自动取（前端传空数组时的兜底）
  const resolvedItems = (items && items.length > 0) ? items : (order.items ? JSON.parse(order.items) : []);
  if (resolvedItems.length === 0) return fail(res, '订单中没有商品，无法申请售后');

  const id = 'aft_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  db.prepare(
    'INSERT INTO aftersales (id, orderId, userId, orderStatus, items, reason, description, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, orderId, req.user.id, order.status, JSON.stringify(resolvedItems), reason, description || '', JSON.stringify(images || []));

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
  // 审核通过 → 恢复库存 + 更新状态（同一事务）
  db.transaction(() => {
    db.prepare('UPDATE aftersales SET status = ?, handleReason = ?, handledAt = ? WHERE id = ?')
      .run(status, handleReason || '', now, req.params.id);

    if (status === 'approved') {
      const items = existing.items ? JSON.parse(existing.items) : [];
      for (const item of items) {
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.productId);
      }
    }
  })();

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
