import ReactDOM from 'react-dom/client';
import { GhostToolbar } from '@/components/GhostToolbar';
import '@/assets/styles.css'; // Import for side-effects to ensure tailwind generates classes

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    let ui: any = null;
    let currentSelection: { text: string; range: Range } | null = null;

    const removeUi = () => {
      if (ui) {
        ui.remove();
        ui = null;
      }
    };

    const saveHighlight = async (text: string, note?: string) => {
      try {
        // Get the page metadata
        const hostname = window.location.hostname.replace(/^www\./, '');
        const title = hostname;
        const url = window.location.href;
        const author = ""; // User requested empty author for web highlights
        
        // Use Google's favicon service for reliable favicon fetching (128px for good quality)
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
        
        console.log('[Lektr] Saving highlight:', { text, title, url, faviconUrl });
        
        // Send to background script to save
        const response = await browser.runtime.sendMessage({
          type: 'SAVE_WEB_HIGHLIGHT',
          data: {
            text,
            note,
            title,
            author,
            url,
            faviconUrl,
          }
        });
        
        if (response?.success) {
          console.log('[Lektr] Highlight saved successfully');
        } else {
          console.error('[Lektr] Failed to save highlight:', response?.error);
        }
      } catch (error) {
        console.error('[Lektr] Error saving highlight:', error);
      }
    };

    const handleSelection = async () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) {
        removeUi();
        currentSelection = null;
        return;
      }

      const text = selection.toString().trim();
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // Use viewport coordinates for fixed positioning (no scrollY needed)
      const position = {
        x: rect.left + rect.width / 2,
        y: rect.top, // viewport coordinates for fixed position
      };

      currentSelection = { text, range };

      // Remove existing UI before creating new one
      if (ui) {
        removeUi(); 
      }

      ui = await createShadowRootUi(ctx, {
        name: 'lektr-toolbar',
        position: 'inline',
        anchor: 'body',
        mode: 'open',
        append: 'last',
        onMount: (uiContainer) => {
          const root = ReactDOM.createRoot(uiContainer);
          
          root.render(
            <GhostToolbar 
              position={position}
              onHighlight={() => {
                if (currentSelection) {
                  saveHighlight(currentSelection.text);
                }
                removeUi();
                window.getSelection()?.removeAllRanges();
              }}
              onNote={() => {
                if (currentSelection) {
                  // For now, just save without a note
                  // TODO: Add note input UI
                  const note = prompt('Add a note (optional):');
                  saveHighlight(currentSelection.text, note || undefined);
                }
                removeUi();
                window.getSelection()?.removeAllRanges();
              }}
              onClose={() => {
                removeUi();
                window.getSelection()?.removeAllRanges();
              }}
            />
          );
          return root;
        },
        onRemove: (root) => {
          root?.unmount();
        },
      });

      ui.mount();
    };

    // Track position and update on scroll instead of removing
    const updatePosition = () => {
      if (!ui || !currentSelection) return;
      
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        removeUi();
        return;
      }
      
      // If selection changed, remove the UI
      if (selection.toString().trim() !== currentSelection.text) {
        removeUi();
        return;
      }
      
      // Re-render with updated position
      handleSelection();
    };

    // Debounce selection change
    let timeout: Timer;
    document.addEventListener('selectionchange', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        handleSelection();
      }, 200);
    });
    
    // Update position on scroll (debounced)
    let scrollTimeout: Timer;
    document.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updatePosition, 50);
    }, true);
    
    // Remove on window resize
    window.addEventListener('resize', removeUi);
  },
});
