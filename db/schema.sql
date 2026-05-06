-- Edvenswa AI Tracker schema
-- Run: psql "$DATABASE_URL" -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    name          TEXT,
    password_hash TEXT NOT NULL,
    org_id        UUID REFERENCES organizations(id) ON DELETE SET NULL,
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','super_admin')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_org ON users (org_id);

-- Rollup of extension activity per (user, ai_platform, topic).
CREATE TABLE IF NOT EXISTS extension_conversations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id                UUID REFERENCES organizations(id) ON DELETE SET NULL,
    ai_platform           TEXT NOT NULL,
    topic                 TEXT NOT NULL,
    model                 TEXT,
    total_active_seconds  INTEGER NOT NULL DEFAULT 0,
    event_count           INTEGER NOT NULL DEFAULT 0,
    first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, ai_platform, topic)
);

CREATE INDEX IF NOT EXISTS idx_ext_convos_user_last
    ON extension_conversations (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_ext_convos_org_last
    ON extension_conversations (org_id, last_seen_at DESC);

-- Extension auth tokens. Hash stored, never plaintext.
CREATE TABLE IF NOT EXISTS extension_tokens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id        UUID REFERENCES organizations(id) ON DELETE SET NULL,
    token_hash    TEXT NOT NULL UNIQUE,
    label         TEXT NOT NULL DEFAULT 'browser',
    last_used_at  TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ext_tokens_user ON extension_tokens (user_id);

-- Extension usage events. Each row is one event posted by the browser extension.
CREATE TABLE IF NOT EXISTS usage_analytics (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id          UUID REFERENCES organizations(id) ON DELETE SET NULL,
    provider        TEXT NOT NULL,
    model           TEXT NOT NULL,
    prompt_tokens   INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens    INTEGER GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
    estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
    latency_ms      INTEGER,
    status          TEXT NOT NULL DEFAULT 'ok',
    error_message   TEXT,
    active_seconds  INTEGER,
    ai_platform     TEXT,
    browser         TEXT,
    device_hash     TEXT,
    topic           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_user_created
    ON usage_analytics (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_user_model
    ON usage_analytics (user_id, model);
CREATE INDEX IF NOT EXISTS idx_usage_user_provider_created
    ON usage_analytics (user_id, provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_user_topic
    ON usage_analytics (user_id, topic);
CREATE INDEX IF NOT EXISTS idx_usage_org_created
    ON usage_analytics (org_id, created_at DESC);

-- Catalog of model names observed via the extension.
CREATE TABLE IF NOT EXISTS model_catalog (
    model            TEXT PRIMARY KEY,
    provider         TEXT,
    request_count    BIGINT NOT NULL DEFAULT 0,
    input_per_1k     NUMERIC(12,8),
    output_per_1k    NUMERIC(12,8),
    first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_model_catalog_last_seen
    ON model_catalog (last_seen_at DESC);
