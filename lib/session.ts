import { getIronSession, SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export type Role = 'user' | 'admin' | 'super_admin';

export type SessionData = {
  userId?: string;
  email?: string;
  name?: string;
  orgId?: string;
  role?: Role;
};

// `secure` must reflect the actual deployment protocol, not NODE_ENV.
// If the app is served over plain HTTP (e.g. an IP:port origin without TLS),
// setting Secure causes the browser to silently drop the session cookie and
// login appears to "succeed" but the next request has no session.
const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? '';
const isHttps = appOrigin.startsWith('https://');

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? 'dev-secret-must-be-32-chars-min!!',
  cookieName: 'edvenswa_ai_session',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
  },
};

export async function getLegacySession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}

export async function getSession(): Promise<SessionData> {
  const legacy = await getLegacySession();
  if (legacy.userId) {
    return {
      userId: legacy.userId,
      email: legacy.email,
      name: legacy.name,
      orgId: legacy.orgId,
      role: legacy.role,
    };
  }
  return {};
}

export async function requireUserId(): Promise<string> {
  const s = await getSession();
  if (!s.userId) throw new Response('Unauthorized', { status: 401 });
  return s.userId;
}

export async function requireAdmin(): Promise<SessionData> {
  const s = await getSession();
  if (!s.userId) throw new Response('Unauthorized', { status: 401 });
  if (s.role !== 'admin' && s.role !== 'super_admin') {
    throw new Response('Forbidden', { status: 403 });
  }
  return s;
}

// Translate a session into an admin scope. super_admin sees every org;
// regular admin sees only their own org. Returns null if the admin has no
// org and isn't a super_admin (a malformed account state).
export function adminScope(s: SessionData): { orgId: string } | { all: true } | null {
  if (s.role === 'super_admin') return { all: true };
  if (s.orgId) return { orgId: s.orgId };
  return null;
}

// Like adminScope, but honors a per-request org selection from super_admin.
// The selector in the sidebar writes ?org=<id> (or "all") into the URL of
// every admin page; this helper reads it back and narrows the scope:
//
//   super_admin + requestedOrgId="<uuid>"   → { orgId: <uuid> }
//   super_admin + requestedOrgId="all"|null → { all: true }
//   regular admin                           → their own org (selection ignored)
//
// Regular admins can't escape their org by URL-hacking — the selection is
// dropped before scope is computed.
export function resolveAdminScope(
  s: SessionData,
  requestedOrgId: string | null | undefined,
): { orgId: string } | { all: true } | null {
  if (s.role === 'super_admin') {
    if (requestedOrgId && requestedOrgId !== 'all') {
      return { orgId: requestedOrgId };
    }
    return { all: true };
  }
  if (s.orgId) return { orgId: s.orgId };
  return null;
}
