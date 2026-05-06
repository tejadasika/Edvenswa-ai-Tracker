import { createHash, randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { query } from './db';

// Token format: a 32-byte url-safe base64 string. Plaintext shown to the user
// exactly once (when issued); the DB only stores its sha256.
export function generateExtensionToken(): { plaintext: string; hash: string } {
  const plaintext = randomBytes(32).toString('base64url');
  const hash = hashToken(plaintext);
  return { plaintext, hash };
}

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export type ExtensionAuth = {
  userId: string;
  orgId: string | null;
  tokenId: string;
};

// Resolves a bearer token from the Authorization header into a user/org pair,
// or returns null if missing/invalid/revoked. Touches last_used_at.
export async function authenticateExtensionRequest(
  req: NextRequest,
): Promise<ExtensionAuth | null> {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const hash = hashToken(match[1].trim());

  const r = await query<{ id: string; user_id: string; org_id: string | null }>(
    `SELECT id, user_id, org_id FROM extension_tokens
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hash],
  );
  if (r.rowCount === 0) return null;

  // Fire-and-forget last_used_at update; don't block ingest on it.
  query(`UPDATE extension_tokens SET last_used_at = now() WHERE id = $1`, [r.rows[0].id]).catch(
    () => {},
  );

  return {
    userId: r.rows[0].user_id,
    orgId: r.rows[0].org_id,
    tokenId: r.rows[0].id,
  };
}
