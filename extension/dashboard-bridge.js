// Edvenswa AI Tracker — dashboard bridge content script.
//
// Runs on dashboard origins (localhost + the production server). Safari Web
// Extensions don't fully support `externally_connectable`, so the dashboard
// page can't call `chrome.runtime.sendMessage(extensionId, ...)` directly.
// Instead the page posts a `window.postMessage` request, this content script
// forwards it to the background service worker, and posts the response back.
//
// Protocol:
//   page  → bridge:  { __edvenswa: 'request',  id, payload }
//   bridge → page:   { __edvenswa: 'response', id, ok, response | error }
//   bridge → page:   { __edvenswa: 'ready' }   (presence ping on load)

(() => {
  if (typeof globalThis.chrome === 'undefined' && typeof globalThis.browser !== 'undefined') {
    globalThis.chrome = globalThis.browser;
  }
  const api = globalThis.chrome ?? globalThis.browser;
  if (!api?.runtime?.sendMessage) return;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || typeof msg !== 'object' || msg.__edvenswa !== 'request') return;
    const { id, payload } = msg;
    if (typeof id !== 'string' || !payload || typeof payload !== 'object') return;

    const reply = (ok, body) => {
      const out = { __edvenswa: 'response', id, ok };
      if (ok) out.response = body ?? null;
      else out.error = body ?? 'unknown error';
      window.postMessage(out, window.location.origin);
    };

    Promise.resolve()
      .then(() => api.runtime.sendMessage(payload))
      .then((response) => reply(true, response))
      .catch((err) => reply(false, String(err?.message ?? err)));
  });

  const announce = () => {
    window.postMessage({ __edvenswa: 'ready' }, window.location.origin);
  };
  announce();
  window.addEventListener('focus', announce);
})();
