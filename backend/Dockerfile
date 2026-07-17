FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# ── DEV: nodemon + all deps ──────────────────────────────────
FROM base AS development
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]

# ── PROD: only production deps ────────────────────────────────
FROM base AS production
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "src/app.js"]
