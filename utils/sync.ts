import { KindleScraper, type KindleBook } from '@/lib/kindle-scraper';
import { getApiEndpoint } from '@/lib/api';

export interface SyncResult {
  success: boolean;
  booksProcessed: number;
  highlightsImported: number;
  error?: string;
}

export async function checkLoginAndSync(): Promise<SyncResult> {
  console.log('[Lektr Sync] Starting sync...');
  
  try {
    // Scrape highlights from Kindle
    const books = await KindleScraper.scrapeHighlights();
    console.log(`[Lektr Sync] Scraped ${books.length} books`);
    
    if (books.length === 0) {
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
    
    // Show success notification
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon/128.png',
      title: 'Lektr Sync Complete',
      message: `Imported ${result.highlightsImported} highlights from ${result.booksProcessed} books.`,
      priority: 1,
    });
    
    console.log('[Lektr Sync] Sync complete:', result);
    return result;
    
  } catch (error: any) {
    if (error.message === 'LOGIN_REQUIRED') {
      console.log('[Lektr Sync] Login required');
      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icon/128.png',
        title: 'Lektr Sync',
        message: 'Please log in to Kindle to sync your highlights.',
        priority: 2,
      });
      return { success: false, booksProcessed: 0, highlightsImported: 0, error: 'LOGIN_REQUIRED' };
    }
    
    console.error('[Lektr Sync] Sync failed', error);
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

async function submitHighlightsToLektr(books: KindleBook[]): Promise<SyncResult> {
  const baseUrl = await getApiEndpoint();
  let highlightsImported = 0;
  let booksProcessed = 0;
  
  for (const book of books) {
    if (book.highlights.length === 0) continue;
    
    try {
      // Submit each highlight using the manual import endpoint
      for (const highlight of book.highlights) {
        const response = await fetch(`${baseUrl}/api/v1/import/manual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            title: book.title,
            author: book.author,
            content: highlight.content,
            note: highlight.note,
          }),
        });
        
        if (response.ok) {
          highlightsImported++;
        } else {
          const error = await response.json();
          console.warn(`[Lektr Sync] Failed to import highlight: ${error.error || 'Unknown error'}`);
        }
      }
      
      booksProcessed++;
    } catch (err) {
      console.error(`[Lektr Sync] Error importing book "${book.title}":`, err);
    }
  }
  
  return {
    success: true,
    booksProcessed,
    highlightsImported,
  };
}

