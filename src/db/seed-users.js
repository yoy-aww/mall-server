const { hashPassword, generateSalt } = require('../auth');

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_ID = 'u_admin';

/**
 * 如果管理员账号不存在则创建
 */
function ensureAdmin() {
  const { getDb } = require('./database');
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME);
  if (existing) return;

  const salt = generateSalt();
  const pwHash = hashPassword(ADMIN_PASSWORD, salt);
  db.prepare(
    'INSERT INTO users (id, username, password, salt, nickname, phone, role) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(ADMIN_ID, ADMIN_USERNAME, pwHash, salt, '管理员', '', 'admin');
  console.log('[Seed] 创建默认管理员账号 admin/admin123');
}

// 普通用户种子（供 mall-web 登录演示用）
const DEMO_USERS = [
  { username: 'zhangsan', password: '123456', nickname: '张三',  phone: '138****1234', role: 'user' },
  { username: 'lisi',     password: '123456', nickname: '李四',  phone: '139****5678', role: 'user' },
  { username: 'wangwu',   password: '123456', nickname: '王五',  phone: '150****9012', role: 'user' },
];

function seedDemoUsers() {
  const { getDb } = require('./database');
  const db = getDb();
  for (const u of DEMO_USERS) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username);
    if (existing) continue;
    const salt = generateSalt();
    const pwHash = hashPassword(u.password, salt);
    const id = 'u_' + u.username;
    db.prepare(
      'INSERT INTO users (id, username, password, salt, nickname, phone, role) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, u.username, pwHash, salt, u.nickname, u.phone, u.role);
  }
  console.log(`[Seed] 导入 ${DEMO_USERS.length} 个演示用户`);
}

module.exports = { ensureAdmin, seedDemoUsers };
