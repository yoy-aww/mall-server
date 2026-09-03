const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'mall.db');

let db;

/**
 * 获取数据库实例（单例）
 */
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    // 启用 WAL 模式，提升并发性能
    db.pragma('journal_mode = WAL');
    // 启用外键约束
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 * 初始化表结构
 */
function initSchema() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '',
      productCount INTEGER DEFAULT 0,
      sortOrder INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      image TEXT NOT NULL,
      originalPrice REAL NOT NULL,
      discountedPrice REAL,
      categoryId TEXT NOT NULL,
      description TEXT DEFAULT '',
      stock INTEGER DEFAULT 0,
      tags TEXT DEFAULT '[]',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (categoryId) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS banners (
      id TEXT PRIMARY KEY,
      title TEXT DEFAULT '',
      subtitle TEXT DEFAULT '',
      image TEXT NOT NULL,
      link TEXT DEFAULT '',
      sortOrder INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      audioUrl TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      userId TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      items TEXT NOT NULL DEFAULT '[]',
      totalAmount REAL NOT NULL DEFAULT 0,
      shippingAddress TEXT DEFAULT '',
      receiverName TEXT DEFAULT '',
      receiverPhone TEXT DEFAULT '',
      remark TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now')),
      paidAt TEXT,
      shippedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      salt TEXT NOT NULL DEFAULT '',
      nickname TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      avatar TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      userId TEXT DEFAULT '',
      username TEXT DEFAULT '',
      nickname TEXT DEFAULT '',
      rating INTEGER NOT NULL DEFAULT 5,
      content TEXT NOT NULL DEFAULT '',
      images TEXT DEFAULT '[]',
      reply TEXT DEFAULT '',
      replyAt TEXT,
      visible INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(productId);
  `);

  console.log('[DB] 表结构初始化完成');
}

/**
 * 数据库迁移：products 表增加 enabled 字段（商品上下架）
 */
function migrate() {
  const db = getDb();
  // 检查 products 表是否存在 enabled 列
  const info = db.prepare("PRAGMA table_info(products)").all();
  const hasEnabled = info.some(col => col.name === 'enabled');
  if (!hasEnabled) {
    db.exec('ALTER TABLE products ADD COLUMN enabled INTEGER DEFAULT 1');
    console.log('[DB] 已迁移：products 表新增 enabled 字段');
  }
}

module.exports = { getDb, initSchema, migrate, DB_PATH };