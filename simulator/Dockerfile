# Simulador de Members, Memberships, Payments y Access Control (Node.js, sin compilación).
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src/ src/
USER node
EXPOSE 8090
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=30 \
  CMD wget -qO- http://127.0.0.1:8090/health > /dev/null || exit 1
CMD ["node", "src/server.js"]
