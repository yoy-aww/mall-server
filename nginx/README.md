# Nginx 配置（宝塔面板）

本目录存放运行在服务器 `/www/server/panel/vhost/nginx/` 下的两个 vhost 配置，
作为版本控制基线。实际生效的文件在面板目录里，这里只是镜像 + 可回滚。

- `mall-web.conf`   → 8898，前端商城静态站点 + `/api`、`/uploads` 代理到后端 3000
- `mall.conf`       → 8899，管理后台静态站点 + `/api`、`/uploads` 代理到后端 3000

## 为什么要有 `/uploads/` 代理

前端返回的图片 url 是相对路径 `/uploads/xxx.png`。nginx 默认只把 `/api/` 代理到
后端，`/uploads/` 会被 `try_files` 兜底到 `index.html`，导致评价图片预览空白。
因此两个 server 块都显式加了：

```nginx
location /uploads/ {
    proxy_pass http://127.0.0.1:3000;
}
```

后端 `mall-server` 已经用 `express.static` 把 `./uploads/` 挂在 `/uploads` 上服务。

## 同步到线上

```bash
# 把这里的配置复制到面板目录（路径按实际面板调整）
cp nginx/mall-web.conf /www/server/panel/vhost/nginx/mall-web.conf
cp nginx/mall.conf    /www/server/panel/vhost/nginx/mall.conf
nginx -t && nginx -s reload
```

> 宝塔面板改 vhost 也会写这些文件；如果从面板改了，记得反向把改动拷回这里提交，
> 保持两边一致。
