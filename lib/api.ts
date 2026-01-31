/**
 * API client for communicating with the Lektr backend.
 */

const DEFAULT_API_ENDPOINT = 'http://localhost:3001';

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export type ConnectionStatus = 'checking' | 'unreachable' | 'unauthenticated' | 'authenticated';

export async function getApiEndpoint(): Promise<string> {
  const endpoint = await storage.getItem<string>('local:apiEndpoint');
  return endpoint || DEFAULT_API_ENDPOINT;
}

/**
 * Make an authenticated API request.
 */
export async function apiClient<T>(
  path: string, 
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = await getApiEndpoint();
  const url = `${baseUrl}${path}`;
  
  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Important for cookie-based auth
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Check if the API is reachable.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const baseUrl = await getApiEndpoint();
    // Use /api/v1/version instead of /health as it's guaranteed to exist
    const response = await fetch(`${baseUrl}/api/v1/version`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the current authenticated user.
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const baseUrl = await getApiEndpoint();
    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      credentials: 'include',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Log in with email and password.
 */
export async function login(email: string, password: string): Promise<User> {
  const baseUrl = await getApiEndpoint();
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  const data = await response.json();
  return data.user;
}

/**
 * Log out the current user.
 */
export async function logout(): Promise<void> {
  const baseUrl = await getApiEndpoint();
  await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

/**
 * Check connection and auth status.
 */
export async function checkConnectionStatus(): Promise<{ status: ConnectionStatus; user: User | null }> {
  const isReachable = await checkHealth();
  
  if (!isReachable) {
    return { status: 'unreachable', user: null };
  }

  const user = await getCurrentUser();
  
  if (!user) {
    return { status: 'unauthenticated', user: null };
  }

  return { status: 'authenticated', user };
}

/**
 * Save a highlight to Lektr.
 */
export async function saveHighlight(data: {
  content: string;
  url: string;
  title: string;
  note?: string;
  prefix?: string;
  suffix?: string;
}) {
  return apiClient('/api/v1/import/manual', {
    method: 'POST',
    body: JSON.stringify({
      title: data.title,
      content: data.content,
      note: data.note,
    }),
  });
}

