# 服务器部署指南

## 服务器信息

- IP: `43.153.148.187`
- 类型: 腾讯云海外云主机
- 系统: Ubuntu / Debian（推荐）

---

## 一、服务器环境准备（一次性）

通过 SSH 连上服务器，执行以下命令：

### 1. 安装 Node.js

```bash
# 安装 Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

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
apt install -y nginx

# 验证
nginx -v
```

### 4. 配置 Nginx 反向代理

创建配置文件 `/etc/nginx/sites-available/mall`：

```nginx
server {
    listen 80;
    server_name 43.153.148.187;

    # 管理后台（静态文件）
    root /var/www/mall-manage;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
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

启用配置：

```bash
ln -sf /etc/nginx/sites-available/mall /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t          # 测试配置是否正确
systemctl restart nginx
```

### 5. 配置 Git 和 SSH

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

### 6. 创建项目目录

```bash
mkdir -p /var/www/mall
```

---

## 二、首次部署

### 1. 把 deploy.sh 上传到服务器

```bash
# 本地执行
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

# 检查管理后台
curl http://localhost/api/banners
# 应返回: {"success":true,"data":[...]}
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
```