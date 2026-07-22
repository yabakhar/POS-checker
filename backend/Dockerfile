FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma

# ── DEV: tsx watch (on-the-fly TS) + all deps ────────────────
FROM base AS development
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]

# ── BUILD: compile TypeScript -> dist/ (needs devDependencies) ──
FROM base AS build
RUN npm install
COPY . .
RUN npm run build

# ── PROD: only production deps + compiled output ─────────────
FROM base AS production
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/app.js"]
