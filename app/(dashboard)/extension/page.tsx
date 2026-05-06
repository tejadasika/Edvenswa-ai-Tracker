import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { query } from '@/lib/db';
import ExtensionClient from './ExtensionClient';

export const dynamic = 'force-dynamic';

type TokenRow = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type BrowserRow = {
  browser: string;
};

export default async function ExtensionPage() {
  const s = await getSession();
  if (!s.userId) redirect('/');

  // Each user only ever sees their own tokens. Server-rendered so the page
  // works even with JS disabled; the client island handles issue + revoke.
  const r = await query<TokenRow>(
    `SELECT id::text, label, created_at, last_used_at, revoked_at
       FROM extension_tokens
      WHERE user_id = $1
      ORDER BY revoked_at IS NOT NULL,           -- active first
               created_at DESC`,
    [s.userId],
  );

  const browsers = await query<BrowserRow>(
    `SELECT browser
       FROM usage_analytics
      WHERE user_id = $1 AND browser IS NOT NULL
      GROUP BY browser
      ORDER BY MAX(created_at) DESC`,
    [s.userId],
  );

  const initialTokens = r.rows.map((t) => ({
    id: t.id,
    label: t.label,
    createdAt: t.created_at,
    lastUsedAt: t.last_used_at,
    revokedAt: t.revoked_at,
  }));

  return (
    <ExtensionClient
      initialTokens={initialTokens}
      browserSummary={browsers.rows.map((row) => row.browser)}
    />
  );
}
