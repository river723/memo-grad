#!/usr/bin/env bash
# 部署 memo-grad 后端到飞牛 NAS。
#
# 用法（在仓库根目录或 server/ 目录都行）:
#   bash server/deploy-nas.sh
#
# 前提:
#   1. 本机装了 Git Bash / WSL / Linux（自带 rsync + ssh）
#   2. 已用 ssh-copy-id 配置好免密登录 NAS
#   3. NAS 上已建好目标目录，例如 /volume1/docker/memograd/server
#
# 可调参数（也可用环境变量覆盖）:
#   NAS_HOST  NAS_USER  NAS_PATH  SSH_PORT  COMPOSE_FILE
set -euo pipefail

# === 默认配置（按需改这里） ===
NAS_HOST="${NAS_HOST:-192.168.1.8}"
NAS_USER="${NAS_USER:-admin}"
NAS_PATH="${NAS_PATH:-/volume1/docker/memograd/server}"
SSH_PORT="${SSH_PORT:-22}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
HEALTH_URL="${HEALTH_URL:-http://${NAS_HOST}:5888/health}"

# 定位到 server/ 目录（无论从仓库根还是 server/ 调起都能找到 rsync 源）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "▶ 同步源码到 ${NAS_USER}@${NAS_HOST}:${NAS_PATH}"
rsync -avz --delete \
  -e "ssh -p ${SSH_PORT}" \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=.env \
  --exclude=.env.local \
  --exclude=.env.development \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  ./ "${NAS_USER}@${NAS_HOST}:${NAS_PATH}/"

echo "▶ 远程重建并重启容器（首次构建可能数分钟，依赖层会走缓存）"
ssh -p "${SSH_PORT}" "${NAS_USER}@${NAS_HOST}" \
  "cd '${NAS_PATH}' && docker compose -f ${COMPOSE_FILE} up -d --build"

echo "▶ 等待容器健康"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 3 "${HEALTH_URL}" >/dev/null 2>&1; then
    echo "  ✓ 健康检查通过（${HEALTH_URL}）"
    break
  fi
  if [[ $i -eq 10 ]]; then
    echo "  ⚠ 30s 内未通过健康检查，请查看日志："
    echo "    ssh ${NAS_USER}@${NAS_HOST} 'docker logs --tail=80 memograd-api'"
    exit 1
  fi
  sleep 3
done

echo "▶ 最近 30 行日志"
ssh -p "${SSH_PORT}" "${NAS_USER}@${NAS_HOST}" "docker logs --tail=30 memograd-api" || true

echo
echo "✓ 部署完成 → ${HEALTH_URL}"
