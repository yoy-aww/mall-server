// 加载 .env 配置文件（本地开发使用）
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = require('./app');
const { initSchema, migrate } = require('./db/database');
const { seed } = require('./db/seed');
const { getDb } = require('./db/database');

// 图片 CDN URL 迁移：七牛云已下线，旧 clouddn URL → jsDelivr（幂等，无匹配则跳过）
function migrateImageUrls() {
  const db = getDb();
  const OLD = 'tiyycecb8.hn-bkt.clouddn.com';
  const NEW = 'cdn.jsdelivr.net/gh/yoy-aww/mall-images';

  const tables = ['products', 'banners', 'orders', 'reviews'];
  let total = 0;

  for (const t of tables) {
    let rows;
    if (t === 'reviews') {
      // reviews.images 是 JSON 数组字符串
      rows = db.prepare(`SELECT id, images FROM reviews WHERE images LIKE ?`).all(`%${OLD}%`);
      const upd = db.prepare('UPDATE reviews SET images = ? WHERE id = ?');
      for (const r of rows) {
        const updated = r.images.replace(new RegExp(OLD, 'g'), NEW);
        if (updated !== r.images) { upd.run(updated, r.id); total++; }
      }
    } else if (t === 'orders') {
      // orders.items 是 JSON 数组字符串
      rows = db.prepare(`SELECT id, items FROM orders WHERE items LIKE ?`).all(`%${OLD}%`);
      const upd = db.prepare('UPDATE orders SET items = ? WHERE id = ?');
      for (const r of rows) {
        const updated = r.items.replace(new RegExp(OLD, 'g'), NEW);
        if (updated !== r.items) { upd.run(updated, r.id); total++; }
      }
    } else {
      // products.image / banners.image
      const col = t === 'products' ? 'image' : 'image';
      rows = db.prepare(`SELECT id, ${col} as img FROM ${t} WHERE ${col} LIKE ?`).all(`%${OLD}%`);
      const upd = db.prepare(`UPDATE ${t} SET ${col} = ? WHERE id = ?`);
      for (const r of rows) {
        const updated = r.img.replace(new RegExp(OLD, 'g'), NEW);
        if (updated !== r.img) { upd.run(updated, r.id); total++; }
      }
    }
  }

  if (total > 0) {
    console.log(`[Migrate] 替换 ${total} 条图片 URL（clouddn → jsDelivr）`);
  }
}

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// 初始化数据库
initSchema();
migrate();
seed();
migrateImageUrls();

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