# Edvenswa AI Tracker — Browser Extension

MV3 extension that records foreground time on third-party AI sites (ChatGPT,
Claude, Gemini, Perplexity, Copilot, DeepSeek) and reports it to your Edvenswa AI Tracker
dashboard.

## What it tracks

- AI platform (host-based detection only)
- Foreground seconds per visit
- Best-effort model name from URL/title
- Browser family + random per-install ID

## What it does **not** track

- Prompts, replies, or any DOM text
- Cookies, credentials, screenshots
- Anything outside the supported AI hostnames

## Install (developer mode, Chrome / Edge)

1. Issue a token from your dashboard:
   ```bash
   curl -X POST http://localhost:3000/api/extension/tokens \
     -H 'cookie: edvenswa_ai_session=...' \
     -H 'content-type: application/json' \
     -d '{"label":"my laptop"}'
   ```
   The response includes `token` — copy it. The server only stores its sha256;
   you cannot retrieve it again.

2. Load the extension:
   - Visit `chrome://extensions` (or `edge://extensions`)
   - Enable **Developer mode**
   - Click **Load unpacked** and pick the `extension/` folder

3. Open the extension's **Settings** page (right-click the toolbar icon → Options):
   - **Server URL**: e.g. `http://localhost:3000`
   - **Extension token**: paste the plaintext from step 1
   - Click **Save**

4. Visit any supported AI site. The popup status should show **active** and
   the queue counter should rise. Events flush every 60 seconds, or on demand
   via **Flush now**.

## Architecture

| File             | Role                                                      |
| ---------------- | --------------------------------------------------------- |
| `manifest.json`  | MV3 manifest, host permissions, background+content        |
| `background.js`  | Service worker: config, queue, 60s flush alarm, retry     |
| `content.js`     | Per-tab tracker: visibility/idle, emits one event per visit |
| `popup.html/js`  | Toolbar UI: status, pause toggle, manual flush            |
| `options.html/js`| Settings: server URL, token, privacy disclosure           |

The content script and the server never talk directly — every request goes
through the background worker, which holds the bearer token.

## Wire format

`POST {serverUrl}/api/extension/events`

```json
{
  "events": [
    {
      "ai_platform": "chatgpt",
      "model": "gpt-4o",
      "browser": "chrome",
      "device_hash": "abc123…",
      "active_seconds": 312,
      "started_at": "2026-05-01T18:42:11.000Z"
    }
  ]
}
```

Server caps the batch at 200 events. Unknown platforms are rejected (counted
under `rejected` in the response). 401 from the server pauses the extension
automatically until the user supplies a fresh token.

## Firefox

Not yet supported. Firefox MV3 still requires `browser_specific_settings` and
has gaps around `chrome.alarms` lifetime — left out of v0.1 deliberately.
