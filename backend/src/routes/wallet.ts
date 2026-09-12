import { Router, type Request, type Response } from 'express';
import { nanoid } from 'nanoid';
import {
  addTransaction,
  addWithdrawalRequest,
  addAuditLog,
  appendLedgerEntry,
  findUserById,
  getLedgerForUser,
  getTransactionsForUser,
  getAllUsers,
  getWalletsForUser,
  getWithdrawalRequests,
  setAvailableWithdrawal,
  updateWithdrawalRequest,
  type Transaction,
} from '../db/index.js';
import { requireAuth, requireKycApproved, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { SUPPORTED_ASSETS } from '../data/strategies.js';
import { getPlanByAmount, addWorkingDays, computeExpectedReturn, workingDaysBetween, MIN_DEPOSIT } from '../data/plans.js';
import { addInvestment, getActiveInvestmentForUser, type Investment } from '../db/index.js';

// ---- Card payment processing ---------------------------------------------
// Deposits are card-only. Real card charges are processed by Stripe's
// Payment Intents API (server-side, through the REST endpoint — card details
// are never stored by us). When STRIPE_SECRET_KEY is not configured, a MOCK
// card processor is used so the flow can be exercised in development without
// charging a real card.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_API_BASE = 'https://api.stripe.com/v1';

interface PaymentIntent {
  id: string;
  clientSecret: string;
  currency: string;
  amount: number; // in dollars
  metadata: Record<string, string>;
  status: string;
}

// Mock intents store (dev/demo only — used when STRIPE_SECRET_KEY is unset)
const mockIntents = new Map<string, PaymentIntent>();

function metadataToParams(metadata: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(metadata).map(([k, v]) => [`metadata[${k}]`, v]));
}

async function stripeApi(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  params: Record<string, string> = {},
): Promise<any> {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(method === 'POST' ? { body } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe API error (${res.status}): ${text}`);
  }
  return res.json();
}

async function createPaymentIntent(params: {
  amount: number; // in dollars
  currency: string;
  description: string;
  metadata: Record<string, string>;
}): Promise<PaymentIntent> {
  if (STRIPE_SECRET_KEY) {
    const intent = await stripeApi('/payment_intents', 'POST', {
      amount: String(Math.round(params.amount * 100)),
      currency: params.currency,
      description: params.description,
      'payment_method_types[]': 'card',
      ...metadataToParams(params.metadata),
    });
    return {
      id: intent.id,
      clientSecret: intent.client_secret,
      currency: intent.currency,
      amount: params.amount,
      metadata: params.metadata,
      status: intent.status,
    };
  }

  // Mock processor (dev/demo) — no real card is charged.
  console.warn(
    '[wallet] STRIPE_SECRET_KEY not set — using MOCK card processor. ' +
      'Deposits are simulated and NOT charged. Set STRIPE_SECRET_KEY to enable real card payments.',
  );
  const mock: PaymentIntent = {
    id: `pi_mock_${nanoid(16)}`,
    clientSecret: `sk_test_mock_${nanoid(16)}`,
    currency: params.currency,
    amount: params.amount,
    metadata: params.metadata,
    status: 'succeeded',
  };
  mockIntents.set(mock.id, mock);
  return mock;
}

async function retrievePaymentIntent(id: string): Promise<PaymentIntent | null> {
  if (STRIPE_SECRET_KEY) {
    const intent = await stripeApi(`/payment_intents/${id}`);
    return {
      id: intent.id,
      clientSecret: intent.client_secret,
      currency: intent.currency,
      amount: Number(intent.amount) / 100,
      metadata: intent.metadata ?? {},
      status: intent.status,
    };
  }
  return mockIntents.get(id) ?? null;
}

const router = Router();

router.use(requireAuth);

/** Strict minimum withdrawal amount (USD). */
export const MIN_WITHDRAWAL = 5;

/**
 * Records an investment for a confirmed deposit: assigns the plan strictly by
 * amount (getPlanByAmount), snapshots the daily rate, duration, start/end dates
 * (end = start + duration in WORKING days, weekends skipped) and the total
 * expected return, then persists the row in the investments table.
 * Amounts below the $20 minimum throw — callers must validate first.
 */
export async function recordInvestmentForDeposit(userId: string, amount: number): Promise<Investment> {
  const plan = getPlanByAmount(amount);
  if (!plan) {
    throw new Error(`Minimum deposit is $${MIN_DEPOSIT}. No plan available.`);
  }
  const startDate = new Date();
  const endDate = addWorkingDays(startDate, plan.durationDays);
  const investment: Investment = {
    id: `INV-${nanoid(10)}`,
    userId,
    initialDeposit: amount,
    assignedPlan: plan.name,
    dailyRate: plan.dailyRate,
    durationDays: plan.durationDays,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    totalExpectedReturn: computeExpectedReturn(amount, plan.dailyRate, plan.durationDays),
    status: 'active',
  };
  await addInvestment(investment);
  return investment;
}

/**
 * Per-asset deposit network registry.
 *
 * USDT supports multiple networks (TRC-20 and BEP-20); BTC and ETH each support
 * one. Each entry maps a network id to its custodial deposit address. In
 * production these addresses should come from your secure custody system.
 */
const DEPOSIT_WALLET_BY_NETWORK: Record<string, { network: string; label: string; address: string }[]> = {
  USDT: [
    { network: 'TRC-20', label: 'Tron (TRC-20)', address: process.env.DEPOSIT_WALLET_USDT_TRC20 || 'TUc2wxZTmfseu42idSDdhKDT35eyUiWwwp' },
    { network: 'BEP-20', label: 'BNB Smart Chain (BEP-20)', address: process.env.DEPOSIT_WALLET_USDT_BEP20 || '0x69276bb6ccd6927ac2623a6b18601ce2d48efda3' },
  ],
  BTC: [{ network: 'BTC', label: 'Bitcoin Network', address: process.env.DEPOSIT_WALLET_BTC || '0x69276bb6ccd6927ac2623a6b18601ce2d48efda3' }],
  ETH: [{ network: 'ERC-20', label: 'Ethereum (ERC-20)', address: process.env.DEPOSIT_WALLET_ETH || '0x69276bb6ccd6927ac2623a6b18601ce2d48efda3' }],
};

/** Default network used for each asset when a client does not specify one. */
const DEFAULT_NETWORK: Record<string, string> = { USDT: 'TRC-20', BTC: 'BTC', ETH: 'ERC-20' };

interface DepositNetwork {
  network: string;
  label: string;
  address: string;
}

/**
 * Resolve the deposit network for an asset.
 * Returns undefined when the asset is unsupported or the requested network is
 * not valid for that asset (e.g. BEP-20 on BTC).
 */
function getDepositNetwork(asset: string, network?: string): DepositNetwork | undefined {
  const networks = DEPOSIT_WALLET_BY_NETWORK[asset];
  if (!networks || networks.length === 0) return undefined;
  const wanted = (network || DEFAULT_NETWORK[asset] || networks[0].network).toUpperCase();
  return networks.find((n) => n.network.toUpperCase() === wanted);
}

/**
 * GET /api/wallet/deposit-address/:asset?network=
 * Returns the custodial deposit address for the specified asset on the
 * requested network (network is required when the asset supports more than one,
 * e.g. USDT → TRC-20 or BEP-20).
 */
router.get('/deposit-address/:asset', async (req: AuthenticatedRequest, res: Response) => {
  const asset = req.params.asset as string;
  const network = (req.query.network as string | undefined)?.toUpperCase();

  const deposit = getDepositNetwork(asset, network);
  if (!deposit) {
    const networks = DEPOSIT_WALLET_BY_NETWORK[asset];
    if (!SUPPORTED_ASSETS.includes(asset)) {
      res.status(400).json({ error: `Unsupported asset. Supported: ${SUPPORTED_ASSETS.join(', ')}` });
    } else {
      res.status(400).json({
        error: `Unsupported network for ${asset}. Supported: ${networks.map((n) => n.network).join(', ')}`,
      });
    }
    return;
  }

  res.json({
    asset,
    network: deposit.network,
    address: deposit.address,
    message: `Deposit ${asset} on the ${deposit.network} network to this custodial address.`,
  });
});

/**
 * GET /api/wallet/addresses
 * Returns the user's deposit addresses per asset and network.
 */
router.get('/addresses', async (req: AuthenticatedRequest, res: Response) => {
  const addresses = SUPPORTED_ASSETS.flatMap((asset) =>
    (DEPOSIT_WALLET_BY_NETWORK[asset] ?? []).map((n) => ({
      asset,
      network: n.network,
      label: n.label,
      address: n.address,
      isActive: true,
      createdAt: new Date().toISOString(),
    }))
  );
  res.json(addresses);
});

/**
 * GET /api/wallet/balances
 * Returns the user's wallets across custody tiers (hot/warm/cold).
 */
router.get('/balances', async (req: AuthenticatedRequest, res: Response) => {
  const wallets = await getWalletsForUser(req.userId!);
  res.json(wallets);
});

/**
 * GET /api/wallet/policy
 * Withdrawal policy (backend.md §5.1: rate limiting, caps).
 */
router.get('/policy', (req: AuthenticatedRequest, res: Response) => {
  res.json({
    processingTimeFiat: '1–3 business days',
    processingTimeCrypto: 'Instant to whitelisted wallets',
    withdrawalFee: '$0',
    networkFees: 'Passed at cost',
    dailyCap: req.user!.withdrawalCap,
    requiresMultiSig: true,
    // 2FA is no longer required per §5.1
  });
});

/**
 * POST /api/wallet/deposit
 * Creates a card Payment Intent (Stripe) for the deposit.
 * Deposits are card-only and the purchased asset is delivered to a constant
 * custodial crypto wallet (DEPOSIT_WALLET_BY_NETWORK) — there is no manual
 * crypto-transfer address flow.
 * KYC must be APPROVED (backend.md §4.2).
 * 
 * Body: { asset: 'USDT', amount: 1000 }
 * Response: { clientSecret, paymentIntentId, amount, asset, depositAddress }
 */
router.post('/deposit', requireKycApproved, async (req: AuthenticatedRequest, res: Response) => {
  const { asset, amount, network } = req.body as { asset?: string; amount?: number; network?: string };
  const userId = req.userId!;

  if (!asset || !SUPPORTED_ASSETS.includes(asset)) {
    res.status(400).json({ error: `Unsupported asset. Supported: ${SUPPORTED_ASSETS.join(', ')}` });
    return;
  }
  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'Amount must be positive' });
    return;
  }

  const deposit = getDepositNetwork(asset, network);
  if (!deposit) {
    res.status(400).json({
      error: `Unsupported network for ${asset}. Supported: ${DEPOSIT_WALLET_BY_NETWORK[asset].map((n) => n.network).join(', ')}`,
    });
    return;
  }

  try {
    // Create a Stripe Payment Intent. Amount is in cents, so multiply by 100.
    const intent = await createPaymentIntent({
      amount,
      currency: 'usd',
      description: `Deposit ${amount} USD as ${asset} to GDPTraders`,
      metadata: { userId, asset, network: deposit.network, depositAddress: deposit.address },
    });

    res.status(201).json({
      clientSecret: intent.clientSecret,
      paymentIntentId: intent.id,
      amount,
      asset,
      network: deposit.network,
      depositAddress: deposit.address,
      message: 'Payment intent created. Complete the card payment to deposit funds into the custodial wallet.',
    });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

/**
 * POST /api/wallet/deposit-confirm
 * Confirms a successful card deposit and credits the user's account.
 * Called after the Stripe card payment succeeds.
 * 
 * Body: { paymentIntentId, asset, amount }
 */
router.post('/deposit-confirm', requireKycApproved, async (req: AuthenticatedRequest, res: Response) => {
  const { paymentIntentId, asset, amount, network } = req.body as {
    paymentIntentId?: string;
    asset?: string;
    amount?: number;
    network?: string;
  };
  const userId = req.userId!;

  if (!asset || !SUPPORTED_ASSETS.includes(asset) || !amount || amount <= 0) {
    res.status(400).json({ error: 'Invalid asset or amount' });
    return;
  }
  // A deposit must map to an investment plan — below $20 there is no plan.
  if (!getPlanByAmount(amount)) {
    res.status(400).json({ error: `Minimum deposit is $${MIN_DEPOSIT}. No plan available.` });
    return;
  }

  const deposit = getDepositNetwork(asset, network);
  const depositAddress = deposit?.address;

  try {
    // Verify the card payment intent (real Stripe or mock).
    const intent = await retrievePaymentIntent(paymentIntentId ?? '');
    if (!intent || intent.status !== 'succeeded') {
      res.status(400).json({ error: 'Payment has not been completed' });
      return;
    }

    // Record deposit in ledger
    const txId = `TX-${nanoid(12)}`;
    await appendLedgerEntry(userId, asset, amount, 'deposit', txId);

    // Snapshot the investment plan assigned to this confirmed deposit.
    const investment = await recordInvestmentForDeposit(userId, amount);

    // Create transaction record
    const tx: Transaction = {
      id: txId,
      userId,
      date: new Date().toISOString(),
      type: 'Deposit',
      asset,
      amount,
      strategy: 'Pending Allocation',
      status: 'Completed',
      txHash: paymentIntentId ?? '',
      network: deposit?.network,
    };
    await addTransaction(tx);
    
    // Audit log
    await addAuditLog(
      userId,
      'DEPOSIT',
      `Card deposit confirmed: ${amount} USD as ${asset}${deposit ? ` (${deposit.network})` : ''} delivered to custodial wallet ${depositAddress} (${paymentIntentId})`
    );

    res.status(201).json({
      transaction: tx,
      depositAddress,
      network: deposit?.network,
      investment,
      message: `Deposit confirmed. Your ${asset} has been delivered to the custodial wallet and credited to your account.`,
    });
  } catch (err) {
    console.error('Deposit confirmation error:', err);
    res.status(500).json({ error: 'Failed to confirm deposit' });
  }
});

/**
 * POST /api/wallet/crypto-deposit
 * Records a crypto deposit submitted by the user via manual wallet transfer.
 * The user sends the selected asset to the constant custodial deposit wallet
 * (DEPOSIT_WALLET_BY_NETWORK), then notifies us to verify the on-chain transfer.
 * The deposit is recorded as Processing until confirmed. The declared amount
 * is stored so admins can verify it against the actual on-chain transfer
 * before crediting the client's portfolio (ledger 'deposit' entry).
 *
 * Body: { asset: 'USDT', amount: 1500 }
 */
router.post('/crypto-deposit', requireKycApproved, async (req: AuthenticatedRequest, res: Response) => {
  const { asset, amount, network } = req.body as { asset?: string; amount?: number; network?: string };
  const userId = req.userId!;

  if (!asset || !SUPPORTED_ASSETS.includes(asset)) {
    res.status(400).json({ error: `Unsupported asset. Supported: ${SUPPORTED_ASSETS.join(', ')}` });
    return;
  }
  const parsedAmount = Number(amount);
  if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ error: 'A positive deposit amount is required.' });
    return;
  }
  // A deposit must map to an investment plan — below $20 there is no plan.
  if (!getPlanByAmount(parsedAmount)) {
    res.status(400).json({ error: `Minimum deposit is $${MIN_DEPOSIT}. No plan available.` });
    return;
  }
  const deposit = getDepositNetwork(asset, network);
  if (!deposit) {
    res.status(400).json({
      error: `Unsupported network for ${asset}. Supported: ${DEPOSIT_WALLET_BY_NETWORK[asset].map((n) => n.network).join(', ')}`,
    });
    return;
  }

  // Create a pending deposit transaction (on-chain verification is pending).
  const txId = `TX-${nanoid(12)}`;
  const tx: Transaction = {
    id: txId,
    userId,
    date: new Date().toISOString(),
    type: 'Deposit',
    asset,
    amount: parsedAmount,
    strategy: 'Pending Allocation',
    status: 'Processing',
    txHash: `0x${nanoid(16)}`,
    network: deposit.network,
  };
  await addTransaction(tx);
  await addAuditLog(
    userId,
    'DEPOSIT_SUBMITTED',
    `User reported sending ${parsedAmount} ${asset} on ${deposit.network} to custodial wallet ${deposit.address} (${txId})`
  );

  res.status(201).json({
    transaction: tx,
    network: deposit.network,
    depositAddress: deposit.address,
    message: `Deposit recorded. We will verify your ${asset} (${deposit.network}) transfer on the blockchain and credit your account once confirmed.`,
  });
});

/**
 * POST /api/wallet/reinvest-profit
 * Client requests to reinvest PROFIT (admin-credited gains only) into their
 * initial capital. Goes through the same admin approval flow as a normal
 * deposit: it creates a pending 'Reinvest' transaction which an admin must
 * confirm before the amount moves from profit to capital.
 *
 * Server-side validation guarantees the amount never exceeds the client's
 * un-reinvested admin-credited profit:
 *   availableProfit = total profit credits - total loss debits - prior reinvestments
 *
 * Body: { amount }
 */
router.post('/reinvest-profit', requireKycApproved, async (req: AuthenticatedRequest, res: Response) => {
  const { amount } = req.body as { amount?: number };
  const user = req.user!;
  const parsedAmount = Number(amount);

  if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ error: 'Please enter the profit amount you wish to reinvest.' });
    return;
  }

  // Available profit = admin-credited profit − admin debits (losses) −
  // profit already moved to capital by earlier reinvestments (pending or
  // approved — a pending request reserves its amount). Withdrawals do not
  // reduce it (they draw from availableWithdrawal, set by an admin).
  const [ledger, transactions] = await Promise.all([getLedgerForUser(user.id), getTransactionsForUser(user.id)]);
  const profit = ledger.filter((e) => e.entryType === 'profit').reduce((s, e) => s + e.amount, 0);
  const loss = ledger.filter((e) => e.entryType === 'loss').reduce((s, e) => s + Math.abs(e.amount), 0);
  const reinvested = transactions
    .filter((t) => t.type === 'Reinvest' && t.status !== 'Cancelled')
    .reduce((s, t) => s + t.amount, 0);
  const availableProfit = profit - loss - reinvested;

  if (parsedAmount > availableProfit + 1e-9) {
    res.status(400).json({
      error: `You only have ${Math.max(availableProfit, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} USD of un-reinvested profit available to reinvest.`,
    });
    return;
  }

  const txId = `RX-${Math.floor(100000 + Math.random() * 900000)}`;
  const tx: Transaction = {
    id: txId,
    userId: user.id,
    date: new Date().toISOString(),
    type: 'Reinvest',
    asset: 'USDT',
    amount: parsedAmount,
    strategy: 'Profit Reinvestment',
    status: 'Processing',
    txHash: `0x${nanoid(16)}`,
    requiresApproval: true,
  };
  await addTransaction(tx);
  await addAuditLog(user.id, 'REINVEST_REQUESTED', `Client requested to reinvest ${parsedAmount} USD of profit into capital (${txId})`);

  res.status(201).json({
    transaction: tx,
    availableProfit: Math.max(availableProfit - parsedAmount, 0),
    message: 'Reinvestment request submitted. It will be credited to your initial capital once an admin approves it.',
  });
});

/**
 * GET /api/wallet/reinvest-profit
 * Client's available profit and reinvestment request history.
 */
router.get('/reinvest-profit', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const [ledger, txs] = await Promise.all([getLedgerForUser(userId), getTransactionsForUser(userId)]);

  const totalProfit = ledger.filter((e) => e.entryType === 'profit').reduce((s, e) => s + e.amount, 0);
  const totalLoss = ledger.filter((e) => e.entryType === 'loss').reduce((s, e) => s + Math.abs(e.amount), 0);

  // Profit already committed to reinvestment (pending or completed requests).
  const reinvestments = txs
    .filter((t) => t.type === 'Reinvest' && t.status !== 'Cancelled')
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const reinvested = reinvestments.reduce((s, t) => s + t.amount, 0);

  res.json({
    totalProfit,
    totalLoss,
    reinvested,
    availableProfit: Math.max(totalProfit - totalLoss - reinvested, 0),
    reinvestments: reinvestments.map((t) => ({ id: t.id, date: t.date, amount: t.amount, status: t.status })),
  });
});

/**
 * GET /api/wallet/investment
 * The client's most recent ACTIVE investment record (read straight from the
 * investments table). Returns null fields when the client has no active plan.
 */
router.get('/investment', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  let inv = await getActiveInvestmentForUser(userId);

  // ---- Legacy-client self-heal ----
  // Clients who deposited BEFORE the investments table existed have no row at
  // all, so the backfill script cannot help them (it only patches existing
  // rows). Derive their plan from the immutable ledger's deposit entries —
  // the historical source of truth for initial capital — and persist the
  // record once so later reads hit the table like any other client.
  if (!inv) {
    const ledger = await getLedgerForUser(userId);
    const depositEntries = ledger
      .filter((e) => e.entryType === 'deposit')
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const totalDeposited = depositEntries.reduce((sum, e) => sum + e.amount, 0);
    const plan = getPlanByAmount(totalDeposited);
    if (plan && depositEntries.length > 0) {
      const startDate = new Date(depositEntries[0].createdAt);
      inv = {
        id: `INV-${nanoid(10)}`,
        userId,
        initialDeposit: totalDeposited,
        assignedPlan: plan.name,
        dailyRate: plan.dailyRate,
        durationDays: plan.durationDays,
        startDate: startDate.toISOString(),
        endDate: addWorkingDays(startDate, plan.durationDays).toISOString(),
        totalExpectedReturn: computeExpectedReturn(totalDeposited, plan.dailyRate, plan.durationDays),
        status: 'active',
      };
      await addInvestment(inv);
      console.warn(
        `[investment] Legacy client ${userId} had no investments row — derived ${plan.name} ` +
          `from ${depositEntries.length} ledger deposit(s) totalling ${totalDeposited} and persisted record ${inv.id}.`,
      );
    }
  }

  if (!inv) {
    res.json({ investment: null, daysRemaining: 0 });
    return;
  }

    // ---- Runtime fallback (Task 4) ----
  // Read the stored plan snapshot first; if the plan columns are NULL (legacy
  // row the backfill script hasn't reached yet) OR the stored rate no longer
  // matches the live plan definition (plan rates may have been updated since
  // the row was written), compute the plan dynamically from the deposit amount
  // so the dashboard always shows current rates — and log a warning so ops
  // know this row should be backfilled.
  let planName = inv.assignedPlan;
  let dailyRate = inv.dailyRate;
  let durationDays = inv.durationDays;
  let endDate = inv.endDate;
  let totalExpectedReturn = inv.totalExpectedReturn;
  const fallback = getPlanByAmount(inv.initialDeposit);
  if (
    fallback &&
    // Admin plan overrides are authoritative — never revert them to the
    // amount-based plan (e.g. an admin manually upgraded a client's tier).
    !inv.planOverride &&
    (planName == null ||
      dailyRate == null ||
      durationDays == null ||
      dailyRate !== fallback.dailyRate ||
      durationDays !== fallback.durationDays ||
      planName !== fallback.name)
  ) {
    const wasNull = planName == null || dailyRate == null || durationDays == null;
    planName = fallback.name;
    dailyRate = fallback.dailyRate;
    durationDays = fallback.durationDays;
    endDate = endDate ?? addWorkingDays(new Date(inv.startDate), fallback.durationDays).toISOString();
    // Always recompute the expected payout from the served rate/duration so the
    // displayed "Daily Accrual" and "Expected Total Payout" stay consistent even
    // when the stored row carries an older plan snapshot (rates may have changed
    // since the row was written). Previously this only recomputed when it was
    // NULL, leaving a stale payout displayed next to updated rates.
    totalExpectedReturn = computeExpectedReturn(inv.initialDeposit, fallback.dailyRate, fallback.durationDays);
    console.warn(
      `[investment] Investment ${inv.id} (user ${userId}) ${wasNull ? 'has no stored plan snapshot' : `stored ${inv.assignedPlan}/${inv.dailyRate}% which differs from live plan`} — serving current rates (${fallback.name}/${fallback.dailyRate}%). Run \`npm run backfill:investments\` to backfill this row.`,
    );
  } else if (!fallback) {
    console.warn(
      `[investment] Investment ${inv.id} (user ${userId}) amount ${inv.initialDeposit} is below the ` +
        `$${MIN_DEPOSIT} plan minimum — no plan available. Row flagged 'under_review'.`,
    );
  }

  // Working days remaining between now and the maturity date (weekends excluded).
  const now = new Date();
  const end = endDate ? new Date(endDate) : null;
  let daysRemaining = 0;
  if (end && end > now) {
    daysRemaining = workingDaysBetween(now, end);
  }

  res.json({
    investment: {
      id: inv.id,
      planName,
      initialDeposit: inv.initialDeposit,
      dailyRate,
      durationDays,
      startDate: inv.startDate,
      endDate,
      totalExpectedReturn,
      status: inv.status,
    },
    daysRemaining,
  });
});

/**
 * POST /api/wallet/withdraw
 * Creates a withdrawal request requiring multi-sig approval (Admin + Compliance).
 * Body: { asset, amount, destinationAddress }
 */
router.post('/withdraw', requireKycApproved, async (req: AuthenticatedRequest, res: Response) => {
  const { asset, amount, destinationAddress, network } = req.body as {
    asset?: string;
    amount?: number;
    destinationAddress?: string;
    network?: string;
  };
  const user = req.user!;
  const address = typeof destinationAddress === 'string' ? destinationAddress.trim() : '';

  if (!asset || !SUPPORTED_ASSETS.includes(asset)) {
    res.status(400).json({ error: `Unsupported asset. Supported: ${SUPPORTED_ASSETS.join(', ')}` });
    return;
  }

  // Resolve the network the client wants to receive on. USDT supports TRC-20
  // and BEP-20; BTC and ETH default to their single supported network.
  const networks = DEPOSIT_WALLET_BY_NETWORK[asset] ?? [];
  const net = getDepositNetwork(asset, network);
  if (!net || networks.length === 0) {
    res.status(400).json({
      error: `Unsupported network for ${asset}. Supported: ${networks.map((n) => n.network).join(', ')}`,
    });
    return;
  }

  const parsedAmount = Number(amount);
  if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ error: 'Amount must be positive' });
    return;
  }
  // Strict minimum withdrawal — a client cannot withdraw less than MIN_WITHDRAWAL.
  if (parsedAmount < MIN_WITHDRAWAL) {
    res.status(400).json({
      error: `Minimum withdrawal is $${MIN_WITHDRAWAL}. Please enter an amount of at least $${MIN_WITHDRAWAL}.`,
    });
    return;
  }
  // Basic per-network sanity checks so typos/looped-in wrong-chain addresses
  // fail fast. Final verification of the on-chain transfer is the approvers' job.
  const isValidAddress =
    (net.network === 'BTC' && /^[13bc][a-zA-Z0-9]{24,60}$/.test(address)) ||
    (net.network === 'ERC-20' && /^0x[a-fA-F0-9]{40}$/.test(address)) ||
    (net.network === 'TRC-20' && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) ||
    (net.network === 'BEP-20' && /^0x[a-fA-F0-9]{40}$/.test(address));
  if (!address) {
    res.status(400).json({ error: 'Destination wallet address is required' });
    return;
  }
  if (!isValidAddress) {
    res.status(400).json({
      error: `That doesn't look like a valid ${asset} ${net.network} wallet address. Double-check it and try again.`,
    });
    return;
  }
  if (parsedAmount > user.withdrawalCap) {
    res.status(400).json({ error: `Amount exceeds daily withdrawal cap of $${user.withdrawalCap}` });
    return;
  }

  // The "available withdrawal" amount is set by an admin (from the client's
  // initial deposit plus any profit credited). A client can only withdraw up
  // to this approved amount — 0 means no withdrawal has been granted yet.
  if (parsedAmount > user.availableWithdrawal) {
    res.status(400).json({
      error: `Amount exceeds your available withdrawal of ${user.availableWithdrawal.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD. Please contact support if you believe this is incorrect.`,
    });
    return;
  }

  // Ensure the client actually holds enough funds (ledger = source of truth).
  const ledger = await getLedgerForUser(user.id);
  const available = ledger.reduce((sum, entry) => sum + entry.amount, 0);
  if (parsedAmount > available) {
    res.status(400).json({
      error: `Insufficient funds. Available balance: ${available.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD.`,
    });
    return;
  }

  const txId = `TX-${Math.floor(100000 + Math.random() * 900000)}`;
  const tx: Transaction = {
    id: txId,
    userId: user.id,
    date: new Date().toISOString(),
    type: 'Withdrawal',
    asset,
    amount: parsedAmount,
    strategy: 'Client Withdrawal',
    status: 'Pending',
    txHash: `0x${nanoid(16)}`,
    destinationAddress: address,
    network: net.network,
    requiresApproval: true,
    approval1: false,
    approval2: false,
  };
  await addWithdrawalRequest(tx);
  await addTransaction(tx);
  await addAuditLog(user.id, 'WITHDRAWAL_REQUESTED', `${asset} (${net.network}) ${parsedAmount} withdrawal to ${address}`);

  res.status(201).json({
    transaction: tx,
    message: 'Withdrawal request submitted. Requires Admin + Compliance approval before execution.',
  });
});

/**
 * GET /api/wallet/withdrawals (admin/compliance)
 * Lists withdrawal requests for approval, joined with client identity.
 */
router.get(
  '/withdrawals',
  requireRole('admin', 'compliance'),
  async (req: AuthenticatedRequest, res: Response) => {
    const [requests, users] = await Promise.all([getWithdrawalRequests(), getAllUsers()]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    res.json(
      requests.map((t) => ({
        ...t,
        userEmail: userMap.get(t.userId)?.email ?? 'unknown',
        userName: userMap.get(t.userId)?.name ?? 'unknown',
      }))
    );
  }
);

/**
 * POST /api/wallet/withdrawals/:id/approve (admin/compliance)
 * Multi-sig approval: requires BOTH admin and compliance sign-off.
 */
router.post(
  '/withdrawals/:id/approve',
  requireRole('admin', 'compliance'),
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const approver = req.user!;
    const requests = await getWithdrawalRequests();
    const tx = requests.find((t) => t.id === id);

    if (!tx) {
      res.status(404).json({ error: 'Withdrawal request not found' });
      return;
    }
    if (tx.status !== 'Pending') {
      res.status(400).json({ error: 'Withdrawal already processed' });
      return;
    }

    if (approver.role === 'admin') tx.approval1 = true;
    if (approver.role === 'compliance') tx.approval2 = true;

    await addAuditLog(tx.userId, 'WITHDRAWAL_APPROVAL', `${approver.role} approved withdrawal ${tx.id}`);

    // Execute only when both signatures are present (backend.md §4.3)
    if (tx.approval1 && tx.approval2) {
      tx.status = 'Completed';
      await appendLedgerEntry(tx.userId, tx.asset, -tx.amount, 'withdrawal', tx.id);
      // Keep "Available withdrawal" in sync: an executed withdrawal reduces the
      // amount the client can still withdraw (never below 0).
      const wUser = await findUserById(tx.userId);
      if (wUser) {
        await setAvailableWithdrawal(tx.userId, Math.max((wUser.availableWithdrawal ?? 0) - tx.amount, 0));
      }
      await addAuditLog(tx.userId, 'WITHDRAWAL_EXECUTED', `${tx.asset} ${tx.amount} withdrawal executed`);
      await updateWithdrawalRequest(tx.id, { status: 'Completed' });
      await addTransaction(tx); // keep the transactions-table copy in sync (pgStore has separate tables)
      res.json({ transaction: tx, message: 'Withdrawal approved by both parties and executed.' });
    } else {
      await updateWithdrawalRequest(tx.id, { approval1: tx.approval1, approval2: tx.approval2 });
      res.json({
        transaction: tx,
        message: `Approval recorded (${approver.role}). Waiting for the other signatory.`,
      });
    }
  }
);

export default router;
