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
  `);

  console.log('[DB] 表结构初始化完成');
}

module.exports = { getDb, initSchema, DB_PATH };