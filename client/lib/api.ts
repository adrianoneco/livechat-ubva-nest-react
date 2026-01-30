/**
 * API utility functions for authenticated calls to Express backend
 */

// Remove trailing /api from base URL if present to avoid duplication
const rawApiBase = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiBase.replace(/\/api\/?$/, '');

/**
 * Get authentication headers from localStorage
 */
function getAuthHeaders(): Record<string, string> {
  try {
    // Try access_token first (used by this app)
    const accessToken = localStorage.getItem('access_token');
    if (accessToken) {
      return {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };
    }
    
    // Fallback to sb-auth-token (Supabase format)
    const storedSession = localStorage.getItem('sb-auth-token');
    if (storedSession) {
      const session = JSON.parse(storedSession);
      if (session?.access_token) {
        return {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        };
      }
    }
  } catch (e) {
    console.error('[api] Error reading auth token:', e);
  }
  return { 'Content-Type': 'application/json' };
}

/**
 * Make an authenticated fetch request to the Express API
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: Error | null }> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers,
      },
    });

    const text = await response.text();
    let data: T | null = null;
    
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Response was not JSON
      if (!response.ok) {
        return { data: null, error: new Error(text || `HTTP ${response.status}`) };
      }
    }

    if (!response.ok) {
      const errorMsg = (data as any)?.error || (data as any)?.message || `HTTP ${response.status}`;
      return { data: null, error: new Error(errorMsg) };
    }

    return { data, error: null };
  } catch (e) {
    console.error('[api] Fetch error:', e);
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * POST request to API functions endpoint
 */
export async function invokeFunction<T = any>(
  functionName: string,
  body?: Record<string, any>
): Promise<{ data: T | null; error: Error | null }> {
  return apiFetch<T>(`/api/functions/${functionName}`, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * GET request to API endpoint
 */
export async function apiGet<T = any>(
  endpoint: string
): Promise<{ data: T | null; error: Error | null }> {
  return apiFetch<T>(endpoint, { method: 'GET' });
}
