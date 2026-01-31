/**
 * Companion content script for lektr.content.ts
 * This script runs in the ISOLATED world to handle browser.* API calls
 * and communicates with the MAIN world script via CustomEvents.
 */

export default defineContentScript({
  matches: ['*://localhost/*', '*://lektr.io/*', '*://*.lektr.io/*'],
  runAt: 'document_start',
  // Default world is ISOLATED - we have access to browser.* APIs
  
  main() {
    console.log('[Lektr Extension Bridge] Starting...');
    
    // Listen for status check requests from the website
    window.addEventListener('lektr-check-status', async () => {
      console.log('[Lektr Extension Bridge] Status check requested');
      
      try {
        const response = await browser.runtime.sendMessage({ type: 'GET_EXTENSION_STATUS' });
        console.log('[Lektr Extension Bridge] Got status:', response);
        
        window.dispatchEvent(new CustomEvent('lektr-status-response', {
          detail: response
        }));
      } catch (error) {
        console.error('[Lektr Extension Bridge] Error getting status:', error);
        const version = browser.runtime.getManifest().version;
        window.dispatchEvent(new CustomEvent('lektr-status-response', {
          detail: { error: 'Failed to get status', installed: true, version }
        }));
      }
    });
    
    // Listen for sync trigger requests from the website
    window.addEventListener('lektr-trigger-sync', async () => {
      console.log('[Lektr Extension Bridge] Sync triggered');
      
      try {
        const response = await browser.runtime.sendMessage({ type: 'SYNC_NOW' });
        window.dispatchEvent(new CustomEvent('lektr-sync-response', {
          detail: response
        }));
      } catch (error) {
        console.error('[Lektr Extension Bridge] Error triggering sync:', error);
        window.dispatchEvent(new CustomEvent('lektr-sync-response', {
          detail: { error: 'Failed to trigger sync' }
        }));
      }
    });
    
    console.log('[Lektr Extension Bridge] Event listeners attached');
  }
});
