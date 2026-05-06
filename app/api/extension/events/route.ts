import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateExtensionRequest } from '@/lib/extension-auth';
import { preflight, withCors } from '@/lib/cors';

export const runtime = 'nodejs';
export const OPTIONS = preflight;

// POST /api/extension/events
// Headers:  Authorization: Bearer <extension_token>
// Body:     { events: ExtensionEvent[] }
//
// ExtensionEvent {
//   ai_platform:    'chatgpt' | 'claude' | 'gemini' | 'perplexity' | string
//   model?:         string                 // best-effort detection from DOM
//   browser?:       'chrome' | 'edge' | 'firefox' | string
//   device_hash?:   string                 // hashed client-side, opaque to server
//   active_seconds: number                 // foreground time on the AI tab
//   prompt_tokens?:    number              // estimated; never authoritative
//   completion_tokens?: number             // estimated; never authoritative
//   started_at:     ISO-8601 string        // when the session began
// }
//
// Up to 200 events accepted per call. Cost is intentionally NOT estimated for
// extension events — there's no real billing relationship for third-party AI use,
// and surfacing fake cost numbers next to authoritative proxy costs is misleading.

const MAX_EVENTS_PER_BATCH = 200;
const ALLOWED_PLATFORMS = new Set([
  'chatgpt',
  'claude',
  'gemini',
  'perplexity',
  'copilot',
  'deepseek',
  'other',
]);

type RawEvent = {
  ai_platform?: unknown;
  model?: unknown;
  browser?: unknown;
  device_hash?: unknown;
  topic?: unknown;
  page_title?: unknown;
  active_seconds?: unknown;
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  started_at?: unknown;
};

function clampInt(v: unknown, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), max);
}

function asString(v: unknown, max = 64): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export async function POST(req: NextRequest) {
  const auth = await authenticateExtensionRequest(req);
  if (!auth) {
    return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  let body: { events?: RawEvent[] };
  try {
    body = await req.json();
  } catch {
    return withCors(req, NextResponse.json({ error: 'invalid json' }, { status: 400 }));
  }

  // Debug: print raw incoming events so we can see exactly what fields the
  // extension is sending (model, topic, page_title, etc.). Logs to the
  // `next dev` terminal — remove or gate behind an env flag once verified.
  console.log(
    `[ext events] user=${auth.userId} batch=${Array.isArray(body?.events) ? body.events.length : 'invalid'}`,
  );
  if (Array.isArray(body?.events)) {
    for (const ev of body.events) {
      console.log('[ext events] raw:', JSON.stringify(ev));
      console.log(
        `[ext events] page_title=${JSON.stringify(ev?.page_title ?? null)}` +
          ` topic=${JSON.stringify(ev?.topic ?? null)}` +
          ` model=${JSON.stringify(ev?.model ?? null)}` +
          ` platform=${JSON.stringify(ev?.ai_platform ?? null)}`,
      );
    }
  }

  const events = Array.isArray(body?.events) ? body.events : null;
  if (!events) {
    return withCors(
      req,
      NextResponse.json({ error: 'events array required' }, { status: 400 }),
    );
  }
  if (events.length === 0) return withCors(req, NextResponse.json({ accepted: 0 }));
  if (events.length > MAX_EVENTS_PER_BATCH) {
    return withCors(
      req,
      NextResponse.json(
        { error: `max ${MAX_EVENTS_PER_BATCH} events per batch` },
        { status: 413 },
      ),
    );
  }

  let accepted = 0;
  let rejected = 0;

  // Per-row inserts keep partial-batch failures isolated. Volume is low
  // (one batch per browser per minute) so a transactional COPY isn't worth it.
  for (const ev of events) {
    const platform = asString(ev.ai_platform, 32)?.toLowerCase() ?? null;
    if (!platform || !ALLOWED_PLATFORMS.has(platform)) {
      rejected++;
      continue;
    }
    const startedAt = typeof ev.started_at === 'string' ? new Date(ev.started_at) : null;
    if (!startedAt || Number.isNaN(startedAt.getTime())) {
      rejected++;
      continue;
    }

    const activeSeconds = clampInt(ev.active_seconds, 24 * 60 * 60);
    const promptTokens = clampInt(ev.prompt_tokens, 10_000_000);
    const completionTokens = clampInt(ev.completion_tokens, 10_000_000);
    const model = asString(ev.model, 64);
    const browser = asString(ev.browser, 32);
    const deviceHash = asString(ev.device_hash, 128);
    // Topic resolution order:
    //   1. Explicit `topic` field (extension already stripped suffixes / dropped placeholders)
    //   2. Raw `page_title` field (extension didn't bother — accept it as-is, capped)
    //   3. Fallback: "<platform>: untitled" so we still get a row for every event.
    // This guarantees extension_conversations gets populated for any event we
    // accept, instead of silently dropping rows when title detection fails.
    const explicitTopic = asString(ev.topic, 256);
    const rawTitle = asString(ev.page_title, 256);
    const topic = explicitTopic ?? rawTitle ?? `${platform}: untitled`;

    await query(
      `INSERT INTO usage_analytics
         (user_id, org_id, provider, model,
          prompt_tokens, completion_tokens, estimated_cost_usd,
          latency_ms, status,
          ai_platform, browser, device_hash, topic, active_seconds, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,0,NULL,'ok',$7,$8,$9,$10,$11,$12)`,
      [
        auth.userId,
        auth.orgId,
        platform,
        model ?? platform,
        promptTokens,
        completionTokens,
        platform,
        browser,
        deviceHash,
        topic,
        activeSeconds,
        startedAt.toISOString(),
      ],
    );

    await query(
      `INSERT INTO extension_conversations
         (user_id, org_id, ai_platform, topic, model,
          total_active_seconds, event_count, first_seen_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7)
       ON CONFLICT (user_id, ai_platform, topic) DO UPDATE
         SET total_active_seconds = extension_conversations.total_active_seconds + EXCLUDED.total_active_seconds,
             event_count          = extension_conversations.event_count + 1,
             last_seen_at         = GREATEST(extension_conversations.last_seen_at, EXCLUDED.last_seen_at),
             model                = COALESCE(EXCLUDED.model, extension_conversations.model)`,
      [
        auth.userId,
        auth.orgId,
        platform,
        topic,
        model,
        activeSeconds,
        startedAt.toISOString(),
      ],
    );

    if (model) {
      await query(
        `INSERT INTO model_catalog (model, provider, request_count)
         VALUES ($1, $2, 1)
         ON CONFLICT (model) DO UPDATE
           SET last_seen_at  = now(),
               request_count = model_catalog.request_count + 1,
               provider      = COALESCE(model_catalog.provider, EXCLUDED.provider)`,
        [model, platform],
      );
    }
    accepted++;
  }

  return withCors(req, NextResponse.json({ accepted, rejected }));
}
