# Edvenswa AI Tracker

BYOK gateway across OpenAI, Anthropic, Gemini, and Llama. Each user stores
provider keys (encrypted with AES-256-GCM), the proxy decrypts them in memory
to call the model, and every request is logged to `usage_analytics` with
token counts and an estimated cost.

## Stack
- Next.js 14 (App Router) + Tailwind
- PostgreSQL (`pg`)
- AES-256-GCM via Node `crypto`
- iron-session cookies for auth
- Provider SDKs unified via [lib/llm.ts](lib/llm.ts) (LiteLLM-style; swap for LangChain.js if preferred)

## Setup
```bash
cp .env.example .env
# fill DATABASE_URL, ENCRYPTION_KEY (64 hex), SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # for ENCRYPTION_KEY
npm install
npm run db:init     # applies db/schema.sql
npm run dev
```

## Layout
- [db/schema.sql](db/schema.sql) — tables + indexes for "Specific Account" stats
- [lib/encryption.ts](lib/encryption.ts) — `encrypt()` / `decrypt()` (AES-256-GCM)
- [lib/llm.ts](lib/llm.ts) — multi-provider adapter
- [lib/pricing.ts](lib/pricing.ts) — token → USD cost
- [lib/stats.ts](lib/stats.ts) — `getAccountStats(userId)` for spend rollups
- [app/api/chat/route.ts](app/api/chat/route.ts) — Smart Proxy: auth → fetch key → decrypt → call → log → respond
- [app/api/keys/route.ts](app/api/keys/route.ts) — vault CRUD
- [app/(dashboard)/vault/page.tsx](app/(dashboard)/vault/page.tsx) — Account Vault
- [app/(dashboard)/ledger/page.tsx](app/(dashboard)/ledger/page.tsx) — Usage Ledger
- [app/(dashboard)/hub/page.tsx](app/(dashboard)/hub/page.tsx) — Intelligence Hub
