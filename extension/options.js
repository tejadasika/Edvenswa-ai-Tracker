// Options page: load + save server URL and token via the background worker.

const $ = (id) => document.getElementById(id);

async function load() {
  const r = await chrome.runtime.sendMessage({ type: 'getStatus' });
  $('serverUrl').value = r?.serverUrl ?? '';
  // Token is intentionally not echoed back from storage; the user can re-paste
  // to overwrite. Showing the existing value would normalize copying it.
  $('token').placeholder = r?.configured
    ? '••• token already saved (paste to replace) •••'
    : 'Paste the token shown when you issued it';
}

$('save').addEventListener('click', async () => {
  const patch = {};
  const url = $('serverUrl').value.trim();
  if (url) patch.serverUrl = url;
  const tok = $('token').value.trim();
  if (tok) patch.token = tok;
  // Saving any config implicitly un-pauses — otherwise users will fix the
  // problem and wonder why nothing reports.
  patch.paused = false;
  await chrome.runtime.sendMessage({ type: 'setConfig', patch });
  $('token').value = '';
  $('saved').hidden = false;
  setTimeout(() => ($('saved').hidden = true), 1500);
  load();
});

load();
