// 加载 .env 配置文件（本地开发使用）
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = require('./app');
const { initSchema, migrate } = require('./db/database');
const { seed } = require('./db/seed');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// 初始化数据库
initSchema();
migrate();
seed();

app.listen(PORT, HOST, () => {
  console.log('========================================');
  console.log('  小程序商城 API 服务已启动');
  console.log('========================================');
  console.log(`  地址: http://${HOST}:${PORT}`);
  console.log(`  健康检查: http://localhost:${PORT}/api/health`);
  console.log(`  接口列表:`);
  console.log(`    GET    /api/banners`);
  console.log(`    POST   /api/banners`);
  console.log(`    PUT    /api/banners/:id`);
  console.log(`    DELETE /api/banners/:id`);
  console.log(`    GET    /api/categories`);
  console.log(`    POST   /api/categories`);
  console.log(`    PUT    /api/categories/:id`);
  console.log(`    DELETE /api/categories/:id`);
  console.log(`    GET    /api/products`);
  console.log(`    POST   /api/products`);
  console.log(`    PUT    /api/products/:id`);
  console.log(`    DELETE /api/products/:id`);
  console.log(`    GET    /api/products/search?q=xxx`);
  console.log(`    GET    /api/products/popular`);
  console.log(`    GET    /api/products/category/:categoryId`);
  console.log(`    GET    /api/products/grouped`);
  console.log('========================================');
});