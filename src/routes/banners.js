const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// 工具：包装返回格式
function ok(res, data) {
  res.json({ success: true, data });
}
function fail(res, msg, status = 400) {
  res.status(status).json({ success: false, error: msg });
}

// GET /api/banners — 获取所有启用的 Banner
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM banners WHERE enabled = 1 ORDER BY sortOrder ASC'
  ).all();
  ok(res, rows);
});

// GET /api/banners/all — 获取所有 Banner（含禁用）
router.get('/all', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM banners ORDER BY sortOrder ASC').all();
  ok(res, rows);
});

// GET /api/banners/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM banners WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, 'Banner 不存在', 404);
  ok(res, row);
});

// POST /api/banners — 新增 Banner
router.post('/', (req, res) => {
  const db = getDb();
  const { id, title, subtitle, image, link, sortOrder, enabled, audioUrl } = req.body;
  if (!id || !image) return fail(res, 'id 和 image 为必填');
  db.prepare(
    'INSERT INTO banners (id, title, subtitle, image, link, sortOrder, enabled, audioUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, title || '', subtitle || '', image, link || '', sortOrder || 0, enabled ? 1 : 0, audioUrl || '');
  ok(res, { id });
});

// PUT /api/banners/:id — 更新 Banner
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM banners WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 'Banner 不存在', 404);

  const { title, subtitle, image, link, sortOrder, enabled, audioUrl } = req.body;
  db.prepare(
    'UPDATE banners SET title=?, subtitle=?, image=?, link=?, sortOrder=?, enabled=?, audioUrl=? WHERE id=?'
  ).run(
    title ?? existing.title, subtitle ?? existing.subtitle,
    image ?? existing.image, link ?? existing.link,
    sortOrder ?? existing.sortOrder, enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
    audioUrl ?? existing.audioUrl, req.params.id
  );
  ok(res, { id: req.params.id });
});

// DELETE /api/banners/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM banners WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return fail(res, 'Banner 不存在', 404);
  ok(res, { deleted: req.params.id });
});

module.exports = router;