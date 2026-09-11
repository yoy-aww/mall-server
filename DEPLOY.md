# 服务器部署指南

## 服务器信息

- IP: `43.153.148.187`
- 类型: 腾讯云海外云主机
- 系统: **OpenCloudOS 9.4**（RHEL 系，包管理器用 `dnf`）

---

## 一、服务器环境准备（一次性）

通过 SSH 连上服务器，执行以下命令：

### 1. 安装 Node.js

OpenCloudOS 是 RHEL 系，用 NodeSource 的 RPM 源安装：

```bash
# 安装 Node.js 20.x LTS
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

# 验证
node -v   # 应显示 v20.x.x
npm -v    # 应显示 10.x.x
```

### 2. 安装 PM2（进程管理）

```bash
npm install -g pm2

# 验证
pm2 -v
```

### 3. 安装 Nginx（Web 服务器）

```bash
dnf install -y nginx

# 启动并设置开机自启
systemctl start nginx
systemctl enable nginx

# 验证
nginx -v
```

### 4. 配置 Nginx 反向代理

> 服务器实际使用**宝塔面板**管理 Nginx，vhost 配置在 `/www/server/panel/vhost/nginx/`
> 下（不是 `/etc/nginx/conf.d/`）。两个站点端口：
> - **8898** `mall-web.conf` → 前端商城（`root /var/www/mall-web`）
> - **8899** `mall.conf`    → 管理后台（`root /var/www/mall-manage`）
>
> 这两个 vhost 的**版本控制基线**在 `mall-server/nginx/`（`mall-web.conf`、`mall.conf`），
> 改完复制下面两处、`nginx -t && nginx -s reload` 即可。完整说明见 `nginx/README.md`。

两个 server 块结构一致，以 8898 的 `mall-web.conf` 为例：

```nginx
server {
    listen 8898;
    server_name 43.153.148.187;

    root /var/www/mall-web;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 用户上传文件（评价图片等）—— 关键，缺了会空白
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
    }

    # 后端 API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

> ⚠️ `/uploads/` 必须代理到后端（或用 `alias` 指向 `mall-server/uploads/`）。
> 前端拿到的图片 url 是相对路径 `/uploads/xxx.png`，若 nginx 不处理它，
> 会命中 `try_files` 兜底返回 `index.html`，图片预览就显示空白。

启用配置：

```bash
nginx -t                  # 测试配置是否正确
nginx -s reload           # 或 systemctl reload nginx
```

### 5. 配置防火墙

OpenCloudOS 默认使用 firewalld：

```bash
# 开放 80 端口
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --reload

# 查看开放端口
firewall-cmd --list-ports
```

### 6. 配置 Git 和 SSH

```bash
# 生成 SSH 密钥（用于拉取 GitHub 仓库）
ssh-keygen -t ed25519 -C "your-email@example.com" -f ~/.ssh/id_ed25519 -N ""

# 查看公钥
cat ~/.ssh/id_ed25519.pub
```

把输出的公钥添加到 GitHub：
- 打开 https://github.com/settings/keys
- 点击 "New SSH key"
- 粘贴公钥

测试连接：

```bash
ssh -T git@github.com
# 应显示: Hi yoy-aww! You've successfully authenticated...
```

### 7. 创建项目目录

```bash
mkdir -p /var/www/mall
```

### 7. 图片 CDN 配置

图片存储在独立 GitHub 仓库 `yoy-aww/mall-images`，通过 jsDelivr CDN 加速。

- 仓库地址：`https://github.com/yoy-aww/mall-images`
- CDN 基础路径：`https://cdn.jsdelivr.net/gh/yoy-aww/mall-images/imgs/`
- 添加/替换图片：直接 push 到 mall-images 仓库的 `imgs/` 目录即可

---

## 二、首次部署

### 1. 把 deploy.sh 上传到服务器

在你的本地电脑执行：

```bash
cd /c/yoyac-work/小程序商城/server
scp deploy.sh root@43.153.148.187:/var/www/mall/deploy.sh
```

### 2. 执行部署脚本

```bash
ssh root@43.153.148.187 "bash /var/www/mall/deploy.sh"
```

### 3. 验证

```bash
# 检查后端
curl http://localhost:3000/api/health
# 应返回: {"status":"ok","time":"..."}

# 通过 Nginx 检查管理后台
curl http://localhost/api/banners
# 应返回: {"success":true,"data":[...]}

# 通过浏览器访问
curl http://43.153.148.187
# 应返回管理后台的 HTML 页面
```

---

## 三、日常部署

每次修改代码后：

```bash
# 1. 推送代码到 GitHub
git push

# 2. 连服务器部署
ssh root@43.153.148.187 "bash /var/www/mall/deploy.sh"
```

---

## 四、常用命令

```bash
# 查看后端日志
pm2 logs mall-server

# 重启后端
pm2 restart mall-server

# 查看进程状态
pm2 list

# 查看 Nginx 日志
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# 测试 API
curl http://localhost:3000/api/health
curl http://localhost:3000/api/products

# 防火墙管理
firewall-cmd --list-ports
systemctl status firewalld

# 查看 SELinux 状态
getenforce
```

---

## 五、常见问题

### Q: 部署后网站打不开，Nginx 报 502
A: 通常是 SELinux 导致的，执行：
```bash
setsebool -P httpd_can_network_connect 1
```

### Q: 部署后 API 返回空数据
A: 检查 `mall.db` 文件是否存在：
```bash
ls -la /var/www/mall/mall-server/mall.db
```
如果不存在，重启服务会自动生成并导入种子数据：
```bash
pm2 restart mall-server
```

### Q: 部署时 git pull 报权限错误
A: 检查 SSH 密钥是否已添加到 GitHub：
```bash
ssh -T git@github.com
```