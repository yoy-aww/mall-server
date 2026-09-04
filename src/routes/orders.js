const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { verifyToken } = require('../auth');

function ok(res, data) { res.json({ success: true, data }); }
function fail(res, msg, status = 400) { res.status(status).json({ success: false, error: msg }); }

// 分页参数解析：GET ?page=1&limit=20
// 不传则不分页，保持向后兼容
function parsePagination(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function parseAuthUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const userId = verifyToken(token);
  if (!userId) return null;
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || null;
}
function requireAdmin(req, res, next) {
  const user = parseAuthUser(req);
  if (!user || user.role !== 'admin') return fail(res, '无权限', 403);
  next();
}

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

// GET /api/orders — 所有订单（按创建时间倒序），支持 ?userId=xxx&status=xxx&page=&limit=
router.get('/', (req, res) => {
  const db = getDb();
  const { page, limit, offset } = parsePagination(req);
  const usePage = req.query.page || req.query.limit;

  let where = '1=1';
  const params = [];
  if (req.query.userId) { where += ' AND userId = ?'; params.push(req.query.userId); }
  if (req.query.status) { where += ' AND status = ?'; params.push(req.query.status); }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM orders WHERE ${where}`).get(...params);
  const total = countRow.total;

  let rows;
  if (usePage) {
    rows = db.prepare(`SELECT * FROM orders WHERE ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  } else {
    rows = db.prepare(`SELECT * FROM orders WHERE ${where} ORDER BY createdAt DESC`).all(...params);
  }

  if (usePage) {
    ok(res, { list: rows.map(rowToOrder), total, page, limit });
  } else {
    ok(res, rows.map(rowToOrder));
  }
});

// POST /api/orders — 创建订单（普通用户，需登录）
router.post('/', (req, res) => {
  const user = parseAuthUser(req);
  if (!user) return fail(res, '未登录', 401);
  const db = getDb();
  const { items, totalAmount, shippingAddress, receiverName, receiverPhone, remark } = req.body;
  if (!items || items.length === 0 || !receiverName || !receiverPhone || !shippingAddress) {
    return fail(res, 'items, 收件人信息为必填');
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
      ).run(id, user.id, 'pending', JSON.stringify(items), totalAmount, shippingAddress, receiverName, receiverPhone, remark || '');
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

// PUT /api/orders/:id/status — 更新订单状态（仅管理员）
router.put('/:id/status', requireAdmin, (req, res) => {
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

// PUT /api/orders/:id — 更新订单（如发货信息，仅管理员）
router.put('/:id', requireAdmin, (req, res) => {
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

// DELETE /api/orders/:id（仅管理员）
router.delete('/:id', requireAdmin, (req, res) => {
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
