# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS build
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run typecheck && npm run build

FROM base AS runtime
RUN addgroup -S rectangle -g 1001 && adduser -S rectangle -u 1001 -G rectangle
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=rectangle:rectangle /app/dist ./dist
COPY --from=build --chown=rectangle:rectangle /app/migrations ./migrations
USER rectangle
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const port=process.env.PORT||8080; require('http').get('http://127.0.0.1:'+port+'/health/live', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["npm", "run", "start"]
