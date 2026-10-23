-- =============================================================================
-- Trackash local database (SQLite). One file per instance, one owner: there are
-- no users or row-level policies, the file itself is the boundary (mode 600,
-- in a git-ignored folder).
--
-- Conventions:
--   * timestamps are ISO 8601 UTC text ("2026-10-05T03:00:00.000Z"), dates are
--     "YYYY-MM-DD" text; both sort and compare as strings.
--   * booleans are integers 0/1; JSON is text.
--   * amounts are REAL (they fit comfortably in a double).
-- =============================================================================

-- Instance settings (Pluggy credentials, setup state).
create table settings (
  key text primary key,
  value text not null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Pluggy / Meu Pluggy connections (items). Meu Pluggy items all come with
-- connector "MeuPluggy": the real institution is resolved at sync time (bank
-- code + Pluggy's connector catalog), unless the owner pinned one by hand
-- (institution_locked).
create table pluggy_items (
  id text primary key,
  connector_id integer,
  connector_name text,
  connector_image_url text,
  status text,
  execution_status text,
  last_updated_at text,
  institution_name text,
  institution_image_url text,
  institution_color text,
  institution_locked integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Accounts (checking, savings, credit card). `ignored_by` says who decided:
-- 'auto' (duplicate detection, re-evaluated on every sync) or 'user' (never
-- overridden by the sync).
create table accounts (
  id text primary key,
  item_id text not null references pluggy_items (id) on delete cascade,
  type text not null,               -- BANK | CREDIT
  subtype text,                     -- CHECKING_ACCOUNT | SAVINGS_ACCOUNT | CREDIT_CARD
  name text,
  marketing_name text,
  number_last4 text,                -- minimization: last 4 digits only
  balance real,
  currency_code text,
  credit_limit real,
  available_credit_limit real,
  minimum_payment real,
  balance_close_date text,
  balance_due_date text,
  card_brand text,
  card_level text,
  ignored integer not null default 0,
  ignored_by text check (ignored_by in ('auto', 'user')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index accounts_item_idx on accounts (item_id);

-- Transactions (bank and card)
create table transactions (
  id text primary key,
  account_id text not null references accounts (id) on delete cascade,
  date text not null,
  description text,
  amount real not null,
  amount_in_account_currency real,
  currency_code text,
  type text not null,               -- DEBIT | CREDIT
  status text,                      -- PENDING | POSTED
  category text,
  category_id text,
  merchant_name text,
  merchant_category text,
  counterparty_name text,
  operation_type text,
  bill_id text,
  installment_number integer,
  total_installments integer,
  purchase_date text,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index transactions_date_idx on transactions (date desc);
create index transactions_account_date_idx on transactions (account_id, date desc);

-- Credit card bills
create table credit_card_bills (
  id text primary key,
  account_id text not null references accounts (id) on delete cascade,
  due_date text not null,
  closing_date text,
  total_amount real not null,
  currency_code text,
  minimum_payment real,
  finance_charges text not null default '[]',
  payments text not null default '[]',
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index credit_card_bills_due_idx on credit_card_bills (due_date desc);
create index credit_card_bills_account_idx on credit_card_bills (account_id);

-- Investments (current position). `liquidity` is the owner's setting (Pluggy
-- doesn't report it); the sync never writes it.
create table investments (
  id text primary key,
  item_id text not null references pluggy_items (id) on delete cascade,
  code text,
  isin text,
  name text not null,
  type text not null,
  subtype text,
  status text,
  currency_code text,
  balance real,
  amount real,
  amount_original real,
  amount_profit real,
  amount_withdrawal real,
  quantity real,
  value real,
  taxes real,
  taxes2 real,
  rate real,
  rate_type text,
  fixed_annual_rate real,
  annual_rate real,
  last_month_rate real,
  last_twelve_months_rate real,
  position_date text,
  due_date text,
  issue_date text,
  purchase_date text,
  issuer text,
  institution_name text,
  liquidity text check (liquidity in ('daily', 'maturity')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index investments_item_idx on investments (item_id);

-- Investment movements (buy, sell, tax, transfer)
create table investment_transactions (
  id text primary key,
  investment_id text not null references investments (id) on delete cascade,
  type text,                        -- BUY | SELL | TAX | TRANSFER
  movement_type text,               -- DEBIT | CREDIT
  description text,
  quantity real,
  value real,
  amount real,
  net_amount real,
  date text not null,
  trade_date text,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index investment_transactions_date_idx on investment_transactions (date desc);
create index investment_transactions_investment_idx on investment_transactions (investment_id);

-- Daily snapshot of each position: the basis of performance over time.
create table investment_snapshots (
  investment_id text not null references investments (id) on delete cascade,
  snapshot_date text not null,
  balance real,
  amount_original real,
  amount_profit real,
  quantity real,
  value real,
  primary key (investment_id, snapshot_date)
);
create index investment_snapshots_date_idx on investment_snapshots (snapshot_date);

-- Pluggy categories (public catalog)
create table categories (
  id text primary key,
  description text not null,
  description_translated text,
  parent_id text,
  parent_description text,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Sync runs (history, progress guard). `pid` is the process running it, so a
-- run left behind by a process that died is recognized as interrupted.
create table sync_runs (
  id integer primary key autoincrement,
  started_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at text,
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  error text,
  stats text,
  pid integer
);
create index sync_runs_started_idx on sync_runs (started_at desc);

-- B3 "Área do Investidor" movement statements (extrato de movimentação): the
-- history of stock purchases, corporate events and dividends that Pluggy
-- doesn't provide. Re-importing overlapping periods is idempotent (row ids are
-- content hashes).
create table b3_imports (
  id integer primary key autoincrement,
  file_name text not null,
  rows_read integer not null,
  rows_inserted integer not null,
  period_start text,
  period_end text,
  imported_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index b3_imports_imported_idx on b3_imports (imported_at desc);

create table b3_movements (
  -- sha256 of the normalized row + its occurrence index among identical rows
  id text primary key,
  import_id integer references b3_imports (id) on delete set null,
  direction text not null check (direction in ('CREDIT', 'DEBIT')),
  date text not null,
  movement text not null,           -- raw B3 "Movimentação" (domain value, pt-BR)
  product text not null,            -- raw B3 "Produto"
  ticker text,                      -- parsed from the product, e.g. PETR4
  institution text,
  quantity real,
  unit_price real,
  amount real,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index b3_movements_date_idx on b3_movements (date);
create index b3_movements_ticker_idx on b3_movements (ticker);
