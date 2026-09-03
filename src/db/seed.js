/**
 * 数据库种子数据
 * 从 mock 数据文件导入到 SQLite
 */
const { getDb } = require('./database');

// 从 mock 数据读取
const { products } = require('../data/products');
const { banners } = require('../data/banners');
const { categories } = require('../data/categories');
const { orders } = require('../data/orders');

function seed() {
  const db = getDb();

  // 检查是否已有数据
  const count = db.prepare('SELECT COUNT(*) as c FROM categories').get();
  if (count.c > 0) {
    console.log('[Seed] 数据库已有数据，跳过导入');
    return;
  }

  console.log('[Seed] 开始导入种子数据...');

  // 导入分类
  const insertCategory = db.prepare(
    'INSERT INTO categories (id, name, icon, productCount, sortOrder) VALUES (?, ?, ?, ?, ?)'
  );
  for (const c of categories) {
    insertCategory.run(c.id, c.name, c.icon, c.productCount, c.sortOrder);
  }
  console.log(`[Seed] 导入 ${categories.length} 个分类`);

  // 导入产品
  const insertProduct = db.prepare(
    `INSERT INTO products (id, name, image, originalPrice, discountedPrice, categoryId, description, stock, tags, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const p of products) {
    insertProduct.run(
      p.id, p.name, p.image,
      p.originalPrice, p.discountedPrice || null,
      p.categoryId, p.description || '',
      p.stock, JSON.stringify(p.tags || []),
      p.enabled !== false ? 1 : 0
    );
  }
  console.log(`[Seed] 导入 ${products.length} 个商品`);

  // 导入 Banner
  const insertBanner = db.prepare(
    'INSERT INTO banners (id, title, subtitle, image, link, sortOrder, enabled, audioUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const b of banners) {
    insertBanner.run(
      b.id, b.title || '', b.subtitle || '',
      b.image, b.link || '',
      b.sortOrder, b.enabled ? 1 : 0,
      b.audioUrl || ''
    );
  }
  console.log(`[Seed] 导入 ${banners.length} 个 Banner`);

  // 导入订单
  const insertOrder = db.prepare(
    'INSERT INTO orders (id, userId, status, items, totalAmount, shippingAddress, receiverName, receiverPhone, remark, createdAt, paidAt, shippedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const o of orders) {
    insertOrder.run(
      o.id, o.userId, o.status, o.items, o.totalAmount,
      o.shippingAddress, o.receiverName, o.receiverPhone, o.remark || '',
      o.createdAt, o.paidAt || '', o.shippedAt || ''
    );
  }
  console.log('[Seed] 导入 6 个订单');

  // 导入评价
  const { reviews } = require('../data/reviews');
  const insertReview = db.prepare(
    'INSERT INTO reviews (id, productId, userId, username, nickname, rating, content, images, reply, replyAt, visible, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const r of reviews) {
    insertReview.run(r.id, r.productId, r.userId, r.username, r.nickname, r.rating, r.content, JSON.stringify(r.images || []), r.reply || '', r.replyAt || '', r.visible !== false ? 1 : 0, r.createdAt);
  }
  console.log(`[Seed] 导入 ${reviews.length} 条评价`);

  // 用户
  const { ensureAdmin, seedDemoUsers } = require('./seed-users');
  ensureAdmin();
  seedDemoUsers();
  const { seed: seedAddresses } = require('./seed-addresses');
  seedAddresses();
  const { seed: seedAftersales } = require('./seed-aftersales');
  seedAftersales();

  console.log('[Seed] 种子数据导入完成');
}

module.exports = { seed };