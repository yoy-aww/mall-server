const express = require('express');
const router = express.Router();

// 每次请求时读取环境变量（确保 dotenv 生效）
const getEnv = () => ({
  ak: process.env.QINIU_AK,
  sk: process.env.QINIU_SK,
  bucket: process.env.QINIU_BUCKET,
  domain: process.env.QINIU_DOMAIN,
});

function ok(res, data) {
  res.json({ success: true, data });
}
function fail(res, msg, status = 400) {
  res.status(status).json({ success: false, error: msg });
}

// GET /api/upload/config
router.get('/config', (req, res) => {
  const env = getEnv();
  if (!env.domain) return fail(res, '七牛云未配置');
  ok(res, {
    domain: env.domain,
    region: 'z2',
    useCdnDomain: true,
  });
});

// GET /api/upload/token
router.get('/token', (req, res) => {
  const env = getEnv();
  if (!env.ak || !env.sk || !env.bucket) {
    return fail(res, '七牛云未配置完整，请设置 QINIU_AK、QINIU_SK、QINIU_BUCKET');
  }

  const qiniu = require('qiniu');
  const mac = new qiniu.auth.digest.Mac(env.ak, env.sk);
  const putPolicy = new qiniu.rs.PutPolicy({
    scope: env.bucket,
    expires: 3600,
    fsizeLimit: 10 * 1024 * 1024,
    mimeLimit: 'image/jpeg;image/png;image/webp;image/gif',
  });

  ok(res, {
    token: putPolicy.uploadToken(mac),
    domain: env.domain,
    bucket: env.bucket,
  });
});

module.exports = router;