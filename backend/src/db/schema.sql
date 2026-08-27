-- GDPTraders PostgreSQL Schema
-- Implements the database tables from backend.md §4

-- Users table (backend.md §4.1)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'client',
    kyc_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    ip_whitelist TEXT[] DEFAULT '{}',
    withdrawal_cap NUMERIC(20, 2) DEFAULT 100000,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Wallets table (backend.md §4.3)
CREATE TABLE IF NOT EXISTS wallets (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id),
    asset VARCHAR(10) NOT NULL,
    address VARCHAR(255) NOT NULL,
    wallet_type VARCHAR(20) NOT NULL, -- hot, warm, cold
    created_at TIMESTAMP DEFAULT NOW()
);

-- Deposit addresses table (backend.md §4.3)
CREATE TABLE IF NOT EXISTS deposit_addresses (
    address VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id),
    asset VARCHAR(10) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Append-only ledger (backend.md §4.4)
-- Critical rule: Never update a balance. Only append new rows.
CREATE TABLE IF NOT EXISTS ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    asset VARCHAR(10) NOT NULL,
    amount NUMERIC(20, 8) NOT NULL,
    entry_type VARCHAR(20) NOT NULL, -- deposit, withdrawal, trade, fee, interest, profit, loss
    reference_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    integrity_hash TEXT NOT NULL -- SHA-256 of row + previous hash
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id),
    date TIMESTAMP DEFAULT NOW(),
    type VARCHAR(20) NOT NULL,
    asset VARCHAR(10) NOT NULL,
    amount NUMERIC(20, 8) NOT NULL,
    strategy VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'Processing',
    tx_hash VARCHAR(255),
    destination_address VARCHAR(255),
    requires_approval BOOLEAN DEFAULT false,
    approval1 BOOLEAN DEFAULT false,
    approval2 BOOLEAN DEFAULT false
);

-- Migration for databases created before the destination_address column existed
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS destination_address VARCHAR(255);

-- Strategy allocations
CREATE TABLE IF NOT EXISTS strategy_allocations (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id),
    strategy_id VARCHAR(50) NOT NULL,
    strategy_name VARCHAR(255) NOT NULL,
    allocation NUMERIC(20, 2) NOT NULL,
    weight NUMERIC(5, 2) NOT NULL,
    pnl_24h NUMERIC(20, 2) DEFAULT 0
);

-- Performance series
CREATE TABLE IF NOT EXISTS performance_series (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id),
    date DATE NOT NULL,
    portfolio NUMERIC(20, 2) NOT NULL,
    benchmark NUMERIC(20, 2) NOT NULL
);

-- Audit logs (backend.md §4.6)
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created ON ledger_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);