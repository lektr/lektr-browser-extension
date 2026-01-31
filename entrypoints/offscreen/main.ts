/**
 * Offscreen document for invisible Kindle notebook scraping.
 * This runs in a hidden context with DOM access.
 */

import { KindleBook, KindleHighlight } from '@/lib/kindle-scraper';

interface SyncMessage {
  type: 'SYNC_LIBRARY';
  domain: string;
}

interface SyncResult {
  success: boolean;
  books: KindleBook[];
  error?: string;
}

// DOM-based extraction functions (full DOM access available)
async function extractHighlightsFromDOM(doc: Document): Promise<KindleHighlight[]> {
  const highlights: KindleHighlight[] = [];
  
  // Get current book info from main panel
  const titleEl = doc.getElementById('kp-notebook-annotated-book-title') 
    || doc.querySelector('h3.kp-notebook-metadata');
  const authorEl = doc.getElementById('kp-notebook-annotated-book-author')
    || doc.querySelector('p.kp-notebook-metadata');
  
  const bookTitle = titleEl?.textContent?.trim() || 'Unknown Title';
  const bookAuthor = authorEl?.textContent?.replace(/^By:\s*/i, '').trim() || null;
  
  // Get all highlight elements
  const highlightEls = doc.querySelectorAll('#highlight');
  const headerEls = doc.querySelectorAll('#annotationHighlightHeader');
  const noteEls = doc.querySelectorAll('#note');
  
  highlightEls.forEach((el, i) => {
    const content = el.textContent?.trim();
    if (!content) return;
    
    const header = headerEls[i]?.textContent?.trim() || '';
    const locationMatch = header.match(/Location:\s*(\d+)/i);
    const colorMatch = header.match(/^(\w+)\s+highlight/i);
    const note = noteEls[i]?.textContent?.trim() || null;
    
    highlights.push({
      bookTitle,
      bookAuthor,
      content,
      note,
      location: locationMatch ? locationMatch[1] : null,
      color: colorMatch ? colorMatch[1] : null,
    });
  });
  
  return highlights;
}

async function getBookListFromDOM(doc: Document): Promise<HTMLElement[]> {
  const bookElements = doc.querySelectorAll('.kp-notebook-library-each-book');
  return Array.from(bookElements) as HTMLElement[];
}

function getBookInfoFromElement(el: HTMLElement): { asin: string; title: string; author: string | null } {
  const asin = el.id || '';
  const titleEl = el.querySelector('h2');
  const authorEl = el.querySelector('p');
  
  const title = titleEl?.textContent?.trim() || 'Unknown';
  const authorText = authorEl?.textContent?.trim() || '';
  const author = authorText.replace(/^By:\s*/i, '').trim() || null;
  
  return { asin, title, author };
}

async function waitForHighlightsToLoad(doc: Document, timeout = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const highlights = doc.querySelectorAll('#highlight');
    if (highlights.length > 0) return;
    await new Promise(r => setTimeout(r, 200));
  }
}

async function syncLibraryFromPage(domain: string): Promise<SyncResult> {
  console.log('[Offscreen] Starting library sync for domain:', domain);
  
  try {
    // Fetch the notebook page HTML
    const response = await fetch(`https://${domain}/notebook`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch notebook: ${response.status}`);
    }
    
    // Check for login redirect
    if (response.redirected && response.url.includes('signin')) {
      throw new Error('LOGIN_REQUIRED');
    }
    
    const html = await response.text();
    
    // Parse HTML into a DOM document
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Get list of all books from sidebar
    const bookElements = await getBookListFromDOM(doc);
    console.log(`[Offscreen] Found ${bookElements.length} books in sidebar`);
    
    const allBooks: KindleBook[] = [];
    
    if (bookElements.length === 0) {
      // No books in sidebar, try extracting from current page
      const highlights = await extractHighlightsFromDOM(doc);
      const titleEl = doc.getElementById('kp-notebook-annotated-book-title');
      const asinInput = doc.getElementById('kp-notebook-annotations-asin') as HTMLInputElement;
      
      if (highlights.length > 0) {
        allBooks.push({
          asin: asinInput?.value || '',
          title: titleEl?.textContent?.trim() || 'Unknown Title',
          author: null,
          highlights,
        });
      }
    } else {
      // We have books in sidebar - need to fetch each book's highlights
      // Since we can't click in parsed HTML, we need to fetch each book's notebook page
      // Amazon provides per-book URLs like: /notebook?asin=B0xxxxx
      
      for (const bookEl of bookElements) {
        const bookInfo = getBookInfoFromElement(bookEl);
        console.log(`[Offscreen] Fetching highlights for: ${bookInfo.title}`);
        
        try {
          // Fetch the book's notebook page
          const bookResponse = await fetch(`https://${domain}/notebook?asin=${bookInfo.asin}`, {
            credentials: 'include',
          });
          
          if (!bookResponse.ok) continue;
          
          const bookHtml = await bookResponse.text();
          const bookDoc = parser.parseFromString(bookHtml, 'text/html');
          
          const highlights = await extractHighlightsFromDOM(bookDoc);
          
          if (highlights.length > 0) {
            allBooks.push({
              asin: bookInfo.asin,
              title: bookInfo.title,
              author: bookInfo.author,
              highlights,
            });
          }
          
          // Small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 300));
          
        } catch (err) {
          console.error(`[Offscreen] Error fetching book ${bookInfo.asin}:`, err);
        }
      }
    }
    
    console.log(`[Offscreen] Sync complete: ${allBooks.length} books, ${allBooks.reduce((n, b) => n + b.highlights.length, 0)} highlights`);
    
    return {
      success: true,
      books: allBooks,
    };
    
  } catch (error: any) {
    console.error('[Offscreen] Sync failed:', error);
    return {
      success: false,
      books: [],
      error: error.message,
    };
  }
}

// Listen for messages from background script
browser.runtime.onMessage.addListener((message: SyncMessage, sender, sendResponse) => {
  if (message.type === 'SYNC_LIBRARY') {
    syncLibraryFromPage(message.domain)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, books: [], error: err.message }));
    return true; // async response
  }
});

console.log('[Offscreen] Offscreen document ready');
