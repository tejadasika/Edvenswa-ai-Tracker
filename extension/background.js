// Safari exposes the WebExtension API as `browser.*`; recent Safari also
// aliases it to `chrome.*`. Older Safari (and Firefox) only expose `browser`.
// Aliasing here lets the rest of the file keep its `chrome.*` calls verbatim.
if (typeof globalThis.chrome === 'undefined' && typeof globalThis.browser !== 'undefined') {
  globalThis.chrome = globalThis.browser;
}

// Edvenswa AI Tracker — background service worker (MV3).
//
// Responsibilities:
//   1. Persist config (server URL, bearer token, paused flag, device hash).
//   2. Receive `event` messages from content scripts; batch them in storage.
//   3. On a 60-second alarm (and at startup), POST the batch to
//      `${serverUrl}/api/extension/events`. On 2xx, drop the flushed events.
//      On non-2xx, keep them and retry next tick (capped at MAX_QUEUE).
//   4. Expose getStatus / clearToken / setConfig messages to popup & options.
//
// Privacy posture: this worker never reads page content. Content scripts only
// send platform name, model name (if visible in the URL/title), and active
// foreground seconds. No prompts, no responses, no DOM text.

const FLUSH_ALARM = 'edvenswa-ai-flush';
const FLUSH_PERIOD_MIN = 1; // 60s
const MAX_QUEUE = 1000;
const MAX_BATCH = 200; // matches the server's MAX_EVENTS_PER_BATCH

const DEFAULT_CONFIG = {
  serverUrl: 'http://31.97.206.219:9031',
  token: '',
  paused: false,
  deviceHash: '',
};

// ---------- config helpers ----------

async function getConfig() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_CONFIG));
  const cfg = { ...DEFAULT_CONFIG, ...stored };
  if (!cfg.deviceHash) {
    cfg.deviceHash = await generateDeviceHash();
    await chrome.storage.local.set({ deviceHash: cfg.deviceHash });
  }
  return cfg;
}

async function setConfig(patch) {
  const allowed = {};
  for (const k of ['serverUrl', 'token', 'paused']) {
    if (k in patch) allowed[k] = patch[k];
  }
  if ('serverUrl' in allowed) {
    allowed.serverUrl = String(allowed.serverUrl).replace(/\/+$/, '');
  }
  await chrome.storage.local.set(allowed);
}

// ---------- queue ----------

let storagePromise = Promise.resolve();
/**
 * Serializes storage operations to prevent race conditions when multiple
 * tabs report events at the exact same millisecond.
 */
async function queueTask(fn) {
  storagePromise = storagePromise.then(fn).catch(console.error);
  return storagePromise;
}

async function enqueue(event) {
  return queueTask(async () => {
    const { queue = [] } = await chrome.storage.local.get('queue');
    queue.push(event);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    await chrome.storage.local.set({ queue });
  });
}

async function clearQueue() {
  return queueTask(() => chrome.storage.local.remove('queue'));
}

async function generateDeviceHash() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Backoff: on transient failure, skip the next N alarms before retrying.
// 1 alarm = 1 minute. Sequence: 1, 2, 4, 8, 16, capped at 30 (= 30 min).
// Resets to 0 on every successful flush. Without this a server outage or
// laptop offline period results in a retry every minute forever.
const BACKOFF_CAP = 30;

async function shouldSkipForBackoff() {
  const { backoffSkip = 0 } = await chrome.storage.local.get('backoffSkip');
  if (backoffSkip > 0) {
    await chrome.storage.local.set({ backoffSkip: backoffSkip - 1 });
    return true;
  }
  return false;
}

async function bumpBackoff() {
  const { backoffLevel = 0 } = await chrome.storage.local.get('backoffLevel');
  const next = Math.min(BACKOFF_CAP, Math.max(1, backoffLevel * 2 || 1));
  await chrome.storage.local.set({ backoffLevel: next, backoffSkip: next });
}

async function clearBackoff() {
  await chrome.storage.local.set({ backoffLevel: 0, backoffSkip: 0 });
}

async function flush() {
  const cfg = await getConfig();
  if (cfg.paused || !cfg.token || !cfg.serverUrl) {
    console.log(`[flush] skipped: paused=${cfg.paused} hasToken=${!!cfg.token} hasUrl=${!!cfg.serverUrl}`);
    return { skipped: true };
  }

  if (await shouldSkipForBackoff()) return { skipped: true, reason: 'backoff' };

  const { queue = [] } = await chrome.storage.local.get('queue');
  if (queue.length === 0) {
    console.log('[flush] queue empty, skipping');
    return { skipped: true };
  }

  console.log(`[flush] sending ${queue.length} queued events, token=${cfg.token.slice(0, 16)}...`);
  const batch = queue.slice(0, MAX_BATCH);
  let res;
  try {
    res = await fetch(`${cfg.serverUrl}/api/extension/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({ events: batch }),
    });
  } catch (err) {
    console.error('[flush] network error:', err?.message ?? err);
    await setLastError(`network: ${err?.message ?? err}`);
    await bumpBackoff();
    return { ok: false };
  }

  if (!res.ok) {
    console.warn(`[flush] http ${res.status}`);
    await setLastError(`http ${res.status}`);
    // 401 means the token is dead — clear it and pause entirely so the
    // extension disconnects immediately instead of staying configured.
    if (res.status === 401) {
      await setConfig({ paused: true, token: '' });
      await clearQueue();
      await clearBackoff();
    } else {
      await bumpBackoff();
    }
    return { ok: false, status: res.status };
  }

  // Drop only what we sent; new events may have been queued during the fetch.
  return queueTask(async () => {
    const { queue: latest = [] } = await chrome.storage.local.get('queue');
    const remaining = latest.slice(batch.length);
    await chrome.storage.local.set({ queue: remaining, lastFlushAt: Date.now(), lastError: '' });
    await clearBackoff();
    return { ok: true, sent: batch.length, remaining: remaining.length };
  });
}

async function setLastError(msg) {
  await chrome.storage.local.set({ lastError: msg, lastErrorAt: Date.now() });
}

// ---------- alarms / lifecycle ----------

// Defensive: chrome.alarms.create is idempotent on the same name, so calling
// it whenever we receive an event guarantees the periodic flush is alive
// even if MV3 garbage-collected the alarm during a long idle period.
async function ensureFlushAlarm() {
  const a = await chrome.alarms.get(FLUSH_ALARM);
  if (!a) chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: FLUSH_PERIOD_MIN });
}

chrome.runtime.onInstalled.addListener(ensureFlushAlarm);
chrome.runtime.onStartup.addListener(ensureFlushAlarm);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === FLUSH_ALARM) tick();
});

// Per-alarm work: if there are queued events, flush them (existing behavior).
// If the queue is empty but we're configured, ping the server so a token that
// was revoked from another browser/window gets noticed within a minute even
// when the user isn't actively using an AI site.
async function tick() {
  const { queue = [] } = await chrome.storage.local.get('queue');
  if (queue.length > 0) return flush();
  return pingIfConfigured();
}

async function pingIfConfigured() {
  const cfg = await getConfig();
  if (cfg.paused || !cfg.token || !cfg.serverUrl) return;
  // Backoff applies to ping too — if the server is down we shouldn't hammer
  // it with liveness probes any more than we hammer it with event flushes.
  if (await shouldSkipForBackoff()) return;

  let res;
  try {
    res = await fetch(`${cfg.serverUrl}/api/extension/ping`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}` },
    });
  } catch {
    // Network error = offline. Don't bump backoff for liveness probes;
    // the next event flush will handle real outage signaling.
    return;
  }
  if (res.status === 401) {
    // Same disconnect path as flush(): the token is dead.
    await setLastError('http 401');
    await setConfig({ paused: true, token: '' });
    await clearQueue();
    await clearBackoff();
  }
}

// ---------- message router ----------

// Shared dashboard-handshake handler. Used by both onMessageExternal (Chrome's
// direct page→extension path) and onMessage (Safari path, where a content-script
// bridge forwards `window.postMessage` requests from dashboard pages because
// Safari Web Extensions don't fully support `externally_connectable`).
async function handleDashboardMessage(msg, sender) {
  // After a successful provision/unprovision, close the dashboard's
  // handshake tab. window.close() doesn't work on tabs opened via
  // chrome.tabs.create, so we close them from the extension side using
  // sender.tab.id. Tiny delay so the page's success state is visible
  // for an instant before disappearing.
  const maybeCloseSenderTab = (closeAfter) => {
    if (!closeAfter) return;
    const tabId = sender?.tab?.id;
    if (typeof tabId === 'number') {
      setTimeout(() => chrome.tabs.remove(tabId).catch(() => {}), 500);
    }
  };

  if (msg?.type === 'provision') {
    const token = typeof msg.token === 'string' ? msg.token.trim() : '';
    const serverUrl = typeof msg.serverUrl === 'string' ? msg.serverUrl.trim() : '';
    console.log(`[bg] received provision: token=${token.slice(0, 16)}... serverUrl=${serverUrl}`);
    if (!token || !serverUrl) {
      return { ok: false, error: 'token and serverUrl required' };
    }
    await setConfig({ token, serverUrl, paused: false });
    await clearBackoff();
    const flushResult = await flush();
    console.log('[bg] immediate flush result:', flushResult);
    maybeCloseSenderTab(msg.closeAfter);
    return { ok: true };
  }
  if (msg?.type === 'unprovision') {
    await setConfig({ token: '', paused: true });
    await clearQueue();
    await clearBackoff();
    maybeCloseSenderTab(msg.closeAfter);
    return { ok: true };
  }
  if (msg?.type === 'ping') {
    return { ok: true, installed: true };
  }
  if (msg?.type === 'getDeviceHash') {
    const cfg = await getConfig();
    return { ok: true, deviceHash: cfg.deviceHash };
  }
  return null; // not a dashboard-handshake message
}

// External handler: kept for Chrome (and any browser that supports
// externally_connectable). Origin is enforced by the manifest.
if (chrome.runtime.onMessageExternal) {
  chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    (async () => {
      const result = await handleDashboardMessage(msg, sender);
      sendResponse(result ?? { ok: false, error: 'unknown message' });
    })();
    return true;
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // Dashboard handshake messages may arrive here via the content-script
    // bridge (Safari path). Try the shared handler first; if it returns
    // null the message wasn't a handshake type and we fall through to
    // the popup/options/content-script handlers below.
    if (
      msg?.type === 'provision' ||
      msg?.type === 'unprovision' ||
      msg?.type === 'ping'
    ) {
      const result = await handleDashboardMessage(msg, sender);
      sendResponse(result ?? { ok: false, error: 'unknown message' });
      return;
    }
    if (msg?.type === 'event') {
      const cfg = await getConfig();
      if (cfg.paused) return sendResponse({ ok: true, paused: true });

      // Capture queue length BEFORE the enqueue. If it was empty, this is
      // the first event of a fresh activity burst — flush soon so the
      // dashboard reflects "user just started using AI" within a few
      // seconds instead of waiting up to 60s for the alarm.
      const { queue: before = [] } = await chrome.storage.local.get('queue');
      const wasEmpty = before.length === 0;

      await enqueue({ ...msg.event, device_hash: cfg.deviceHash });
      // Re-arm the periodic alarm in case MV3 nuked it during a long idle.
      ensureFlushAlarm();

      if (wasEmpty) {
        // Don't await — let the response return quickly. The flush runs
        // in parallel; failures bump the backoff like any other.
        flush();
      }
      sendResponse({ ok: true });
    } else if (msg?.type === 'getStatus') {
      const cfg = await getConfig();
      const { queue = [], lastFlushAt, lastError } = await chrome.storage.local.get([
        'queue',
        'lastFlushAt',
        'lastError',
      ]);
      sendResponse({
        configured: Boolean(cfg.token && cfg.serverUrl),
        paused: cfg.paused,
        serverUrl: cfg.serverUrl,
        queueLength: queue.length,
        lastFlushAt: lastFlushAt ?? null,
        lastError: lastError ?? '',
      });
    } else if (msg?.type === 'setConfig') {
      await setConfig(msg.patch ?? {});
      // Any config change is an explicit user fix — give the next flush a clean shot.
      await clearBackoff();
      sendResponse({ ok: true });
    } else if (msg?.type === 'getDeviceHash') {
      // Lets the dashboard's connect page tag the provisioned token with this
      // browser install's device hash, so connecting browser B doesn't revoke
      // browser A's token.
      const cfg = await getConfig();
      sendResponse({ ok: true, deviceHash: cfg.deviceHash });
    } else if (msg?.type === 'flushNow') {
      // Manual flush bypasses backoff — users hitting the button want a retry now.
      await clearBackoff();
      const r = await flush();
      sendResponse(r);
    } else if (msg?.type === 'openConnect' || msg?.type === 'openDisconnect') {
      // Open the dashboard's handshake page. The page uses our own runtime ID
      // (passed via ?ext=) to message back into this worker with a freshly
      // issued token (or to revoke). The page closes itself on success.
      //
      // Reuse-vs-create: if any tab is already on the dashboard origin, we
      // navigate THAT tab to the connect URL instead of stacking a new one.
      // This handles the common case where the user already has the
      // dashboard open and signed in — they see one brief navigation, then
      // the tab goes back/closes, no orphan tabs left over.
      const cfg = await getConfig();
      const action = msg.type === 'openDisconnect' ? '&action=disconnect' : '';
      const url = `${cfg.serverUrl}/extension/connect?ext=${encodeURIComponent(chrome.runtime.id)}${action}`;
      try {
        // Find any existing dashboard tab. We DON'T use `chrome.tabs.query({url})`
        // because its match-pattern parser is unreliable for URLs with ports
        // (e.g. http://localhost:3000) — it frequently returns an empty array
        // even when matching tabs exist. Instead we list all tabs and filter
        // by origin manually. Both the tabs[] permission and an explicit URL
        // read are already granted via the "tabs" permission in manifest.json.
        const allTabs = await chrome.tabs.query({});
        const originPrefix = `${cfg.serverUrl}/`;
        // Prefer a tab that's NOT already on /extension/connect so we don't
        // try to reuse an in-flight handshake tab as the "previous" tab.
        const candidates = allTabs.filter(
          (t) => typeof t.url === 'string' && t.url.startsWith(originPrefix),
        );
        const target =
          candidates.find((t) => !t.url.includes('/extension/connect')) ??
          candidates[0];

        if (target && typeof target.id === 'number') {
          // Reuse: pass the tab's current URL via &prevUrl so the connect
          // page can navigate back to it after the handshake. Closing this
          // tab would destroy the user's existing dashboard session.
          const prev = target.url ? `&prevUrl=${encodeURIComponent(target.url)}` : '';
          await chrome.tabs.update(target.id, { url: `${url}${prev}`, active: true });
          if (typeof target.windowId === 'number') {
            chrome.windows.update(target.windowId, { focused: true }).catch(() => {});
          }
        } else {
          // No dashboard tab open — create a fresh one. The connect page
          // tells us to close it via `closeAfter: true` once done.
          await chrome.tabs.create({ url, active: true });
        }
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message ?? err) });
      }
    } else {
      sendResponse({ ok: false, error: 'unknown message' });
    }
  })();
  return true; // async sendResponse
});
