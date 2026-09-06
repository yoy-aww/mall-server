const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ==================== 配置 ====================
const SECRET = process.env.AUTH_SECRET || 'mall-default-secret';
if (!process.env.AUTH_SECRET) {
  console.warn('[WARN] AUTH_SECRET 未设置，使用默认密钥，生产环境请务必配置！');
}
// token 有效期：默认 7 天（毫秒）
const TOKEN_TTL_MS = parseInt(process.env.AUTH_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000, 10);
// bcrypt 成本因子：10 是安全与速度的平衡点
const BCRYPT_ROUNDS = 10;

// ==================== token 工具 ====================
/**
 * Token 格式: userId:expiresUnix:sig
 * sig = HMAC-SHA256(userId + ":" + expiresUnix + ":" + salt, SECRET)
 *
 * 三个好处：
 *   1) 有 expiresUnix —— 到点自动失效
 *   2) 带 salt —— 用户改密码（换 salt）后旧 token 立刻失效
 *   3) timing-safe compare —— 防时序攻击
 */
function timingSafeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * 生成带过期时间的签名 token
 * @param {string} userId
 * @param {string} salt 用户当前 salt
 * @param {number} ttlMs 有效期（毫秒），默认 TOKEN_TTL_MS
 */
function signToken(userId, salt, ttlMs = TOKEN_TTL_MS) {
  const expires = Math.floor(Date.now() / 1000) + Math.floor(ttlMs / 1000);
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(`${userId}:${expires}:${salt}`)
    .digest('hex');
  return `${userId}:${expires}:${sig}`;
}

/**
 * 校验 token，返回 userId 或 null。
 * 校验点：格式、过期时间、签名匹配、salt 匹配（改密码后失效）。
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split(':');
  if (parts.length !== 3) return null; // 兼容旧格式时长度=2，此处直接拒绝
  const [userId, expiresStr, sig] = parts;
  if (!userId || !expiresStr || !sig) return null;

  const expires = parseInt(expiresStr, 10);
  if (!Number.isFinite(expires)) return null;
  if (Date.now() / 1000 > expires) return null; // 过期

  const db = require('./db/database').getDb();
  const user = db.prepare('SELECT salt FROM users WHERE id = ?').get(userId);
  if (!user || !user.salt) return null;

  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${userId}:${expires}:${user.salt}`)
    .digest('hex');
  return timingSafeEqual(sig, expected) ? userId : null;
}

// ==================== 密码散列 ====================
/**
 * 判断密码 hash 是否是旧格式（SHA-256 hex，64 位十六进制）
 * bcrypt 输出以 $2a$ / $2b$ / $2y$ 开头
 */
function isLegacyHash(pw) {
  return typeof pw === 'string' && /^[a-fA-F0-9]{64}$/.test(pw);
}

/**
 * 生成 bcrypt hash（异步）
 * @param {string} password
 */
function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * 兼容校验密码：
 * - bcrypt 格式：用 bcrypt.compare
 * - 旧 SHA-256(salt+password) 格式：算一遍 sha256 比对
 * @returns {Promise<boolean>}
 */
function verifyPassword(password, storedHash, salt) {
  if (isLegacyHash(storedHash)) {
    // 旧算法：sha256(password + ":" + salt)
    const computed = crypto.createHash('sha256').update(`${password}:${salt}`).digest('hex');
    return Promise.resolve(timingSafeEqual(computed, storedHash));
  }
  return bcrypt.compare(password, storedHash);
}

/**
 * 生成新盐（bcrypt 的 salt 内嵌在 hash 里，这里保留是为兼容旧代码/DB 字段）
 * 新 hash 里已带 salt，users.salt 可保留但不再参与哈希。
 */
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// ==================== SSE 一次性 ticket ====================
// 用途：EventSource 不能带自定义 header，传统做法把 token 塞 query，会进 access log。
// 解法：客户端先用长期 token POST /api/auth/sse-ticket 换一次性短 ticket（默认 60s），
//        EventSource 只带这个短 ticket，被日志截获也无利用价值。
const SSE_TICKET_TTL_MS = parseInt(process.env.SSE_TICKET_TTL_MS || 60 * 1000, 10);
const sseTickets = new Map(); // ticket -> { userId, expires }

function issueSseTicket(userId) {
  const ticket = 'sse_' + crypto.randomBytes(16).toString('hex');
  sseTickets.set(ticket, { userId, expires: Date.now() + SSE_TICKET_TTL_MS });
  // 定期清理过期票据
  if (!module.exports._sseTimer) {
    module.exports._sseTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of sseTickets) if (now > v.expires) sseTickets.delete(k);
    }, 5 * 60 * 1000);
    module.exports._sseTimer.unref();
  }
  return { ticket, ttlMs: SSE_TICKET_TTL_MS };
}

function verifySseTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return null;
  const rec = sseTickets.get(ticket);
  if (!rec) return null;
  if (Date.now() > rec.expires) { sseTickets.delete(ticket); return null; }
  return rec.userId;
}

module.exports = {
  signToken,
  verifyToken,
  hashPassword,        // 新 API：async bcrypt
  verifyPassword,      // 兼容 API
  generateSalt,
  isLegacyHash,
  issueSseTicket,
  verifySseTicket,
  SECRET,
  TOKEN_TTL_MS,
  BCRYPT_ROUNDS,
  SSE_TICKET_TTL_MS,
};
