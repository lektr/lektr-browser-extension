import { KindleScraper, type KindleBook } from '@/lib/kindle-scraper';
import { getApiEndpoint } from '@/lib/api';

interface SyncResult {
  success: boolean;
  booksProcessed: number;
  highlightsImported: number;
  error?: string;
}

async function submitHighlightsToLektr(books: KindleBook[]): Promise<SyncResult> {
  const baseUrl = await getApiEndpoint();
  let highlightsImported = 0;
  let booksProcessed = 0;

  for (const book of books) {
    if (book.highlights.length === 0) continue;

    try {
      // Use the dedicated /kindle endpoint with batch format (one request per book)
      const response = await fetch(`${baseUrl}/api/v1/import/kindle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          books: [{
            title: book.title,
            author: book.author,
            highlights: book.highlights.map(h => ({
              content: h.content,
              note: h.note,
              location: h.location,
              color: h.color,
            })),
          }],
        }),
      });

      if (response.ok) {
        const result = await response.json();
        highlightsImported += result.highlightsImported || 0;
        booksProcessed++;
        console.log(`[Background] Book "${book.title}": ${result.highlightsImported} imported, ${result.highlightsSkipped} skipped`);
      } else {
        const error = await response.json();
        console.warn(`[Background] Failed to import book "${book.title}": ${error.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(`[Background] Error importing book "${book.title}":`, err);
    }
  }

  return {
    success: true,
    booksProcessed,
    highlightsImported,
  };
}

/**
 * Wait for a tab to finish loading and for content script to inject.
 */
async function waitForTabLoad(tabId: number): Promise<void> {
  console.log(`[Background] Waiting for tab ${tabId} to load...`);

  // Wait for tab status to be 'complete'
  await new Promise<void>((resolve) => {
    const checkTabLoaded = async () => {
      try {
        const tab = await browser.tabs.get(tabId);
        console.log(`[Background] Tab ${tabId} status: ${tab.status}`);
        if (tab.status === 'complete') {
          resolve();
        } else {
          setTimeout(checkTabLoaded, 200);
        }
      } catch {
        resolve(); // Tab might have been closed
      }
    };
    // Start checking immediately
    checkTabLoaded();
  });

  console.log(`[Background] Tab ${tabId} loaded, brief wait for content script...`);

  // Brief delay for content script to inject - reduced for faster start
  await new Promise(r => setTimeout(r, 500));

  console.log(`[Background] Content script should be ready now`);
}

/**
 * Try to sync via content script (full library via DOM clicking).
 * If no Kindle notebook tab is open, automatically creates one.
 * Always refreshes the tab to ensure clean state.
 */
async function syncViaContentScript(): Promise<{ books: KindleBook[]; cancelled: boolean } | null> {
  console.log('[Background] Attempting content script sync...');

  try {
    // Find Kindle notebook tabs
    let tabs = await browser.tabs.query({
      url: ['*://read.amazon.com/notebook*', '*://read.amazon.co.uk/notebook*'],
    });

    // If no tab found, create one
    if (tabs.length === 0) {
      console.log('[Background] No Kindle notebook tab found, opening one...');

      // Save the currently active tab so we can switch back
      const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });

      // Create the tab as ACTIVE initially - Chrome doesn't fully initialize background tabs
      const newTab = await browser.tabs.create({
        url: 'https://read.amazon.com/notebook',
        active: true, // Must be active for Chrome to fully initialize JavaScript
      });

      // Wait for the tab to finish loading
      await waitForTabLoad(newTab.id!);

      // Brief delay to ensure content script is fully initialized
      await new Promise(r => setTimeout(r, 500));

      // Switch focus back to the original tab (if we had one)
      if (currentTab?.id) {
        await browser.tabs.update(currentTab.id, { active: true });
        console.log('[Background] Switched focus back to original tab');
      }

      // Re-query for tabs
      tabs = await browser.tabs.query({
        url: ['*://read.amazon.com/notebook*', '*://read.amazon.co.uk/notebook*'],
      });

      console.log('[Background] Created new tab, found', tabs.length, 'tabs now');
    } else {
      // Refresh existing tab to ensure clean state (starts from first book)
      console.log('[Background] Refreshing existing Kindle tab to ensure clean state...');
      const tabId = tabs[0].id;
      if (tabId) {
        await browser.tabs.reload(tabId);
        await waitForTabLoad(tabId);
        console.log('[Background] Tab refreshed');
      }
    }

    if (tabs.length === 0) {
      console.log('[Background] Still no Kindle notebook tab found');
      return null;
    }

    // Log all found tabs for debugging
    console.log('[Background] Found', tabs.length, 'Kindle notebook tabs:');
    tabs.forEach((t, i) => {
      console.log(`  Tab ${i}: id=${t.id}, url=${t.url}, active=${t.active}`);
    });

    // Try each tab until one responds
    for (const tab of tabs) {
      const tabId = tab.id;
      if (!tabId) continue;

      try {
        console.log(`[Background] Sending message to tab ${tabId}...`);
        const response = await browser.tabs.sendMessage(tabId, { type: 'SYNC_ALL_BOOKS' });

        if (response?.success && response.books) {
          console.log(`[Background] Content script returned ${response.books.length} books from tab ${tabId}`);
          const cancelled = response.error?.includes('cancelled') || false;
          return { books: response.books as KindleBook[], cancelled };
        } else if (response?.error) {
          console.warn('[Background] Content script error from tab', tabId, ':', response.error);
        }
      } catch (tabErr) {
        console.log(`[Background] Tab ${tabId} not responding:`, tabErr);
        // Continue to next tab
      }
    }

    console.log('[Background] No tabs responded with content script');
    return null;
  } catch (err) {
    console.log('[Background] Content script sync not available:', err);
    return null;
  }
}

async function syncKindleLibrary(useContentScript: boolean = true): Promise<SyncResult> {
  console.log(`[Background] Starting Kindle library sync (useContentScript=${useContentScript})...`);

  // Set sync state to true
  await browser.storage.local.set({ isSyncing: true, syncStartTime: Date.now() });

  try {
    let books: KindleBook[] = [];
    let wasCancelled = false;

    if (useContentScript) {
      // Strategy 1: Use tab-based DOM clicking (content script) - this can scroll and trigger lazy loading
      // Used for manual sync when user clicks the button
      console.log('[Background] Using content script sync (can scroll to load all books)...');
      const contentScriptResult = await syncViaContentScript();

      if (contentScriptResult) {
        if (contentScriptResult.cancelled) {
          // Sync was stopped by user - don't submit to API
          console.log('[Background] Sync was cancelled by user');
          wasCancelled = true;
          books = contentScriptResult.books; // Keep for logging but don't submit
        } else if (contentScriptResult.books.length > 0) {
          console.log(`[Background] Content script sync succeeded! Got ${contentScriptResult.books.length} books`);
          books = contentScriptResult.books;
        }
      }

      // Fall back to fetch if content script didn't work
      if (books.length === 0 && !wasCancelled) {
        console.log('[Background] Content script failed, falling back to fetch approach...');
        try {
          books = await KindleScraper.scrapeAllBooksViaFetch();
          const totalHighlights = books.reduce((sum, b) => sum + b.highlights.length, 0);
          if (books.length > 0 && totalHighlights > 0) {
            console.log(`[Background] Fetch fallback succeeded! Got ${books.length} books with ${totalHighlights} highlights`);
          } else {
            books = [];
          }
        } catch (fetchErr: any) {
          console.log('[Background] Fetch approach also failed:', fetchErr.message);
        }
      }
    } else {
      // Strategy 2: Fetch-only approach - quick background sync
      // Used for auto-sync (alarm-triggered) - doesn't open a tab
      console.log('[Background] Using fetch-only sync (quick background check)...');
      try {
        books = await KindleScraper.scrapeAllBooksViaFetch();
        const totalHighlights = books.reduce((sum, b) => sum + b.highlights.length, 0);
        if (books.length > 0 && totalHighlights > 0) {
          console.log(`[Background] Fetch sync succeeded! Got ${books.length} books with ${totalHighlights} highlights`);
        } else {
          books = [];
        }
      } catch (fetchErr: any) {
        console.log('[Background] Fetch sync failed:', fetchErr.message);
      }
    }

    // Strategy 3: Last resort - legacy single-book fetch (only if manual sync)
    if (books.length === 0 && !wasCancelled && useContentScript) {
      console.log('[Background] Trying legacy single-book fetch...');
      books = await KindleScraper.scrapeHighlights();
    }

    // If sync was cancelled, don't submit to API and close the tab
    if (wasCancelled) {
      await browser.storage.local.set({ isSyncing: false, syncStartTime: null });

      // Close Kindle notebook tabs
      const tabs = await browser.tabs.query({
        url: ['*://read.amazon.com/notebook*', '*://read.amazon.co.uk/notebook*'],
      });
      for (const tab of tabs) {
        if (tab.id) {
          await browser.tabs.remove(tab.id);
        }
      }

      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icon/128.png',
        title: 'Lektr Sync',
        message: 'Sync was stopped.',
        priority: 1,
      });

      return { success: false, booksProcessed: 0, highlightsImported: 0, error: 'Sync cancelled' };
    }

    console.log(`[Background] Scraped ${books.length} books total`);

    if (books.length === 0) {
      await browser.storage.local.set({
        isSyncing: false,
        syncStartTime: null,
        lastSyncTime: new Date().toISOString()
      });
      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icon/128.png',
        title: 'Lektr Sync',
        message: 'No highlights found in your Kindle library.',
        priority: 1,
      });
      return { success: true, booksProcessed: 0, highlightsImported: 0 };
    }

    // Submit to Lektr API
    const result = await submitHighlightsToLektr(books);

    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon/128.png',
      title: 'Lektr Sync Complete',
      message: `Imported ${result.highlightsImported} highlights from ${result.booksProcessed} books.`,
      priority: 1,
    });

    // Clear sync state and save last sync time
    await browser.storage.local.set({
      isSyncing: false,
      syncStartTime: null,
      lastSyncTime: new Date().toISOString()
    });

    console.log('[Background] Sync complete:', result);
    return result;

  } catch (error: any) {
    console.error('[Background] Sync failed:', error);

    // Clear sync state on error
    await browser.storage.local.set({ isSyncing: false, syncStartTime: null });

    if (error.message === 'LOGIN_REQUIRED') {
      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icon/128.png',
        title: 'Lektr Sync',
        message: 'Please log in to Kindle to sync your highlights.',
        priority: 2,
      });
      return { success: false, booksProcessed: 0, highlightsImported: 0, error: 'LOGIN_REQUIRED' };
    }

    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon/128.png',
      title: 'Lektr Sync Failed',
      message: error.message || 'An error occurred during sync.',
      priority: 2,
    });

    return { success: false, booksProcessed: 0, highlightsImported: 0, error: error.message };
  }
}

export default defineBackground(() => {
  // Listen for messages from the offscreen document
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'update-icon' && message.theme) {
      const folder = message.theme === 'dark' ? 'icon-dark' : 'icon-light';
      browser.action.setIcon({
        path: {
          16: `/${folder}/16.png`,
          32: `/${folder}/32.png`,
          48: `/${folder}/48.png`,
          96: `/${folder}/96.png`,
          128: `/${folder}/128.png`,
        },
      });
    }
  });
  // Helper to update or clear the sync alarm
  const updateSyncAlarm = async (intervalMinutes: number) => {
    // Clear existing alarm first
    await browser.alarms.clear('kindleSync');

    if (intervalMinutes > 0) {
      console.log(`[Background] Setting auto-sync alarm for every ${intervalMinutes} minutes`);
      browser.alarms.create('kindleSync', { periodInMinutes: intervalMinutes });
    } else {
      console.log('[Background] Auto-sync disabled');
    }
  };

  // Set up periodic sync alarm on install using saved settings
  browser.runtime.onInstalled.addListener(async () => {
    const result = await storage.getItem<string>('local:autoSyncInterval');
    const interval = result ? parseInt(result, 10) : 0;
    await updateSyncAlarm(interval);
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'kindleSync') {
      console.log('[Background] Auto-sync triggered by alarm');
      syncKindleLibrary(false); // Auto-sync uses fetch-only (quick, no tab)
    }
  });

  // Listen for messages from popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SYNC_NOW') {
      syncKindleLibrary(true).then((res) => sendResponse(res)); // Manual sync uses content script (thorough)
      return true; // async response
    }

    if (message.type === 'STOP_SYNC') {
      console.log('[Background] Stop sync requested');
      // Forward stop message to content script
      browser.tabs.query({
        url: ['*://read.amazon.com/notebook*', '*://read.amazon.co.uk/notebook*'],
      }).then(tabs => {
        tabs.forEach(tab => {
          if (tab.id) {
            browser.tabs.sendMessage(tab.id, { type: 'STOP_SYNC' });
          }
        });
      });
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'UPDATE_AUTO_SYNC') {
      console.log('[Background] Updating auto-sync interval to', message.interval, 'minutes');
      updateSyncAlarm(message.interval).then(() => sendResponse({ success: true }));
      return true;
    }

    // Handler for website integration - returns extension status
    if (message.type === 'GET_EXTENSION_STATUS') {
      (async () => {
        try {
          const amazonLoggedIn = await KindleScraper.checkLoginStatus();
          const storageData = await browser.storage.local.get(['isSyncing', 'lastSyncTime']);
          const autoSyncInterval = await storage.getItem<string>('local:autoSyncInterval');

          sendResponse({
            installed: true,
            version: browser.runtime.getManifest().version,
            amazonLoggedIn,
            isSyncing: storageData.isSyncing || false,
            lastSyncTime: storageData.lastSyncTime || null,
            autoSyncInterval: autoSyncInterval ? parseInt(autoSyncInterval, 10) : 0,
          });
        } catch (error) {
          console.error('[Background] Error getting status:', error);
          sendResponse({
            installed: true,
            version: browser.runtime.getManifest().version,
            error: 'Failed to get Amazon status',
          });
        }
      })();
      return true;
    }

    // Handler for saving web highlights from content script
    if (message.type === 'SAVE_WEB_HIGHLIGHT') {
      (async () => {
        try {
          const { text, note, title, author, url, faviconUrl } = message.data;
          console.log('[Background] Saving web highlight:', { text: text.substring(0, 50), title, faviconUrl });

          const baseUrl = await getApiEndpoint();
          const response = await fetch(`${baseUrl}/api/v1/import/manual`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              title: title || 'Web Highlight',
              author: author ?? 'Unknown',
              content: text,
              note: note || undefined,
              sourceUrl: url,
              coverImageUrl: faviconUrl || undefined,
              source: 'web',
            }),
          });

          if (response.ok) {
            const result = await response.json();
            console.log('[Background] Highlight saved:', result);
            sendResponse({ success: true, bookId: result.bookId });
          } else {
            const error = await response.json();
            console.error('[Background] Failed to save highlight:', error);
            sendResponse({ success: false, error: error.error || 'Failed to save' });
          }
        } catch (error) {
          console.error('[Background] Error saving web highlight:', error);
          sendResponse({ success: false, error: 'Network error' });
        }
      })();
      return true;
    }
  });

  console.log('[Background] Background script loaded');
});
