import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import ConnectClient from './ConnectClient';

export const dynamic = 'force-dynamic';

// Internal handoff page opened by the extension when the user clicks the
// "Tracking" switch in the popup. The page itself does nothing user-visible
// except a tiny spinner — it provisions a token via the existing API,
// pushes it into the extension via chrome.runtime.sendMessage, and
// closes itself.
//
// Auth: gated by the same session as the rest of the dashboard, so
// unauthenticated users hit the login flow first and return here after.
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ ext?: string; action?: string; prevUrl?: string }>;
}) {
  const s = await getSession();
  const sp = await searchParams;
  if (!s.userId) {
    // Bounce through login, then back to this exact URL with params preserved.
    const params = new URLSearchParams();
    if (sp.ext) params.set('ext', sp.ext);
    if (sp.action) params.set('action', sp.action);
    if (sp.prevUrl) params.set('prevUrl', sp.prevUrl);
    const next = `/extension/connect${params.toString() ? `?${params.toString()}` : ''}`;
    redirect(`/?next=${encodeURIComponent(next)}`);
  }

  // The extension passes its own ID via ?ext=<id>. We accept that instead of
  // hard-coding because the ID differs between dev (unpacked) and Chrome Web
  // Store builds, and we don't want to require a server env var just for this.
  const extensionId = typeof sp.ext === 'string' ? sp.ext : '';
  const action = sp.action === 'disconnect' ? 'disconnect' : 'connect';
  // prevUrl is only set when the extension navigated an existing dashboard
  // tab (instead of creating a fresh one). When set, we navigate back to it
  // after the handshake instead of asking the extension to close us.
  const prevUrl = typeof sp.prevUrl === 'string' ? sp.prevUrl : null;

  return <ConnectClient extensionId={extensionId} action={action} prevUrl={prevUrl} />;
}
