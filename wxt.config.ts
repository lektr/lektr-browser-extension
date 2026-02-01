import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Lektr',
    description: 'Capture web highlights and sync Amazon Kindle highlights to your self-hosted Lektr instance',
    // author: { email: "[EMAIL_ADDRESS]" },
    version: '0.1.0',

    permissions: ['storage', 'alarms', 'notifications', 'offscreen'],
    host_permissions: [
      // Lektr API & Any Webpage (for highlighting)
      'http://*/*',
      'https://*/*',
      // Amazon Kindle domains
      '*://read.amazon.com/*',
      '*://read.amazon.co.uk/*',
      '*://read.amazon.de/*',
      '*://read.amazon.co.jp/*',
      '*://read.amazon.ca/*',
      '*://read.amazon.com.au/*',
      '*://read.amazon.in/*',
      '*://read.amazon.br/*'
    ],
    icons: {
      '16': '/icon-light/16.png',
      '32': '/icon-light/32.png',
      '48': '/icon-light/48.png',
      '96': '/icon-light/96.png',
      '128': '/icon-light/128.png'
    },
    action: {
      default_icon: {
        '16': '/icon-light/16.png',
        '32': '/icon-light/32.png',
        '48': '/icon-light/48.png',
        '96': '/icon-light/96.png',
        '128': '/icon-light/128.png'
      }
    }
  }
});
