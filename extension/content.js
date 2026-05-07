// Safari exposes the WebExtension API as `browser.*`; alias it to `chrome.*`
// so this file's chrome.* calls work unchanged on Safari.
if (typeof globalThis.chrome === 'undefined' && typeof globalThis.browser !== 'undefined') {
  globalThis.chrome = globalThis.browser;
}

// Edvenswa AI Tracker — content script.
//
// Tracks foreground time per visit on a known AI site and emits one event
// when the visit ends (visibility hidden, tab unload, or 5-minute idle).
// Never reads DOM text — only looks at hostname, pathname, and document.title.

(() => {
  const PLATFORM_BY_HOST = {
    'chatgpt.com': 'chatgpt',
    'chat.openai.com': 'chatgpt',
    'claude.ai': 'claude',
    'gemini.google.com': 'gemini',
    'www.perplexity.ai': 'perplexity',
    'copilot.microsoft.com': 'copilot',
    'chat.deepseek.com': 'deepseek',
  };

  const platform = PLATFORM_BY_HOST[location.hostname];
  if (!platform) return; // host_permissions are wider than detection — be safe.

  const browser = detectBrowser();

  let activeMs = 0;
  let segmentStart = document.visibilityState === 'visible' ? Date.now() : null;
  let sessionStart = new Date().toISOString();
  let idleTimer = null;
  const IDLE_MS = 5 * 60 * 1000;

  // Threshold for the first "I started using this" event. We wait FIRST_EVENT_MS
  // of foreground time so a quick passing glance (page load → tab switch) doesn't
  // generate a session row. Anything ≥ this counts as a real session start.
  const FIRST_EVENT_MS = 10_000;
  // Periodic checkpoint cadence. Smaller = fresher dashboard, but each event
  // costs one DB row; 30s is the sweet spot.
  const CHECKPOINT_MS = 30_000;
  let firstEventSent = false;
  let lastModelSent = null;
  let lastTopicSent = null;
  // Disabled flag — mirrors background's `paused` setting. While disabled we
  // hold no segments open, accumulate no time, and emit no events. Read once
  // at script start (default false), then kept in sync via storage.onChanged
  // so toggling the popup button takes effect across every open AI tab live.
  let disabled = false;
  chrome.storage.local.get('paused').then((r) => {
    disabled = !!r.paused;
    if (disabled) endSegment();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !('paused' in changes)) return;
    const next = !!changes.paused.newValue;
    if (next === disabled) return;
    disabled = next;
    if (disabled) {
      // Drop any accumulated time so the next enable starts clean.
      endSegment();
      activeMs = 0;
      firstEventSent = false;
      lastModelSent = null;
      lastTopicSent = null;
    } else if (document.visibilityState === 'visible') {
      sessionStart = new Date().toISOString();
      startSegment();
    }
  });

  function startSegment() {
    if (disabled) return;
    if (segmentStart === null) {
      segmentStart = Date.now();
      sessionStart = sessionStart || new Date().toISOString();
    }
    armIdle();
  }

  function endSegment() {
    if (segmentStart !== null) {
      activeMs += Date.now() - segmentStart;
      segmentStart = null;
    }
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function armIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(flush, IDLE_MS);
  }

  // Send whatever foreground time has accumulated so far, and reset the
  // accumulator. `reason` is informational — it's not sent to the server,
  // just useful when watching the background console.
  function emitCheckpoint(reason) {
    if (disabled) return false;
    // Roll any open segment into activeMs without ending it (so tracking
    // keeps running across the checkpoint).
    if (segmentStart !== null) {
      activeMs += Date.now() - segmentStart;
      segmentStart = Date.now();
    }
    const activeSeconds = Math.round(activeMs / 1000);
    if (activeSeconds < 5) return false;
    const model = detectModel();
    const topic = detectTopic();
    // Always send the raw tab title too. The server uses it as a fallback
    // when `topic` is null (e.g. site title we don't recognize, or stripping
    // rejected it). Guarantees every event still produces a conversation row.
    const pageTitle = (document.title || '').trim().slice(0, 256) || null;
    try {
      chrome.runtime.sendMessage({
        type: 'event',
        event: {
          ai_platform: platform,
          model,
          topic,
          page_title: pageTitle,
          browser,
          active_seconds: activeSeconds,
          started_at: sessionStart,
        },
      });
    } catch {
      // Service worker may be asleep; background alarm will pick up backlog.
    }
    lastModelSent = model;
    console.log(`[content] Emitted checkpoint: reason=${reason}, activeSeconds=${activeSeconds}, model=${model}, topic=${topic}, pageTitle=${pageTitle}`);
    lastTopicSent = topic;
    activeMs = 0;
    sessionStart = new Date().toISOString();
    firstEventSent = true;
    return true;
  }

  // End-of-session flush. Same as a checkpoint but also closes the segment
  // (caller is about to lose foreground or unload).
  function flush() {
    endSegment();
    emitCheckpoint('flush');
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') startSegment();
    else flush();
  });

  // Tab/window close. visibilitychange usually fires first, but belt + braces.
  window.addEventListener('pagehide', flush);

  // User activity resets the idle timer (we only care that *something* happened,
  // not what the user typed).
  for (const evt of ['mousemove', 'keydown', 'scroll', 'click']) {
    window.addEventListener(evt, armIdle, { passive: true });
  }

  // Heartbeat: emits an event as soon as a real session starts (~10s of
  // foreground), then keeps emitting every CHECKPOINT_MS while the tab is
  // active. This is what makes the admin dashboard update WITHOUT the user
  // pressing Flush — fresh data rolls in continuously while you use the AI.
  setInterval(() => {
    if (disabled) return;
    if (segmentStart === null) return; // tab not foreground; nothing to send
    const accumulatedMs = activeMs + (Date.now() - segmentStart);

    // Phase 1: first event. After ~10s of real use, send "session started".
    // Smaller threshold than the 5s anti-spam floor so a brief tab-switch
    // doesn't qualify, but a real interaction does.
    if (!firstEventSent && accumulatedMs >= FIRST_EVENT_MS) {
      emitCheckpoint('first-event');
      return;
    }
    // Phase 2: regular checkpoints every CHECKPOINT_MS while active.
    if (firstEventSent && Date.now() - segmentStart >= CHECKPOINT_MS) {
      emitCheckpoint('checkpoint');
    }
  }, 5_000);

  // Model & topic change watcher. Neither has a "changed" event we can hook —
  // the model picker is a button label, and document.title updates whenever the
  // site renames the chat. Polling once a second is cheap (a querySelector and
  // a string read), and flushing immediately on change keeps the rollup in
  // extension_conversations accurate: time before the change attaches to the
  // old topic, time after attaches to the new one.
  setInterval(() => {
    if (disabled) return;
    if (segmentStart === null || !firstEventSent) return;
    const currentModel = detectModel();
    const currentTopic = detectTopic();
    const modelChanged = currentModel && currentModel !== lastModelSent;
    const topicChanged = currentTopic !== lastTopicSent;
    if (modelChanged || topicChanged) {
      emitCheckpoint(modelChanged ? 'model-change' : 'topic-change');
    }
  }, 1_000);

  // Best-effort model detection. Privacy posture: we only read three things —
  //  - URL / search params
  //  - document.title
  //  - a *single* element matching the model-selector / picker for each site
  // We never read the chat transcript, the input box, or arbitrary DOM text.
  // Returns a normalized lowercased model name, or null.
  function detectModel() {
    const url = location.href;
    const title = document.title || '';

    // Read the visible label from a model-picker element by selector list.
    // Returns the trimmed text content (capped at 64 chars) or null.
    function readPicker(selectors) {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 64);
        if (txt) return txt;
      }
      return null;
    }

    // Map a free-form picker label to a stable model id.
    function normalize(s) {
      if (!s) return null;
      const t = s.toLowerCase();
      // ChatGPT family
      if (/\bgpt-?4o\b.*\bmini\b/.test(t) || /\b4o-?mini\b/.test(t)) return 'gpt-4o-mini';
      if (/\bgpt-?4o\b/.test(t) || /\b4o\b/.test(t)) return 'gpt-4o';
      if (/\bo1\b.*\bmini\b/.test(t)) return 'o1-mini';
      if (/\bo1\b/.test(t)) return 'o1';
      if (/\bgpt-?4\b/.test(t)) return 'gpt-4';
      if (/\bgpt-?3\.5\b/.test(t)) return 'gpt-3.5';
      // Claude family
      if (/opus[-\s]*4/.test(t)) return 'claude-opus-4';
      if (/sonnet[-\s]*4(?:\.\d+)?/.test(t)) {
        const m = t.match(/sonnet[-\s]*(4(?:\.\d+)?)/);
        return `claude-sonnet-${m[1]}`;
      }
      if (/haiku[-\s]*4(?:\.\d+)?/.test(t)) return 'claude-haiku-4';
      if (/3\.7[-\s]*sonnet|sonnet[-\s]*3\.7/.test(t)) return 'claude-3.7-sonnet';
      if (/3\.5[-\s]*sonnet|sonnet[-\s]*3\.5/.test(t)) return 'claude-3.5-sonnet';
      if (/3[-\s]*opus/.test(t)) return 'claude-3-opus';
      // Gemini family
      if (/gemini[-\s]*2\.5[-\s]*pro/.test(t)) return 'gemini-2.5-pro';
      if (/gemini[-\s]*2\.0[-\s]*flash/.test(t)) return 'gemini-2.0-flash';
      if (/gemini[-\s]*1\.5[-\s]*pro/.test(t)) return 'gemini-1.5-pro';
      if (/gemini[-\s]*1\.5[-\s]*flash/.test(t)) return 'gemini-1.5-flash';
      if (/\bgemini\b/.test(t)) return 'gemini';
      // Perplexity
      if (/sonar[-\s]*pro/.test(t)) return 'sonar-pro';
      if (/\bsonar\b/.test(t)) return 'sonar';
      // DeepSeek
      if (/deepseek[-\s]*r1/.test(t)) return 'deepseek-r1';
      if (/deepseek[-\s]*v3/.test(t)) return 'deepseek-v3';
      if (/\bdeepseek\b/.test(t)) return 'deepseek';
      // Copilot
      if (/\bgpt-?4\b/.test(t) && platform === 'copilot') return 'copilot-gpt-4';
      // Fallback: return the trimmed label so admins at least see *something*.
      return s.replace(/\s+/g, '-').toLowerCase().slice(0, 48);
    }

    if (platform === 'chatgpt') {
      const m = url.match(/[?&]model=([^&#]+)/);
      if (m) return decodeURIComponent(m[1]).toLowerCase();
      // OpenAI's model picker is a button at the top of the chat. data-testid
      // values have been stable across redesigns; selectors stacked from most
      // specific to most generic so we degrade gracefully on UI changes.
      const picked = readPicker([
        '[data-testid="model-switcher-dropdown-button"]',
        '[data-testid^="model-switcher"]',
        'button[aria-haspopup="menu"][aria-label*="Model" i]',
        'div[class*="model-picker"] button',
        '.group\\/model-picker button',
      ]);
      if (picked) return normalize(picked);
      if (/gpt-4o/i.test(title)) return 'gpt-4o';
      if (/gpt-4/i.test(title)) return 'gpt-4';
      return null;
    }
    if (platform === 'claude') {
      const picked = readPicker([
        '[data-testid="model-selector"]',
        'button[aria-label*="model" i]',
        'button[aria-haspopup="menu"][data-testid*="model" i]',
      ]);
      if (picked) return normalize(picked);
      const m = title.match(/Claude\s+([\w.-]+)/i);
      if (m) return `claude-${m[1].toLowerCase()}`;
      return null;
    }
    if (platform === 'gemini') {
      // Gemini exposes the model name in a top-bar dropdown.
      const picked = readPicker([
        'bard-mode-switcher button',
        'button[mode-switcher-button]',
        'button[aria-label*="model" i]',
        'span[class*="model-name"]',
      ]);
      if (picked) return normalize(picked);
      const m = url.match(/\/app\/([^/?#]+)/);
      if (m && m[1] !== 'home') return normalize(m[1]);
      return null;
    }
    if (platform === 'perplexity') {
      const picked = readPicker([
        'button[aria-label*="model" i]',
        'button[data-testid*="model" i]',
      ]);
      if (picked) return normalize(picked);
      return null;
    }
    if (platform === 'copilot') {
      // Copilot's "tone" / model picker.
      const picked = readPicker([
        'button[aria-label*="model" i]',
        'button[aria-label*="tone" i]',
      ]);
      if (picked) return normalize(picked);
      return null;
    }
    if (platform === 'deepseek') {
      const picked = readPicker([
        'button[aria-label*="model" i]',
        'button[aria-haspopup="listbox"]',
      ]);
      if (picked) return normalize(picked);
      // DeepSeek's chat URL sometimes carries the mode (e.g. ?model=deepseek-r1)
      const m = url.match(/[?&]model=([^&#]+)/);
      if (m) return normalize(decodeURIComponent(m[1]));
      return null;
    }
    return null;
  }

  // Topic = the conversation/chat title the user sees in the tab.
  // Sourced ONLY from document.title (no transcript reads). Each AI site
  // sets its tab title to the chat name plus a site suffix; we strip the
  // suffix and the new-chat placeholder.
  function detectTopic() {
    const raw = (document.title || '').trim();
    if (!raw) return null;
    const STRIP = [
      /\s*[-–|]\s*ChatGPT\s*$/i,
      /\s*[-–|]\s*OpenAI\s*$/i,
      /\s*[-–|]\s*Claude\s*$/i,
      /\s*[-–|]\s*Anthropic\s*$/i,
      /\s*[-–|]\s*Gemini\s*$/i,
      /\s*[-–|]\s*Google\s*$/i,
      /\s*[-–|]\s*Perplexity(?:\s+AI)?\s*$/i,
      // Copilot's title is "Microsoft Copilot" (no separator) or "<chat> | Microsoft Copilot".
      // Strip the full brand first so "Microsoft" doesn't survive as a fake topic.
      /\s*[-–|]\s*Microsoft\s+Copilot\s*$/i,
      /\s*Microsoft\s+Copilot\s*$/i,
      /\s*[-–|]\s*Copilot\s*$/i,
      /\s*[-–|]\s*DeepSeek\s*$/i,
    ];
    let t = raw;
    for (const re of STRIP) t = t.replace(re, '');
    t = t.trim();

    const isPlaceholder = (s) =>
      !s ||
      /^(new chat|chatgpt|claude|gemini|perplexity|copilot|microsoft copilot|deepseek)$/i.test(s);

    // Copilot fallback: Copilot is a SPA that often does NOT update
    // document.title to include the chat name. Read the single visible
    // conversation-title element instead. We only touch one element by
    // selector (no transcript reads), consistent with how the model picker works.
    if (platform === 'copilot' && isPlaceholder(t)) {
      const titleEl = document.querySelector(
        'h1[data-testid*="conversation" i], [data-testid="conversation-title"], header h1, nav [aria-current="page"]',
      );
      const fromDom = (titleEl?.textContent || '').trim().replace(/\s+/g, ' ');
      if (!isPlaceholder(fromDom)) return fromDom.slice(0, 256);
    }

    if (isPlaceholder(t)) return null;
    return t.slice(0, 256);
  }

  function detectBrowser() {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return 'edge';
    if (/OPR\//.test(ua)) return 'opera';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/Chrome\//.test(ua)) return 'chrome';
    return 'other';
  }
})();
