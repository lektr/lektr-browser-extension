/**
 * Content script that runs on the Lektr website to expose extension status.
 * This script runs in the MAIN world (page context) so it can set window properties
 * visible to the page.
 * 
 * Note: In MAIN world, we cannot access browser.* APIs directly.
 * We use a companion ISOLATED world script to handle messaging.
 */

// Declare the window property type
declare global {
  interface Window {
    __LEKTR_EXTENSION__?: {
      installed: boolean;
      version: string;
    };
  }
}

export default defineContentScript({
  matches: ['*://localhost/*', '*://lektr.io/*', '*://*.lektr.io/*'],
  runAt: 'document_start',
  world: 'MAIN', // Run in page context to set window properties
  
  main() {
    // In MAIN world, we're in the page's JavaScript context
    // We can directly set window properties!
    
    if (window.__LEKTR_EXTENSION__) {
      console.log('[Lektr Extension] Already initialized');
      return;
    }
    
    Object.defineProperty(window, '__LEKTR_EXTENSION__', {
      value: {
        installed: true,
        version: '1.0.0', // We can't access browser.runtime in MAIN world
      },
      writable: false,
      configurable: false,
    });
    
    console.log('[Lektr Extension] Detected on Lektr website');
    
    // Dispatch ready event
    window.dispatchEvent(new CustomEvent('lektr-extension-ready', {
      detail: { installed: true, version: '1.0.0' }
    }));
  }
});
