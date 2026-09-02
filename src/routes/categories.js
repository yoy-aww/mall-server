const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

function ok(res, data) { res.json({ success: true, data }); }
function fail(res, msg, status = 400) { res.status(status).json({ success: false, error: msg }); }

// GET /api/categories — 所有分类（含商品数）
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT c.*, COALESCE((SELECT COUNT(*) FROM products p WHERE p.categoryId = c.id), 0) as productCount
     FROM categories c ORDER BY c.sortOrder ASC`
  ).all();
  ok(res, rows);
});

// GET /api/categories/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, '分类不存在', 404);
  ok(res, row);
});

// POST /api/categories — 新增分类
router.post('/', (req, res) => {
  const db = getDb();
  const { id, name, icon, productCount, sortOrder } = req.body;
  if (!id || !name) return fail(res, 'id 和 name 为必填');
  db.prepare(
    'INSERT INTO categories (id, name, icon, productCount, sortOrder) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, icon || '', productCount || 0, sortOrder || 0);
  ok(res, { id });
});

// PUT /api/categories/:id — 更新分类
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '分类不存在', 404);

  const { name, icon, productCount, sortOrder } = req.body;
  db.prepare(
    'UPDATE categories SET name=?, icon=?, productCount=?, sortOrder=? WHERE id=?'
  ).run(
    name ?? existing.name, icon ?? existing.icon,
    productCount ?? existing.productCount,
    sortOrder ?? existing.sortOrder, req.params.id
  );
  ok(res, { id: req.params.id });
});

// DELETE /api/categories/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  // 先检查是否有商品引用
  const ref = db.prepare('SELECT COUNT(*) as c FROM products WHERE categoryId = ?').get(req.params.id);
  if (ref.c > 0) return fail(res, `该分类下还有 ${ref.c} 个商品，无法删除`, 400);

  const result = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return fail(res, '分类不存在', 404);
  ok(res, { deleted: req.params.id });
});

module.exports = router;
