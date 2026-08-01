const express = require('express');
const cors = require('cors');
const { initSchema } = require('./db/database');
const { seed } = require('./db/seed');

const bannerRoutes = require('./routes/banners');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');

// 初始化数据库
initSchema();
seed();

const app = express();

// ==================== 中间件 ====================

// CORS — 允许小程序跨域访问
app.use(cors());

// JSON 解析
app.use(express.json());

// 请求日志
app.use((req, res, next) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${req.method} ${req.originalUrl}`);
  next();
});

// ==================== 路由 ====================

app.use('/api/banners', bannerRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ==================== 404 处理 ====================

app.use((req, res) => {
  res.status(404).json({ success: false, error: '接口不存在' });
});

// ==================== 错误处理 ====================

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ success: false, error: '服务器内部错误' });
});

module.exports = app;