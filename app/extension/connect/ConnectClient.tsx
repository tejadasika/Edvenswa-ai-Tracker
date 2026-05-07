'use client';
import { useEffect, useState } from 'react';

// Page → extension messaging now goes through a content-script bridge that
// every supported browser-flavour of the extension injects on dashboard
// origins. This works on Chrome, Edge, Firefox AND Safari — Safari Web
// Extensions don't fully support `externally_connectable`, so the older
// `chrome.runtime.sendMessage(extensionId, ...)` path doesn't work there.
//
// Protocol (mirrored in extension/dashboard-bridge.js):
//   page  → bridge:  { __edvenswa: 'request',  id, payload }
//   bridge → page:   { __edvenswa: 'response', id, ok, response | error }
//   bridge → page:   { __edvenswa: 'ready' }   (presence ping on load)

type BridgeResponse = { __edvenswa: 'response'; id: string; ok: boolean; response?: unknown };

function sendToExtension(message: unknown, timeoutMs = 3000): Promise<unknown | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;

    const finish = (value: unknown | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timeoutId);
      resolve(value);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as BridgeResponse | undefined;
      if (!data || data.__edvenswa !== 'response' || data.id !== id) return;
      finish(data.ok ? (data.response ?? null) : null);
    };

    window.addEventListener('message', onMessage);
    const timeoutId = window.setTimeout(() => finish(null), timeoutMs);
    window.postMessage(
      { __edvenswa: 'request', id, payload: message },
      window.location.origin,
    );
  });
}

function detectBrowser() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua) || /Opera\//.test(ua)) return 'opera';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

type Status = 'working' | 'done' | 'error';

function safePrev(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

export default function ConnectClient({
  extensionId: _extensionId,
  action,
  prevUrl,
}: {
  extensionId: string;
  action: 'connect' | 'disconnect';
  prevUrl: string | null;
}) {
  const [status, setStatus] = useState<Status>('working');
  const [message, setMessage] = useState<string>(
    action === 'connect' ? 'Connecting your browser…' : 'Disconnecting…',
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // closeAfter tells the extension whether to close this tab on success.
      // If the extension reused a pre-existing dashboard tab (prevUrl set),
      // we navigate back ourselves instead of letting the extension destroy
      // the user's tab.
      const safePrevUrl = safePrev(prevUrl);
      const closeAfter = !safePrevUrl;

      const finish = (label: string) => {
        setStatus('done');
        setMessage(label);
        if (safePrevUrl) {
          setTimeout(() => {
            window.location.href = safePrevUrl;
          }, 600);
        }
      };

      // Probe the bridge first. If the extension isn't installed we'll get
      // a null back and can show a clear error instead of timing out twice.
      const probe = (await sendToExtension({ type: 'ping' }, 1500)) as
        | { ok?: boolean; installed?: boolean }
        | null;
      if (cancelled) return;
      if (!probe || !probe.ok) {
        setStatus('error');
        setMessage(
          'Could not reach the extension. Make sure it is installed and enabled in this browser, then try again from the popup.',
        );
        return;
      }

      // Ask the extension for this install's device hash up-front. The server
      // labels the auto-provisioned token `auto:<deviceHash>` so each browser
      // gets its own token slot — connecting browser B no longer revokes
      // browser A's. Older extensions without this message return null and
      // we fall back to the legacy single-slot behavior.
      const dhResp = (await sendToExtension({ type: 'getDeviceHash' })) as {
        deviceHash?: string;
      } | null;
      const deviceHash =
        dhResp && typeof dhResp.deviceHash === 'string' ? dhResp.deviceHash : null;
      const browser = detectBrowser();
      const provisionBody = JSON.stringify({ deviceHash, browser });
      const provisionInit: RequestInit = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: provisionBody,
      };

      if (action === 'connect') {
        const r = await fetch('/api/extension/provision', provisionInit);
        if (!r.ok) {
          if (cancelled) return;
          setStatus('error');
          setMessage(`Provision failed (HTTP ${r.status})`);
          return;
        }
        const j = await r.json();
        const ack = await sendToExtension({
          type: 'provision',
          token: j.token,
          serverUrl: j.serverUrl ?? window.location.origin,
          closeAfter,
        });
        if (cancelled) return;
        if (!ack) {
          await fetch('/api/extension/provision', {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: provisionBody,
          });
          setStatus('error');
          setMessage('Could not reach the extension. Try again from the popup.');
          return;
        }
        finish(safePrevUrl ? 'Connected. Returning…' : 'Connected. Closing…');
      } else {
        await fetch('/api/extension/provision', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: provisionBody,
        });
        await sendToExtension({ type: 'unprovision', closeAfter });
        if (cancelled) return;
        finish(safePrevUrl ? 'Disconnected. Returning…' : 'Disconnected. Closing…');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [action, prevUrl]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="text-center space-y-3">
        <div
          className={
            'mx-auto h-10 w-10 rounded-full border-2 border-app-border ' +
            (status === 'working' ? 'animate-spin border-t-indigo-500' : '') +
            (status === 'done' ? 'border-green-600 bg-green-950/30' : '') +
            (status === 'error' ? 'border-red-700 bg-red-950/30' : '')
          }
        />
        <p className="text-sm text-fg">{message}</p>
        {status === 'error' && (
          <button
            onClick={() => window.close()}
            className="text-xs text-fg-muted underline hover:text-fg"
          >
            Close this tab
          </button>
        )}
      </div>
    </div>
  );
}
