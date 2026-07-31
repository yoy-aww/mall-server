const app = require('./app');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log('========================================');
  console.log('  小程序商城 API 服务已启动');
  console.log('========================================');
  console.log(`  地址: http://${HOST}:${PORT}`);
  console.log(`  健康检查: http://localhost:${PORT}/api/health`);
  console.log(`  接口列表:`);
  console.log(`    GET  /api/banners`);
  console.log(`    GET  /api/categories`);
  console.log(`    GET  /api/categories/:id`);
  console.log(`    GET  /api/products`);
  console.log(`    GET  /api/products/:id`);
  console.log(`    GET  /api/products/search?q=关键词`);
  console.log(`    GET  /api/products/popular`);
  console.log(`    GET  /api/products/category/:categoryId`);
  console.log(`    GET  /api/products/grouped`);
  console.log('========================================');
});