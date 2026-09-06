const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth, requireAdmin } = require('./auth');
const { pushNotification } = require('../utils/notification');
const orderUtil = require('../utils/order');

function ok(res, data) { res.json({ success: true, data }); }
function fail(res, msg, status = 400) { res.status(status).json({ success: false, error: msg }); }

// 运费规则（后端为唯一计价源）
const SHIPPING_RULES = {
  standard: { fee: 8, freeThreshold: 199 },
  sfx: { fee: 15, freeThreshold: Infinity },
};

function calculateShippingFee(subtotal, method) {
  const rule = SHIPPING_RULES[method] || SHIPPING_RULES.standard;
  const shippingFee = (rule.freeThreshold < Infinity && subtotal >= rule.freeThreshold) ? 0 : rule.fee;
  return { shippingFee, subtotal, total: subtotal + shippingFee, free: shippingFee === 0 };
}

function resolveItemsFromDb(db, items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('商品不能为空');
  const resolved = [];
  let subtotal = 0;
  for (const item of items) {
    const productId = item.productId;
    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    if (!productId) throw new Error('productId 必填');
    const product = db.prepare('SELECT id, name, discountedPrice, originalPrice, stock FROM products WHERE id = ?').get(productId);
    if (!product) throw new Error(`${productId} 不存在`);
    if (product.stock < qty) throw new Error(`${product.name} 库存不足（剩 ${product.stock} 件）`);
    const price = product.discountedPrice || product.originalPrice;
    subtotal += price * qty;
    resolved.push({ productId, productName: product.name, price, quantity: qty });
  }
  return { resolved, subtotal };
}

function rowToOrder(row) {
  return {
    ...row,
    items: safeParse(row.items, []),
  };
}

function safeParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

/**
 * 校验订单归属：本人或管理员
 */
function canAccessOrder(order, user) {
  return order && (order.userId === user.id || user.role === 'admin');
}

// POST /api/orders/preview — 报价（前端展示金额用），不扣库存
router.post('/preview', requireAuth, (req, res) => {
  const db = getDb();
  const { items, shippingMethod } = req.body || {};
  try {
    const { resolved, subtotal } = resolveItemsFromDb(db, items);
    const method = SHIPPING_RULES[shippingMethod] ? shippingMethod : 'standard';
    const { shippingFee, total, free } = calculateShippingFee(subtotal, method);
    ok(res, {
      items: resolved,
      subtotal, shippingFee, total, free, shippingMethod: method,
    });
  } catch (err) {
    fail(res, err.message);
  }
});

// POST /api/orders — 创建订单
router.post('/', requireAuth, (req, res) => {
  const user = req.user;
  const db = getDb();
  const { items, shippingMethod, shippingAddress, receiverName, receiverPhone, remark } = req.body;
  if (!items || items.length === 0 || !receiverName || !receiverPhone || !shippingAddress) {
    return fail(res, 'items, 收件人信息为必填');
  }
  if (!SHIPPING_RULES[shippingMethod] && shippingMethod !== undefined) {
    return fail(res, `无效配送方式: ${shippingMethod}`);
  }

  try {
    const result = db.transaction(() => {
      const { resolved, subtotal } = resolveItemsFromDb(db, items);
      const method = SHIPPING_RULES[shippingMethod] ? shippingMethod : 'standard';
      const { shippingFee, total, free } = calculateShippingFee(subtotal, method);

      for (const item of resolved) {
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.quantity, item.productId);
      }

      const id = 'ORD' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
      const storedItems = resolved;
      db.prepare(
        'INSERT INTO orders (id, userId, status, items, totalAmount, shippingFee, subtotal, shippingMethod, shippingAddress, receiverName, receiverPhone, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, user.id, 'pending', JSON.stringify(storedItems), total, shippingFee, subtotal, method, shippingAddress, receiverName, receiverPhone, remark || '');

      return { id, subtotal, shippingFee, total, free, shippingMethod: method };
    })();

    ok(res, result);
  } catch (err) {
    fail(res, err.message || '库存不足');
  }
});

// GET /api/orders — 列表
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { userId, status, limit = 20, offset = 0 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 20, 100);
  const off = Math.max(parseInt(offset, 10) || 0, 0);

  let where = '';
  const params = [];
  const filterUserId = userId || (req.user.role !== 'admin' ? req.user.id : null);
  if (filterUserId) { where += 'WHERE userId = ?'; params.push(filterUserId); }
  if (status) { where += (where ? ' AND ' : 'WHERE ') + 'status = ?'; params.push(status); }

  const total = db.prepare(`SELECT COUNT(*) as c FROM orders ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM orders ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`)
    .all(...params, lim, off);
  ok(res, { list: rows.map(rowToOrder), total, limit: lim, offset: off });
});

// GET /api/orders/admin/stats — 管理员订单统计
router.get('/admin/stats', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const countByStatus = db.prepare(
    'SELECT status, COUNT(*) as c FROM orders GROUP BY status'
  ).all();
  const revenuePaid = db.prepare(
    "SELECT COALESCE(SUM(totalAmount), 0) as revenue FROM orders WHERE status IN ('paid', 'shipped', 'delivered', 'completed')"
  ).get().revenue;
  const revenueCompleted = db.prepare(
    "SELECT COALESCE(SUM(totalAmount), 0) as revenue FROM orders WHERE status = 'completed'"
  ).get().revenue;
  ok(res, { countByStatus, revenuePaid, revenueCompleted });
});

// GET /api/orders/:id — 详情
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, '订单不存在', 404);
  if (!canAccessOrder(row, req.user)) return fail(res, '无权限', 403);
  ok(res, rowToOrder(row));
});

// POST /api/orders/:id/payment — 支付（本人或管理员，pending → paid）
router.post('/:id/payment', requireAuth, (req, res) => {
  const r = orderUtil.applyStatusChange({
    orderId: req.params.id,
    toStatus: 'paid',
    operatorId: req.user.id,
    operatorIsAdmin: req.user.role === 'admin',
    pushNotification,
  });
  if (!r.ok) return fail(res, r.error, r.status || 400);
  ok(res, r.data);
});

// POST /api/orders/:id/cancel — 取消（本人或管理员，pending/paid → cancelled）
router.post('/:id/cancel', requireAuth, (req, res) => {
  const { reason } = req.body || {};
  const r = orderUtil.applyStatusChange({
    orderId: req.params.id,
    toStatus: 'cancelled',
    operatorId: req.user.id,
    operatorIsAdmin: req.user.role === 'admin',
    reason: (reason || '').slice(0, 200),
    pushNotification,
  });
  if (!r.ok) return fail(res, r.error, r.status || 400);
  ok(res, r.data);
});

// POST /api/orders/:id/ship — 管理员发货（paid → shipped，可带 tracking）
router.post('/:id/ship', requireAuth, requireAdmin, (req, res) => {
  const { tracking } = req.body || {};
  const r = orderUtil.applyStatusChange({
    orderId: req.params.id,
    toStatus: 'shipped',
    operatorId: req.user.id,
    operatorIsAdmin: true,
    tracking: (tracking || '').slice(0, 100),
    pushNotification,
  });
  if (!r.ok) return fail(res, r.error, r.status || 400);
  ok(res, r.data);
});

// POST /api/orders/:id/deliver — 管理员或用户确认签收（shipped → delivered）
router.post('/:id/deliver', requireAuth, (req, res) => {
  const r = orderUtil.applyStatusChange({
    orderId: req.params.id,
    toStatus: 'delivered',
    operatorId: req.user.id,
    operatorIsAdmin: req.user.role === 'admin',
    pushNotification,
  });
  if (!r.ok) return fail(res, r.error, r.status || 400);
  ok(res, r.data);
});

// POST /api/orders/:id/confirm — 用户确认完成（delivered → completed）
router.post('/:id/confirm', requireAuth, (req, res) => {
  const r = orderUtil.applyStatusChange({
    orderId: req.params.id,
    toStatus: 'completed',
    operatorId: req.user.id,
    operatorIsAdmin: req.user.role === 'admin',
    pushNotification,
  });
  if (!r.ok) return fail(res, r.error, r.status || 400);
  ok(res, r.data);
});

// POST /api/orders/auto-complete — 触发自动完成（管理员或健康检查定时调用）
router.post('/auto-complete', requireAuth, requireAdmin, (req, res) => {
  const { days } = req.body || {};
  const result = orderUtil.autoCompleteDelivered({ days: Math.max(1, parseInt(days, 10) || 7) });
  ok(res, { completed: result.length, ids: result });
});

// PUT /api/orders/:id/status — 兼容旧接口：管理员通用改状态
router.put('/:id/status', requireAuth, requireAdmin, (req, res) => {
  const { status, tracking, reason } = req.body || {};
  const r = orderUtil.applyStatusChange({
    orderId: req.params.id,
    toStatus: status,
    operatorId: req.user.id,
    operatorIsAdmin: true,
    tracking: (tracking || '').slice(0, 100),
    reason: (reason || '').slice(0, 200),
    pushNotification,
  });
  if (!r.ok) return fail(res, r.error, r.status || 400);
  ok(res, r.data);
});

// PUT /api/orders/:id — 更新非状态字段（收件信息、备注；管理员）
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '订单不存在', 404);

  const { receiverName, receiverPhone, shippingAddress, remark } = req.body;

  db.prepare(
    `UPDATE orders SET receiverName=?, receiverPhone=?, shippingAddress=?, remark=?, updatedAt=? WHERE id=?`
  ).run(
    receiverName ?? existing.receiverName,
    receiverPhone ?? existing.receiverPhone,
    shippingAddress ?? existing.shippingAddress,
    remark ?? existing.remark,
    orderUtil.nowStamp(),
    req.params.id
  );
  ok(res, { id: req.params.id });
});

// DELETE /api/orders/:id（仅管理员）
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return fail(res, '订单不存在', 404);
  ok(res, { deleted: req.params.id });
});

module.exports = router;
