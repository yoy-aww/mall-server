const express = require('express');
const router = express.Router();
const { products } = require('../data/products');

// 辅助：按分类分组
function groupByCategory() {
  const map = {};
  products.forEach(p => {
    if (!map[p.categoryId]) map[p.categoryId] = [];
    map[p.categoryId].push(p);
  });
  return map;
}

// GET /api/products - 获取所有产品
router.get('/', (req, res) => {
  res.json({ success: true, data: products });
});

// GET /api/products/search?q=xxx - 搜索产品
router.get('/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) {
    return res.json({ success: true, data: [] });
  }

  const results = products.filter(p =>
    p.name.includes(q) ||
    (p.description && p.description.includes(q)) ||
    (p.tags && p.tags.some(t => t.includes(q)))
  );

  res.json({ success: true, data: results });
});

// GET /api/products/popular - 获取热门产品
router.get('/popular', (req, res) => {
  const popular = products.filter(p =>
    ['welfare_1', 'tea_1', 'tea_2', 'herbs_1', 'health_1'].includes(p.id)
  );
  res.json({ success: true, data: popular });
});

// GET /api/products/category/:categoryId - 按分类获取产品
router.get('/category/:categoryId', (req, res) => {
  const result = products.filter(p => p.categoryId === req.params.categoryId);
  res.json({ success: true, data: result });
});

// GET /api/products/grouped - 按分类分组的产品（首页用）
router.get('/grouped', (req, res) => {
  const grouped = groupByCategory();
  res.json({ success: true, data: grouped });
});

// GET /api/products/:id - 获取单个产品
router.get('/:id', (req, res) => {
  const product = products.find(p => p.id === req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, error: '商品不存在' });
  }
  res.json({ success: true, data: product });
});

module.exports = router;