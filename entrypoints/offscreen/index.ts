
// Send current theme to background
function updateTheme() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  browser.runtime.sendMessage({
    type: 'update-icon',
    theme: isDark ? 'dark' : 'light',
  });
}

// Initial check
updateTheme();

// Listen for changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme);
