/**
 * 用户种子数据 — bcrypt 散列
 * id 命名沿用历史（u_zhangsan / u_lisi / u_wangwu / u_zhaomin / u_chenhao / u_liuyang），
 * 因为 seed-orders / seed-reviews / seed-aftersales / seed-addresses 都依赖这些 id。
 */
const bcrypt = require('bcryptjs');
const { getDb } = require('./database');

const BCRYPT_ROUNDS = 10;

function seedDemoUsers() {
  const db = getDb();
  const existing = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'user'").get().c;
  if (existing > 0) {
    console.log('[Seed] 用户表已有普通用户，跳过导入');
    return;
  }

  const insert = db.prepare(
    "INSERT INTO users (id, username, password, salt, nickname, phone, role, disabled) VALUES (?, ?, ?, ?, ?, ?, 'user', 0)"
  );

  // 演示用户 — 密码都是 Demo@123，bcrypt 散列
  // 注意：id 用历史命名，其他 seed 依赖
  const demoUsers = [
    { id: 'u_zhangsan', username: 'zhangwei',  nickname: '张伟', phone: '13800138001', pw: 'Demo@123' },
    { id: 'u_lisi',     username: 'lina',      nickname: '李娜', phone: '13800138002', pw: 'Demo@123' },
    { id: 'u_wangwu',   username: 'wangqiang', nickname: '王强', phone: '13800138003', pw: 'Demo@123' },
    { id: 'u_zhaomin',  username: 'zhaomin',   nickname: '赵敏', phone: '13800138004', pw: 'Demo@123' },
    { id: 'u_chenhao',  username: 'chenhao',   nickname: '陈浩', phone: '13800138005', pw: 'Demo@123' },
    { id: 'u_liuyang',  username: 'liuyang',   nickname: '刘洋', phone: '13800138006', pw: 'Demo@123' },
  ];

  const { generateSalt } = require('../auth');
  for (const u of demoUsers) {
    insert.run(u.id, u.username, bcrypt.hashSync(u.pw, BCRYPT_ROUNDS), generateSalt(), u.nickname, u.phone);
  }
  console.log(`[Seed] 导入 ${demoUsers.length} 个演示用户（bcrypt）`);
}

function ensureAdmin() {
  const db = getDb();
  const { generateSalt } = require('../auth');
  const existing = db.prepare("SELECT id, password, salt FROM users WHERE role = 'admin'").get();

  if (existing) {
    const isBcrypt = String(existing.password || '').startsWith('$2');
    const hasSalt = String(existing.salt || '').length > 0;

    // 1) legacy SHA-256 hash → 重置为 bcrypt Admin@123
    if (!isBcrypt) {
      db.prepare("UPDATE users SET password = ***, salt = ?, updatedAt = datetime('now') WHERE id = ?")
        .run(bcrypt.hashSync('Admin@123', BCRYPT_ROUNDS), generateSalt(), existing.id);
      console.log('[Seed] admin 为旧 SHA-256 hash，已重置为 bcrypt Admin@123');
      return;
    }

    // 2) bcrypt 但 salt 为空（旧 seed 遗留）→ 补 salt
    //    bcrypt 本身内嵌 salt，HMAC 校验用的是 users.salt 字段，空的会导致 token 无法验证。
    //    补上 salt 会让已有的 token 失效，但那些 token 本来也验证不过。
    if (!hasSalt) {
      db.prepare("UPDATE users SET salt = ?, updatedAt = datetime('now') WHERE id = ?")
        .run(generateSalt(), existing.id);
      console.log('[Seed] admin bcrypt hash 已存在但 salt 为空，已补 salt');
    }
    return;
  }

  // 新建默认管理员：admin / Admin@123
  db.prepare(
    "INSERT INTO users (id, username, password, salt, nickname, phone, role, disabled) VALUES (?, ?, ?, ?, ?, ?, 'admin', 0)"
  ).run(
    'admin_001', 'admin',
    bcrypt.hashSync('Admin@123', BCRYPT_ROUNDS),
    generateSalt(),
    '管理员', '13800000000'
  );
  console.log('[Seed] 创建默认管理员 admin / Admin@123（bcrypt）');
}

module.exports = { seedDemoUsers, ensureAdmin };
