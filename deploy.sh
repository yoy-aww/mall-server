#!/bin/bash
# =============================================
# mall-server 部署脚本
# 用法: ssh root@<服务器IP> "bash /var/www/mall/deploy.sh"
# =============================================
set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

# ==================== 配置 ====================
BASE_DIR="/var/www/mall"
SERVER_DIR="$BASE_DIR/mall-server"
MANAGE_DIR="$BASE_DIR/mall-manage"
MANAGE_DIST_DIR="/var/www/mall-manage"  # Nginx 指向的目录

# ==================== 部署 mall-server ====================
log "========== 部署 mall-server =========="

if [ ! -d "$SERVER_DIR" ]; then
  log "首次部署，克隆仓库..."
  mkdir -p "$BASE_DIR"
  git clone git@github.com:yoy-aww/mall-server.git "$SERVER_DIR"
fi

cd "$SERVER_DIR"
log "拉取最新代码..."
git pull

log "安装依赖..."
npm install --production

log "重启服务..."
pm2 restart mall-server 2>/dev/null || pm2 start src/index.js --name mall-server

log "✅ mall-server 部署完成"

# ==================== 部署 mall-manage ====================
log "========== 部署 mall-manage =========="

if [ ! -d "$MANAGE_DIR" ]; then
  log "首次部署，克隆仓库..."
  git clone git@github.com:yoy-aww/mall-manage.git "$MANAGE_DIR"
fi

cd "$MANAGE_DIR"
log "拉取最新代码..."
git pull

log "安装依赖..."
npm install

log "构建生产版本..."
npm run build

log "复制到 Nginx 目录..."
mkdir -p "$MANAGE_DIST_DIR"
cp -r dist/* "$MANAGE_DIST_DIR/"

log "✅ mall-manage 部署完成"

# ==================== 完成 ====================
log "========================================"
log "🎉 全部部署完成！"
log "   后端 API: http://<服务器IP>:3000"
log "   管理后台: http://<服务器IP>"
log "========================================"