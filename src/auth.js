const crypto = require('crypto');

const SECRET = process.env.AUTH_SECRET || 'mall-default-secret';

/**
 * 生成签名 token
 * 格式: userId:hex(HMAC-SHA256(userId+salt, secret))
 * salt 是用户密码字段，双重绑定
 */
function signToken(userId, salt) {
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(`${userId}:${salt}`)
    .digest('hex');
  return `${userId}:${sig}`;
}

/**
 * 校验 token，返回 userId 或 null
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [userId, sig] = token.split(':');
  if (!userId || !sig) return null;
  const db = require('./db/database').getDb();
  const user = db.prepare('SELECT salt FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${userId}:${user.salt}`)
    .digest('hex');
  return sig === expected ? userId : null;
}

/**
 * 密码散列：SHA256(password+salt)
 * salt 存数据库 users.salt 字段
 */
function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(`${password}:${salt}`).digest('hex');
}

/**
 * 生成随机盐
 */
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { signToken, verifyToken, hashPassword, generateSalt, SECRET };
