export interface KindleHighlight {
  bookTitle: string;
  bookAuthor: string | null;
  content: string;
  note: string | null;
  location: string | null;
  color: string | null;
}

export interface KindleBook {
  asin: string;
  title: string;
  author: string | null;
  highlights: KindleHighlight[];
}

export class KindleScraper {
  static async getPreferredDomain(): Promise<string> {
    const domain = await storage.getItem<string>('local:amazonDomain');
    return domain || 'read.amazon.com';
  }

  static async checkLoginStatus(): Promise<boolean> {
    const domain = await this.getPreferredDomain();
    try {
      const response = await fetch(`https://${domain}/notebook`, { 
        method: 'GET',
        credentials: 'include',
      });
      // If redirected to signin, response.url will contain 'signin'
      if (response.redirected && response.url.includes('signin')) {
        return false;
      }
      return response.ok;
    } catch (e) {
      console.error('[KindleScraper] Login check failed', e);
      return false;
    }
  }

  /**
   * MV3-Compliant: Scrape all highlights from ALL books using fetch requests.
   * Uses the discovered URL pattern: /notebook?asin={ASIN}&contentLimitState=&
   * This works entirely in the background without needing a visible tab.
   */
  static async scrapeAllBooksViaFetch(): Promise<KindleBook[]> {
    const isLoggedIn = await this.checkLoginStatus();
    if (!isLoggedIn) {
      throw new Error('LOGIN_REQUIRED');
    }

    const domain = await this.getPreferredDomain();
    
    // First, get the main notebook page to find all books
    console.log('[KindleScraper] Fetching main notebook page...');
    const mainResponse = await fetch(`https://${domain}/notebook`, {
      credentials: 'include',
    });
    const mainHtml = await mainResponse.text();
    
    console.log('[KindleScraper] Fetched main notebook, length:', mainHtml.length);
    
    // Extract book list from sidebar
    const bookList = this.extractBookList(mainHtml);
    console.log('[KindleScraper] Found', bookList.length, 'books in sidebar');
    
    if (bookList.length === 0) {
      console.log('[KindleScraper] No books found');
      return [];
    }
    
    // Fetch highlights for each book using the per-ASIN URL pattern
    const allBooks: KindleBook[] = [];
    
    for (const book of bookList) {
      console.log(`[KindleScraper] Fetching highlights for "${book.title}" (${book.asin})...`);
      
      try {
        // Use the discovered URL pattern with contentLimitState parameter
        const bookResponse = await fetch(
          `https://${domain}/notebook?asin=${book.asin}&contentLimitState=&`,
          { credentials: 'include' }
        );
        
        if (!bookResponse.ok) {
          console.warn(`[KindleScraper] Failed to fetch book ${book.asin}: ${bookResponse.status}`);
          continue;
        }
        
        const bookHtml = await bookResponse.text();
        const highlights = this.extractHighlightsFromHtml(bookHtml);
        
        if (highlights.length > 0) {
          allBooks.push({
            asin: book.asin,
            title: book.title,
            author: book.author,
            highlights,
          });
          console.log(`[KindleScraper] Book "${book.title}" has ${highlights.length} highlights`);
        } else {
          console.log(`[KindleScraper] Book "${book.title}" has no highlights`);
        }
        
        // Small delay between requests to be polite
        await new Promise(r => setTimeout(r, 200));
        
      } catch (err) {
        console.error(`[KindleScraper] Error fetching book ${book.asin}:`, err);
      }
    }
    
    console.log(`[KindleScraper] Total: ${allBooks.length} books with highlights`);
    return allBooks;
  }

  /**
   * Legacy: Scrape highlights from the currently selected book only.
   * This is the fallback method that only gets one book's highlights.
   */
  static async scrapeHighlights(): Promise<KindleBook[]> {
    const isLoggedIn = await this.checkLoginStatus();
    if (!isLoggedIn) {
      throw new Error('LOGIN_REQUIRED');
    }

    const domain = await this.getPreferredDomain();
    
    // First, get the main notebook page to find all books
    const mainResponse = await fetch(`https://${domain}/notebook`, {
      credentials: 'include',
    });
    const mainHtml = await mainResponse.text();
    
    console.log('[KindleScraper] Fetched main notebook, length:', mainHtml.length);
    
    // Extract book list from sidebar
    const bookList = this.extractBookList(mainHtml);
    console.log('[KindleScraper] Found', bookList.length, 'books in sidebar');
    
    // Amazon notebook loads highlights via JavaScript, so we can't fetch per-book pages
    // Instead, extract highlights from the main page (for the currently selected book)
    const mainHighlights = this.extractHighlightsFromHtml(mainHtml);
    console.log('[KindleScraper] Found', mainHighlights.length, 'highlights in main page');
    
    if (mainHighlights.length === 0) {
      console.log('[KindleScraper] No highlights found in main page');
      return [];
    }
    
    // Determine book title and author
    // The main panel often shows generic "Your Notes and Highlights" header
    // So we use the FIRST book from the sidebar as the selected book
    let bookTitle = 'Unknown Title';
    let bookAuthor: string | null = null;
    let bookAsin = '';
    
    if (bookList.length > 0) {
      // Use the first book from sidebar (it's the selected/default one)
      bookTitle = bookList[0].title;
      bookAuthor = bookList[0].author;
      bookAsin = bookList[0].asin;
      console.log(`[KindleScraper] Using first sidebar book: "${bookTitle}" by ${bookAuthor}`);
    } else {
      // Fallback: try to extract from main panel
      const titleMatch = mainHtml.match(/id="kp-notebook-annotated-book-title"[^>]*>([^<]+)</i);
      const authorMatch = mainHtml.match(/id="kp-notebook-annotated-book-author"[^>]*>([^<]+)</i);
      const asinMatch = mainHtml.match(/<input[^>]*id="kp-notebook-annotations-asin"[^>]*value="([^"]+)"/i);
      
      if (titleMatch && !titleMatch[1].includes('Your Notes')) {
        bookTitle = this.decodeHtmlEntities(titleMatch[1].trim());
      }
      if (authorMatch) {
        bookAuthor = this.decodeHtmlEntities(authorMatch[1].replace(/^By:\s*/i, '').trim());
      }
      if (asinMatch) {
        bookAsin = asinMatch[1];
      }
      console.log(`[KindleScraper] Extracted from main panel: "${bookTitle}" by ${bookAuthor}`);
    }
    
    return [{
      asin: bookAsin,
      title: bookTitle,
      author: bookAuthor,
      highlights: mainHighlights,
    }];
  }

  /**
   * Extract list of books from sidebar HTML.
   */
  private static extractBookList(html: string): { asin: string; title: string; author: string | null }[] {
    const books: { asin: string; title: string; author: string | null }[] = [];
    
    // Find all book divs - match divs that have both an ASIN-like id and kp-notebook-library-each-book class
    // Use a more flexible pattern that doesn't rely on attribute order
    const bookDivPattern = /<div[^>]*class="[^"]*kp-notebook-library-each-book[^"]*"[^>]*>/gi;
    
    let match;
    let lastIndex = 0;
    const bookStarts: number[] = [];
    
    // Find all book div start positions
    while ((match = bookDivPattern.exec(html)) !== null) {
      bookStarts.push(match.index);
    }
    
    console.log(`[KindleScraper] Found ${bookStarts.length} book div matches`);
    
    // Process each book section
    for (let i = 0; i < bookStarts.length; i++) {
      const startPos = bookStarts[i];
      const endPos = bookStarts[i + 1] || html.indexOf('<div id="kp-notebook-annotations"', startPos) || html.length;
      const bookHtml = html.substring(startPos, endPos);
      
      // Extract ASIN from id attribute - look for id="B..." pattern
      const asinMatch = bookHtml.match(/<div[^>]*id="(B[A-Z0-9]+)"/i);
      if (!asinMatch) {
        console.log('[KindleScraper] No ASIN found in book div');
        continue;
      }
      const asin = asinMatch[1];
      
      // Extract title from h2
      const titleMatch = bookHtml.match(/<h2[^>]*>([^<]+)<\/h2>/i);
      const title = titleMatch ? this.decodeHtmlEntities(titleMatch[1].trim()) : 'Unknown Title';
      
      // Extract author from p tag
      const authorMatch = bookHtml.match(/<p[^>]*>(?:By:\s*)?([^<]+)<\/p>/i);
      let author = authorMatch ? this.decodeHtmlEntities(authorMatch[1].trim()) : null;
      if (author?.startsWith('By:')) {
        author = author.replace(/^By:\s*/, '').trim();
      }
      
      books.push({ asin, title, author });
    }
    
    console.log(`[KindleScraper] Extracted ${books.length} books with ASINs:`);
    books.forEach((b, i) => console.log(`  ${i+1}. ${b.title} (${b.asin})`));
    return books;
  }

  /**
   * Extract highlights from a book's HTML page.
   */
  private static extractHighlightsFromHtml(html: string): KindleHighlight[] {
    const highlights: KindleHighlight[] = [];
    
    // Get book info for this page
    const titleMatch = html.match(/id="kp-notebook-annotated-book-title"[^>]*>([^<]+)</i)
      || html.match(/<h3[^>]*class="[^"]*kp-notebook-metadata[^"]*"[^>]*>([^<]+)</i);
    const bookTitle = titleMatch ? this.decodeHtmlEntities(titleMatch[1].trim()) : 'Unknown Title';
    
    const authorMatch = html.match(/id="kp-notebook-annotated-book-author"[^>]*>([^<]+)</i);
    const bookAuthor = authorMatch ? this.decodeHtmlEntities(authorMatch[1].replace(/^By:\s*/i, '').trim()) : null;
    
    // Extract all highlight texts using id="highlight"
    // Note: Amazon uses the same id multiple times (non-standard but consistent)
    const highlightPattern = /<span[^>]*id="highlight"[^>]*>([\s\S]*?)<\/span>/gi;
    const highlightTexts: string[] = [];
    let hlMatch;
    
    while ((hlMatch = highlightPattern.exec(html)) !== null) {
      const content = this.decodeHtmlEntities(hlMatch[1].trim());
      if (content && content.length > 0) {
        highlightTexts.push(content);
      }
    }
    
    // Extract location/color headers
    const headerPattern = /<span[^>]*id="annotationHighlightHeader"[^>]*>([^<]+)<\/span>/gi;
    const headers: string[] = [];
    let hdrMatch;
    while ((hdrMatch = headerPattern.exec(html)) !== null) {
      headers.push(this.decodeHtmlEntities(hdrMatch[1].trim()));
    }
    
    // Extract notes
    const notePattern = /<span[^>]*id="note"[^>]*>([\s\S]*?)<\/span>/gi;
    const notes: string[] = [];
    let noteMatch;
    while ((noteMatch = notePattern.exec(html)) !== null) {
      notes.push(this.decodeHtmlEntities(noteMatch[1].trim()));
    }
    
    // Combine into highlight objects
    for (let i = 0; i < highlightTexts.length; i++) {
      const header = headers[i] || '';
      const locationMatch = header.match(/Location:\s*(\d+(?:-\d+)?)/i);
      const colorMatch = header.match(/^(\w+)\s+highlight/i);
      
      highlights.push({
        bookTitle,
        bookAuthor,
        content: highlightTexts[i],
        note: notes[i] || null,
        location: locationMatch ? locationMatch[1] : null,
        color: colorMatch ? colorMatch[1] : null,
      });
    }
    
    return highlights;
  }

  private static decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x2F;/g, '/')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
