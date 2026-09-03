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

function rowToReview(row) {
  if (!row) return null;
  return {
    ...row,
    images: row.images ? JSON.parse(row.images) : [],
    reply: row.reply || undefined,
    replyAt: row.replyAt || undefined,
  };
}

// GET /api/reviews?productId=xxx — 商品评价列表
router.get('/', (req, res) => {
  const db = getDb();
  const { productId } = req.query;
  if (!productId) return fail(res, 'productId 为必填');
  const rows = db.prepare(
    'SELECT * FROM reviews WHERE productId = ? AND visible = 1 ORDER BY createdAt DESC'
  ).all(productId);
  ok(res, rows.map(rowToReview));
});

// GET /api/reviews/product/:productId/stats — 评价统计
router.get('/product/:productId/stats', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(AVG(rating), 0) as avg,
      SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as s5,
      SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as s4,
      SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as s3,
      SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as s2,
      SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as s1
    FROM reviews WHERE productId = ? AND visible = 1
  `).get(req.params.productId);
  ok(res, {
    avg: Math.round((row.avg || 0) * 10) / 10,
    total: row.total || 0,
    dist: [row.s1 || 0, row.s2 || 0, row.s3 || 0, row.s4 || 0, row.s5 || 0],
  });
});

// POST /api/reviews — 发表评价（需登录）
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { productId, rating, content, images } = req.body;
  if (!productId || !content || !content.trim()) return fail(res, 'productId 和 content 为必填');
  if (!rating || rating < 1 || rating > 5) return fail(res, 'rating 须为 1-5');

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) return fail(res, '商品不存在', 404);

  const id = 'rev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  db.prepare(
    'INSERT INTO reviews (id, productId, userId, username, nickname, rating, content, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, productId, req.user.id, req.user.username, req.user.nickname, rating, content.trim(), JSON.stringify(images || []));

  ok(res, { id });
});

// PUT /api/reviews/:id/reply — 商家回复（管理员）
router.put('/:id/reply', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '评价不存在', 404);

  const { reply } = req.body;
  if (!reply || !reply.trim()) return fail(res, '回复内容为必填');
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('UPDATE reviews SET reply = ?, replyAt = ? WHERE id = ?').run(reply.trim(), now, req.params.id);
  ok(res, { id: req.params.id });
});

// PUT /api/reviews/:id — 切换可见性（管理员）
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '评价不存在', 404);
  const { visible } = req.body;
  db.prepare('UPDATE reviews SET visible = ? WHERE id = ?').run(visible ? 1 : 0, req.params.id);
  ok(res, { id: req.params.id, visible: !!visible });
});

// DELETE /api/reviews/:id — 删除评价（管理员）
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return fail(res, '评价不存在', 404);
  ok(res, { deleted: req.params.id });
});

module.exports = router;
