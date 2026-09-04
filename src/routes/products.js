const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { safeImage } = require('./imageFix');
const { requireAuth, requireAdmin } = require('./auth');

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

// 行转产品对象（返回全量数据，不下架过滤，供管理后台使用）
function rowToProduct(row) {
  if (!row) return null;
  return {
    ...row,
    image: safeImage(row.image),
    tags: row.tags ? JSON.parse(row.tags) : [],
    enabled: row.enabled === 1 || row.enabled === '1',
  };
}

// GET /api/products — 所有产品（管理后台：含下架商品），支持 ?admin=1&category=xxx&page=&limit=
router.get('/', (req, res) => {
  const db = getDb();
  const { page, limit, offset } = parsePagination(req);
  const usePage = req.query.page || req.query.limit;

  let where = '1=1';
  const params = [];
  if (req.query.admin !== '1') where += ' AND enabled = 1';
  if (req.query.category && req.query.category !== 'undefined' && req.query.category !== 'null') { where += ' AND categoryId = ?'; params.push(req.query.category); }

  const total = db.prepare(`SELECT COUNT(*) as total FROM products WHERE ${where}`).get(...params).total;
  let rows;
  if (usePage) {
    rows = db.prepare(`SELECT * FROM products WHERE ${where} ORDER BY categoryId, id LIMIT ? OFFSET ?`).all(...params, limit, offset);
  } else {
    rows = db.prepare(`SELECT * FROM products WHERE ${where} ORDER BY categoryId, id`).all(...params);
  }

  if (usePage) ok(res, { list: rows.map(rowToProduct), total, page, limit });
  else ok(res, rows.map(rowToProduct));
});

// GET /api/products/search?q=xxx&page=&limit=
router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return ok(res, []);

  const db = getDb();
  const { page, limit, offset } = parsePagination(req);
  const usePage = req.query.page || req.query.limit;
  const like = `%${q}%`;

  const total = db.prepare(
    'SELECT COUNT(*) as total FROM products WHERE enabled = 1 AND (name LIKE ? OR description LIKE ?)'
  ).get(like, like).total;

  let rows;
  if (usePage) {
    rows = db.prepare(
      'SELECT * FROM products WHERE enabled = 1 AND (name LIKE ? OR description LIKE ?) ORDER BY id LIMIT ? OFFSET ?'
    ).all(like, like, limit, offset);
  } else {
    rows = db.prepare(
      'SELECT * FROM products WHERE enabled = 1 AND (name LIKE ? OR description LIKE ?) ORDER BY id'
    ).all(like, like);
  }

  if (usePage) ok(res, { list: rows.map(rowToProduct), total, page, limit });
  else ok(res, rows.map(rowToProduct));
});

// GET /api/products/popular
router.get('/popular', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM products WHERE enabled = 1 AND id IN ('welfare_1','tea_1','tea_2','herbs_1','health_1')"
  ).all();
  ok(res, rows.map(rowToProduct));
});

// GET /api/products/category/:categoryId
router.get('/category/:categoryId', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM products WHERE enabled = 1 AND categoryId = ? ORDER BY id').all(req.params.categoryId);
  ok(res, rows.map(rowToProduct));
});

// GET /api/products/grouped — 按分类分组（仅上架）
router.get('/grouped', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM products WHERE enabled = 1 ORDER BY categoryId, id').all();
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
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { name, image, originalPrice, discountedPrice, categoryId, description, stock, tags, enabled } = req.body;
  if (!name || !image || originalPrice === undefined || !categoryId) {
    return fail(res, 'name, image, originalPrice, categoryId 为必填');
  }
  const id = 'prod_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  db.prepare(
    'INSERT INTO products (id, name, image, originalPrice, discountedPrice, categoryId, description, stock, tags, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id, name, image, originalPrice, discountedPrice || null,
    categoryId, description || '', stock || 0,
    JSON.stringify(tags || []), enabled !== false ? 1 : 0
  );
  ok(res, { id });
});

// PUT /api/products/:id — 更新商品
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '商品不存在', 404);

  const { name, image, originalPrice, discountedPrice, categoryId, description, stock, tags, enabled } = req.body;
  db.prepare(
    `UPDATE products SET name=?, image=?, originalPrice=?, discountedPrice=?, categoryId=?, description=?, stock=?, tags=?, enabled=?, updatedAt=datetime('now') WHERE id=?`
  ).run(
    name ?? existing.name, image ?? existing.image,
    originalPrice ?? existing.originalPrice,
    discountedPrice !== undefined ? discountedPrice : existing.discountedPrice,
    categoryId ?? existing.categoryId, description ?? existing.description,
    stock ?? existing.stock,
    tags ? JSON.stringify(tags) : existing.tags,
    enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
    req.params.id
  );
  ok(res, { id: req.params.id, enabled: enabled !== undefined ? !!enabled : existing.enabled === 1 });
});

// DELETE /api/products/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return fail(res, '商品不存在', 404);
  ok(res, { deleted: req.params.id });
});

module.exports = router;