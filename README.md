# Lektr Browser Extension

A modern, cross-browser extension to capture web highlights and sync Kindle highlights to [Lektr](https://github.com/lektr/lektr).

Built with **WXT** (Vite-based framework), **React 19**, and **Tailwind CSS 4.0**.

## Features

### 🖍️ Web Highlighter ("Ghost Toolbar")

- Select any text on a webpage to reveal a floating toolbar
- Capture highlights and notes directly to your Lektr library
- Shadow DOM isolated UI prevents style conflicts with host pages
- Toggleable between floating toolbar and context menu (coming soon)

### 📚 Kindle Sync

- Automatic background sync every 24 hours via Service Worker
- Manual sync button in the extension popup
- Supports international Amazon domains:
  - `read.amazon.com` (US)
  - `read.amazon.co.uk` (UK)
  - `read.amazon.de` (Germany)
  - `read.amazon.co.jp` (Japan)
  - `read.amazon.in` (India)
  - And more...
- Smart login detection with user notifications

### 🔗 Robust Text Anchoring

- Stores prefix/suffix context around highlights
- Enables re-highlighting even when page content changes

## Development

### Prerequisites

- Node.js 18+
- npm or bun

### Setup

```bash
cd lektr-extension
npm install
```

### Development Mode

```bash
npm run dev
```

This starts WXT in development mode with hot reload. Load the extension from `.output/chrome-mv3-dev`.

### Production Build

```bash
npm run build
```

Output is generated in `.output/chrome-mv3`.

### Testing

```bash
npx vitest run
```

## Installation (Development)

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3` folder

## Project Structure

```text
lektr-extension/
├── entrypoints/
│   ├── background.ts       # Service worker (sync, alarms)
│   ├── content/            # Content scripts
│   │   └── index.tsx       # Ghost Toolbar + highlighting
│   └── popup/              # Extension popup UI
├── components/             # Shared React components
├── lib/                    # Utilities (scraper, helpers)
├── utils/                  # Sync logic, mocks for tests
├── assets/
│   └── styles.css          # Tailwind entry point
├── wxt.config.ts           # WXT configuration
└── vitest.config.ts        # Test configuration
```

## Configuration

### Amazon Domain

Set your preferred Amazon domain in the extension popup. This is stored locally and used for Kindle sync.

### Permissions

The extension requests:

- `storage` — Persist settings and highlight cache
- `alarms` — Schedule periodic sync
- `notifications` — Alert when login is required

## Cross-Browser Support

WXT provides built-in support for multiple browsers:

```bash
# Firefox
npm run build -- --browser firefox

# Safari (requires additional setup)
npm run build -- --browser safari
```

## Roadmap

- [ ] Full API integration with Lektr backend
- [ ] "Limit Reached" detection and partial highlight saving
- [ ] Context menu toggle setting
- [ ] Firefox Add-on & Safari Extension publishing
- [ ] E2E tests with Playwright
- [ ] Implement context menu toggle

## Contributing

We welcome contributions! Please see [CONTRIBUTORS.md](CONTRIBUTORS.md) for guidelines on how to get started.

Apache 2.0 — See [LICENSE](../LICENSE) for details.
