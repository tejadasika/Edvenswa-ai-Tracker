// Popup: tracking switch (auto-connect to dashboard) + status + manual flush.
//
// Switch behavior:
//   OFF → ON  : background opens a dashboard tab at /extension/connect.
//               Dashboard provisions a token, pushes it back via
//               chrome.runtime.sendMessage(EXT_ID, {type:'provision', ...}),
//               and closes the tab. Background's onMessageExternal handler
//               stores the token and unpauses.
//   ON  → OFF : background opens /extension/connect?action=disconnect, which
//               revokes the server-side token and tells the extension to
//               clear local state, then closes itself.

const $ = (id) => document.getElementById(id);

function fmtTime(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function pill(text, kind) {
  return `<span class="pill ${kind}">${text}</span>`;
}

let lastConfigured = false;
let lastPaused = false;

async function refresh() {
  const r = await chrome.runtime.sendMessage({ type: 'getStatus' });
  if (!r) return;

  lastConfigured = Boolean(r.configured);
  lastPaused = Boolean(r.paused);
  const tracking = lastConfigured && !lastPaused;

  const sw = $('trackSwitch');
  sw.setAttribute('aria-checked', tracking ? 'true' : 'false');
  // Once tracking is enabled, the switch is locked on — users cannot disable it.
  sw.disabled = tracking;

  if (tracking) {
    $('sub').textContent = 'Tracking AI-site time on supported browsers.';
    $('status').innerHTML = pill('active', 'ok');
  } else if (lastConfigured && lastPaused) {
    $('sub').textContent = 'Paused. Flip the switch to resume.';
    $('status').innerHTML = pill('paused', 'warn');
  } else {
    $('sub').textContent = 'Not connected. Flip the switch to connect.';
    $('status').innerHTML = pill('not connected', 'warn');
  }

  $('server').textContent = r.serverUrl || '—';
  $('queue').textContent = String(r.queueLength);
  $('lastFlush').textContent = fmtTime(r.lastFlushAt);
  $('lastError').textContent = r.lastError ? `Last error: ${r.lastError}` : '';
}

$('trackSwitch').addEventListener('click', async () => {
  const sw = $('trackSwitch');
  if (sw.disabled) return;
  const wasOn = sw.getAttribute('aria-checked') === 'true';
  // Tracking is one-way: once enabled it cannot be disabled from the popup.
  if (wasOn) return;
  sw.disabled = true;
  sw.setAttribute('aria-checked', 'true');
  await chrome.runtime.sendMessage({ type: 'openConnect' });
  // The handshake happens in a separate tab; poll a few times so the popup
  // catches up once the dashboard finishes provisioning.
  for (let i = 0; i < 15; i++) {
    await new Promise((res) => setTimeout(res, 500));
    await refresh();
    const newState = $('trackSwitch').getAttribute('aria-checked') === 'true';
    if (newState !== wasOn) break;
  }
});

$('flush').addEventListener('click', async () => {
  $('flush').disabled = true;
  $('flush').textContent = 'Flushing…';
  await chrome.runtime.sendMessage({ type: 'flushNow' });
  $('flush').disabled = false;
  $('flush').textContent = 'Flush now';
  refresh();
});

refresh();
setInterval(refresh, 2000);
