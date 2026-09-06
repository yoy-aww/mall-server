module.exports = {
  apps: [{
    name: 'mall-server',
    script: 'src/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '0.0.0.0',
      // 图片 CDN：https://cdn.jsdelivr.net/gh/yoy-aww/mall-images/imgs/
      // 不依赖七牛云，图片存在独立 GitHub 仓库 mall-images，由 jsDelivr CDN 加速。
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