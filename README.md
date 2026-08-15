# GDPTraders

Institutional-grade custodial cryptocurrency investment platform.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite + Nginx)  →  http://localhost:3000  │
└──────────────────────────┬──────────────────────────────────┘
                           │ /api (proxied)
┌──────────────────────────▼──────────────────────────────────┐
│  Backend (Node.js + Express)  →  http://localhost:8000      │
│  Auth · KYC · Wallet · Ledger · Portfolio · Compliance      │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  PostgreSQL 16  →  localhost:5433 (container: 5432)         │
│  Adminer UI    →  http://localhost:8080                     │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start (Docker)

```bash
# 1. Start Docker Desktop

# 2. Build and start all services
docker compose up --build -d

# 3. Access the system
#    Frontend:  http://localhost:3000
#    Backend:   http://localhost:8000/api/health
#    Adminer:   http://localhost:8080  (server: postgres, user: gdptrader, password: gdptrader_password, db: gdptraders)
#    PostgreSQL (host): localhost:5433
```

## Quick Start (Local Development)

```bash
# Terminal 1 - Backend (port 8000)
cd backend
npm install
npm run dev

# Terminal 2 - Frontend (port 5173, proxies /api to backend)
cd frontend
npm install
npm run dev
```

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Client | `demo@gdptraders.io` | `DemoPass123!` |
| Admin | `admin@gdptraders.io` | `AdminPass123!` |
| Compliance | `compliance@gdptraders.io` | `CompliancePass123!` |

## Services

| Service | Description | Port |
|---------|-------------|------|
| **frontend** | React SPA served by Nginx | 3000 |
| **backend** | Node.js/Express API | 8000 |
| **postgres** | PostgreSQL 16 database | 5433 (host) → 5432 (container) |
| **adminer** | Database management UI | 8080 |

## Backend Services (from backend.md)

- **User Service** — Registration, login, JWT auth
- **KYC/AML Service** — KYC submission, no deposits until APPROVED
- **Wallet & Custody** — Layered hot/warm/cold wallets, multi-sig withdrawals
- **Ledger Service** — Append-only immutable ledger with SHA-256 hash chaining
- **Portfolio Service** — Summary, allocations, performance, transactions
- **Compliance** — Audit trail, ledger integrity verification, stats

## Security Features

- JWT authentication with role-based access control
- KYC gating: no deposits until KYC is APPROVED
- Append-only ledger with cryptographic integrity hash chaining
- Multi-sig withdrawals (Admin + Compliance approval required)
- Rate limiting (120 req/min per IP)
- Daily withdrawal caps per user
- Helmet + CORS security headers

## Project Structure

```
├── backend/           # Node.js/TypeScript API
│   ├── src/
│   │   ├── db/        # Database layer (in-memory + PostgreSQL)
│   │   ├── routes/    # API route handlers
│   │   ├── middleware/ # Auth, role, KYC middleware
│   │   └── data/      # Strategy definitions
│   ├── Dockerfile
│   └── package.json
├── frontend/          # React + Vite SPA
│   ├── src/
│   │   ├── api/       # API client (connects to backend)
│   │   ├── pages/     # Page components
│   │   └── components/ # UI components
│   ├── Dockerfile
│   └── nginx.conf
└── docker-compose.yml # Full stack orchestration
```

## API Endpoints

```
POST   /api/auth/register
POST   /api/auth/login            # { email, password }
GET    /api/auth/profile

GET    /api/portfolio/summary
GET    /api/portfolio/allocations
GET    /api/portfolio/performance?days=90
GET    /api/portfolio/transactions
GET    /api/portfolio/ledger

GET    /api/kyc/status
POST   /api/kyc/submit            # { documentType, documentNumber }

GET    /api/wallet/addresses
GET    /api/wallet/policy
POST   /api/wallet/deposit        # { asset, amount }
POST   /api/wallet/withdraw       # { asset, amount, destinationAddress }
GET    /api/wallet/withdrawals    # admin/compliance
POST   /api/wallet/withdrawals/:id/approve  # admin/compliance

GET    /api/strategies
GET    /api/strategies/:id

GET    /api/admin/ledger          # admin/compliance
GET    /api/admin/ledger/verify   # admin/compliance
GET    /api/admin/audit-logs      # admin/compliance
GET    /api/admin/stats           # admin/compliance