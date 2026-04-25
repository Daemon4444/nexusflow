import Database from "better-sqlite3";
import path from "path";
import { encryptProviderSecret, isEncryptedProviderSecret } from "../utils/provider-secrets";

const DB_PATH = path.resolve(__dirname, "../../data/ai-router.db");

// 确保 data 目录存在
import fs from "fs";
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// 开启 WAL 模式，提升并发性能
db.pragma("journal_mode = WAL");

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    nickname TEXT NOT NULL DEFAULT '',
    balance REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    ref_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
  CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

  CREATE TABLE IF NOT EXISTS payment_orders (
    id TEXT PRIMARY KEY,
    order_no TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'alipay',
    status TEXT NOT NULL DEFAULT 'created',
    provider_trade_no TEXT,
    paid_at TEXT,
    notify_payload TEXT,
    processed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
  CREATE INDEX IF NOT EXISTS idx_payment_orders_created_at ON payment_orders(created_at);

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used TEXT,
    usage_count INTEGER NOT NULL DEFAULT 0,
    rate_limit INTEGER NOT NULL DEFAULT 60,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key_id TEXT,
    user_id TEXT,
    model TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success',
    latency_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON usage_logs(model);
  CREATE INDEX IF NOT EXISTS idx_usage_logs_api_key_id ON usage_logs(api_key_id);
  CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);

  -- 供应商表
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    logo_url TEXT,
    website TEXT,
    api_base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    rejection_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    approved_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_providers_status ON providers(status);
  CREATE INDEX IF NOT EXISTS idx_providers_slug ON providers(slug);

  -- 供应商提交的模型表
  CREATE TABLE IF NOT EXISTS provider_models (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '大语言模型',
    context_length INTEGER NOT NULL DEFAULT 4096,
    max_output INTEGER NOT NULL DEFAULT 4096,
    prompt_price REAL NOT NULL DEFAULT 0,
    completion_price REAL NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '[]',
    supported TEXT NOT NULL DEFAULT '["文本"]',
    is_featured INTEGER NOT NULL DEFAULT 0,
    is_new INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_provider_models_provider_id ON provider_models(provider_id);
  CREATE INDEX IF NOT EXISTS idx_provider_models_status ON provider_models(status);
  CREATE INDEX IF NOT EXISTS idx_provider_models_category ON provider_models(category);
`);

// ========== 异步任务表 ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS async_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    api_key_id TEXT,
    type TEXT NOT NULL,                -- 'image' | 'video'
    model TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'dashscope',
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'running' | 'succeeded' | 'failed'
    input TEXT NOT NULL DEFAULT '{}',  -- JSON: prompt, params, etc.
    output TEXT,                        -- JSON: result URLs, etc.
    upstream_task_id TEXT,             -- DashScope/PixVerse task ID
    error_message TEXT,
    progress INTEGER DEFAULT 0,        -- 0-100
    cost REAL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_async_tasks_status ON async_tasks(status);
  CREATE INDEX IF NOT EXISTS idx_async_tasks_user_id ON async_tasks(user_id);
  CREATE INDEX IF NOT EXISTS idx_async_tasks_upstream ON async_tasks(upstream_task_id);
`);

// ========== 供应商容量配置表 ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS provider_capacity (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    rpm_limit INTEGER NOT NULL DEFAULT 60,      -- requests per minute
    tpm_limit INTEGER NOT NULL DEFAULT 100000,  -- tokens per minute
    daily_limit INTEGER NOT NULL DEFAULT 10000,  -- requests per day
    concurrent_limit INTEGER NOT NULL DEFAULT 10, -- max concurrent requests
    priority INTEGER NOT NULL DEFAULT 0,         -- higher = more priority
    weight INTEGER NOT NULL DEFAULT 100,         -- load balancing weight (0-100)
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
    UNIQUE(provider_id, model_id)
  );

  CREATE INDEX IF NOT EXISTS idx_provider_capacity_model ON provider_capacity(model_id);
  CREATE INDEX IF NOT EXISTS idx_provider_capacity_provider ON provider_capacity(provider_id);
`);

// ========== 供应商健康记录表 ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS provider_health (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'healthy',  -- 'healthy' | 'degraded' | 'down'
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_success_at TEXT,
    last_failure_at TEXT,
    last_error TEXT,
    avg_latency_ms INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
    UNIQUE(provider_id, model_id)
  );
`);

// 迁移：给已有的 users 表添加 email 列（如果不存在）
try {
  const cols = db.pragma("table_info(users)") as any[];
  if (!cols.find((c: any) => c.name === "email")) {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT");
    db.exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
  }
} catch {}

// 迁移：给已有的 users 表添加 password_hash 列（如果不存在）
try {
  const cols = db.pragma("table_info(users)") as any[];
  if (!cols.find((c: any) => c.name === "password_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
  }
} catch {}

// 迁移：将 phone 字段从 NOT NULL 改为可空（支持纯邮箱用户）
try {
  const cols = db.pragma("table_info(users)") as any[];
  const phoneCol = cols.find((c: any) => c.name === "phone");
  if (phoneCol && phoneCol.notnull === 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users_new (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE,
        email TEXT,
        nickname TEXT NOT NULL DEFAULT '',
        balance REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO users_new SELECT id, NULLIF(phone, ''), email, nickname, balance, created_at, updated_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
  }
} catch {}

// 迁移：给已有的 api_keys 表添加 user_id 列（如果不存在）
try {
  const cols = db.pragma("table_info(api_keys)") as any[];
  if (!cols.find((c: any) => c.name === "user_id")) {
    db.exec("ALTER TABLE api_keys ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE");
  }
} catch {}

// 迁移：给已有的 usage_logs 表添加 user_id 列（如果不存在）
try {
  const cols = db.pragma("table_info(usage_logs)") as any[];
  if (!cols.find((c: any) => c.name === "user_id")) {
    db.exec("ALTER TABLE usage_logs ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  }
} catch {}

// 迁移：给已有的 usage_logs 表添加 ttft_ms 和 tpot_ms 列（性能监控）
try {
  const cols = db.pragma("table_info(usage_logs)") as any[];
  if (!cols.find((c: any) => c.name === "ttft_ms")) {
    db.exec("ALTER TABLE usage_logs ADD COLUMN ttft_ms INTEGER NOT NULL DEFAULT 0");
  }
  if (!cols.find((c: any) => c.name === "tpot_ms")) {
    db.exec("ALTER TABLE usage_logs ADD COLUMN tpot_ms REAL NOT NULL DEFAULT 0");
  }
} catch {}

// 迁移：给已有的 payment_orders 表补齐字段（如从早期版本升级）
try {
  const cols = db.pragma("table_info(payment_orders)") as any[];
  if (cols.length > 0) {
    if (!cols.find((c: any) => c.name === "channel")) {
      db.exec("ALTER TABLE payment_orders ADD COLUMN channel TEXT NOT NULL DEFAULT 'alipay'");
    }
    if (!cols.find((c: any) => c.name === "provider_trade_no")) {
      db.exec("ALTER TABLE payment_orders ADD COLUMN provider_trade_no TEXT");
    }
    if (!cols.find((c: any) => c.name === "paid_at")) {
      db.exec("ALTER TABLE payment_orders ADD COLUMN paid_at TEXT");
    }
    if (!cols.find((c: any) => c.name === "notify_payload")) {
      db.exec("ALTER TABLE payment_orders ADD COLUMN notify_payload TEXT");
    }
    if (!cols.find((c: any) => c.name === "processed")) {
      db.exec("ALTER TABLE payment_orders ADD COLUMN processed INTEGER NOT NULL DEFAULT 0");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_payment_orders_created_at ON payment_orders(created_at)");
  }
} catch {}

// 迁移：渠道与模型状态从审核语义切换到内部渠道语义
try {
  db.exec(`
    UPDATE providers SET status = 'draft' WHERE status = 'pending';
    UPDATE providers SET status = 'enabled' WHERE status = 'approved';
    UPDATE providers SET status = 'disabled' WHERE status = 'rejected';
    UPDATE provider_models SET status = 'draft' WHERE status = 'pending';
    UPDATE provider_models SET status = 'enabled' WHERE status = 'approved';
    UPDATE provider_models SET status = 'disabled' WHERE status = 'rejected';
  `);
} catch {}

// 迁移：已有渠道 API Key 自动加密存储
try {
  const rows = db.prepare("SELECT id, api_key FROM providers").all() as Array<{ id: string; api_key: string }>;
  const updateStmt = db.prepare("UPDATE providers SET api_key = ? WHERE id = ?");
  for (const row of rows) {
    if (!row.api_key || isEncryptedProviderSecret(row.api_key)) continue;
    const encrypted = encryptProviderSecret(row.api_key);
    if (encrypted !== row.api_key) {
      updateStmt.run(encrypted, row.id);
    }
  }
} catch {}

// ========== 用户速率限制表 ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS user_rate_limits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '*',
    qpm INTEGER NOT NULL DEFAULT 1000,
    tpm INTEGER NOT NULL DEFAULT 1000000,
    source TEXT NOT NULL DEFAULT 'default',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, model)
  );
  CREATE INDEX IF NOT EXISTS idx_user_rate_limits_user ON user_rate_limits(user_id);
`);

// ========== 工单表 ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'rate_limit',
    subject TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    model TEXT,
    requested_qpm INTEGER,
    requested_tpm INTEGER,
    status TEXT NOT NULL DEFAULT 'open',
    admin_reply TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
`);

export default db;
