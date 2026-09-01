# GDPTraders

Institutional-grade custodial cryptocurrency investment platform.

Two portals share one backend:

- **Client Portal** (`/dashboard`) — portfolio overview, crypto deposits, withdrawals, transactions
- **Admin Portal** (`/admin`) — command center for staff: every account, every transaction, deposit confirmation, multi-sig withdrawal approvals, ledger and audit trail

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite + Nginx)  →  http://localhost:3000  │
│   /dashboard (clients)        /admin (staff only)           │
└──────────────────────────┬──────────────────────────────────┘
                           │ /api (proxied)
┌──────────────────────────▼──────────────────────────────────┐
│  Backend (Node.js + Express)  →  http://localhost:8000      │
│  Auth · KYC · Wallet · Ledger · Portfolio · Admin · Market   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  PostgreSQL 16  →  localhost:5433 (container: 5432)         │
│  Adminer UI    →  http://localhost:8081                     │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start (Docker)

```bash
# 1. Start Docker Desktop

# 2. Create the root environment file (required by docker-compose.yml).
#    Compose reads env_file: .env at the project root; without it, `up` fails
#    with "env file ...\.env not found".
cp .env.example .env        # Linux/macOS
copy .env.example .env      # Windows (PowerShell: Copy-Item .env.example .env)

# 3. Build and start all services
docker compose up --build -d

# 4. Access the system
#    Frontend:  http://localhost:3000   (clients: /dashboard, staff: /admin)
#    Backend:   http://localhost:8000/api/health
#    Adminer:   http://localhost:8081  (server: postgres, user: gdptrader,
#               password: gdptrader_password, db: gdptraders)
#    PostgreSQL (host): localhost:5433
```

The backend runs idempotent schema migrations on every startup (`ensureSchema()`), so existing database volumes are self-healed when new columns ship — no manual migration steps required.

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

## Tests & CI

The backend has a real test suite (Node's built-in test runner via `tsx`):

```bash
cd backend
npm test        # coin whitelist, OHLC parser, TTL cache, rate limiter, config helpers
npm run build   # tsc type-check + emit
```

GitHub Actions CI (`.github/workflows/ci.yml`) runs backend build + tests and the
frontend production build on every push to `main` and every pull request.

## Configuration & Security

Environment variables (root `.env`, copied from `.env.example`):

| Variable | Required | Notes |
|----------|----------|-------|
| `JWT_SECRET` | **Yes (prod)** | Must be ≥ 32 chars. The backend **fails fast at boot in production** if it is missing, still the known dev default, or too short. |
| `JWT_EXPIRES_IN` | No | Token lifetime (default `1h`). |
| `FRONTEND_URL` | No | Used to build email-verification links. |
| `CORS_ORIGINS` | No | Comma-separated allowlist; falls back to the local dev origins. |
| `RESEND_API_KEY` | Prod | Outbound verification emails. Without it, dev mode logs the link to the console. |
| `COINGECKO_API_KEY` | No | Optional CoinGecko key sent as `x-cg-demo-api-key` by the market proxy. |

Hardening in place:

- **Helmet** security headers; CORS allowlist; JSON body limit; `trust proxy`.
- **Rate limiting** — global per-IP limiter plus a strict 10 req/min throttle on
  `POST /api/auth/login` and `POST /api/auth/register` (brute-force protection).
- **Central config** (`backend/src/config.ts`) — no scattered secret fallbacks.
- Secrets are **never committed**; `.env` files are gitignored.

## Live Market Data

The dashboard's interactive candlestick chart (BTC / ETH / USDT switcher,
24H / 7D / 30D ranges, crosshair tooltips, 30s auto-refresh) is powered by a
**backend market proxy** with a coin whitelist and TTL caching — the browser
never calls CoinGecko directly, which keeps the platform safe from upstream
rate limits. Add an optional `COINGECKO_API_KEY` to raise upstream limits.


## Demo Credentials

| Role | Email | Password | Sees |
|------|-------|----------|------|
| Admin | `admin@gdptraders.io` | `gdpAdmin#` | `/admin` |
| Compliance | `compliance@gdptraders.io` | `gdpCompliance#` | `/admin` |

> **Note:** The database seeds staff accounts only — no demo client exists. Create
> a client account via the sign-up page (`/signup`) to use the client portal.

Access is enforced on both ends: an `AdminRoute` guard in the frontend plus `requireRole('admin','compliance')` middleware on every admin API endpoint.

## Services

| Service | Description | Port |
|---------|-------------|------|
| **frontend** | React SPA served by Nginx | 3000 |
| **backend** | Node.js/Express API | 8000 |
| **postgres** | PostgreSQL 16 database | 5433 (host) → 5432 (container) |
| **adminer** | Database management UI | 8081 |

## Deposit Flow (crypto only)

Clients transfer from any wallet they already own — no in-app coin purchase:

1. **Choose a coin & network** — USDT (TRC-20 or BEP-20), BTC (Bitcoin), or ETH (ERC-20), plus the intended amount.
2. **Copy the platform deposit address** — stored per asset/network in `DEPOSIT_WALLET_BY_NETWORK` (`backend/src/routes/wallet.ts`), shown with a copy button and network label.
3. **Send on the correct network** — a red warning explains that wrong-network transfers lose funds.
4. **Confirm "I've Sent My Coins"** — a `Processing` transaction is recorded with the declared amount and network.
5. **Admin confirms** — staff verify the on-chain transfer in *Admin → Transactions* (amount editable against actual received value). Confirming writes an append-only ledger entry that instantly credits the client's portfolio; denying marks it `Cancelled`.

Card payment was removed from the UI (legacy card endpoints remain in the backend but are unused).

## Withdrawal Flow

1. Client enters coin, network (USDT offers TRC-20 or BEP-20), amount, and **their own destination wallet address** (validated per network server-side: Tron `T…`, BEP-20/ERC-20 EVM `0x…`, Bitcoin).
2. Checked against their available ledger balance and daily cap, then stored `Pending` with the address and network persisted on the transaction.
3. **Multi-sig execution** — requires signatures from BOTH an admin and a compliance officer (*Admin → Approvals* shows client identity, destination address, signature progress).
4. At 2/2 signatures the withdrawal completes and a negative ledger entry deducts it from the client's portfolio.

## Number Consistency Guarantee

Client portfolio value, per-client balance in *Admin → Accounts*, and total AUM all derive from the same formula over the append-only ledger:

```
value = Σ ledger amounts (deposits − withdrawals ± trades − fees + interest)
```

A live E2E reconciliation verified: deposit approval credits the portfolio by exactly the confirmed amount; withdrawal completion debits exactly the requested amount at 2/2 signatures; admin views match client views to the cent.

## Security Features

- JWT authentication with role-based access control (client / admin / compliance)
- KYC gating: no deposits or withdrawals until KYC is APPROVED
- Append-only ledger with SHA-256 integrity hash chaining (+ `/admin/ledger/verify`)
- Multi-sig withdrawals (Admin + Compliance approval required)
- Per-network destination-address validation on withdrawals
- Idempotent schema migrations self-heal deployed databases at startup
- Rate limiting — 120 req/min per IP globally, plus a strict 10 req/min throttle
  on login/register (see Configuration & Security)
- Daily withdrawal caps per user
- Helmet + CORS security headers

## Project Structure

```
├── backend/                  # Node.js/TypeScript API
│   ├── src/
│   │   ├── db/               # Dual-mode store: pgStore.ts (PostgreSQL) + database.ts (in-memory)
│   │   ├── routes/           # auth, kyc, wallet, portfolio, strategies, admin, market
│   │   ├── lib/              # email.ts (Resend), market.ts (CoinGecko proxy + cache + tests)
│   │   ├── config.ts         # Central validated config (fails fast on bad secrets in prod)
│   │   ├── middleware/       # Auth, role, KYC, rate-limit middleware
│   │   └── data/             # Strategy definitions
│   ├── Dockerfile
│   └── package.json
├── frontend/                 # React + Vite SPA
│   ├── src/
│   │   ├── api/client.ts     # Typed API client
│   │   ├── pages/dashboard/  # Client portal (incl. DepositPage, WithdrawPage)
│   │   ├── pages/admin/      # Staff portal (Dashboard, Accounts, Transactions, Approvals, Ledger, AuditLogs)
│   │   ├── components/admin/ # AdminLayout (crimson "command center" theme)
│   │   ├── components/       # Shared UI (CandlestickChart, PasswordInput)
│   │   └── contexts/         # AuthContext
│   ├── Dockerfile
│   └── nginx.conf
└── docker-compose.yml        # postgres + adminer + backend + frontend
```

## Client Portal Pages

| Route | Page |
|-------|------|
| `/dashboard` | Overview — KPIs + interactive live candlestick chart (BTC/ETH/USDT switcher, 24H/7D/30D ranges, crosshair tooltips, 30s auto-refresh) |
| `/dashboard/deposit` | Step-by-step crypto deposit guide with copyable addresses |
| `/dashboard/withdraw` | Withdrawal request form + request history |
| `/dashboard/transactions` | Personal transaction history |
| `/dashboard/security` · `/tax` · `/support` | Account utilities |

## Admin Portal Pages (staff only)

| Route | Page |
|-------|------|
| `/admin` | Dashboard — users, AUM, volumes, pending items, recent activity |
| `/admin/accounts` | Every account with portfolio value, inline KYC/role controls, manual credit modal |
| `/admin/transactions` | All transactions; confirm/deny pending crypto deposits |
| `/admin/approvals` | Multi-sig withdrawal queue (client, amount, destination, 0/2 → 2/2 signatures) |
| `/admin/ledger` | Append-only ledger with integrity verification |
| `/admin/audit-logs` | Immutable action trail |

## API Endpoints

```
POST   /api/auth/register
POST   /api/auth/login            # { email, password }
GET    /api/auth/profile

GET    /api/portfolio/summary     # derived from the full ledger
GET    /api/portfolio/allocations
GET    /api/portfolio/performance?days=90
GET    /api/portfolio/transactions
GET    /api/portfolio/ledger

GET    /api/kyc/status
POST   /api/kyc/submit            # { documentType, documentNumber }

GET    /api/wallet/addresses              # all deposit addresses + networks
GET    /api/wallet/deposit-address/:asset
GET    /api/wallet/balances
GET    /api/wallet/policy
POST   /api/wallet/crypto-deposit         # { asset, amount } → Processing txn awaiting admin confirm
POST   /api/wallet/withdraw               # { asset, amount, destinationAddress }
GET    /api/wallet/withdrawals            # admin/compliance, joined with client identity
POST   /api/wallet/withdrawals/:id/approve  # multi-sig, executes at 2/2

GET    /api/strategies
GET    /api/strategies/:id

# ---- Market data (public, cached proxy; coin whitelist: bitcoin, ethereum, tether) ----
GET    /api/market/coins                          # supported coins for the chart selector
GET    /api/market/summary?coin=bitcoin           # price + 24h change
GET    /api/market/ohlc?coin=bitcoin&range=24h    # OHLC candles; range: 24h | 7d | 30d

# ---- Admin / compliance (role-gated) ----
GET    /api/admin/dashboard                       # KPIs incl. AUM, pending KYC & approvals
GET    /api/admin/users                           # accounts with derived portfolio values
POST   /api/admin/users/:id/kyc                   # set KYC status
POST   /api/admin/users/:id/role                  # change role (admin only)
POST   /api/admin/users/:id/deposit               # manual credit { asset, amount } + ledger entry
POST   /api/admin/users/:id/withdrawal-amount      # { amount } → set client's available-withdrawal limit
GET    /api/admin/transactions                    # all transactions joined with client identity
POST   /api/admin/transactions/:id/confirm-deposit  # { amount } → ledger credit
POST   /api/admin/transactions/:id/deny-deposit     # → Cancelled
GET    /api/admin/ledger
GET    /api/admin/ledger/verify                   # SHA-256 hash-chain check
GET    /api/admin/audit-logs
GET    /api/admin/stats
```