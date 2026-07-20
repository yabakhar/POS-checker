# POS Checker

Dashboard web pour visualiser les données remontées par les agents POS Windows.

## Architecture

```
┌──────────────┐     x-api-key     ┌─────────────────────┐
│ Agent Windows│ ──────────────►   │  EC2 (Docker)        │
│  (déjà fait) │   POST /api/agent │  ┌───────────────┐   │
└──────────────┘                   │  │    Backend    │   │
                                   │  │  (Node.js)    │   │
┌──────────────┐     JWT Token     │  └───────┬───────┘   │
│    Client    │ ◄──────────────►  │          │           │
│  (Dashboard) │   /api/client/*   │  ┌───────▼───────┐   │
└──────────────┘                   │  │    Frontend   │   │
                                   │  │   (React+Nginx)│  │
┌──────────────┐     JWT Token     │  └───────────────┘   │
│   Sysadmin   │ ◄──────────────►  └──────────┬──────────┘
│   (Panel)    │   /api/admin/*               │
└──────────────┘                    ┌──────────▼──────────┐
                                    │    AWS RDS           │
                                    │   (PostgreSQL)       │
                                    └─────────────────────┘
```

## Routes API

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | `/api/auth/admin/login` | — | Login admin |
| POST | `/api/auth/client/login` | — | Login client |
| GET | `/api/admin/clients` | JWT (admin) | Liste des clients |
| POST | `/api/admin/clients` | JWT (admin) | Créer un client |
| PUT | `/api/admin/clients/:id/reset-password` | JWT (admin) | Reset mot de passe |
| PUT | `/api/admin/clients/:id/toggle` | JWT (admin) | Activer/désactiver |
| PUT | `/api/admin/clients/:id/regenerate-key` | JWT (admin) | Nouvelle clé API |
| GET | `/api/client/dashboard` | JWT (client) | Données POS |
| GET | `/api/client/stats` | JWT (client) | Statistiques |
| POST | `/api/agent/data` | x-api-key | Envoyer données POS |
| GET | `/api/agent/ping` | x-api-key | Test de connexion |

### Format pour l'agent Windows

```http
POST /api/agent/data
x-api-key: <clé_api_du_client>
Content-Type: application/json

{
  "any_field": "any_value",
  "sales": [...],
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## 1. Développement local

### Prérequis
- Docker Desktop installé
- Node.js 20+

### Lancer en local (avec PostgreSQL local)

```bash
# Cloner le repo
git clone git@github.com:<username>/posChecker.git
cd posChecker

# Démarrer tous les services
docker-compose up --build -d

# App disponible sur:
# Frontend: http://localhost:80
# Backend:  http://localhost:3001
# DB:       localhost:5432
```

### Créer le premier admin (local)

```bash
cd backend
cp .env.example .env
# Éditez .env: ADMIN_USERNAME=admin, ADMIN_PASSWORD=votremotdepasse

npm install
npm run db:seed-admin
```

---

## 2. Déploiement AWS

### Étape 1 — Créer le RDS PostgreSQL

1. Allez dans AWS Console → **RDS** → **Create database**
2. Engine: **PostgreSQL 15**
3. Template: **Free tier** (ou production)
4. DB identifier: `pos-checker-db`
5. Master username: `postgres`
6. Master password: (notez-le bien)
7. **VPC Security Group**: autoriser le port `5432` depuis l'IP de votre EC2 uniquement
8. Copiez l'**Endpoint** (ex: `pos-checker-db.xxxxx.eu-west-1.rds.amazonaws.com`)

### Étape 2 — Configurer l'EC2

```bash
# Connectez-vous à votre EC2
ssh -i votre-key.pem ubuntu@<EC2_PUBLIC_IP>

# Installer Docker
sudo apt-get update
sudo apt-get install -y docker.io docker-compose git
sudo usermod -aG docker ubuntu
newgrp docker

# Cloner le projet
git clone git@github.com:<username>/posChecker.git
cd posChecker

# Créer le .env depuis l'exemple
cp backend/.env.example backend/.env
nano backend/.env
```

### Étape 3 — Remplir le .env sur EC2

```env
PORT=3001
DB_HOST=pos-checker-db.xxxxx.eu-west-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=pos_checker
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe_rds
JWT_SECRET=un_secret_long_et_aleatoire_minimum_32_chars
FRONTEND_URL=http://<EC2_PUBLIC_IP>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=votre_mot_de_passe_admin
```

### Étape 4 — Initialiser la base de données

```bash
# Sur l'EC2, dans le dossier posChecker/backend
npm install
npm run db:init        # applique les migrations SQL (backend/migrations/)
npm run db:seed-admin  # crée le compte admin
```

### Étape 5 — Lancer en production

```bash
cd /home/ubuntu/posChecker
docker-compose -f docker-compose.prod.yml up --build -d

# Vérifier que tout tourne
docker ps
docker logs pos_backend
docker logs pos_frontend
```

### Étape 6 — Security Groups AWS

Dans AWS Console → EC2 → Security Groups, autorisez:
| Type | Port | Source |
|------|------|--------|
| HTTP | 80 | 0.0.0.0/0 |
| HTTPS | 443 | 0.0.0.0/0 (si SSL) |
| SSH | 22 | Votre IP uniquement |

---

## 3. GitHub Actions — CI/CD automatique

À chaque `git push` sur `main`, le code est automatiquement déployé sur EC2.

### Configurer les secrets GitHub

Allez dans votre repo GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret | Valeur |
|--------|--------|
| `EC2_HOST` | IP publique de votre EC2 (ex: `54.123.45.67`) |
| `EC2_USER` | `ubuntu` (ou `ec2-user` selon l'AMI) |
| `EC2_SSH_KEY` | Contenu de votre fichier `.pem` (clé privée entière) |

### Ajouter la clé SSH de GitHub à l'EC2

```bash
# Sur votre machine locale
cat ~/.ssh/id_ed25519.pub  # ou id_rsa.pub

# Coller cette clé dans EC2:
# ssh ubuntu@<EC2_IP> "echo '<votre_cle_pub>' >> ~/.ssh/authorized_keys"
```

### Flow GitHub

```
git add .
git commit -m "feat: nouvelle fonctionnalite"
git push origin main

# → GitHub Actions se déclenche automatiquement
# → SSH dans EC2 → git pull → docker-compose up --build -d
# → Déployé en ~2 minutes
```

---

## 4. Structure du projet

```
posChecker/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD GitHub Actions
├── backend/
│   ├── src/
│   │   ├── config/db.js        # Connexion PostgreSQL
│   │   ├── middleware/
│   │   │   ├── authMiddleware.js    # Vérification JWT
│   │   │   └── apiKeyMiddleware.js  # Vérification clé API (agent)
│   │   ├── routes/
│   │   │   ├── auth.js         # Login admin + client
│   │   │   ├── admin.js        # Gestion clients
│   │   │   ├── client.js       # Dashboard client
│   │   │   └── agent.js        # Réception données POS
│   │   └── app.js
│   ├── scripts/
│   │   ├── migrate.js          # Applique les migrations SQL en attente
│   │   └── seedAdmin.js        # Créer le premier admin
│   ├── migrations/
│   │   └── 001_init.sql        # Schéma initial (admins, clients, pos_data)
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── AdminLogin.jsx
│   │   │   ├── AdminDashboard.jsx
│   │   │   ├── ClientLogin.jsx
│   │   │   └── ClientDashboard.jsx
│   │   ├── components/ProtectedRoute.jsx
│   │   ├── api/axios.js
│   │   └── App.jsx
│   ├── nginx.conf
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml          # Local dev
├── docker-compose.prod.yml     # Production (EC2 + RDS)
└── .gitignore
```

---

## 5. Commandes utiles

```bash
# Voir les logs en temps réel
docker logs -f pos_backend
docker logs -f pos_frontend

# Redémarrer un seul service
docker-compose -f docker-compose.prod.yml restart backend

# Mettre à jour manuellement
cd /home/ubuntu/posChecker
git pull origin main
docker-compose -f docker-compose.prod.yml up --build -d

# Accéder à la base de données
docker exec -it pos_backend node -e "
const pool = require('./src/config/db');
pool.query('SELECT COUNT(*) FROM clients').then(r => { console.log(r.rows); pool.end(); });
"
```
