# Construction : Node épinglé, dépendances figées par le lockfile, tests compris.
FROM node:24.18.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run typecheck && npm test && npx vite build && npx vite build --ssr server/index.ts

# Service : Node seul (aucune dépendance npm à l'exécution), utilisateur non root.
# Le site, l'API d'administration, la médiathèque et les messages. Les données
# (SQLite + images envoyées) vivent sur le volume /app/data.
FROM node:24.18.1-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/app/data TRUST_PROXY=1
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/content >/dev/null || exit 1
CMD ["node", "dist-server/index.js"]
