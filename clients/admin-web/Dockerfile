# Panel administrativo: se compila con Node y se sirve con nginx, que además hace de proxy en el mismo origen:
#   /api/graphql -> GraphQL Gateway (/graphql), única ruta de API del navegador
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY public/ public/
COPY src/ src/
RUN npm run build

FROM nginx:1.27-alpine
ENV GATEWAY_UPSTREAM=graphql-gateway:8080 \
    DNS_RESOLVER=127.0.0.11
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=10 \
  CMD wget -qO- http://127.0.0.1/healthz > /dev/null || exit 1
