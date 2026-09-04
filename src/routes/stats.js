const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/stats — 仪表盘统计（管理员）
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const [products, banners, categories, orders, users, aftersales] = [
    db.prepare('SELECT COUNT(*) AS c FROM products WHERE enabled = 1').get().c,
    db.prepare('SELECT COUNT(*) AS c FROM banners').get().c,
    db.prepare('SELECT COUNT(*) AS c FROM categories').get().c,
    db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
    db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    db.prepare('SELECT COUNT(*) AS c FROM aftersales').get().c,
  ];
  res.json({ success: true, data: { products, banners, categories, orders, users, aftersales } });
});

module.exports = router;
