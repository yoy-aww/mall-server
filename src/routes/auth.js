const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { signToken, verifyToken, hashPassword, verifyPassword, generateSalt, isLegacyHash } = require('../auth');
const { rateLimit, loginLimiter, registerLimiter } = require('../rate-limit');

function ok(res, data) { res.json({ success: true, data }); }
function fail(res, msg, status = 400) { res.status(status).json({ success: false, error: msg }); }

// ============ 认证中间件 ============

/** 从 token 提取用户信息，挂到 req.user */
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return fail(res, '未登录', 401);

  const userId = verifyToken(token);
  if (!userId) return fail(res, '登录已过期', 401);

  const db = getDb();
  const user = db.prepare(
    'SELECT id, username, nickname, phone, role, avatar, createdAt, disabled FROM users WHERE id = ?'
  ).get(userId);
  if (!user) return fail(res, '登录已过期', 401);
  if (user.disabled) return fail(res, '账号已被禁用', 403);

  const { password, salt, ...safeUser } = user;
  req.user = safeUser;
  next();
}

/** 管理员权限 */
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return fail(res, '无权限', 403);
  next();
}

// ============ 注册 ============

// POST /api/auth/register（限流：每 IP 15 分钟内最多 5 次）
router.post('/register', rateLimit(registerLimiter), async (req, res) => {
  const { username, password, nickname, phone } = req.body;
  if (!username || !password) return fail(res, '用户名和密码为必填');
  if (username.length < 3) return fail(res, '用户名至少 3 位');
  if (password.length < 6) return fail(res, '密码至少 6 位');
  // 手机号格式校验
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) return fail(res, '手机号格式不正确');

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return fail(res, '用户名已存在');

  const pwHash = await hashPassword(password); // bcrypt
  const salt = generateSalt();                  // 兼容字段，token 仍绑定它
  const id = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);

  db.prepare(
    'INSERT INTO users (id, username, password, salt, nickname, phone, role) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, username, pwHash, salt, nickname || '', phone || '', 'user');

  const token = signToken(id, salt);
  ok(res, {
    token,
    user: { id, username, nickname: nickname || '', phone: phone || '', role: 'user' },
  });
});

// ============ 登录 ============

// POST /api/auth/login（限流：每 IP 15 分钟内最多 10 次）
router.post('/login', rateLimit(loginLimiter), async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return fail(res, '请输入用户名和密码');

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.disabled) return fail(res, '用户名或密码错误');

  // 兼容旧 hash / 新 bcrypt 两条路径
  const valid = await verifyPassword(password, user.password, user.salt);
  if (!valid) return fail(res, '用户名或密码错误');

  // 老 SHA-256 hash 自动升级为 bcrypt：登录成功即换 hash + 新 salt
  // （副作用：所有旧 token 立刻失效，用户需要重新登录一次）
  if (isLegacyHash(user.password)) {
    const newSalt = generateSalt();
    const newHash = await hashPassword(password);
    db.prepare('UPDATE users SET password = ?, salt = ?, updatedAt = datetime(\'now\') WHERE id = ?')
      .run(newHash, newSalt, user.id);
    user.salt = newSalt;
    console.log(`[Auth] 用户 ${user.username} 密码已自动升级为 bcrypt`);
  }

  const token = signToken(user.id, user.salt);

  const { password: _p, salt, ...safeUser } = user;
  ok(res, { token, user: safeUser });
});

// ============ 当前用户 ============

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  ok(res, req.user);
});

// POST /api/auth/users — 管理员新增用户
router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  const { username, password, nickname, phone } = req.body;
  if (!username || !password) return fail(res, '用户名和密码为必填');
  if (username.length < 3) return fail(res, '用户名至少 3 位');
  if (password.length < 6) return fail(res, '密码至少 6 位');

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return fail(res, '用户名已存在');

  const salt = generateSalt();
  const pwHash = await hashPassword(password);
  const id = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);

  db.prepare(
    'INSERT INTO users (id, username, password, salt, nickname, phone, role, disabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, username, pwHash, salt, nickname || '', phone || '', 'user', 0);

  ok(res, { id, username });
});

// PUT /api/auth/users/:id/status — 管理员禁用/启用账号
router.put('/users/:id/status', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '用户不存在', 404);
  if (existing.role === 'admin') return fail(res, '不能禁用管理员账号', 400);
  if (existing.id === req.user.id) return fail(res, '不能禁用自己', 400);

  const { disabled } = req.body;
  const val = disabled ? 1 : 0;
  db.prepare('UPDATE users SET disabled=?, updatedAt=datetime(\'now\') WHERE id=?')
    .run(val, req.params.id);

  ok(res, { id: req.params.id, disabled: val });
});

// ============ 密码修改 ============

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return fail(res, '旧密码和新密码为必填');
  if (newPassword.length < 6) return fail(res, '新密码至少 6 位');

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  // 先校验旧密码
  const oldValid = await verifyPassword(oldPassword, user.password, user.salt);
  if (!oldValid) return fail(res, '旧密码错误');

  // 新密码不能与旧密码相同
  if (await verifyPassword(newPassword, user.password, user.salt)) {
    return fail(res, '新密码不能与旧密码相同');
  }

  // 换新 salt + 新 bcrypt hash（副作用：所有旧 token 立刻失效）
  const newSalt = generateSalt();
  const newHash = await hashPassword(newPassword);
  db.prepare('UPDATE users SET password = ?, salt = ?, updatedAt = datetime(\'now\') WHERE id = ?')
    .run(newHash, newSalt, user.id);

  ok(res, { message: '密码已修改，请重新登录' });
});

// ============ 管理员用户管理 ============

// GET /api/users — 所有用户
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM users ORDER BY createdAt DESC').all();
  const safe = rows.map(({ password, salt, ...u }) => u);
  ok(res, safe);
});

// GET /api/users/:id
router.get('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, '用户不存在', 404);
  const { password, salt, ...safe } = row;
  ok(res, safe);
});

// PUT /api/users/:id — 更新用户（改昵称、角色等，admin 可用）
router.put('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '用户不存在', 404);

  const { username, nickname, phone, role, avatar } = req.body;
  if (username && username !== existing.username) {
    const dup = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.params.id);
    if (dup) return fail(res, '用户名已存在');
  }
  db.prepare(
    'UPDATE users SET username=?, nickname=?, phone=?, role=?, avatar=?, updatedAt=datetime(\'now\') WHERE id=?'
  ).run(
    username ?? existing.username,
    nickname ?? existing.nickname,
    phone ?? existing.phone,
    role ?? existing.role,
    avatar ?? existing.avatar,
    req.params.id
  );
  ok(res, { id: req.params.id });
});

// POST /api/users/reset-password/:id — 管理员重置用户密码
router.post('/users/reset-password/:id', requireAuth, requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return fail(res, '新密码至少 6 位');

  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '用户不存在', 404);

  const salt = generateSalt();
  const pwHash = await hashPassword(password);
  db.prepare('UPDATE users SET password=?, salt=?, updatedAt=datetime(\'now\') WHERE id=?')
    .run(pwHash, salt, req.params.id);

  ok(res, { message: '密码已重置' });
});

// DELETE /api/users/:id?mode=soft|hard
// 默认软删除：用户敏感字段抹除，历史订单保留但变为"已删除用户"归属，
// 避免孤儿订单，也保留审计线索。mode=hard 才真的 DELETE 全部相关数据。
router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '用户不存在', 404);
  if (existing.role === 'admin') return fail(res, '不能删除管理员账号', 400);
  if (existing.id === req.user.id) return fail(res, '不能删除自己', 400);
  if (existing.disabled) return fail(res, '用户已被软删除', 400);

  const mode = req.query.mode === 'hard' ? 'hard' : 'soft';
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const userId = req.params.id;

  if (mode === 'hard') {
    // 硬删除：先处理子表，再删用户
    const counts = {
      orders: db.prepare('SELECT COUNT(*) as c FROM orders WHERE userId = ?').get(userId).c,
      aftersales: db.prepare('SELECT COUNT(*) as c FROM aftersales WHERE userId = ?').get(userId).c,
      reviews: db.prepare('SELECT COUNT(*) as c FROM reviews WHERE userId = ?').get(userId).c,
      addresses: db.prepare('SELECT COUNT(*) as c FROM addresses WHERE userId = ?').get(userId).c,
      notifications: db.prepare('SELECT COUNT(*) as c FROM notifications WHERE userId = ?').get(userId).c,
    };
    db.transaction(() => {
      db.prepare('DELETE FROM aftersales WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM reviews WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM orders WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM addresses WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM notifications WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    })();
    ok(res, { deleted: userId, mode, counts });
    return;
  }

  // 软删除：抹除敏感字段，保留审计，处理子表归属
  const counts = {
    ordersAnonymized: db.prepare("SELECT COUNT(*) as c FROM orders WHERE userId = ?").get(userId).c,
    reviewsAnonymized: db.prepare("SELECT COUNT(*) as c FROM reviews WHERE userId = ?").get(userId).c,
    aftersalesAnonymized: db.prepare("SELECT COUNT(*) as c FROM aftersales WHERE userId = ?").get(userId).c,
    addressesDeleted: db.prepare("SELECT COUNT(*) as c FROM addresses WHERE userId = ?").get(userId).c,
    notificationsDeleted: db.prepare("SELECT COUNT(*) as c FROM notifications WHERE userId = ?").get(userId).c,
  };

  db.transaction(() => {
    // 抹除敏感字段：清空昵称/头像/电话，密码设非法值
    db.prepare(`UPDATE users SET
        nickname = ?,
        avatar = '',
        phone = '',
        password = ?,
        disabled = 1,
        updatedAt = ?
      WHERE id = ?
    `).run(`[deleted:${now}]`, '$2b$10$invalid00000000000000000000000000000000000000000000000000', now, userId);

    // 订单：保留但标注归属已删除（不能 DELETE，售后/评价/历史查询会孤儿）
    // 在 remark 末尾附加删除标记，方便管理员后台筛选
    const orders = db.prepare("SELECT id, remark FROM orders WHERE userId = ?").all(userId);
    const updOrder = db.prepare('UPDATE orders SET remark = ? WHERE id = ?');
    for (const o of orders) {
      updOrder.run(`[${o.remark || ''} | owner_deleted:${now}]`.trim(), o.id);
    }

    // 评价：保留但 username/nickname 抹除
    db.prepare(`UPDATE reviews SET username = ?, nickname = ? WHERE userId = ?`)
      .run('[deleted]', '[deleted]', userId);

    // 售后：保留但关联用户已删除（status 为 pending 的自动拒）
    db.prepare(`UPDATE aftersales SET status = ?, handleReason = ?, handledAt = ? WHERE userId = ? AND status = ?`)
      .run('rejected', '用户已删除，售后申请自动关闭', now, userId, 'pending');

    // 地址：删除（敏感信息）
    db.prepare('DELETE FROM addresses WHERE userId = ?').run(userId);
    // 通知：删除（临时信息）
    db.prepare('DELETE FROM notifications WHERE userId = ?').run(userId);
  })();

  ok(res, { deleted: userId, mode: 'soft', counts });
});

module.exports = { router, requireAuth, requireAdmin };
