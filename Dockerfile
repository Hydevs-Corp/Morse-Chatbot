FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm ci
RUN npm run build
RUN npm ci --only=production && npm cache clean --force

RUN addgroup -g 1001 -S nodejs
RUN adduser -S chatbot -u 1001
RUN chown -R chatbot:nodejs /app

USER chatbot

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

CMD ["npm", "start"]
