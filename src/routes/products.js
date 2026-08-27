const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { safeImage } = require('./imageFix');

function ok(res, data) { res.json({ success: true, data }); }
function fail(res, msg, status = 400) { res.status(status).json({ success: false, error: msg }); }

// 辅助：行转产品对象
function rowToProduct(row) {
  if (!row) return null;
  return {
    ...row,
    image: safeImage(row.image),
    tags: row.tags ? JSON.parse(row.tags) : [],
  };
}

// GET /api/products — 所有产品
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM products ORDER BY categoryId, id').all();
  ok(res, rows.map(rowToProduct));
});

// GET /api/products/search?q=xxx
router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return ok(res, []);

  const db = getDb();
  const like = `%${q}%`;
  const rows = db.prepare(
    'SELECT * FROM products WHERE name LIKE ? OR description LIKE ? ORDER BY id'
  ).all(like, like);
  ok(res, rows.map(rowToProduct));
});

// GET /api/products/popular
router.get('/popular', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM products WHERE id IN ('welfare_1','tea_1','tea_2','herbs_1','health_1')"
  ).all();
  ok(res, rows.map(rowToProduct));
});

// GET /api/products/category/:categoryId
router.get('/category/:categoryId', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM products WHERE categoryId = ? ORDER BY id').all(req.params.categoryId);
  ok(res, rows.map(rowToProduct));
});

// GET /api/products/grouped — 按分类分组
router.get('/grouped', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM products ORDER BY categoryId, id').all();
  const grouped = {};
  for (const r of rows) {
    const p = rowToProduct(r);
    if (!grouped[p.categoryId]) grouped[p.categoryId] = [];
    grouped[p.categoryId].push(p);
  }
  ok(res, grouped);
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, '商品不存在', 404);
  ok(res, rowToProduct(row));
});

// POST /api/products — 新增商品
router.post('/', (req, res) => {
  const db = getDb();
  const { id, name, image, originalPrice, discountedPrice, categoryId, description, stock, tags } = req.body;
  if (!id || !name || !image || originalPrice === undefined || !categoryId) {
    return fail(res, 'id, name, image, originalPrice, categoryId 为必填');
  }
  db.prepare(
    'INSERT INTO products (id, name, image, originalPrice, discountedPrice, categoryId, description, stock, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id, name, image, originalPrice, discountedPrice || null,
    categoryId, description || '', stock || 0,
    JSON.stringify(tags || [])
  );
  ok(res, { id });
});

// PUT /api/products/:id — 更新商品
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '商品不存在', 404);

  const { name, image, originalPrice, discountedPrice, categoryId, description, stock, tags } = req.body;
  db.prepare(
    'UPDATE products SET name=?, image=?, originalPrice=?, discountedPrice=?, categoryId=?, description=?, stock=?, tags=?, updatedAt=datetime(\'now\') WHERE id=?'
  ).run(
    name ?? existing.name, image ?? existing.image,
    originalPrice ?? existing.originalPrice,
    discountedPrice !== undefined ? discountedPrice : existing.discountedPrice,
    categoryId ?? existing.categoryId, description ?? existing.description,
    stock ?? existing.stock,
    tags ? JSON.stringify(tags) : existing.tags,
    req.params.id
  );
  ok(res, { id: req.params.id });
});

// DELETE /api/products/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return fail(res, '商品不存在', 404);
  ok(res, { deleted: req.params.id });
});

module.exports = router;