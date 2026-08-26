/**
 * API client for GDPTraders backend.
 *
 * Calls the real backend service at `/api/...` proxied via vite.config.ts
 * to http://localhost:8000 (the GDPTraders backend server).
 */

const API_BASE = '/api';

// ---------- Types ----------

export interface PortfolioSummary {
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  todayPnl: number;
  todayPnlPercent: number;
  lastUpdated: string;
}

export interface StrategyAllocation {
  strategyId: string;
  strategyName: string;
  allocation: number; // USD value
  weight: number; // percentage 0-100
  pnl24h: number;
}

export interface Transaction {
  id: string;
  date: string;
  type: 'Deposit' | 'Withdrawal' | 'Trade' | 'Fee' | 'Performance Fee';
  asset: string;
  amount: number;
  strategy: string;
  status: 'Completed' | 'Pending' | 'Processing';
  txHash: string;
}

export interface PerformancePoint {
  date: string;
  portfolio: number;
  benchmark: number;
}

export interface WithdrawalPolicy {
  processingTimeFiat: string;
  processingTimeCrypto: string;
  withdrawalFee: string;
  networkFees: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    kycStatus: string;
  };
}

// ---------- Auth token management ----------

const TOKEN_KEY = 'gdptraders_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ---------- Core fetch helper ----------

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await res.json();

  if (!res.ok) {
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return body as T;
}

// ---------- Auth ----------

export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    return res;
  },

  async register(email: string, password: string, name: string): Promise<LoginResponse> {
    const res = await request<LoginResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    setToken(res.token);
    return res;
  },

  async getProfile(): Promise<LoginResponse['user']> {
    return request<LoginResponse['user']>('/auth/profile');
  },

  async submitKyc(documentType: string, documentNumber: string): Promise<{ status: string; message: string }> {
    return request<{ status: string; message: string }>('/kyc/submit', {
      method: 'POST',
      body: JSON.stringify({ documentType, documentNumber }),
    });
  },

  logout(): void {
    clearToken();
  },
};

// ---------- Dashboard data ----------

export const api = {
  async getPortfolioSummary(): Promise<PortfolioSummary> {
    return request<PortfolioSummary>('/portfolio/summary');
  },

  async getStrategyAllocations(): Promise<StrategyAllocation[]> {
    return request<StrategyAllocation[]>('/portfolio/allocations');
  },

  async getPerformanceSeries(days = 90): Promise<PerformancePoint[]> {
    return request<PerformancePoint[]>(`/portfolio/performance?days=${days}`);
  },

  async getTransactions(): Promise<Transaction[]> {
    return request<Transaction[]>('/portfolio/transactions');
  },

  async getWithdrawalPolicy(): Promise<WithdrawalPolicy> {
    return request<WithdrawalPolicy>('/wallet/policy');
  },

  /** Returns the user's unique deposit addresses per asset (backend.md §4.3). */
  async getWalletAddresses(): Promise<
    { address: string; asset: string; isActive: boolean }[]
  > {
    return request<{ address: string; asset: string; isActive: boolean }[]>('/wallet/addresses');
  },

  /** Get deposit wallet address for an asset. */
  async getDepositWalletAddress(asset: string): Promise<{ asset: string; address: string }> {
    return request<{ asset: string; address: string }>(`/wallet/deposit-address/${asset}`);
  },

  /** Records a crypto transfer submitted by the user (manual wallet deposit). */
  async submitCryptoDeposit(asset: string): Promise<{ transaction: Transaction; message: string }> {
    return request<{ transaction: Transaction; message: string }>('/wallet/crypto-deposit', {
      method: 'POST',
      body: JSON.stringify({ asset }),
    });
  },

  /** Creates a Stripe payment intent for card deposit. */
  async createCardDeposit(asset: string, amount: number): Promise<{ clientSecret: string; paymentIntentId: string; amount: number; asset: string; depositAddress: string }> {
    return request<{ clientSecret: string; paymentIntentId: string; amount: number; asset: string; depositAddress: string }>('/wallet/deposit', {
      method: 'POST',
      body: JSON.stringify({ asset, amount }),
    });
  },

  /** Confirms a card deposit after Stripe payment succeeds. */
  async confirmCardDeposit(paymentIntentId: string, asset: string, amount: number): Promise<{ transaction: Transaction; message: string }> {
    return request<{ transaction: Transaction; message: string }>('/wallet/deposit-confirm', {
      method: 'POST',
      body: JSON.stringify({ paymentIntentId, asset, amount }),
    });
  },

  /** Creates a withdrawal request requiring multi-sig approval. */
  async createWithdrawal(asset: string, amount: number, destinationAddress: string): Promise<{ transaction: Transaction; message: string }> {
    return request<{ transaction: Transaction; message: string }>('/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ asset, amount, destinationAddress }),
    });
  },
};

// ---------- Formatters ----------

export function formatCurrency(value: number, compact = false): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
