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
  totalProfit: number;
  totalLoss: number;
  netPnl: number;
  initialDeposit: number;
  availableWithdrawal: number;
  totalPnlPercent: number;
  todayPnl: number;
  todayPnlPercent: number;
  lastUpdated: string;
}

/** Client-facing Profit & Loss statement (admin-managed credits/debits). */
export interface PnlSummary {
  totalProfit: number;
  totalLoss: number;
  netPnl: number;
  netPnlPercent: number;
  entries: {
    id: string;
    date: string;
    kind: 'Profit' | 'Loss';
    asset: string;
    amount: number;
    referenceId: string;
  }[];
  lastUpdated: string;
}

export interface StrategyAllocation {
  strategyId: string;
  strategyName: string;
  allocation: number; // USD value
  weight: number; // percentage 0-100
  pnl24h: number;
}

/** Client's un-reinvested profit summary and reinvestment history. */
export interface ReinvestSummary {
  totalProfit: number;
  totalLoss: number;
  reinvested: number;
  availableProfit: number;
  reinvestments: { id: string; date: string; amount: number; status: string }[];
}

/** The client's active investment record (investments table snapshot).
 *  Plan fields can be null on legacy rows flagged 'under_review' (< $20). */
export interface ActiveInvestment {
  id: string;
  planName: string | null;
  initialDeposit: number;
  dailyRate: number | null;
  durationDays: number | null;
  startDate: string;
  endDate: string | null;
  totalExpectedReturn: number | null;
  status: string;
}

export interface Transaction {
  id: string;
  date: string;
  type: 'Deposit' | 'Withdrawal' | 'Trade' | 'Fee' | 'Performance Fee' | 'Reinvest';
  asset: string;
  amount: number;
  strategy: string;
  status: 'Completed' | 'Pending' | 'Processing' | 'Cancelled';
  txHash: string;
  destinationAddress?: string;
  network?: string;
  requiresApproval?: boolean;
  approval1?: boolean;
  approval2?: boolean;
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
    withdrawalAddress?: string | null;
    withdrawalNetwork?: string | null;
    withdrawalAsset?: string | null;
  };
}

/** Client-facing referral program summary (own code + referred clients). */
export interface ReferralSummary {
  referralCode: string | null;
  referralLink: string | null;
  totalEarned: number;
  referredClients: {
    id: string;
    name: string; // masked server-side
    email: string; // masked server-side
    signupDate: string;
    kycStatus: string;
    totalDeposits: number;
    totalEarned: number;
  }[];
}

/** A platform-wide referral relationship (admin view). */
export interface AdminReferral {
  referrer: { id: string; name: string; email: string };
  referred: { id: string; name: string; email: string };
  signupDate: string;
  totalCommissions: number;
}

/** Referral chain for a single user (admin KYC/AML investigation). */
export interface AdminReferralChain {
  user: { id: string; name: string; email: string };
  referredBy: { id: string; name: string; email: string } | null;
  upstreamChain: { id: string; name: string; email: string }[];
  referred: { id: string; name: string; email: string; signupDate: string; totalCommissions: number; depth: number }[];
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  kycStatus: string;
  withdrawalCap: number;
  availableWithdrawal: number;
  withdrawalAddress: string | null;
  withdrawalNetwork: string | null;
  withdrawalAsset: string | null;
  referralCode?: string | null;
  createdAt: string;
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

  async register(email: string, password: string, name: string, referralCode?: string): Promise<LoginResponse & { referralWarning?: string }> {
    const res = await request<LoginResponse & { referralWarning?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, ...(referralCode ? { referralCode } : {}) }),
    });
    setToken(res.token);
    return res;
  },

  async getProfile(): Promise<UserProfile> {
    return request<UserProfile>('/auth/profile');
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async updateProfile(name: string): Promise<{ name: string; message: string }> {
    return request<{ name: string; message: string }>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

    async updateWithdrawalAddress(
    address: string,
    network?: string,
    asset?: string
  ): Promise<{ withdrawalAddress: string; withdrawalNetwork: string | null; withdrawalAsset: string | null; message: string }> {
    return request<{ withdrawalAddress: string; withdrawalNetwork: string | null; withdrawalAsset: string | null; message: string }>('/auth/withdrawal-address', {
      method: 'PUT',
      body: JSON.stringify({ address, network, asset }),
    });
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

  /** Profit & Loss statement driven by admin-managed credits (profit) and debits (loss). */
  async getPnl(): Promise<PnlSummary> {
    return request<PnlSummary>('/portfolio/pnl');
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
  async submitCryptoDeposit(
    asset: string,
    amount: number,
    network?: string
  ): Promise<{ transaction: Transaction; message: string }> {
    return request<{ transaction: Transaction; message: string }>('/wallet/crypto-deposit', {
      method: 'POST',
      body: JSON.stringify({ asset, amount, network }),
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
  async createWithdrawal(
    asset: string,
    amount: number,
    destinationAddress: string,
    network?: string
  ): Promise<{ transaction: Transaction; message: string }> {
    return request<{ transaction: Transaction; message: string }>('/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ asset, amount, destinationAddress, network }),
    });
  },

  /** Requests to reinvest profit into the initial capital (admin-approved). */
  async reinvestProfit(amount: number): Promise<{ transaction: Transaction; availableProfit: number; message: string }> {
    return request<{ transaction: Transaction; availableProfit: number; message: string }>('/wallet/reinvest-profit', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  },

  /** Fetches the client's available profit and reinvestment history. */
  async getReinvestSummary(): Promise<ReinvestSummary> {
    return request<ReinvestSummary>('/wallet/reinvest-profit');
  },

  /** Fetches the client's active investment (from the investments table). */
  async getInvestment(): Promise<{ investment: ActiveInvestment | null; daysRemaining: number }> {
    return request<{ investment: ActiveInvestment | null; daysRemaining: number }>('/wallet/investment');
  },

  /** Fetches the client's referral code, shareable link, and referred clients. */
  async getReferrals(): Promise<ReferralSummary> {
    return request<ReferralSummary>('/referrals/me');
  },
};
// ---------- Admin types ----------

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  kycStatus: string;
  createdAt: string;
  withdrawalCap: number;
  availableWithdrawal: number;
  balance: number;
  deposits: number;
  withdrawals: number;
  totalProfit: number;
  totalLoss: number;
  netPnl: number;
  pendingWithdrawals: { id: string; asset: string; amount: number; status: string; approvals: number }[];
  processingDeposits: number;
  transactionCount: number;
  /** Who referred this account (compliance / AML chain tracing). */
  referredBy?: { id: string; name: string; email: string } | null;
  /** How many accounts this user has referred. */
  referredCount?: number;
  /** The client's active investment (plan snapshot) — null if none / staff. */
  investment?: AdminInvestment | null;
}

/** A client's active investment as surfaced to admins (plan override UI). */
export interface AdminInvestment {
  id: string;
  planName: string | null;
  initialDeposit: number;
  dailyRate: number | null;
  durationDays: number | null;
  startDate: string;
  endDate: string | null;
  totalExpectedReturn: number | null;
  status: string;
}

export interface AdminTransaction extends Transaction {
  userEmail: string;
  userName: string;
}

/** A withdrawal request as seen in the admin Approvals page (with client identity). */
export interface WithdrawalRequestView extends Transaction {
  userEmail: string;
  userName: string;
}

export interface AdminDashboard {
  stats: {
    totalUsers: number;
    clients: number;
    staff: number;
    pendingKyc: number;
    totalAUM: number;
    totalProfit: number;
    totalLoss: number;
    netPnl: number;
    completedDeposits: number;
    completedWithdrawals: number;
    fees: number;
    pendingWithdrawals: number;
    pendingWithdrawalAmount: number;
    processingDeposits: number;
    transactionCount: number;
    ledgerEntries: number;
    auditCount: number;
  };
  recentTransactions: Transaction[];
}

export interface LedgerEntryView {
  id: string;
  userId: string;
  asset: string;
  amount: number;
  entryType: string;
  referenceId: string;
  createdAt: string;
  integrityHash: string;
}

export interface AuditLogEntryView {
  id: string;
  userId: string;
  action: string;
  details: string;
  createdAt: string;
}

// ---------- Admin API ----------

export const adminApi = {
  async getDashboard(): Promise<AdminDashboard> {
    return request<AdminDashboard>('/admin/dashboard');
  },

  async getUsers(): Promise<AdminUser[]> {
    return request<AdminUser[]>('/admin/users');
  },

  async getTransactions(): Promise<AdminTransaction[]> {
    return request<AdminTransaction[]>('/admin/transactions');
  },

  async getLedger(): Promise<LedgerEntryView[]> {
    return request<LedgerEntryView[]>('/admin/ledger');
  },

  async verifyLedger(): Promise<{ valid: boolean; checked: number }> {
    return request<{ valid: boolean; checked: number }>('/admin/ledger/verify');
  },

  async getAuditLogs(): Promise<AuditLogEntryView[]> {
    return request<AuditLogEntryView[]>('/admin/audit-logs');
  },

  async setKyc(userId: string, status: string): Promise<{ userId: string; status: string }> {
    return request<{ userId: string; status: string }>(`/admin/users/${userId}/kyc`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  async setRole(userId: string, role: string): Promise<{ userId: string; role: string }> {
    return request<{ userId: string; role: string }>(`/admin/users/${userId}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  },

  /** Admin sets the amount a client is currently able to withdraw. */
  async setAvailableWithdrawal(userId: string, amount: number): Promise<{ userId: string; availableWithdrawal: number }> {
    return request<{ userId: string; availableWithdrawal: number }>(`/admin/users/${userId}/withdrawal-amount`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  },

  /** Admin override — change or set a client's investment plan (reflects on their dashboard). */
  async setInvestmentPlan(userId: string, planName: string): Promise<{ userId: string; message: string }> {
    return request<{ userId: string; message: string }>(`/admin/users/${userId}/investment-plan`, {
      method: 'POST',
      body: JSON.stringify({ planName }),
    });
  },

  async manualDeposit(
    userId: string,
    asset: string,
    amount: number,
    note?: string,
  ): Promise<{ transaction: Transaction; message: string }> {
    return request<{ transaction: Transaction; message: string }>(`/admin/users/${userId}/deposit`, {
      method: 'POST',
      body: JSON.stringify({ asset, amount, note }),
    });
  },

  /** Admin debit — recorded as a LOSS in the ledger and reflected in the client's P&L. */
  async manualDebit(
    userId: string,
    asset: string,
    amount: number,
    note?: string,
  ): Promise<{ transaction: Transaction; message: string }> {
    return request<{ transaction: Transaction; message: string }>(`/admin/users/${userId}/debit`, {
      method: 'POST',
      body: JSON.stringify({ asset, amount, note }),
    });
  },

  async confirmDeposit(txId: string, amount: number): Promise<{ transaction: Transaction; message: string }> {
    return request<{ transaction: Transaction; message: string }>(`/admin/transactions/${txId}/confirm-deposit`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  },

  async denyDeposit(txId: string): Promise<{ transaction: Transaction; message: string }> {
    return request<{ transaction: Transaction; message: string }>(`/admin/transactions/${txId}/deny-deposit`, {
      method: 'POST',
    });
  },

  // Withdrawal multi-sig approvals (existing wallet route)
  async getWithdrawals(): Promise<WithdrawalRequestView[]> {
    return request<WithdrawalRequestView[]>('/wallet/withdrawals');
  },

  async approveWithdrawal(txId: string): Promise<{ transaction: Transaction; message: string }> {
    return request<{ transaction: Transaction; message: string }>(`/wallet/withdrawals/${txId}/approve`, {
      method: 'POST',
    });
  },

  // Referral program (admin / compliance)
  async getReferrals(): Promise<AdminReferral[]> {
    return request<AdminReferral[]>('/admin/referrals');
  },

  async getReferralChain(userId: string): Promise<AdminReferralChain> {
    return request<AdminReferralChain>(`/admin/referrals/${userId}/chain`);
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
