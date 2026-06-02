# WarungAI — container image for Cloud Run (or any container host).
FROM node:20-slim

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App source
COPY . .

ENV NODE_ENV=production
# Cloud Run injects PORT (defaults to 8080); the app reads it via config.
EXPOSE 8080

CMD ["node", "server.js"]
