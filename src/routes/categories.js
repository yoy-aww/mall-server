const express = require('express');
const router = express.Router();
const { categories } = require('../data/categories');

// GET /api/categories - 获取所有分类
router.get('/', (req, res) => {
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  res.json({ success: true, data: sorted });
});

// GET /api/categories/:id - 获取单个分类
router.get('/:id', (req, res) => {
  const cat = categories.find(c => c.id === req.params.id);
  if (!cat) {
    return res.status(404).json({ success: false, error: '分类不存在' });
  }
  res.json({ success: true, data: cat });
});

module.exports = router;