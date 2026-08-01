const express = require('express');
const router = express.Router();

// ==================== 七牛云配置 ====================
// 所有配置从环境变量读取，不硬编码任何默认值
// 配置方式：
//   生产环境：ecosystem.config.js 或 .env 文件
//   本地开发：export QINIU_AK=xxx
const QINIU_AK = process.env.QINIU_AK;
const QINIU_SK = process.env.QINIU_SK;
const QINIU_BUCKET = process.env.QINIU_BUCKET;
const QINIU_DOMAIN = process.env.QINIU_DOMAIN;

function ok(res, data) {
  res.json({ success: true, data });
}
function fail(res, msg, status = 400) {
  res.status(status).json({ success: false, error: msg });
}

// GET /api/upload/config — 获取上传配置（前端用）
router.get('/config', (req, res) => {
  if (!QINIU_DOMAIN) {
    return fail(res, '七牛云未配置');
  }
  ok(res, {
    domain: QINIU_DOMAIN,
    region: 'z2',  // 华南（根据你的 bucket 区域调整）
    useCdnDomain: true,
  });
});

// GET /api/upload/token — 获取七牛云上传凭证
router.get('/token', (req, res) => {
  if (!QINIU_AK || !QINIU_SK || !QINIU_BUCKET) {
    return fail(res, '七牛云未配置完整，请设置 QINIU_AK、QINIU_SK、QINIU_BUCKET');
  }

  const qiniu = require('qiniu');
  const mac = new qiniu.auth.digest.Mac(QINIU_AK, QINIU_SK);
  const putPolicy = new qiniu.rs.PutPolicy({
    scope: QINIU_BUCKET,
    expires: 3600,                    // 1 小时过期
    fsizeLimit: 10 * 1024 * 1024,     // 最大 10MB
    mimeLimit: 'image/jpeg;image/png;image/webp;image/gif',
  });

  const uploadToken = putPolicy.uploadToken(mac);

  ok(res, {
    token: uploadToken,
    domain: QINIU_DOMAIN,
    bucket: QINIU_BUCKET,
  });
});

module.exports = router;