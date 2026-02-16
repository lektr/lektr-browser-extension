import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Server, Loader2, LogOut, AlertCircle, ExternalLink } from 'lucide-react';
import {
  checkConnectionStatus,
  login,
  logout,
  type ConnectionStatus,
  type User
} from '@/lib/api';
import { KindleScraper } from '@/lib/kindle-scraper';

type AmazonStatus = 'checking' | 'logged_in' | 'not_logged_in' | 'error';

function App() {
  const [apiEndpoint, setApiEndpoint] = useState('http://localhost:3001');
  const [amazonDomain, setAmazonDomain] = useState('read.amazon.com');

  // Auth state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [user, setUser] = useState<User | null>(null);

  // Amazon state
  const [amazonStatus, setAmazonStatus] = useState<AmazonStatus>('checking');

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState('0'); // 0 = disabled

  // Check Lektr API connection status
  const checkStatus = useCallback(async () => {
    setConnectionStatus('checking');
    const result = await checkConnectionStatus();
    setConnectionStatus(result.status);
    setUser(result.user);
  }, []);

  // Check Amazon login status
  const checkAmazonStatus = useCallback(async () => {
    setAmazonStatus('checking');
    try {
      const isLoggedIn = await KindleScraper.checkLoginStatus();
      setAmazonStatus(isLoggedIn ? 'logged_in' : 'not_logged_in');
    } catch {
      setAmazonStatus('error');
    }
  }, []);

  // Load saved settings and check status on mount
  useEffect(() => {
    storage.getItem<string>('local:apiEndpoint').then((val) => {
      if (val) setApiEndpoint(val);
    });
    storage.getItem<string>('local:amazonDomain').then((val) => {
      if (val) setAmazonDomain(val);
    });
    storage.getItem<string>('local:autoSyncInterval').then((val) => {
      if (val) setAutoSyncInterval(val);
    });

    // Check if sync is currently in progress
    browser.storage.local.get(['isSyncing']).then((result) => {
      if (result.isSyncing) {
        setIsSyncing(true);
      }
    });

    // Listen for sync state changes
    const handleStorageChange = (changes: Record<string, { newValue?: unknown }>) => {
      if ('isSyncing' in changes) {
        setIsSyncing(changes.isSyncing.newValue === true);
      }
    };
    browser.storage.local.onChanged.addListener(handleStorageChange);

    // Initial status checks
    checkStatus();
    checkAmazonStatus();

    return () => {
      browser.storage.local.onChanged.removeListener(handleStorageChange);
    };
  }, [checkStatus, checkAmazonStatus]);

  // Re-check Amazon status when domain changes
  useEffect(() => {
    checkAmazonStatus();
  }, [amazonDomain, checkAmazonStatus]);

  // Re-check status when endpoint changes
  useEffect(() => {
    const timeout = setTimeout(() => {
      checkStatus();
    }, 500); // Debounce
    return () => clearTimeout(timeout);
  }, [apiEndpoint, checkStatus]);

  const handleApiEndpointChange = (value: string) => {
    setApiEndpoint(value);
    storage.setItem('local:apiEndpoint', value);
  };

  const handleAmazonDomainChange = (value: string) => {
    setAmazonDomain(value);
    storage.setItem('local:amazonDomain', value);
  };

  const handleAutoSyncIntervalChange = (value: string) => {
    setAutoSyncInterval(value);
    storage.setItem('local:autoSyncInterval', value);
    // Notify background to update the alarm
    browser.runtime.sendMessage({ type: 'UPDATE_AUTO_SYNC', interval: parseInt(value, 10) });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const loggedInUser = await login(email, password);
      setUser(loggedInUser);
      setConnectionStatus('authenticated');
      setEmail('');
      setPassword('');
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setConnectionStatus('unauthenticated');
  };

  const handleSync = async () => {
    if (isSyncing) {
      // Stop the sync - also clear storage flag immediately for responsiveness
      browser.runtime.sendMessage({ type: 'STOP_SYNC' });
      await browser.storage.local.set({ isSyncing: false });
      return;
    }

    // Start sync - background will set isSyncing via storage
    browser.runtime.sendMessage({ type: 'SYNC_NOW' });
  };

  // Status indicator component
  const StatusIndicator = () => {
    switch (connectionStatus) {
      case 'checking':
        return (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
            <span className="text-sm text-slate-500">Checking...</span>
          </div>
        );
      case 'unreachable':
        return (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-sm text-red-600">Disconnected</span>
          </div>
        );
      case 'unauthenticated':
        return (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-sm text-yellow-600">Not logged in</span>
          </div>
        );
      case 'authenticated':
        return (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-600 truncate max-w-180px">
                {user?.email}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-1 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        );
    }
  };

  // Amazon status indicator component
  const AmazonStatusIndicator = () => {
    const openKindleNotebook = () => {
      browser.tabs.create({ url: `https://${amazonDomain}/notebook` });
    };

    switch (amazonStatus) {
      case 'checking':
        return (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
            <span className="text-sm text-slate-500">Checking...</span>
          </div>
        );
      case 'logged_in':
        return (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-green-600">Logged in</span>
          </div>
        );
      case 'not_logged_in':
        return (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-sm text-yellow-600">Not logged in</span>
            </div>
            <button
              onClick={openKindleNotebook}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              Log in <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-sm text-red-600">Error checking status</span>
          </div>
        );
    }
  };

  return (
    <div className="w-350px p-4 bg-background text-foreground antialiased font-sans">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-primary/10 rounded-full text-primary">
          <BookOpen className="w-5 h-5" />
        </div>
        <h1 className="text-xl font-bold font-serif text-slate-900">Lektr Extension</h1>
      </div>

      <div className="card p-4 border rounded-xl shadow-sm bg-white mb-4 space-y-4">
        {/* API Endpoint - only show input when not authenticated */}
        {connectionStatus !== 'authenticated' && (
          <div>
            <label className="text-xs text-slate-500 mb-1 flex items-center gap-1">
              <Server className="w-3 h-3" />
              Lektr API Endpoint
            </label>
            <input
              type="url"
              className="w-full text-sm p-2 border rounded-md bg-slate-50"
              placeholder="http://localhost:3001"
              value={apiEndpoint}
              onChange={(e) => handleApiEndpointChange(e.target.value)}
            />
          </div>
        )}

        {/* Connection Status */}
        <div className={connectionStatus !== 'authenticated' ? 'pt-3 border-t' : ''}>
          <p className="text-xs text-slate-500 mb-2">Connection Status</p>
          <StatusIndicator />

          {/* Show endpoint as static text when authenticated */}
          {connectionStatus === 'authenticated' && (
            <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
              <Server className="w-3 h-3" />
              <span className="truncate">{apiEndpoint}</span>
            </div>
          )}
        </div>

        {/* Login Form - only show when unauthenticated */}
        {connectionStatus === 'unauthenticated' && (
          <form onSubmit={handleLogin} className="pt-3 border-t space-y-3">
            <p className="text-xs text-slate-500">Log in to sync highlights</p>

            {loginError && (
              <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 p-2 rounded">
                <AlertCircle className="w-3 h-3" />
                {loginError}
              </div>
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm p-2 border rounded-md bg-slate-50"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm p-2 border rounded-md bg-slate-50"
              required
            />
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2 px-4 bg-black text-white rounded-lg hover:bg-slate-800 transition-colors font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoggingIn && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoggingIn ? 'Logging in...' : 'Log In'}
            </button>
          </form>
        )}

        {/* Amazon Kindle section - only show when authenticated */}
        {connectionStatus === 'authenticated' && (
          <div className="pt-3 border-t">
            <p className="text-xs text-slate-500 mb-2">Amazon Kindle</p>

            {/* Login Status */}
            <AmazonStatusIndicator />

            {/* Region Selector */}
            <div className="mt-2">
              <label className="text-xs text-slate-400 mb-1 block">Region</label>
              <select
                className="w-full text-sm p-2 border rounded-md bg-slate-50"
                value={amazonDomain}
                onChange={(e) => handleAmazonDomainChange(e.target.value)}
              >
                <option value="read.amazon.com">Global (.com)</option>
                <option value="read.amazon.co.uk">UK (.co.uk)</option>
                <option value="read.amazon.de">Germany (.de)</option>
                <option value="read.amazon.co.jp">Japan (.co.jp)</option>
                <option value="read.amazon.in">India (.in)</option>
              </select>
            </div>

            {/* Auto-Sync Interval */}
            <div className="mt-2">
              <label className="text-xs text-slate-400 mb-1 block">Auto-Sync</label>
              <select
                className="w-full text-sm p-2 border rounded-md bg-slate-50"
                value={autoSyncInterval}
                onChange={(e) => handleAutoSyncIntervalChange(e.target.value)}
              >
                <option value="0">Disabled</option>
                <option value="60">Every hour</option>
                <option value="360">Every 6 hours</option>
                <option value="720">Every 12 hours</option>
                <option value="1440">Once a day</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Sync button - only when authenticated */}
      {connectionStatus === 'authenticated' && (
        <button
          onClick={handleSync}
          className={`w-full py-2 px-4 rounded-lg transition-colors font-medium text-sm cursor-pointer flex items-center justify-center gap-2 ${
            isSyncing
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-black hover:bg-slate-800 text-white'
          }`}
        >
          {isSyncing && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSyncing ? 'Stop Sync' : 'Sync Kindle Highlights'}
        </button>
      )}
    </div>
  );
}

export default App;
