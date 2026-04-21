import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import cors from 'cors';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import {
  ActionPayload,
  ApprovalExecutionStatus,
  ApprovalRequest,
  ApprovalStatus,
} from '@quill/shared';

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

const db = new Database('quill.db');

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

const parseApprovalRow = (row: ApprovalRow): ApprovalRequest => ({
  id: row.id,
  action: row.action,
  payload: JSON.parse(row.payload),
  status: row.status as ApprovalStatus,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
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

// Every route below this line is API-key-gated.
app.use('/api', requireApiKey);

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
  res.status(201).json(approval ? parseApprovalRow(approval) : { id, action, payload, status: 'pending' });
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
