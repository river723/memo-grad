# ---- build 阶段:安装全部依赖、生成 Prisma client、编译 TS ----
FROM node:20-alpine AS build
WORKDIR /app

# 先拷贝依赖描述,利用 Docker 层缓存
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# 拷贝源码并构建
COPY . .
# prisma generate 产出运行时需要的 client;tsc 产出 dist/
RUN npx prisma generate && npm run build

# ---- runner 阶段:精简镜像 ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 从 build 阶段复制运行所需内容。
# 包含完整 node_modules(内含 prisma CLI 与生成的 client),
# 以便 entrypoint 执行 `prisma migrate deploy`。
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh && chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
