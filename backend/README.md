# GDPTraders Backend

Custodial cryptocurrency investment platform backend, implementing the architecture from `backend.md`.

## Services Implemented

| Service | Description | Routes |
|---------|-------------|--------|
| **User Service** | Registration, login, JWT | `/api/auth/*` |
| **KYC/AML Service** | KYC submission and status tracking | `/api/kyc/*` |
| **Wallet & Custody** | Layered hot/warm/cold wallets, deposits, multi-sig withdrawals | `/api/wallet/*` |
| **Ledger Service** | Append-only immutable ledger with integrity hash chaining | `/api/portfolio/ledger`, `/api/admin/ledger/*` |
| **Portfolio Service** | Summary, allocations, performance, transactions | `/api/portfolio/*` |
| **Compliance** | Audit trail, ledger integrity verification, stats | `/api/admin/*` |
| **Products** | Public strategy definitions (no hard APY promises) | `/api/strategies` |

## Quick Start

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Start the server (auto-seeds demo data)
npm run dev
```

The server runs on `http://localhost:8000`.

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Client | `demo@gdptraders.io` | `DemoPass123!` |
| Admin | `admin@gdptraders.io` | `AdminPass123!` |
| Compliance | `compliance@gdptraders.io` | `CompliancePass123!` |

## Security Features

- **JWT authentication** with role-based access control
- **KYC gating**: No deposits accepted until KYC status is `APPROVED`
- **Append-only ledger**: Financial records are never updated in place; each entry is chained via SHA-256 hash to the previous entry
- **Ledger integrity verification**: `/api/admin/ledger/verify` detects any tampering
- **Multi-sig withdrawals**: Requires BOTH Admin and Compliance approval to execute
- **Rate limiting**: 120 requests/min per IP
- **Daily withdrawal caps** per user
- **Helmet + CORS** security headers

## Key Endpoints

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
```

## Production Notes

- **Database**: Replace the in-memory store (`src/db/database.ts`) with PostgreSQL using `DATABASE_URL` in `.env`. Tables: `users`, `wallets`, `deposit_addresses`, `ledger_entries` (see `backend.md` §4).
- **KYC Provider**: Replace the demo auto-approval in `src/routes/kyc.ts` with a real integration (Onfido/Persona/Sumsub).
- **Custody**: Integrate Fireblocks MPC in the wallet service for production key handling.
- **Event Bus**: Add Apache Kafka for the deposit flow events described in `backend.md` §8.
- **Secrets**: Rotate `JWT_SECRET`, use AWS KMS/HSM for platform keys, never store user keys.

## Architecture Notes

The system follows the microservices blueprint in `backend.md`:

- **Decoupled services** (auth, KYC, wallet, ledger, admin)
- **Append-only ledger** with hash chaining
- **Layered custody** (hot/warm/cold wallet tiers)
- **Multi-sig withdrawal** approval workflow
- **No hard APY promises** — strategies are defined by mechanism only