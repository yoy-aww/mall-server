const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { signToken, verifyToken, hashPassword, generateSalt } = require('../auth');

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
    'SELECT id, username, nickname, phone, role, avatar, createdAt FROM users WHERE id = ?'
  ).get(userId);
  if (!user) return fail(res, '登录已过期', 401);

  // 去掉密码和盐
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

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, password, nickname, phone } = req.body;
  if (!username || !password) return fail(res, '用户名和密码为必填');
  if (username.length < 3) return fail(res, '用户名至少 3 位');
  if (password.length < 6) return fail(res, '密码至少 6 位');

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return fail(res, '用户名已存在');

  const salt = generateSalt();
  const pwHash = hashPassword(password, salt);
  const id = 'u_' + Date.now().toString(36);

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

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return fail(res, '请输入用户名和密码');

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.disabled) return fail(res, '用户名或密码错误');

  const expected = hashPassword(password, user.salt);
  if (expected !== user.password) return fail(res, '用户名或密码错误');

  const token = signToken(user.id, user.salt);

  // 去掉敏感字段
  const { password: _, salt, ...safeUser } = user;
  ok(res, {
    token,
    user: safeUser,
  });
});

// ============ 当前用户 ============

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  ok(res, req.user);
});

// POST /api/auth/users — 管理员新增用户
router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, nickname, phone } = req.body;
  if (!username || !password) return fail(res, '用户名和密码为必填');
  if (username.length < 3) return fail(res, '用户名至少 3 位');
  if (password.length < 6) return fail(res, '密码至少 6 位');

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return fail(res, '用户名已存在');

  const salt = generateSalt();
  const pwHash = hashPassword(password, salt);
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
router.post('/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return fail(res, '旧密码和新密码为必填');
  if (newPassword.length < 6) return fail(res, '新密码至少 6 位');

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const expected = hashPassword(oldPassword, user.salt);
  if (expected !== user.password) return fail(res, '旧密码错误');

  const newSalt = generateSalt();
  const newHash = hashPassword(newPassword, newSalt);
  db.prepare('UPDATE users SET password = ?, salt = ?, updatedAt = datetime(\'now\') WHERE id = ?')
    .run(newHash, newSalt, user.id);

  ok(res, { message: '密码已修改' });
});

// ============ 管理员用户管理 ============

// GET /api/users — 所有用户
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM users ORDER BY createdAt DESC').all();
  // 去掉敏感字段
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
router.post('/users/reset-password/:id', requireAuth, requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return fail(res, '新密码至少 6 位');

  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '用户不存在', 404);

  const salt = generateSalt();
  const pwHash = hashPassword(password, salt);
  db.prepare('UPDATE users SET password=?, salt=?, updatedAt=datetime(\'now\') WHERE id=?')
    .run(pwHash, salt, req.params.id);

  ok(res, { message: '密码已重置' });
});

// DELETE /api/users/:id
router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, '用户不存在', 404);
  if (existing.role === 'admin') return fail(res, '不能删除管理员账号', 400);
  if (existing.id === req.user.id) return fail(res, '不能删除自己', 400);

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  ok(res, { deleted: req.params.id });
});

module.exports = { router, requireAuth };
