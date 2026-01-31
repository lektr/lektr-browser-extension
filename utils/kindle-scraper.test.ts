import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KindleScraper } from '../lib/kindle-scraper';
import { storage } from 'wxt/storage';

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Mock storage methods since we are using the alias file which provides default impl
vi.spyOn(storage, 'getItem');

describe('KindleScraper', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Polyfill global storage for auto-import support
    (global as any).storage = storage;
  });

  it('should use default domain if not set', async () => {
    (storage.getItem as any).mockResolvedValue(null);
    const domain = await KindleScraper.getPreferredDomain();
    expect(domain).toBe('read.amazon.com');
  });

  it('should use stored domain', async () => {
    (storage.getItem as any).mockResolvedValue('read.amazon.co.uk');
    const domain = await KindleScraper.getPreferredDomain();
    expect(domain).toBe('read.amazon.co.uk');
  });

  it('checkLoginStatus should return false on redirect to signin', async () => {
    (storage.getItem as any).mockResolvedValue('read.amazon.com');
    fetchMock.mockResolvedValue({
      ok: true, // 200 OK from fetch perspective
      redirected: true,
      url: 'https://www.amazon.com/ap/signin?Result=...',
    });

    const isLoggedIn = await KindleScraper.checkLoginStatus();
    expect(isLoggedIn).toBe(false);
  });

  it('checkLoginStatus should return true on success', async () => {
    (storage.getItem as any).mockResolvedValue('read.amazon.com');
    fetchMock.mockResolvedValue({
      ok: true,
      redirected: false,
      url: 'https://read.amazon.com/notebook',
    });

    const isLoggedIn = await KindleScraper.checkLoginStatus();
    expect(isLoggedIn).toBe(true);
  });
});
