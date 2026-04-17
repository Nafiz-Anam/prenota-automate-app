# Auto Traffic

A modern Electron + Playwright application for automating appointments on the Italian police website (prenotafacile.poliziadistato.it).

## Features

- **Modern UI/UX**: Clean, responsive interface built with Electron
- **Multi-account Management**: Add, edit, and delete user accounts
- **Proxy Management**: Configure HTTP proxies for browser automation
- **Browser Automation**: Automated browser instances with Playwright
- **Service Selection**: Choose from different permit services
- **Scheduling**: Instant start or scheduled execution
- **CAPTCHA Solving**: CapSolver API key stored locally (CapSolver page), same idea as accounts/proxies
- **Automation Status**: Polling-based status and active browser count

## Installation

1. Install dependencies:

```bash
npm install
```

2. **Local data files** (not committed to git): copy the templates in `data/` to create your own files:

- `data/accounts.example.json` → `data/accounts.json`
- `data/proxies.example.json` → `data/proxies.json`

On first run, the app creates empty `accounts.json`, `proxies.json`, and `capsolver-settings.json` if they are missing. You can also copy `data/capsolver-settings.example.json` as a reference; the **CapSolver** sidebar page is the usual way to save the API key.

3. Run the application:

```bash
npm start
```

For development with DevTools:

```bash
npm run dev
```

## Build

Create distributable packages:

```bash
npm run build
```

App icon is `assets/applogo.png` (used for the Electron window and the Windows installer via `build.win.icon`). Replace that file to change branding.

## Project Structure

```
src/
  main/                    # Electron main process
    main.js                # Entry point, IPC, data paths
    preload.js             # contextBridge API for renderer
    browser-automation.js  # Playwright automation
    capsolver-service.js   # CapSolver API (optional HTTPS proxy for API calls)
  renderer/                # Frontend
    index.html
    styles.css
    renderer.js
data/
  accounts.example.json
  proxies.example.json
  capsolver-settings.example.json    # optional reference; app writes capsolver-settings.json
  capsolver-proxy-config.example.json # optional CapSolver API HTTPS proxy settings
assets/                    # Optional icons (see assets/README.txt)
package.json
```

## Proxy Configuration

Use standard **HTTP** proxies (`host`, `port`, `user`, `pass`). Each entry may include `"type": "regular"` (optional). Entries with `"type": "web_unblocker"` are **ignored** — that integration was removed.

See `data/proxies.example.json` for the expected shape.

## CapSolver Setup

1. **API key**: Register at [CapSolver Dashboard](https://dashboard.capsolver.com/). In the app, open **CapSolver** in the sidebar, paste your key, and click **Save**. It is stored in `data/capsolver-settings.json` (gitignored).

2. **Optional: route CapSolver API traffic through an HTTPS proxy** (e.g. if your network blocks direct access):

   - Set environment variable `CAPSOLVER_HTTPS_PROXY` to a full proxy URL, **or**
   - Copy `data/capsolver-proxy-config.example.json` to `data/capsolver-proxy-config.json`, set `capsolverProxy.enabled` to `true`, and fill `server`, `username`, and `password`.

3. Supported task types follow CapSolver’s API (e.g. reCAPTCHA v2) as implemented in `capsolver-service.js`.

## Usage

1. **Add Accounts**: Accounts page — add credentials (stored locally in `data/accounts.json`).
2. **Configure Proxies**: Proxies page — at least as many proxies as accounts for the current automation rules.
3. **CapSolver key**: CapSolver page — save your API key (stored in `data/capsolver-settings.json`).
4. **Select Service**: Dashboard — service type.
5. **CAPTCHA method**: Dashboard — CapSolver or Buster (CapSolver requires a saved key).
6. **Start Automation**: Dashboard — Start.

## Security Notes

- Context isolation is enabled; Node integration is disabled in the renderer; IPC goes through `preload.js`.
- `data/accounts.json`, `data/proxies.json`, `data/capsolver-settings.json`, `data/capsolver-proxy-config.json`, and other local secret files are listed in `.gitignore`. Do not commit real credentials. If credentials were ever committed, **rotate them** at the source (email, proxy provider, CapSolver).
- `package.json` includes an `overrides` block for transitive dependencies; revisit after major `npm` upgrades if installs behave unexpectedly.

## Requirements

- Node.js 18+ (recommended for current Electron)
- Windows, macOS, or Linux
- Network access for proxies and CapSolver as configured

## License

MIT
