/**
 * RAG 租户管理代理 —— 管理后台（manage）调用。
 *
 * 两层鉴权：
 *   1. 商城管理员登录态（requireAuth + requireAdmin）—— 谁有资格管租户
 *   2. X-Admin-Key —— RAG 服务端的管理密钥（本服务 .env 持有）
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('./auth');

const RAG_BASE = process.env.RAG_BASE_URL || 'http://localhost:8000';
const RAG_ADMIN_KEY = process.env.RAG_ADMIN_KEY || 'admin-dev-key';
const TIMEOUT_MS = 30000;

async function adminProxy(req, res, path) {
  try {
    const resp = await fetch(`${RAG_BASE}${path}`, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': RAG_ADMIN_KEY,
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await resp.json().catch(() => ({}));
    res.status(resp.status).json(data);
  } catch (e) {
    res.status(502).json({ success: false, error: `RAG 服务不可达: ${e.message}` });
  }
}

// 租户列表
router.get('/tenants', requireAuth, requireAdmin, (req, res) =>
  adminProxy(req, res, '/admin/tenants'));

// 创建租户 {name}
router.post('/tenants', requireAuth, requireAdmin, (req, res) =>
  adminProxy(req, res, '/admin/tenants'));

// 删除租户
router.delete('/tenants/:id', requireAuth, requireAdmin, (req, res) =>
  adminProxy(req, res, `/admin/tenants/${req.params.id}`));

// 重置 API key
router.post('/tenants/:id/reset-key', requireAuth, requireAdmin, (req, res) =>
  adminProxy(req, res, `/admin/tenants/${req.params.id}/reset-key`));

module.exports = router;
