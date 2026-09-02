const express = require('express');
const cors = require('cors');

// 加载 .env 配置（在路由加载前，确保环境变量生效）
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const { router: authRoutes } = require('./routes/auth');
const bannerRoutes = require('./routes/banners');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const uploadRoutes = require('./routes/upload');

// DB 初始化由 index.js 统一负责，避免重复

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

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/upload', uploadRoutes);

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