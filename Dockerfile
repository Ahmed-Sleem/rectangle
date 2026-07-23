# syntax=docker/dockerfile:1

FROM node:20-alpine AS web-build
WORKDIR /app/apps/web
ENV NODE_ENV=development
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --include=dev
COPY apps/web/index.html apps/web/tsconfig.json apps/web/tsconfig.app.json apps/web/tsconfig.node.json apps/web/vite.config.ts ./
COPY apps/web/public ./public
COPY apps/web/src ./src
RUN npm run typecheck && npm run build

FROM node:20-alpine AS api-build
WORKDIR /app/apps/api
ENV NODE_ENV=development
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --include=dev
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json ./
COPY apps/api/src ./src
COPY apps/api/migrations ./migrations
RUN npm run typecheck && npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV RECTANGLE_WEB_DIST=/app/apps/web/dist
WORKDIR /app
RUN addgroup -S rectangle -g 1001 && adduser -S rectangle -u 1001 -G rectangle
COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
RUN cd apps/api && npm ci --omit=dev && npm cache clean --force
COPY --from=api-build --chown=rectangle:rectangle /app/apps/api/dist ./apps/api/dist
COPY --from=api-build --chown=rectangle:rectangle /app/apps/api/migrations ./apps/api/migrations
COPY --from=web-build --chown=rectangle:rectangle /app/apps/web/dist ./apps/web/dist
USER rectangle
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "const port=process.env.PORT||8080; require('http').get('http://127.0.0.1:'+port+'/health/live', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["sh", "-c", "npm --prefix apps/api run migrate && npm --prefix apps/api run start"]
