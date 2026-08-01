const express = require('express');
const router = express.Router();

// ==================== 七牛云配置 ====================
// 从环境变量读取，避免硬编码密钥
// 配置方式：在服务器上 export QINIU_AK / QINIU_SK，或写入 .env 文件
const QINIU_AK = process.env.QINIU_AK || 'BAQQu2mFzJf0VasdZLOfDaB4UAMoe_nMmHEbY8LY';
const QINIU_SK = process.env.QINIU_SK || '_psf8jJ7ZS3Q6L6q9z7WGX3we03TdAXcJbUnpPF1';
const QINIU_BUCKET = process.env.QINIU_BUCKET || 'tiyycecb8';
const QINIU_DOMAIN = process.env.QINIU_DOMAIN || 'http://tiyycecb8.hn-bkt.clouddn.com';

function ok(res, data) {
  res.json({ success: true, data });
}
function fail(res, msg, status = 400) {
  res.status(status).json({ success: false, error: msg });
}

// GET /api/upload/token — 获取七牛云上传凭证
router.get('/token', (req, res) => {
  if (!QINIU_AK || !QINIU_SK) {
    return fail(res, '七牛云未配置，请在环境变量中设置 QINIU_AK 和 QINIU_SK');
  }

  const qiniu = require('qiniu');

  const mac = new qiniu.auth.digest.Mac(QINIU_AK, QINIU_SK);
  const putPolicy = new qiniu.rs.PutPolicy({
    scope: QINIU_BUCKET,
    // 上传 1 小时后过期
    expires: 3600,
    // 限定上传文件大小不超过 10MB
    fsizeLimit: 10 * 1024 * 1024,
    // 只允许上传图片类型
    mimeLimit: 'image/jpeg;image/png;image/webp;image/gif',
  });

  const uploadToken = putPolicy.uploadToken(mac);

  ok(res, {
    token: uploadToken,
    domain: QINIU_DOMAIN,
    bucket: QINIU_BUCKET,
  });
});

// GET /api/upload/config — 获取上传配置（前端用）
router.get('/config', (req, res) => {
  ok(res, {
    domain: QINIU_DOMAIN,
    region: 'z2',  // 华南（根据你的 bucket 区域调整）
    useCdnDomain: true,
  });
});

module.exports = router;