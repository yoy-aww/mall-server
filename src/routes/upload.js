/**
 * 图片上传 —— 零第三方依赖，Node.js 原生解析 multipart/form-data。
 * 存入 ./uploads/，通过 express.static 对外服务。
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('./auth');

// 上传目录
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const EXT_MAP = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const boundary = (req.headers['content-type'] || '').split('boundary=')[1];
    if (!boundary) return reject(new Error('Missing boundary'));

    const chunks = [];
    let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_SIZE) { reject(new Error('文件过大')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const delim = Buffer.from('--' + boundary);
      let start = raw.indexOf(delim) + delim.length;
      while (raw[start] === 0x0d || raw[start] === 0x0a) start++;
      const end = raw.indexOf(delim, start) - 2;
      if (start >= end) return reject(new Error('Empty file'));
      const buf = raw.slice(start, end);

      // 找 header 和 body 的分隔（\r\n\r\n）
      const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'));
      if (headerEnd < 0) return reject(new Error('Bad multipart'));
      const header = buf.slice(0, headerEnd).toString();
      const body = buf.slice(headerEnd + 4);

      const fileName = header.match(/filename="([^"]+)"/);
      const name = fileName ? fileName[1].split('\\').pop().split('/').pop() : 'upload';
      const mime = header.match(/Content-Type:\s*([\w/]+)/);
      resolve({ name, mime: mime ? mime[1] : 'application/octet-stream', body });
    });
    req.on('error', reject);
  });
}

// POST /api/upload — 上传单张图片
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, mime, body } = await parseMultipart(req);
    if (!ALLOWED.includes(mime)) return res.status(400).json({ success: false, error: '仅支持 JPG/PNG/WebP/GIF' });

    const ext = EXT_MAP[mime] || '.jpg';
    const fname = Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + ext;
    const fpath = path.join(UPLOAD_DIR, fname);
    fs.writeFileSync(fpath, body);

    res.json({ success: true, data: { url: `/uploads/${fname}` } });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || '上传失败' });
  }
});

module.exports = router;
