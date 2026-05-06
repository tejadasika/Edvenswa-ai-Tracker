'use client';
import { useEffect, useState } from 'react';

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage?: (
          extensionId: string,
          message: unknown,
          callback?: (response: unknown) => void,
        ) => unknown;
        lastError?: { message?: string };
      };
    };
    browser?: {
      runtime?: {
        sendMessage?: (
          extensionId: string,
          message: unknown,
          callback?: (response: unknown) => void,
        ) => unknown;
        lastError?: { message?: string };
      };
    };
  }
}

function getExtensionRuntime() {
  if (typeof window === 'undefined') return null;
  return window.chrome?.runtime ?? window.browser?.runtime ?? null;
}

function sendToExtension(extensionId: string, message: unknown): Promise<unknown | null> {
  return new Promise((resolve) => {
    if (!extensionId || typeof window === 'undefined') {
      resolve(null);
      return;
    }
    const runtime = getExtensionRuntime();
    if (!runtime?.sendMessage) {
      resolve(null);
      return;
    }
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 2000);
    try {
      const maybePromise = runtime.sendMessage(extensionId, message, (response) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (window.chrome?.runtime?.lastError || window.browser?.runtime?.lastError) {
          resolve(null);
          return;
        }
        resolve(response ?? null);
      });
      if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
        (maybePromise as Promise<unknown>)
          .then((response) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            resolve(response ?? null);
          })
          .catch(() => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            resolve(null);
          });
      }
    } catch {
      if (!settled) {
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(null);
      }
    }
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
  extensionId,
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
      if (!extensionId) {
        setStatus('error');
        setMessage('Missing extension id. Reopen the extension popup.');
        return;
      }

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

      // Ask the extension for this install's device hash up-front. The server
      // labels the auto-provisioned token `auto:<deviceHash>` so each browser
      // gets its own token slot — connecting browser B no longer revokes
      // browser A. If the extension is older and doesn't know the message,
      // we fall back to legacy single-slot behavior.
      const dhResp = (await sendToExtension(extensionId, {
        type: 'getDeviceHash',
      })) as { deviceHash?: string } | null;
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
        const ack = await sendToExtension(extensionId, {
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
        await sendToExtension(extensionId, { type: 'unprovision', closeAfter });
        if (cancelled) return;
        finish(safePrevUrl ? 'Disconnected. Returning…' : 'Disconnected. Closing…');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [extensionId, action, prevUrl]);

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
