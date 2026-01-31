/**
 * Content script for Kindle Notebook page.
 * Handles DOM-based extraction of all books and highlights.
 */

// Cancellation flag
let cancelSync = false;

export default defineContentScript({
  matches: ['*://read.amazon.com/notebook*', '*://read.amazon.co.uk/notebook*'],
  
  async main() {
    console.log('[Lektr Kindle] Content script loaded on notebook page');
    
    // Listen for sync requests from background
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      console.log('[Lektr Kindle] Received message:', message.type);
      
      if (message.type === 'SYNC_ALL_BOOKS') {
        console.log('[Lektr Kindle] Starting full library sync...');
        cancelSync = false; // Reset cancel flag
        
        // Wrap in try-catch to ensure we always respond
        syncAllBooks()
          .then(result => {
            console.log('[Lektr Kindle] Sync complete, sending response:', result);
            sendResponse(result);
          })
          .catch(err => {
            console.error('[Lektr Kindle] Sync error:', err);
            sendResponse({ success: false, books: [], error: err.message });
          });
        
        return true; // Async response
      }
      
      if (message.type === 'STOP_SYNC') {
        console.log('[Lektr Kindle] Sync cancelled by user');
        cancelSync = true;
        sendResponse({ success: true });
        return true;
      }
      
      // Unknown message type
      console.log('[Lektr Kindle] Unknown message type:', message.type);
    });
  },
});

interface KindleHighlight {
  content: string;
  note: string | null;
  location: string | null;
  color: string | null;
}

interface KindleBook {
  asin: string;
  title: string;
  author: string | null;
  highlights: KindleHighlight[];
}

/**
 * Scroll the sidebar to load all books (Amazon uses lazy loading).
 * Note: #kp-notebook-library is NOT scrollable - must target parent .a-scroller element.
 */
/**
 * Scroll the sidebar to load all books (Amazon uses lazy loading).
 * Note: #kp-notebook-library is NOT scrollable - must target parent .a-scroller element.
 */
async function scrollSidebarToLoadAllBooks(): Promise<void> {
  // Find the actual scrollable container (parent of #kp-notebook-library)
  const sidebar = document.querySelector('#kp-notebook-library');
  const scrollContainer = sidebar?.closest('.a-scroller') || document.querySelector('.kp-notebook-scroller-addon');
  
  if (!scrollContainer) {
    console.log('[Lektr Kindle] Scroll container not found, checking for all books anyway...');
    console.log('[Lektr Kindle] DEBUG: sidebar found:', !!sidebar);
    console.log('[Lektr Kindle] DEBUG: .a-scroller found:', !!document.querySelector('.a-scroller'));
    console.log('[Lektr Kindle] DEBUG: .kp-notebook-scroller-addon found:', !!document.querySelector('.kp-notebook-scroller-addon'));
    return;
  }
  
  // Debug: Log scroll container details
  console.log('[Lektr Kindle] Found scroll container:', scrollContainer.className);
  console.log('[Lektr Kindle] scrollHeight:', scrollContainer.scrollHeight, 'clientHeight:', scrollContainer.clientHeight);
  console.log('[Lektr Kindle] Scrolling sidebar to load all books...');
  
  let previousBookCount = 0;
  let sameCountIterations = 0;
  const maxIterations = 100; // Increased safety limit
  
  for (let i = 0; i < maxIterations; i++) {
    const currentBookCount = document.querySelectorAll('.kp-notebook-library-each-book').length;
    
    if (currentBookCount === previousBookCount && currentBookCount > 0) {
      sameCountIterations++;
      // If count hasn't changed after several scrolls, assume we've loaded all books
      // If count hasn't changed after several scrolls, assume we've loaded all books
      // Threshold 2 is enough if we have robust spinner detection
      console.log(`[Lektr Kindle] Book count stable (${currentBookCount}) for ${sameCountIterations} iterations`);
      if (sameCountIterations >= 2) {
        console.log(`[Lektr Kindle] All ${currentBookCount} books loaded after ${i} scroll iterations`);
        break;
      }
    } else {
      sameCountIterations = 0;
      if (currentBookCount !== previousBookCount) {
        console.log(`[Lektr Kindle] Scroll ${i + 1}: ${previousBookCount} -> ${currentBookCount} books`);
      }
    }
    
    previousBookCount = currentBookCount;
    
    // Scroll to the bottom of the scroll container
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    
    // Sometimes setting scrollTop isn't enough, force a scroll event
    scrollContainer.dispatchEvent(new Event('scroll'));
    
    // Also try scrolling window slightly just in case
    window.scrollBy(0, 10);
    
    // Wait for potential spinner to appear
    await new Promise(r => setTimeout(r, 500));
    
    // Check if spinner is present and wait for it to disappear
    let spinnerChecks = 0;
    const spinner = document.querySelector('.a-spinner-container, .a-spinner');
    if (spinner) {
      console.log('[Lektr Kindle] Spinner detected:', spinner.className);
      // Only wait if it's likely visible/active
      while (document.querySelector('.a-spinner-container, .a-spinner') && spinnerChecks < 15) {
        if (spinnerChecks === 0) console.log('[Lektr Kindle] Waiting for spinner to disappear...');
        await new Promise(r => setTimeout(r, 200));
        spinnerChecks++;
      }
      if (spinnerChecks >= 15) console.log('[Lektr Kindle] Spinner wait timed out, continuing...');
    }
    
    // Extra wait after spinner disappears or if no spinner was found but load might be happening
    await new Promise(r => setTimeout(r, 800));
  }
  
  // Scroll back to top to ensure we start from the beginning
  scrollContainer.scrollTop = 0;
  await new Promise(r => setTimeout(r, 500));
}

/**
 * Extract all books from the sidebar.
 */
async function getBookListFromSidebar(): Promise<Array<{ asin: string; title: string; author: string | null; element: Element }>> {
  // First scroll to load all books
  await scrollSidebarToLoadAllBooks();
  
  const books: Array<{ asin: string; title: string; author: string | null; element: Element }> = [];
  
  // Find all book elements in the sidebar
  const bookElements = document.querySelectorAll('[id^="B"][id].kp-notebook-library-each-book, div.kp-notebook-library-each-book');
  
  bookElements.forEach((el) => {
    // Try to get ASIN from id attribute
    const asin = el.id || '';
    if (!asin.startsWith('B')) return; // Valid ASINs start with B
    
    // Get title from h2
    const titleEl = el.querySelector('h2');
    const title = titleEl?.textContent?.trim() || 'Unknown Title';
    
    // Get author from p
    const authorEl = el.querySelector('p');
    let author = authorEl?.textContent?.trim() || null;
    if (author?.startsWith('By:')) {
      author = author.replace(/^By:\s*/, '').trim();
    }
    
    books.push({ asin, title, author, element: el });
  });
  
  console.log(`[Lektr Kindle] Found ${books.length} books in sidebar:`);
  books.forEach((b, i) => console.log(`  ${i+1}. ${b.title} (${b.asin})`));
  return books;
}

/**
 * Extract highlights from the currently displayed book.
 */
function extractCurrentHighlights(): KindleHighlight[] {
  const highlights: KindleHighlight[] = [];
  
  // Find all highlight spans
  const highlightElements = document.querySelectorAll('span#highlight');
  
  highlightElements.forEach((el) => {
    const content = el.textContent?.trim();
    if (!content) return;
    
    // Find the parent annotation container
    // Must target .kp-notebook-row-separator because .a-row stops at the inner wrapper
    const container = el.closest('.kp-notebook-row-separator');
    
    // Get location/color from header
    // Use ID selector but scoped to this container (Amazon reuses IDs)
    const headerEl = container?.querySelector('#annotationHighlightHeader');
    const headerText = headerEl?.textContent?.trim() || '';
    
    // Debug logging for the first few highlights to verify extraction
    if (highlights.length < 3) {
      console.log(`[Lektr Kindle] Highlight ${highlights.length + 1} debug:`);
      console.log(`[Lektr Kindle]   Container found: ${!!container}`);
      console.log(`[Lektr Kindle]   Header el found: ${!!headerEl}`);
      console.log(`[Lektr Kindle]   Header text: "${headerText}"`);
    }

    // Regex: Handle standard whitespace, non-breaking space (\u00A0), and commas in numbers
    const locationMatch = headerText.match(/Location:[\s\u00A0]*([\d,]+(?:-[\d,]+)?)/i) || 
                          headerText.match(/Page:[\s\u00A0]*([\d,]+)/i);
    
    if (highlights.length < 3) {
      console.log(`[Lektr Kindle]   Location match:`, locationMatch);
      if (locationMatch) console.log(`[Lektr Kindle]   Extracted location: "${locationMatch[1]}"`);
    }

    const colorMatch = headerText.match(/^(\w+)\s+highlight/i);
    
    // Get note if present
    const noteEl = container?.querySelector('span#note');
    const note = noteEl?.textContent?.trim() || null;
    
    highlights.push({
      content,
      note,
      location: locationMatch ? locationMatch[1] : null,
      color: colorMatch ? colorMatch[1] : null,
    });
  });
  
  console.log(`[Lektr Kindle] Extracted ${highlights.length} highlights from current view`);
  return highlights;
}

/**
 * Get a signature of current highlight content for change detection.
 */
function getHighlightsSignature(): string {
  const highlights = document.querySelectorAll('span#highlight');
  if (highlights.length === 0) return '';
  // Use first highlight's text + count as signature
  const first = highlights[0]?.textContent?.trim() || '';
  return `${highlights.length}:${first.substring(0, 50)}`;
}

/**
 * Wait for highlights to change after clicking a book.
 */
/**
 * Wait for highlights to change after clicking a book.
 * Optimized for background execution: use short timeouts (200ms) to catch the earliest
 * execution slot allowed by browser throttling (min ~1000ms).
 */
function waitForHighlightsToChange(previousSignature: string, timeout = 20000): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let checks = 0;
    
    const checkForChange = () => {
      checks++;
      const currentSignature = getHighlightsSignature();
      const noHighlights = document.querySelector('.kp-notebook-annotations-no-notes');
      
      // Check if content has changed from previous or shows "no highlights"
      if (currentSignature !== previousSignature || noHighlights) {
        console.log(`[Lektr Kindle] Content changed after ${Date.now() - startTime}ms (${checks} checks): "${previousSignature.substring(0,30)}" -> "${currentSignature.substring(0,30)}"`);
        resolve(true);
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        console.log('[Lektr Kindle] Timeout waiting for content change, proceeding anyway');
        resolve(false);
        return;
      }
      
      // Poll faster so we execute as soon as browser throttle allows
      setTimeout(checkForChange, 200);
    };
    
    // Start checking immediately (short delay)
    setTimeout(checkForChange, 200);
  });
}

/**
 * Sync all books by clicking through the sidebar.
 */
async function syncAllBooks(): Promise<{ success: boolean; books: KindleBook[]; error?: string }> {
  try {
    const bookList = await getBookListFromSidebar();
    
    if (bookList.length === 0) {
      return { success: false, books: [], error: 'No books found in sidebar' };
    }
    
    const allBooks: KindleBook[] = [];
    
    for (let i = 0; i < bookList.length; i++) {
      // Check for cancellation
      if (cancelSync) {
        console.log('[Lektr Kindle] Sync cancelled, stopping at book', i + 1);
        return { success: true, books: allBooks, error: 'Sync cancelled by user' };
      }
      
      const book = bookList[i];
      console.log(`[Lektr Kindle] Processing book ${i + 1}/${bookList.length}: ${book.title}`);
      
      // Get current highlights signature before clicking
      const previousSignature = getHighlightsSignature();
      
      // Amazon uses a declarative event system - must click the <a> link inside the book element
      // NOT the outer div! The div.click() doesn't trigger the data-action handler.
      const el = book.element as HTMLElement;
      const link = el.querySelector('a');
      
      if (link) {
        // Scroll into view first (Amazon uses virtualized list)
        el.scrollIntoView({ block: 'center' });
        await new Promise(r => setTimeout(r, 100));
        
        // Click the link
        link.click();
        console.log('[Lektr Kindle] Clicked link for book:', book.title);
      } else {
        // Fallback: try the a-declarative span
        const span = el.querySelector('.a-declarative') as HTMLElement;
        if (span) {
          span.click();
          console.log('[Lektr Kindle] Clicked span for book:', book.title);
        } else {
          console.log('[Lektr Kindle] No clickable element found for book:', book.title);
          continue;
        }
      }
      
      // Wait for highlights to actually change
      // Use explicit long timeout for background execution
      let loaded = await waitForHighlightsToChange(previousSignature, 20000);
      
      // Retry logic: If timed out, try clicking ONE more time
      if (!loaded) {
        console.log(`[Lektr Kindle] Timed out waiting for book "${book.title}", retrying click...`);
        
        if (link) {
          link.click();
        } else {
           const span = el.querySelector('.a-declarative') as HTMLElement;
           if (span) span.click();
        }
        
        loaded = await waitForHighlightsToChange(previousSignature, 20000);
      }
      
      if (!loaded) {
         console.warn(`[Lektr Kindle] Failed to load book "${book.title}" even after retry, proceeding anyway...`);
      }
      
      // Additional delay to ensure DOM is fully updated
      await new Promise(r => setTimeout(r, 500));
      
      // Extract highlights
      const highlights = extractCurrentHighlights();
      
      if (highlights.length > 0) {
        allBooks.push({
          asin: book.asin,
          title: book.title,
          author: book.author,
          highlights,
        });
        console.log(`[Lektr Kindle] Book "${book.title}" has ${highlights.length} highlights:`);
        highlights.forEach((h, idx) => {
          const preview = h.content.length > 80 ? h.content.substring(0, 80) + '...' : h.content;
          console.log(`  ${idx + 1}. ${preview}`);
        });
      } else {
        console.log(`[Lektr Kindle] Book "${book.title}" has no highlights`);
      }
      
      // Delay between books to avoid overwhelming the page
      await new Promise(r => setTimeout(r, 300));
    }
    
    console.log(`[Lektr Kindle] Sync complete: ${allBooks.length} books with highlights`);
    return { success: true, books: allBooks };
    
  } catch (err: any) {
    console.error('[Lektr Kindle] Sync failed:', err);
    return { success: false, books: [], error: err.message };
  }
}
