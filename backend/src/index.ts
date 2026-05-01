import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';
import {
  ActionPayload,
  ApprovalExecutionStatus,
  ApprovalRequest,
  ApprovalStatus,
} from '@quill/shared';
import {
  canSendLoopkindPush,
  getLoopkindPushPublicKey,
  sendLoopkindPushNotifications,
  type StoredPushSubscription,
} from './loopkind-push.js';
import { hashPassword, normalizeEmail, verifyPassword } from './passwords.js';

// The backend is invoked from `quillAgent/backend/` by `tsx watch`, so the
// default dotenv lookup in CWD won't find the workspace-level .env that
// holds QUILL_API_KEY. Load the workspace root .env first, then let any
// per-package .env override (and fall back to the regular CWD lookup so
// production builds that ship their own .env beside the binary still work).
const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceEnv = path.resolve(here, '..', '..', '.env');
dotenv.config({ path: workspaceEnv });
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

const rawQuillApiKey = process.env.QUILL_API_KEY?.trim() ?? '';
if (!rawQuillApiKey) {
  // Auth is mandatory. Previously this middleware silently no-op'd when
  // QUILL_API_KEY was unset, which exposed /api/approvals (and its resume
  // tokens, email bodies, calendar IDs) to any localhost caller — see
  // quillServer/SECURITY_AUDIT/findings/04-backend.md §P0.
  console.error(
    'FATAL: QUILL_API_KEY is not set. The backend refuses to start without an API key so that routes serving tokens and approvals cannot be reached unauthenticated.',
  );
  process.exit(1);
}
const quillApiKey = rawQuillApiKey;
const quillApiKeyBuffer = Buffer.from(quillApiKey, 'utf8');

const parseOriginList = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);

const allowedOrigins = parseOriginList(process.env.QUILL_ALLOWED_ORIGINS);

const approvalStatuses = new Set<ApprovalStatus>([
  'pending',
  'approved',
  'rejected',
  'changes_requested',
  'continuous_improvement',
]);
const executionStatuses = new Set<ApprovalExecutionStatus>([
  'pending',
  'running',
  'completed',
  'failed',
]);
const LOOPKIND_MIN_PASSWORD_LENGTH = 12;
const loopkindAllowSignups = process.env.LOOPKIND_ALLOW_SIGNUPS === '1';

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser callers (bridges, executors, server-to-server) send no
      // Origin header; they're authorised by the API key, not by CORS.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS: origin ${origin} is not allowed`));
    },
    credentials: false,
  }),
);
app.use(express.json());

// Rate limiting. Closes audit P2 (`02-code-findings.md` row 7 of the
// backend table). Two layers:
//
//   1. `apiRateLimiter` — generous cap on every `/api/*` route. Protects
//      against runaway agent loops and slows down brute-force probes
//      against the API key check. Defaults to 1200 req/min per IP.
//   2. `authRateLimiter` — tight cap on `/api/loopkind/auth/*`. Keyed by
//      IP + normalised email so that an attacker can't burn through
//      30 attempts on a single account by rotating IPs (or, in the
//      common localhost-only deployment, can't burn 30 attempts on
//      every account from one shared IP). Defaults to 30 attempts per
//      15 minutes per (IP, email).
//
// The limits are deliberately generous; bridges and executors poll
// approvals frequently. Operators can tighten via env without redeploys.
const parseLimitEnv = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: parseLimitEnv(process.env.QUILL_RATE_LIMIT_API_PER_MIN, 1200),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Skip the rate limiter in tests if anyone wires one up — defaults to
  // false in production.
  skip: () => process.env.QUILL_RATE_LIMIT_DISABLED === '1',
  message: { error: 'Too many requests, please slow down' },
});

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: parseLimitEnv(process.env.QUILL_RATE_LIMIT_AUTH_PER_15M, 30),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.QUILL_RATE_LIMIT_DISABLED === '1',
  // Per-(IP, email) bucket so credential spray against multiple accounts
  // each gets its own limit. Falls back to IP-only if no email present.
  keyGenerator: (req, res) => {
    const ipKey = ipKeyGenerator(req.ip ?? '');
    const rawEmail = (req.body as { email?: unknown } | undefined)?.email;
    if (typeof rawEmail !== 'string') return ipKey;
    return `${ipKey}|${rawEmail.toLowerCase().trim()}`;
  },
  message: { error: 'Too many auth attempts, please wait' },
});

const db = new Database('quill.db');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    approval_id TEXT,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY,
    service TEXT NOT NULL UNIQUE,
    access_token TEXT,
    refresh_token TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS shared_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS loopkind_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS loopkind_push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    subscription_json TEXT NOT NULL,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_success_at DATETIME,
    last_error TEXT,
    FOREIGN KEY(user_id) REFERENCES loopkind_users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_loopkind_push_user_id
    ON loopkind_push_subscriptions(user_id);
`);

type TableColumn = {
  name: string;
  type: string;
};

const getTableColumns = (tableName: string): TableColumn[] =>
  db.prepare(`PRAGMA table_info(${tableName})`).all() as TableColumn[];

const hasColumn = (columns: TableColumn[], name: string, type?: string) =>
  columns.some(
    column =>
      column.name === name &&
      (type === undefined || column.type.toUpperCase() === type.toUpperCase()),
  );

const migrateLegacyApprovalsTable = () => {
  const columns = getTableColumns('approvals');
  if (
    columns.length === 0 ||
    (hasColumn(columns, 'id', 'TEXT') && hasColumn(columns, 'updated_at'))
  ) {
    return;
  }

  db.exec(`
    ALTER TABLE approvals RENAME TO approvals_legacy;

    CREATE TABLE approvals (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO approvals (id, action, payload, status, created_at, updated_at)
    SELECT
      CAST(id AS TEXT),
      action,
      payload,
      COALESCE(status, 'pending'),
      COALESCE(created_at, CURRENT_TIMESTAMP),
      COALESCE(created_at, CURRENT_TIMESTAMP)
    FROM approvals_legacy;

    DROP TABLE approvals_legacy;
  `);
};

const migrateLegacyAuditLogTable = () => {
  const columns = getTableColumns('audit_log');
  if (
    columns.length === 0 ||
    (hasColumn(columns, 'id', 'TEXT') && hasColumn(columns, 'approval_id', 'TEXT'))
  ) {
    return;
  }

  db.exec(`
    ALTER TABLE audit_log RENAME TO audit_log_legacy;

    CREATE TABLE audit_log (
      id TEXT PRIMARY KEY,
      approval_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO audit_log (id, approval_id, action, details, created_at)
    SELECT
      CAST(id AS TEXT),
      CAST(approval_id AS TEXT),
      action,
      details,
      COALESCE(created_at, CURRENT_TIMESTAMP)
    FROM audit_log_legacy;

    DROP TABLE audit_log_legacy;
  `);
};

migrateLegacyApprovalsTable();
migrateLegacyAuditLogTable();

const generateId = () => crypto.randomUUID();

type ApprovalRow = {
  id: string;
  action: string;
  payload: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type LoopkindUserRow = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

type LoopkindPushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  subscription_json: string;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  last_success_at: string | null;
  last_error: string | null;
};

const parseApprovalRow = (row: ApprovalRow): ApprovalRequest => ({
  id: row.id,
  action: row.action,
  payload: JSON.parse(row.payload),
  status: row.status as ApprovalStatus,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const serializeLoopkindUser = (row: LoopkindUserRow) => ({
  id: row.id,
  email: row.email,
  createdAt: row.created_at,
});

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

const mergeActionPayload = (
  original: ActionPayload,
  patch: Partial<ActionPayload>,
): ActionPayload => ({
  ...original,
  ...patch,
  preview: patch.preview
    ? {
        ...original.preview,
        ...patch.preview,
      }
    : original.preview,
  details: patch.details
    ? {
        ...original.details,
        ...patch.details,
      }
    : original.details,
});

const getApprovalRow = (id: string): ApprovalRow | undefined =>
  db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as ApprovalRow | undefined;

const getLoopkindUserCount = (): number =>
  (
    db.prepare('SELECT COUNT(*) AS count FROM loopkind_users').get() as {
      count: number;
    }
  ).count;

const signupEnabled = (): boolean =>
  loopkindAllowSignups || getLoopkindUserCount() === 0;

const getLoopkindUserByEmail = (
  email: string,
): LoopkindUserRow | undefined =>
  db
    .prepare('SELECT * FROM loopkind_users WHERE email = ?')
    .get(email) as LoopkindUserRow | undefined;

const getLoopkindUserById = (
  id: string,
): LoopkindUserRow | undefined =>
  db.prepare('SELECT * FROM loopkind_users WHERE id = ?').get(id) as
    | LoopkindUserRow
    | undefined;

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isValidPushSubscription = (
  value: unknown,
): value is {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
} =>
  isRecord(value) &&
  typeof value.endpoint === 'string' &&
  isRecord(value.keys) &&
  typeof value.keys.auth === 'string' &&
  typeof value.keys.p256dh === 'string';

const listLoopkindPushSubscriptions = (): StoredPushSubscription[] => {
  const rows = db
    .prepare('SELECT id, endpoint, subscription_json FROM loopkind_push_subscriptions')
    .all() as LoopkindPushSubscriptionRow[];

  return rows.flatMap(row => {
    try {
      const subscription = JSON.parse(row.subscription_json) as StoredPushSubscription['subscription'];
      return [
        {
          id: row.id,
          endpoint: row.endpoint,
          subscription,
        },
      ];
    } catch {
      return [];
    }
  });
};

const pruneLoopkindPushSubscriptions = (ids: string[]) => {
  if (ids.length === 0) {
    return;
  }

  const deleteOne = db.prepare(
    'DELETE FROM loopkind_push_subscriptions WHERE id = ?',
  );
  const transaction = db.transaction((subscriptionIds: string[]) => {
    for (const id of subscriptionIds) {
      deleteOne.run(id);
    }
  });

  transaction(ids);
};

const markLoopkindPushDelivery = (ids: string[]) => {
  if (ids.length === 0) {
    return;
  }

  const updateOne = db.prepare(`
    UPDATE loopkind_push_subscriptions
    SET last_success_at = CURRENT_TIMESTAMP,
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const transaction = db.transaction((subscriptionIds: string[]) => {
    for (const id of subscriptionIds) {
      updateOne.run(id);
    }
  });

  transaction(ids);
};

const markLoopkindPushFailures = (entries: Array<{ id: string; error: string }>) => {
  if (entries.length === 0) {
    return;
  }

  const updateOne = db.prepare(`
    UPDATE loopkind_push_subscriptions
    SET last_error = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const transaction = db.transaction(
    (failedEntries: Array<{ id: string; error: string }>) => {
      for (const entry of failedEntries) {
        updateOne.run(entry.error, entry.id);
      }
    },
  );

  transaction(entries);
};

const notifyLoopkindSubscribersForApproval = async (
  approval: ApprovalRequest,
) => {
  if (!canSendLoopkindPush()) {
    return;
  }

  const result = await sendLoopkindPushNotifications(
    listLoopkindPushSubscriptions(),
    {
      id: approval.id,
      connector: approval.payload.connector,
      summary: approval.payload.summary,
      title: approval.payload.preview?.title,
      body: approval.payload.preview?.body,
    },
  );

  if (result.expiredIds.length > 0) {
    pruneLoopkindPushSubscriptions(result.expiredIds);
  }

  markLoopkindPushDelivery(result.deliveredIds);
  markLoopkindPushFailures(result.failed);

  if (result.failed.length > 0) {
    console.error('loopkind push delivery failures:', result.failed);
  }
};

const recordAuditEntry = (approvalId: string, action: string, details: string) => {
  const stmt = db.prepare(
    'INSERT INTO audit_log (id, approval_id, action, details) VALUES (?, ?, ?, ?)',
  );
  stmt.run(generateId(), approvalId, action, details);
};

const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
  const providedKey = req.header('x-quill-api-key');
  if (!providedKey) {
    res.status(401).json({ error: 'Missing or invalid API key' });
    return;
  }
  const providedBuffer = Buffer.from(providedKey, 'utf8');
  if (
    providedBuffer.length !== quillApiKeyBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, quillApiKeyBuffer)
  ) {
    res.status(401).json({ error: 'Missing or invalid API key' });
    return;
  }
  next();
};

// Liveness probe — safe to leave unauthenticated so monitoring (uptime
// kuma, docker healthchecks, systemd ExecStartPre) can check us without
// holding the API key.
app.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'live' });
});

// Rate limiters mount BEFORE the API-key check so failed-auth probes
// also count toward the bucket — otherwise an attacker could hammer
// `requireApiKey` for free.
app.use('/api', apiRateLimiter);
app.use('/api/loopkind/auth', authRateLimiter);

// Every route below this line is API-key-gated.
app.use('/api', requireApiKey);

app.get('/api/loopkind/auth/bootstrap', (_req, res) => {
  const hasUsers = getLoopkindUserCount() > 0;
  res.json({
    hasUsers,
    allowSignup: !hasUsers || loopkindAllowSignups,
    minPasswordLength: LOOPKIND_MIN_PASSWORD_LENGTH,
  });
});

app.post('/api/loopkind/auth/signup', (req, res) => {
  const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!signupEnabled()) {
    res.status(403).json({ error: 'Signup is disabled' });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'A valid email is required' });
    return;
  }
  if (password.length < LOOPKIND_MIN_PASSWORD_LENGTH) {
    res.status(400).json({
      error: `Password must be at least ${LOOPKIND_MIN_PASSWORD_LENGTH} characters`,
    });
    return;
  }
  if (getLoopkindUserByEmail(email)) {
    res.status(409).json({ error: 'That email is already in use' });
    return;
  }

  const id = generateId();
  db.prepare(
    'INSERT INTO loopkind_users (id, email, password_hash) VALUES (?, ?, ?)',
  ).run(id, email, hashPassword(password));

  const user = getLoopkindUserById(id);
  res.status(201).json({
    user: user ? serializeLoopkindUser(user) : { id, email },
  });
});

app.post('/api/loopkind/auth/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!isValidEmail(email) || password.length === 0) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = getLoopkindUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  res.json({
    user: serializeLoopkindUser(user),
  });
});

app.get('/api/loopkind/push/public-key', (_req, res) => {
  const publicKey = getLoopkindPushPublicKey();
  res.json({
    enabled: Boolean(publicKey),
    publicKey,
  });
});

app.post('/api/loopkind/push/subscriptions', (req, res) => {
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
  const subscription = req.body?.subscription;
  const userAgent =
    typeof req.body?.userAgent === 'string' && req.body.userAgent.trim().length > 0
      ? req.body.userAgent.trim()
      : null;

  if (!getLoopkindUserById(userId)) {
    res.status(404).json({ error: 'Loopkind user not found' });
    return;
  }
  if (!isValidPushSubscription(subscription)) {
    res.status(400).json({ error: 'A valid PushSubscription is required' });
    return;
  }

  const existing = db
    .prepare(
      'SELECT id FROM loopkind_push_subscriptions WHERE endpoint = ?',
    )
    .get(subscription.endpoint) as { id: string } | undefined;
  const id = existing?.id ?? generateId();

  db.prepare(`
    INSERT INTO loopkind_push_subscriptions (
      id,
      user_id,
      endpoint,
      subscription_json,
      user_agent,
      updated_at,
      last_error
    )
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      subscription_json = excluded.subscription_json,
      user_agent = excluded.user_agent,
      updated_at = CURRENT_TIMESTAMP,
      last_error = NULL
  `).run(
    id,
    userId,
    subscription.endpoint,
    JSON.stringify(subscription),
    userAgent,
  );

  res.status(existing ? 200 : 201).json({ success: true, id });
});

app.delete('/api/loopkind/push/subscriptions', (req, res) => {
  const endpoint =
    typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';

  if (!endpoint) {
    res.status(400).json({ error: 'endpoint is required' });
    return;
  }

  db.prepare(
    'DELETE FROM loopkind_push_subscriptions WHERE endpoint = ?',
  ).run(endpoint);
  res.json({ success: true });
});

app.get('/api/approvals', (req, res) => {
  const rows = db.prepare('SELECT * FROM approvals ORDER BY created_at DESC').all() as ApprovalRow[];
  const requestedStatuses =
    typeof req.query.status === 'string'
      ? req.query.status
          .split(',')
          .map(status => status.trim())
          .filter(Boolean)
      : [];
  const requestedConnector =
    typeof req.query.connector === 'string' ? req.query.connector.trim() : '';
  const requestedAction =
    typeof req.query.action === 'string' ? req.query.action.trim() : '';
  const requestedExecutionStatus =
    typeof req.query.executionStatus === 'string' ? req.query.executionStatus.trim() : '';
  const requestedLimit =
    typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;

  let approvals = rows.map(parseApprovalRow);

  if (requestedStatuses.length > 0) {
    approvals = approvals.filter(approval => requestedStatuses.includes(approval.status));
  }

  if (requestedConnector) {
    approvals = approvals.filter(
      approval => approval.payload.connector === requestedConnector,
    );
  }

  if (requestedAction) {
    approvals = approvals.filter(approval => approval.action === requestedAction);
  }

  if (requestedExecutionStatus) {
    approvals = approvals.filter(
      approval => approval.payload.details?.executionStatus === requestedExecutionStatus,
    );
  }

  if (requestedLimit && Number.isFinite(requestedLimit) && requestedLimit > 0) {
    approvals = approvals.slice(0, requestedLimit);
  }

  res.json(approvals);
});

app.get('/api/approvals/:id', (req, res) => {
  const approval = getApprovalRow(firstParam(req.params.id));
  if (!approval) {
    res.status(404).json({ error: 'Approval not found' });
    return;
  }

  res.json(parseApprovalRow(approval));
});

app.post('/api/approvals', (req, res) => {
  const { action, payload } = req.body;
  if (typeof action !== 'string' || !action.trim()) {
    res.status(400).json({ error: 'action is required' });
    return;
  }
  if (!isRecord(payload) || typeof payload.connector !== 'string' || typeof payload.summary !== 'string') {
    res.status(400).json({ error: 'payload must include connector and summary' });
    return;
  }

  const id = generateId();
  const stmt = db.prepare('INSERT INTO approvals (id, action, payload) VALUES (?, ?, ?)');
  stmt.run(id, action, JSON.stringify(payload));

  const approval = getApprovalRow(id);
  const createdApproval = approval ? parseApprovalRow(approval) : null;

  if (createdApproval) {
    void notifyLoopkindSubscribersForApproval(createdApproval).catch(error => {
      const message =
        error instanceof Error ? error.message : 'Unknown loopkind push failure';
      console.error(`Failed to send loopkind push notifications for ${createdApproval.id}:`, message);
    });
  }

  res.status(201).json(
    createdApproval ?? { id, action, payload, status: 'pending' },
  );
});

app.put('/api/approvals/:id', (req, res) => {
  const id = firstParam(req.params.id);
  const { status, feedback, manualEdit } = req.body;
  if (!approvalStatuses.has(status)) {
    res.status(400).json({ error: 'Invalid approval status' });
    return;
  }

  const approval = getApprovalRow(id);
  if (!approval) {
    res.status(404).json({ error: 'Approval not found' });
    return;
  }

  const parsedPayload = JSON.parse(approval.payload) as ActionPayload;
  const nextPayload =
    isRecord(manualEdit) ? mergeActionPayload(parsedPayload, manualEdit as Partial<ActionPayload>) : parsedPayload;
  db.prepare(
    'UPDATE approvals SET status = ?, payload = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).run(status, JSON.stringify(nextPayload), id);

  recordAuditEntry(
    id,
    approval.action,
    `Status changed to ${status}${feedback ? ` with feedback: ${feedback}` : ''}`,
  );

  const updatedApproval = getApprovalRow(id);
  res.json({
    success: true,
    approval: updatedApproval ? parseApprovalRow(updatedApproval) : undefined,
  });
});

app.delete('/api/approvals/:id', (req, res) => {
  const id = firstParam(req.params.id);
  const approval = getApprovalRow(id);
  if (!approval) {
    res.status(404).json({ error: 'Approval not found' });
    return;
  }

  // Refuse to delete pending cards via this endpoint. The reviewer should
  // either reject or approve them first; this is a "tidy history" action,
  // not an escape hatch for un-reviewed cards. Removing this guard would
  // let a UI bug or accidental swipe drop a real action without an audit
  // trail.
  if (approval.status === 'pending') {
    res
      .status(409)
      .json({ error: 'Cannot delete a pending approval; reject or approve it first.' });
    return;
  }

  const removeApproval = db.transaction((approvalId: string) => {
    db.prepare('DELETE FROM audit_log WHERE approval_id = ?').run(approvalId);
    db.prepare('DELETE FROM approvals WHERE id = ?').run(approvalId);
  });
  removeApproval(id);

  res.json({ success: true });
});

app.delete('/api/approvals', (req, res) => {
  // Bulk wipe of reviewed approvals. Only ever touches non-pending
  // rows so an accidental call cannot drop work the reviewer hasn't
  // seen yet. The same pending-card guard lives on the per-id endpoint
  // and on the loopkind UI; this is a third belt-and-braces line.
  const wipeReviewed = db.transaction(() => {
    const reviewed = db
      .prepare("SELECT id FROM approvals WHERE status <> 'pending'")
      .all() as { id: string }[];
    if (reviewed.length === 0) {
      return 0;
    }
    const placeholders = reviewed.map(() => '?').join(',');
    const ids = reviewed.map(row => row.id);
    db.prepare(
      `DELETE FROM audit_log WHERE approval_id IN (${placeholders})`,
    ).run(...ids);
    db.prepare(
      `DELETE FROM approvals WHERE id IN (${placeholders})`,
    ).run(...ids);
    return reviewed.length;
  });
  const removed = wipeReviewed();
  res.json({ success: true, removed });
});

app.patch('/api/approvals/:id/execution', (req, res) => {
  const id = firstParam(req.params.id);
  const { executionStatus, executedAt, executionResult, executionError } = req.body;
  if (!executionStatuses.has(executionStatus)) {
    res.status(400).json({ error: 'Invalid execution status' });
    return;
  }

  const approval = getApprovalRow(id);
  if (!approval) {
    res.status(404).json({ error: 'Approval not found' });
    return;
  }

  const parsedPayload = JSON.parse(approval.payload) as ActionPayload;
  const nextPayload = mergeActionPayload(parsedPayload, {
    details: {
      ...parsedPayload.details,
      executionStatus,
      executedAt,
      executionResult,
      executionError,
    },
  });

  db.prepare('UPDATE approvals SET payload = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    JSON.stringify(nextPayload),
    id,
  );

  recordAuditEntry(
    id,
    approval.action,
    `Execution changed to ${executionStatus}${executionError ? ` with error: ${executionError}` : ''}`,
  );

  const updatedApproval = getApprovalRow(id);
  res.json({
    success: true,
    approval: updatedApproval ? parseApprovalRow(updatedApproval) : undefined,
  });
});

app.get('/api/tokens/:service', (req, res) => {
  const stmt = db.prepare('SELECT access_token FROM tokens WHERE service = ?');
  const token = stmt.get(firstParam(req.params.service));
  if (token) {
    res.json(token);
    return;
  }

  res.status(404).json({ error: 'Token not found' });
});

app.get('/api/approvals/:id/audit', (req, res) => {
  const stmt = db.prepare('SELECT * FROM audit_log WHERE approval_id = ? ORDER BY created_at DESC');
  res.json(stmt.all(firstParam(req.params.id)));
});

app.get('/api/state/:key', (req, res) => {
  const stmt = db.prepare('SELECT value FROM shared_state WHERE key = ?');
  const result = stmt.get(firstParam(req.params.key)) as { value: string } | undefined;
  if (!result) {
    res.status(404).json({ error: 'State not found' });
    return;
  }

  res.json(JSON.parse(result.value));
});

app.post('/api/state', (req, res) => {
  const { key, value } = req.body;
  const stmt = db.prepare(`
    INSERT INTO shared_state (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(key, JSON.stringify(value));
  res.json({ success: true, key });
});

app.listen(port, () => {
  console.log(
    `Quill Backend running on port ${port} (auth=required, allowedOrigins=[${allowedOrigins.join(', ') || '(none, non-browser callers only)'}])`,
  );
});
