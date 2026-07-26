# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run typecheck && npm run build

# The built app is static files. Serving them through nginx rather than a Node
# process keeps the runtime image free of npm dependencies entirely, so the
# static tier carries no advisory surface of its own.
FROM nginx:1.29-alpine AS runtime
RUN addgroup -S rectangle -g 1001 && adduser -S rectangle -u 1001 -G rectangle
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build --chown=rectangle:rectangle /app/dist /usr/share/nginx/html
RUN mkdir -p /var/cache/nginx /tmp/client_body \
  && chown -R rectangle:rectangle /var/cache/nginx /tmp/client_body
USER rectangle
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
