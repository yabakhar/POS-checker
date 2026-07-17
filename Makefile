.PHONY: dev dev-down prod prod-down logs logs-backend logs-frontend db-init db-seed restart-backend restart-frontend ps

# ── DEV ───────────────────────────────────────────────────────
dev:
	docker-compose up --build

dev-d:
	docker-compose up --build -d

dev-down:
	docker-compose down

# ── PROD ──────────────────────────────────────────────────────
prod:
	docker-compose -f docker-compose.prod.yml up --build -d

prod-down:
	docker-compose -f docker-compose.prod.yml down

prod-rebuild:
	docker-compose -f docker-compose.prod.yml up --build --force-recreate -d

# ── LOGS ──────────────────────────────────────────────────────
logs:
	docker-compose logs -f

logs-backend:
	docker logs -f pos_backend

logs-frontend:
	docker logs -f pos_frontend

# ── DATABASE ──────────────────────────────────────────────────
db-init:
	cd backend && node scripts/initDb.js

db-seed:
	cd backend && node scripts/seedAdmin.js

# ── UTILS ─────────────────────────────────────────────────────
ps:
	docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

restart-backend:
	docker-compose restart backend

restart-frontend:
	docker-compose restart frontend

clean:
	docker-compose down -v
	docker image prune -f
