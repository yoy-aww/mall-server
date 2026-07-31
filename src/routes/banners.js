const express = require('express');
const router = express.Router();
const { banners } = require('../data/banners');

// GET /api/banners - 获取所有启用的 Banner
router.get('/', (req, res) => {
  const enabled = banners
    .filter(b => b.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  res.json({ success: true, data: enabled });
});

module.exports = router;