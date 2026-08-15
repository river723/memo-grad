#!/bin/sh
set -e

# 启动前应用数据库迁移。代码本身不自动迁移,必须在此显式执行,
# 否则新环境表不会建立。
echo "→ 应用数据库迁移..."
node_modules/.bin/prisma migrate deploy

echo "→ 启动服务..."
exec node dist/index.js
