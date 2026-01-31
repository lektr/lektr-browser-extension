import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    permissions: ['storage', 'alarms', 'notifications', 'offscreen'],
    host_permissions: [
      // Lektr API - localhost and any custom domain
      'http://localhost:*/*',
      'http://127.0.0.1:*/*',
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
    ]
  }
});
