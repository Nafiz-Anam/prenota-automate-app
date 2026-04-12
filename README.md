# Prenotafacile Automation - JavaScript Version

A modern Electron + Puppeteer application for automating appointments on the Italian police website (prenotafacile.poliziadistato.it).

## Features

- **Modern UI/UX**: Clean, responsive interface built with Electron
- **Multi-account Management**: Add, edit, and delete user accounts
- **Proxy Management**: Configure and manage multiple proxy servers
- **Browser Automation**: Automated browser instances with Puppeteer
- **Service Selection**: Choose from different permit services
- **Scheduling**: Instant start or scheduled execution
- **Captcha Handling**: Support for CapSolver and Buster
- **Real-time Status**: Live monitoring of automation status

## Installation

1. Install dependencies:
```bash
npm install
```

2. Run the application:
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

## Project Structure

```
js-version/
  src/
    main/                 # Electron main process
      main.js            # Main application entry point
      preload.js         # Preload script for security
      browser-automation.js # Puppeteer automation logic
    renderer/            # Frontend (renderer process)
      index.html         # Main UI
      styles.css         # Modern CSS styling
      renderer.js        # Frontend JavaScript
  data/                  # Data storage
    accounts.json        # User accounts
    proxies.json         # Proxy configurations
  assets/               # Static assets
  package.json          # Dependencies and scripts
```

## Usage

1. **Add Accounts**: Navigate to Accounts page and add your credentials
2. **Configure Proxies**: Add proxy servers in the Proxies page
3. **Select Service**: Choose the service type on Dashboard
4. **Configure Schedule**: Set instant start or schedule time
5. **Start Automation**: Click "Start Automation" to begin

## Security Features

- Context isolation enabled
- Node integration disabled in renderer
- Secure preload script for IPC communication
- Password masking in UI

## Requirements

- Node.js 16+
- Windows, macOS, or Linux
- Internet connection for proxy services

## License

MIT
