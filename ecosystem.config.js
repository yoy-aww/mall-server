module.exports = {
  apps: [{
    name: 'mall-server',
    script: 'src/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '0.0.0.0',
      // 七牛云配置 — 从 .env 文件读取
      // 复制 .env.example 为 .env 并填入实际值
      QINIU_AK: process.env.QINIU_AK || '',
      QINIU_SK: process.env.QINIU_SK || '',
      QINIU_BUCKET: process.env.QINIU_BUCKET || 'tiyycecb8',
      QINIU_DOMAIN: process.env.QINIU_DOMAIN || 'http://tiyycecb8.hn-bkt.clouddn.com',
    },
    // 日志配置
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    // 自动重启
    max_restarts: 10,
    restart_delay: 3000,
  }],
};