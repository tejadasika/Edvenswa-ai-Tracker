import { query } from './db';

// Time-window filter shared by the per-user admin views. 'all' means no
// lower bound; 1m/3m/6m/1y are 30/90/180/365-day windows from now.
export type Range = '1m' | '3m' | '6m' | '1y' | 'all';

export function rangeToInterval(r: Range): string | null {
  switch (r) {
    case '1m': return '30 days';
    case '3m': return '90 days';
    case '6m': return '180 days';
    case '1y': return '365 days';
    case 'all': return null;
  }
}

export function rangeToBucket(r: Range): { sqlTrunc: 'day' | 'week' | 'month' } {
  if (r === '1m' || r === '3m') return { sqlTrunc: 'day' };
  if (r === '6m' || r === '1y') return { sqlTrunc: 'week' };
  return { sqlTrunc: 'month' };
}

// ---------- User-facing extension views ----------

export async function getExtensionActivity(userId: string) {
  const totals = await query<{ total_seconds: string; total_sessions: string }>(
    `SELECT COALESCE(SUM(active_seconds),0)::text AS total_seconds,
            COUNT(*)::text                        AS total_sessions
       FROM usage_analytics
      WHERE user_id = $1`,
    [userId],
  );

  const byPlatform = await query<{
    platform: string;
    sessions: string;
    total_seconds: string;
    avg_seconds: string;
  }>(
    `SELECT COALESCE(ai_platform, provider) AS platform,
            COUNT(*)::text                                       AS sessions,
            COALESCE(SUM(active_seconds),0)::text                AS total_seconds,
            COALESCE(AVG(active_seconds),0)::text                AS avg_seconds
       FROM usage_analytics
      WHERE user_id = $1
      GROUP BY 1
      ORDER BY SUM(active_seconds) DESC`,
    [userId],
  );

  const byModel = await query<{
    platform: string;
    model: string;
    sessions: string;
    total_seconds: string;
  }>(
    `SELECT COALESCE(ai_platform, provider)  AS platform,
            COALESCE(model, 'unknown')        AS model,
            COUNT(*)::text                    AS sessions,
            COALESCE(SUM(active_seconds),0)::text AS total_seconds
       FROM usage_analytics
      WHERE user_id = $1
      GROUP BY 1, 2
      ORDER BY SUM(active_seconds) DESC`,
    [userId],
  );

  const byDay = await query<{ day: string; total_seconds: string; sessions: string }>(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
            COALESCE(SUM(active_seconds),0)::text                AS total_seconds,
            COUNT(*)::text                                       AS sessions
       FROM usage_analytics
      WHERE user_id = $1
        AND created_at >= now() - interval '30 days'
      GROUP BY 1
      ORDER BY 1 DESC`,
    [userId],
  );

  const t = totals.rows[0];
  return {
    totalSeconds: Number(t.total_seconds),
    totalSessions: Number(t.total_sessions),
    byPlatform: byPlatform.rows.map((r) => ({
      platform: r.platform,
      sessions: Number(r.sessions),
      totalSeconds: Number(r.total_seconds),
      avgSeconds: Number(r.avg_seconds),
    })),
    byModel: byModel.rows.map((r) => ({
      platform: r.platform,
      model: r.model,
      sessions: Number(r.sessions),
      totalSeconds: Number(r.total_seconds),
    })),
    byDay: byDay.rows.map((r) => ({
      day: r.day,
      totalSeconds: Number(r.total_seconds),
      sessions: Number(r.sessions),
    })),
  };
}

export async function getExtensionConversations(userId: string, limit = 100) {
  const r = await query<{
    id: string;
    ai_platform: string;
    topic: string;
    model: string | null;
    total_active_seconds: number;
    event_count: number;
    first_seen_at: string;
    last_seen_at: string;
  }>(
    `SELECT id::text,
            ai_platform,
            topic,
            model,
            total_active_seconds,
            event_count,
            first_seen_at,
            last_seen_at
       FROM extension_conversations
      WHERE user_id = $1
      ORDER BY last_seen_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return r.rows.map((row) => ({
    id: row.id,
    platform: row.ai_platform,
    topic: row.topic,
    model: row.model,
    totalSeconds: Number(row.total_active_seconds),
    eventCount: Number(row.event_count),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  }));
}

export async function getLast30DaysExtensionDetail(userId: string) {
  const r = await query<{
    id: string;
    created_at: string;
    ai_platform: string | null;
    provider: string;
    model: string | null;
    browser: string | null;
    topic: string | null;
    active_seconds: number | null;
  }>(
    `SELECT id::text,
            created_at,
            ai_platform,
            provider,
            model,
            browser,
            topic,
            active_seconds
       FROM usage_analytics
      WHERE user_id = $1
        AND created_at >= now() - interval '30 days'
      ORDER BY created_at DESC`,
    [userId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    platform: row.ai_platform ?? row.provider,
    model: row.model,
    browser: row.browser,
    topic: row.topic,
    activeSeconds: Number(row.active_seconds ?? 0),
  }));
}

// ---------- Admin / org-scoped views ----------

export type AdminScope = { orgId: string } | { all: true };

function scopeWhere(scope: AdminScope, column = 'org_id'): { sql: string; params: any[] } {
  if ('all' in scope) return { sql: 'TRUE', params: [] };
  return { sql: `${column} = $1`, params: [scope.orgId] };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isoDateOrNull(s: string | undefined | null): string | null {
  return s && ISO_DATE.test(s) ? s : null;
}
function dateRangeSql(from?: string, to?: string): string {
  const f = isoDateOrNull(from);
  const t = isoDateOrNull(to);
  let sql = '';
  if (f) sql += ` AND created_at >= '${f}'::date`;
  if (t) sql += ` AND created_at < ('${t}'::date + interval '1 day')`;
  return sql;
}
export function bucketTruncForSpan(days: number): 'day' | 'week' | 'month' {
  if (days <= 31) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

export async function getOrgExtensionInstalls(scope: AdminScope) {
  const w = scopeWhere(scope, 'u.org_id');
  const r = await query<{
    token_id: string;
    label: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
    user_id: string;
    email: string;
    name: string | null;
    ext_sessions: string;
    ext_seconds: string;
    ext_last_event: string | null;
  }>(
    `SELECT et.id::text                              AS token_id,
            et.label,
            et.created_at,
            et.last_used_at,
            et.revoked_at,
            u.id::text                               AS user_id,
            u.email,
            u.name,
            COALESCE(s.sessions, 0)::text            AS ext_sessions,
            COALESCE(s.seconds, 0)::text             AS ext_seconds,
            s.last_event                             AS ext_last_event
       FROM extension_tokens et
       JOIN users u ON u.id = et.user_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)                                  AS sessions,
                COALESCE(SUM(active_seconds), 0)          AS seconds,
                MAX(created_at)                           AS last_event
           FROM usage_analytics
          WHERE user_id = et.user_id
       ) s ON true
      WHERE ${w.sql}
      ORDER BY et.revoked_at IS NOT NULL,
               COALESCE(et.last_used_at, et.created_at) DESC`,
    w.params,
  );

  return r.rows.map((row) => ({
    tokenId: row.token_id,
    label: row.label,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    extSessions: Number(row.ext_sessions),
    extSeconds: Number(row.ext_seconds),
    extLastEvent: row.ext_last_event,
  }));
}

export async function getOrgOverview(
  scope: AdminScope,
  from?: string,
  to?: string,
) {
  const w = scopeWhere(scope);
  const wUsers = scopeWhere(scope);
  const rangeSql = dateRangeSql(from, to);
  const totals = await query<{
    total_sessions: string;
    total_seconds: string;
    members: string;
  }>(
    `SELECT COUNT(*)::text                                     AS total_sessions,
            COALESCE(SUM(active_seconds),0)::text              AS total_seconds,
            (SELECT COUNT(*) FROM users WHERE ${wUsers.sql})::text AS members
       FROM usage_analytics
      WHERE ${w.sql}${rangeSql}`,
    w.params,
  );

  const byPlatform = await query<{ ai_platform: string; sessions: string; seconds: string }>(
    `SELECT COALESCE(ai_platform, provider) AS ai_platform,
            COUNT(*)::text                  AS sessions,
            COALESCE(SUM(active_seconds),0)::text AS seconds
       FROM usage_analytics
      WHERE ${w.sql}${rangeSql}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 10`,
    w.params,
  );

  const t = totals.rows[0];
  return {
    totalSessions: Number(t.total_sessions),
    totalSeconds: Number(t.total_seconds),
    members: Number(t.members),
    byPlatform: byPlatform.rows.map((r) => ({
      platform: r.ai_platform,
      sessions: Number(r.sessions),
      seconds: Number(r.seconds),
    })),
  };
}

export async function getOrgActivityByModel(
  scope: AdminScope,
  from?: string,
  to?: string,
) {
  const w = scopeWhere(scope);
  const f = isoDateOrNull(from);
  const t = isoDateOrNull(to);
  const days =
    f && t
      ? Math.max(1, Math.round((Date.parse(t) - Date.parse(f)) / 86400000) + 1)
      : 7;
  const sqlTrunc = bucketTruncForSpan(days);
  const rangeSql = dateRangeSql(from, to);

  const r = await query<{
    bucket: string;
    model: string;
    events: string;
    seconds: string;
  }>(
    `SELECT to_char(date_trunc('${sqlTrunc}', created_at), 'YYYY-MM-DD') AS bucket,
            COALESCE(model, 'unknown') AS model,
            COUNT(*)::text                          AS events,
            COALESCE(SUM(active_seconds),0)::text   AS seconds
       FROM usage_analytics
      WHERE ${w.sql}${rangeSql}
      GROUP BY 1, 2
      ORDER BY 1 ASC`,
    w.params,
  );
  return r.rows.map((row) => ({
    bucket: row.bucket,
    model: row.model,
    events: Number(row.events),
    seconds: Number(row.seconds),
  }));
}

export async function getOrgMember(scope: AdminScope, userId: string) {
  const params: any[] = [userId];
  let where = 'id = $1';
  if ('orgId' in scope) {
    params.push(scope.orgId);
    where += ' AND org_id = $2';
  }
  const r = await query<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    created_at: string;
  }>(
    `SELECT id::text, email, name, role, created_at
       FROM users WHERE ${where}`,
    params,
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
  };
}

export async function getUserBreakdown(userId: string, from?: string, to?: string) {
  const rangeSql = dateRangeSql(from, to);

  const totals = await query<{ ext_sessions: string; ext_seconds: string }>(
    `SELECT COUNT(*)::text                                       AS ext_sessions,
            COALESCE(SUM(active_seconds),0)::text                AS ext_seconds
       FROM usage_analytics
      WHERE user_id = $1${rangeSql}`,
    [userId],
  );

  const byPlatform = await query<{
    platform: string;
    sessions: string;
    seconds: string;
  }>(
    `SELECT COALESCE(ai_platform, provider) AS platform,
            COUNT(*)::text                              AS sessions,
            COALESCE(SUM(active_seconds),0)::text       AS seconds
       FROM usage_analytics
      WHERE user_id = $1${rangeSql}
      GROUP BY 1
      ORDER BY 1`,
    [userId],
  );

  const byModel = await query<{
    model: string;
    provider: string;
    sessions: string;
    seconds: string;
  }>(
    `SELECT model, provider,
            COUNT(*)::text                              AS sessions,
            COALESCE(SUM(active_seconds),0)::text       AS seconds
       FROM usage_analytics
      WHERE user_id = $1${rangeSql}
      GROUP BY model, provider
      ORDER BY COUNT(*) DESC`,
    [userId],
  );

  const t = totals.rows[0];
  return {
    extension: {
      sessions: Number(t.ext_sessions),
      seconds: Number(t.ext_seconds),
    },
    byPlatform: byPlatform.rows.map((r) => ({
      platform: r.platform,
      sessions: Number(r.sessions),
      seconds: Number(r.seconds),
    })),
    byModel: byModel.rows.map((r) => ({
      model: r.model,
      provider: r.provider,
      sessions: Number(r.sessions),
      seconds: Number(r.seconds),
    })),
  };
}

export async function getOrgMembersByUsage(scope: AdminScope) {
  const w = scopeWhere(scope, 'u.org_id');
  const r = await query<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    created_at: string;
    ext_sessions: string;
    ext_seconds: string;
    ext_last: string | null;
  }>(
    `SELECT u.id::text, u.email, u.name, u.role, u.created_at,
            COALESCE(COUNT(ua.id), 0)::text                                      AS ext_sessions,
            COALESCE(SUM(ua.active_seconds), 0)::text                            AS ext_seconds,
            MAX(ua.created_at)                                                   AS ext_last
       FROM users u
       LEFT JOIN usage_analytics ua ON ua.user_id = u.id
      WHERE ${w.sql}
      GROUP BY u.id
      ORDER BY u.created_at ASC`,
    w.params,
  );
  return r.rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
    extSessions: Number(row.ext_sessions),
    extSeconds: Number(row.ext_seconds),
    extLast: row.ext_last,
  }));
}

export async function getUserRecentEvents(
  userId: string,
  limit = 25,
  from?: string,
  to?: string,
) {
  const rangeSql = dateRangeSql(from, to);
  const r = await query<{
    id: string;
    created_at: string;
    platform: string;
    model: string | null;
    browser: string | null;
    topic: string | null;
    seconds: number | null;
    status: string;
  }>(
    `SELECT id::text,
            created_at,
            COALESCE(ai_platform, provider) AS platform,
            model,
            browser,
            topic,
            active_seconds                  AS seconds,
            status
       FROM usage_analytics
      WHERE user_id = $1${rangeSql}
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return r.rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    platform: row.platform,
    model: row.model,
    browser: row.browser,
    topic: row.topic,
    seconds: row.seconds === null ? null : Number(row.seconds),
    status: row.status,
  }));
}

export async function getUserBrowsers(userId: string, from?: string, to?: string) {
  const rangeSql = dateRangeSql(from, to);
  const r = await query<{ browser: string; sessions: string; seconds: string; last_seen: string }>(
    `SELECT browser,
            COUNT(*)::text                       AS sessions,
            COALESCE(SUM(active_seconds),0)::text AS seconds,
            MAX(created_at)                       AS last_seen
       FROM usage_analytics
      WHERE user_id = $1 AND browser IS NOT NULL${rangeSql}
      GROUP BY browser
      ORDER BY MAX(created_at) DESC`,
    [userId],
  );
  return r.rows.map((row) => ({
    browser: row.browser,
    sessions: Number(row.sessions),
    seconds: Number(row.seconds),
    lastSeen: row.last_seen,
  }));
}

export async function getUserActivityByModel(
  userId: string,
  from?: string,
  to?: string,
) {
  const f = isoDateOrNull(from);
  const t = isoDateOrNull(to);
  const days =
    f && t
      ? Math.max(1, Math.round((Date.parse(t) - Date.parse(f)) / 86400000) + 1)
      : 7;
  const sqlTrunc = bucketTruncForSpan(days);
  const rangeSql = dateRangeSql(from, to);

  const r = await query<{
    bucket: string;
    model: string;
    events: string;
    seconds: string;
  }>(
    `SELECT to_char(date_trunc('${sqlTrunc}', created_at), 'YYYY-MM-DD') AS bucket,
            COALESCE(model, 'unknown') AS model,
            COUNT(*)::text                          AS events,
            COALESCE(SUM(active_seconds),0)::text   AS seconds
       FROM usage_analytics
      WHERE user_id = $1${rangeSql}
      GROUP BY 1, 2
      ORDER BY 1 ASC`,
    [userId],
  );
  return r.rows.map((row) => ({
    bucket: row.bucket,
    model: row.model,
    events: Number(row.events),
    seconds: Number(row.seconds),
  }));
}

export async function getOrgMembers(orgId: string) {
  const r = await query<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    created_at: string;
    sessions: string;
    seconds: string;
  }>(
    `SELECT u.id::text, u.email, u.name, u.role, u.created_at,
            COALESCE(COUNT(ua.id),0)::text             AS sessions,
            COALESCE(SUM(ua.active_seconds),0)::text   AS seconds
       FROM users u
       LEFT JOIN usage_analytics ua ON ua.user_id = u.id
      WHERE u.org_id = $1
      GROUP BY u.id
      ORDER BY u.created_at ASC`,
    [orgId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
    sessions: Number(row.sessions),
    seconds: Number(row.seconds),
  }));
}
