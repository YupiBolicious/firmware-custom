FROM node:20-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
RUN mkdir -p /app/uploads && chown -R node:node /app

USER node
EXPOSE 5000
CMD ["node", "src/server.js"]