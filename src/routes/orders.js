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

// GET /api/orders — 所有订单（按创建时间倒序），支持 ?userId=xxx 过滤
router.get('/', (req, res) => {
  const db = getDb();
  let rows;
  if (req.query.userId) {
    rows = db.prepare('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC').all(req.query.userId);
  } else {
    rows = db.prepare('SELECT * FROM orders ORDER BY createdAt DESC').all();
  }
  ok(res, rows.map(rowToOrder));
});

// POST /api/orders — 创建订单（普通用户）
router.post('/', (req, res) => {
  const db = getDb();
  const { userId, items, totalAmount, shippingAddress, receiverName, receiverPhone, remark } = req.body;
  if (!userId || !items || items.length === 0 || !receiverName || !receiverPhone || !shippingAddress) {
    return fail(res, 'userId, items, 收件人信息为必填');
  }

  try {
    db.transaction(() => {
      // 检查库存
      for (const item of items) {
        const product = db.prepare('SELECT name, stock, discountedPrice FROM products WHERE id = ?').get(item.productId);
        if (!product) {
          throw new Error(`${item.productName || item.productId} 不存在`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`${product.name} 库存不足（剩 ${product.stock} 件，需要 ${item.quantity} 件）`);
        }
        // 扣减库存
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.quantity, item.productId);
      }

      const id = 'ORD' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
      db.prepare(
        'INSERT INTO orders (id, userId, status, items, totalAmount, shippingAddress, receiverName, receiverPhone, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, userId, 'pending', JSON.stringify(items), totalAmount, shippingAddress, receiverName, receiverPhone, remark || '');
      ok(res, { id });
    })();
  } catch (err) {
    fail(res, err.message || '库存不足');
  }
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

  // 取消订单 → 恢复库存
  if (status === 'cancelled') {
    const items = existing.items ? JSON.parse(existing.items) : [];
    db.transaction(() => {
      for (const item of items) {
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.productId);
      }
      db.prepare('UPDATE orders SET status = ?, paidAt = ?, shippedAt = ? WHERE id = ?')
        .run(status, paidAt, shippedAt, req.params.id);
    })();
    ok(res, { id: req.params.id, status, stockRestored: true });
    return;
  }

  // 已下单即扣库存，状态变更不再重复扣减
  db.prepare('UPDATE orders SET status = ?, paidAt = ?, shippedAt = ? WHERE id = ?')
    .run(status, paidAt, shippedAt, req.params.id);

  // 通知用户（仅关键状态变更）
  const notifyStatuses = ['paid', 'shipped', 'delivered', 'completed', 'cancelled'];
  const userNotify = {
    paid:      { title: '支付成功',       content: `订单 ${req.params.id} 已付款，正在为您准备` },
    shipped:   { title: '已发货',         content: `订单 ${req.params.id} 已发货，请注意查收` },
    delivered: { title: '已签收',         content: `订单 ${req.params.id} 已签收` },
    completed: { title: '已完成',         content: `订单 ${req.params.id} 已完成` },
    cancelled: { title: '已取消',         content: `订单 ${req.params.id} 已取消` },
  };
  if (notifyStatuses.includes(status)) {
    const n = userNotify[status];
    const nid = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    db.prepare(
      'INSERT INTO notifications (id, userId, type, title, content, relatedId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(nid, existing.userId, 'order', n.title, n.content, req.params.id, now);
  }

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

// POST /api/orders/:id/payment — 模拟支付（仅 pending 订单可支付）
router.post('/:id/payment', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '订单不存在', 404);
  if (existing.status !== 'pending') return fail(res, `订单状态为 ${existing.status}，不可支付`);

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('UPDATE orders SET status = ?, paidAt = ? WHERE id = ?')
    .run('paid', now, req.params.id);
  ok(res, { id: req.params.id, status: 'paid', paidAt: now });
});

module.exports = router;
