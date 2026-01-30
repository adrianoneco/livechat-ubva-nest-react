// API Client para substituir o Supabase Client
import type { User, Session } from './types';

declare global {
  interface ImportMetaEnv {
    VITE_API_URL?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

const API_URL = import.meta.env.VITE_API_URL || '/api';

let accessToken: string | null = localStorage.getItem('access_token');
let refreshToken: string | null = localStorage.getItem('refresh_token');
let authCheckFailed = false; // Prevent retry loops when auth fails

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Attach access token for most endpoints. Skip only auth endpoints that create/refresh sessions.
  if (accessToken && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register') && !endpoint.includes('/auth/refresh')) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && refreshToken && !endpoint.includes('/auth/')) {
      // Try to refresh token
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        const retryResponse = await fetch(`${API_URL}${endpoint}`, {
          ...options,
          headers,
        });
        
        if (!retryResponse.ok) {
          throw new ApiError(retryResponse.status, await retryResponse.text());
        }
        
        return retryResponse.json();
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(response.status, error.error || response.statusText);
    }

    return response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error(`Network error: ${error}`);
  }
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      accessToken = data.accessToken;
      localStorage.setItem('access_token', accessToken!);
      return true;
    }
    
    // Refresh failed, clear tokens
    apiClient.auth.signOut();
    return false;
  } catch {
    apiClient.auth.signOut();
    return false;
  }
}

export const apiClient = {
  auth: {
    signUp: async (email: string, password: string, fullName?: string) => {
      try {
        const data: any = await request('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, fullName }),
        });
        return { data: { user: data.user }, error: null };
      } catch (error: any) {
        return { data: null, error: { message: error.message } };
      }
    },

    signIn: async (email: string, password: string) => {
      try {
        const data: any = await request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        
        accessToken = data.accessToken;
        refreshToken = data.refreshToken;
        authCheckFailed = false; // Reset on successful login
        localStorage.setItem('access_token', accessToken!);
        localStorage.setItem('refresh_token', refreshToken!);
        
        return { data: { user: data.user, session: { user: data.user, access_token: data.accessToken } }, error: null };
      } catch (error: any) {
        return { data: null, error: { message: error.message } };
      }
    },

    signOut: async () => {
      accessToken = null;
      refreshToken = null;
      authCheckFailed = false; // Reset on logout
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      return { error: null };
    },

    getSession: async () => {
      if (!accessToken || authCheckFailed) {
        return { data: { session: null }, error: null };
      }

      try {
        const user: any = await request('/auth/me');
        authCheckFailed = false; // Reset on success
        return {
          data: {
            session: {
              user,
              access_token: accessToken,
            },
          },
          error: null,
        };
      } catch (error: any) {
        // If auth fails with 401, clear tokens and stop retrying
        if (error.status === 401) {
          authCheckFailed = true;
          accessToken = null;
          refreshToken = null;
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
        return { data: { session: null }, error: null };
      }
    },

    getUser: async () => {
      if (!accessToken || authCheckFailed) {
        return { data: { user: null }, error: null };
      }

      try {
        const user = await request('/auth/me');
        authCheckFailed = false; // Reset on success
        return { data: { user }, error: null };
      } catch (error: any) {
        // If auth fails with 401, clear tokens and stop retrying
        if (error.status === 401) {
          authCheckFailed = true;
          accessToken = null;
          refreshToken = null;
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
        return { data: { user: null }, error: { message: error.message } };
      }
    },

    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      // Check if there's a token first
      const hasToken = localStorage.getItem('access_token');
      if (!hasToken || authCheckFailed) {
        // No token or auth already failed - immediately return null session
        callback('INITIAL_SESSION', null);
        return {
          data: { subscription: { unsubscribe: () => {} } },
        };
      }

      // Initial check only if we have a token
      apiClient.auth.getSession().then(({ data }) => {
        callback('INITIAL_SESSION', data.session);
      });

      // Return unsubscribe function
      return {
        data: { subscription: { unsubscribe: () => {} } },
      };
    },
  },

  from: (table: string) => ({
    select: (columns = '*') => {
      // Internal builder state
      const state: any = {
        columns,
        filters: [],
        inFilters: [],
        orders: [],
        limit: undefined,
        range: undefined,
      };

      const buildQueryString = () => {
        const params = new URLSearchParams();
        for (const f of state.filters) {
          // Handle 'is null' operator specially for unassigned filter
          if (f.op === 'is' && f.value === null && f.column === 'assigned_to') {
            params.append('unassigned', 'true');
          } else if (f.op !== 'is' || f.value !== null) {
            params.append(f.column, String(f.value));
          }
        }
        for (const f of state.inFilters) {
          // join values with comma
          params.append(f.column, f.values.join(','));
        }
        if (state.limit) params.append('limit', String(state.limit));
        if (state.range) params.append('range', `${state.range[0]}:${state.range[1]}`);
        return params.toString();
      };

      const builder: any = {
        eq: (column: string, value: any) => {
          state.filters.push({ column, value });
          return builder;
        },
        neq: (column: string, value: any) => {
          state.filters.push({ column, value, op: 'neq' });
          return builder;
        },
        gt: (column: string, value: any) => {
          state.filters.push({ column, value, op: 'gt' });
          return builder;
        },
        gte: (column: string, value: any) => {
          state.filters.push({ column, value, op: 'gte' });
          return builder;
        },
        lt: (column: string, value: any) => {
          state.filters.push({ column, value, op: 'lt' });
          return builder;
        },
        lte: (column: string, value: any) => {
          state.filters.push({ column, value, op: 'lte' });
          return builder;
        },
        not: (column: string, operator: string, value: any) => {
          // Handle .not('column', 'is', null) => filter out nulls
          state.filters.push({ column, value, op: 'not' });
          return builder;
        },
        is: (column: string, value: any) => {
          state.filters.push({ column, value, op: 'is' });
          return builder;
        },
        in: (column: string, values: any[]) => {
          state.inFilters.push({ column, values });
          return builder;
        },
        order: (column: string, _options?: any) => {
          state.orders.push(column);
          return builder;
        },
        limit: (count: number) => {
          state.limit = count;
          return builder;
        },
        range: (from: number, to: number) => {
          state.range = [from, to];
          return builder;
        },
        // Return single result or throw if not found
        single: async () => {
          try {
            const q = buildQueryString();
            const path = q ? `/${table}?${q}` : `/${table}`;
            const data = await request(path);
            const arr = Array.isArray(data) ? data : [data];
            if (arr.length === 0) {
              return { data: null, error: { message: 'No rows found' } };
            }
            return { data: arr[0], error: null };
          } catch (err: any) {
            return { data: null, error: { message: err.message || String(err) } };
          }
        },
        // Return single result or null if not found (no error)
        maybeSingle: async () => {
          try {
            const q = buildQueryString();
            const path = q ? `/${table}?${q}` : `/${table}`;
            const data = await request(path);
            const arr = Array.isArray(data) ? data : [data];
            return { data: arr[0] || null, error: null };
          } catch (err: any) {
            return { data: null, error: { message: err.message || String(err) } };
          }
        },
        // thenable so `await query` works like official supabase client
        then: async (resolve: any, _reject: any) => {
          try {
            const q = buildQueryString();
            const path = q ? `/${table}?${q}` : `/${table}`;
            const data = await request(path);
            const result = { data, error: null };
            return resolve ? resolve(result) : result;
          } catch (err: any) {
            const result = { data: null, error: { message: err.message || String(err) } };
            return resolve ? resolve(result) : result;
          }
        },
      };

      return builder;
    },

    insert: (values: any) => {
      const insertBuilder = {
        select: () => ({
          single: async () => {
            try {
              console.log(`[apiClient.insert] POST /${table}`, values);
              const data = await request(`/${table}`, {
                method: 'POST',
                body: JSON.stringify(values),
              });
              // Return first item if array, otherwise the object itself
              const single = Array.isArray(data) ? data[0] : data;
              return { data: single, error: null };
            } catch (error: any) {
              console.error(`[apiClient.insert] Error:`, error);
              return { data: null, error: { message: error.message } };
            }
          },
          maybeSingle: async () => {
            try {
              console.log(`[apiClient.insert] POST /${table} (maybeSingle)`, values);
              const data = await request(`/${table}`, {
                method: 'POST',
                body: JSON.stringify(values),
              });
              const single = Array.isArray(data) ? data[0] : data;
              return { data: single || null, error: null };
            } catch (error: any) {
              console.error(`[apiClient.insert] Error:`, error);
              return { data: null, error: { message: error.message } };
            }
          },
          then: async (resolve: any) => {
            try {
              const data = await request(`/${table}`, {
                method: 'POST',
                body: JSON.stringify(values),
              });
              const result = { data: Array.isArray(data) ? data : [data], error: null };
              return resolve ? resolve(result) : result;
            } catch (error: any) {
              const result = { data: null, error: { message: error.message } };
              return resolve ? resolve(result) : result;
            }
          },
        }),
        then: async (resolve: any) => {
          try {
            const data = await request(`/${table}`, {
              method: 'POST',
              body: JSON.stringify(values),
            });
            const result = { data, error: null };
            return resolve ? resolve(result) : result;
          } catch (error: any) {
            const result = { data: null, error: { message: error.message } };
            return resolve ? resolve(result) : result;
          }
        },
      };
      return insertBuilder;
    },

    upsert: (values: any, options?: { onConflict?: string }) => {
      const upsertBuilder = {
        select: () => ({
          single: async () => {
            try {
              const data = await request(`/${table}/upsert`, {
                method: 'POST',
                body: JSON.stringify({ 
                  data: values, 
                  onConflict: options?.onConflict 
                }),
              });
              const single = Array.isArray(data) ? data[0] : data;
              return { data: single, error: null };
            } catch (error: any) {
              return { data: null, error: { message: error.message } };
            }
          },
          maybeSingle: async () => {
            try {
              const data = await request(`/${table}/upsert`, {
                method: 'POST',
                body: JSON.stringify({ 
                  data: values, 
                  onConflict: options?.onConflict 
                }),
              });
              const single = Array.isArray(data) ? data[0] : data;
              return { data: single || null, error: null };
            } catch (error: any) {
              return { data: null, error: { message: error.message } };
            }
          },
          then: async (resolve: any) => {
            try {
              const data = await request(`/${table}/upsert`, {
                method: 'POST',
                body: JSON.stringify({ 
                  data: values, 
                  onConflict: options?.onConflict 
                }),
              });
              const result = { data: Array.isArray(data) ? data : [data], error: null };
              return resolve ? resolve(result) : result;
            } catch (error: any) {
              const result = { data: null, error: { message: error.message } };
              return resolve ? resolve(result) : result;
            }
          },
        }),
        then: async (resolve: any) => {
          try {
            const data = await request(`/${table}/upsert`, {
              method: 'POST',
              body: JSON.stringify({ 
                data: values, 
                onConflict: options?.onConflict 
              }),
            });
            const result = { data, error: null };
            return resolve ? resolve(result) : result;
          } catch (error: any) {
            const result = { data: null, error: { message: error.message } };
            return resolve ? resolve(result) : result;
          }
        },
      };
      return upsertBuilder;
    },

    update: (values: any) => {
      const state = { filters: [] as Array<{column: string; value: any}> };
      
      const builder: any = {
        eq: (column: string, value: any) => {
          state.filters.push({ column, value });
          return builder;
        },
        select: () => ({
          single: async () => {
            try {
              // Validate filters
              if (state.filters.some(f => f.value === undefined || f.value === null)) {
                const invalidFilter = state.filters.find(f => f.value === undefined || f.value === null);
                throw new Error(`Invalid filter value for column '${invalidFilter?.column}'`);
              }
              
              // Build query params from filters
              const params = new URLSearchParams();
              for (const f of state.filters) {
                params.append(f.column, String(f.value));
              }
              const queryString = params.toString();
              
              // If single filter on id, use PUT /:table/:id
              if (state.filters.length === 1 && state.filters[0].column === 'id') {
                const data = await request(`/${table}/${state.filters[0].value}`, {
                  method: 'PUT',
                  body: JSON.stringify(values),
                });
                return { data, error: null };
              }
              
              // Otherwise use PATCH with query params
              const data = await request(`/${table}?${queryString}`, {
                method: 'PATCH',
                body: JSON.stringify(values),
              });
              return { data, error: null };
            } catch (error: any) {
              return { data: null, error: { message: error.message } };
            }
          },
          then: async (resolve: any) => {
            try {
              const params = new URLSearchParams();
              for (const f of state.filters) {
                params.append(f.column, String(f.value));
              }
              const queryString = params.toString();
              
              if (state.filters.length === 1 && state.filters[0].column === 'id') {
                const data = await request(`/${table}/${state.filters[0].value}`, {
                  method: 'PUT',
                  body: JSON.stringify(values),
                });
                const result = { data, error: null };
                return resolve ? resolve(result) : result;
              }
              
              const data = await request(`/${table}?${queryString}`, {
                method: 'PATCH',
                body: JSON.stringify(values),
              });
              const result = { data, error: null };
              return resolve ? resolve(result) : result;
            } catch (error: any) {
              const result = { data: null, error: { message: error.message } };
              return resolve ? resolve(result) : result;
            }
          },
        }),
        then: async (resolve: any) => {
          try {
            const params = new URLSearchParams();
            for (const f of state.filters) {
              params.append(f.column, String(f.value));
            }
            const queryString = params.toString();
            
            if (state.filters.length === 1 && state.filters[0].column === 'id') {
              const data = await request(`/${table}/${state.filters[0].value}`, {
                method: 'PUT',
                body: JSON.stringify(values),
              });
              const result = { data, error: null };
              return resolve ? resolve(result) : result;
            }
            
            const data = await request(`/${table}?${queryString}`, {
              method: 'PATCH',
              body: JSON.stringify(values),
            });
            const result = { data, error: null };
            return resolve ? resolve(result) : result;
          } catch (error: any) {
            const result = { data: null, error: { message: error.message } };
            return resolve ? resolve(result) : result;
          }
        },
      };
      
      return builder;
    },

    delete: () => {
      const state = { filters: [] as Array<{column: string; value: any}> };
      
      const builder: any = {
        eq: (column: string, value: any) => {
          state.filters.push({ column, value });
          return builder;
        },
        then: async (resolve: any) => {
          try {
            const params = new URLSearchParams();
            for (const f of state.filters) {
              params.append(f.column, String(f.value));
            }
            const queryString = params.toString();
            
            // If single filter on id, use DELETE /:table/:id
            if (state.filters.length === 1 && state.filters[0].column === 'id') {
              await request(`/${table}/${state.filters[0].value}`, {
                method: 'DELETE',
              });
            } else {
              // Otherwise use DELETE with query params
              await request(`/${table}?${queryString}`, {
                method: 'DELETE',
              });
            }
            const result = { error: null };
            return resolve ? resolve(result) : result;
          } catch (error: any) {
            const result = { error: { message: error.message } };
            return resolve ? resolve(result) : result;
          }
        },
      };
      
      return builder;
    },
  }),

  storage: {
    from: (bucket: string) => ({
      upload: async (path: string, file: File, options?: { contentType?: string }) => {
        try {
          // Use multipart form-data upload to /storage/upload
          const formData = new FormData();
          formData.append('file', file);
          formData.append('bucket', bucket);
          formData.append('path', path);

          // Make request without Content-Type header (browser sets it with boundary for FormData)
          const response = await fetch(`${API_URL}/storage/upload`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
            body: formData,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Upload failed');
          }

          const result = await response.json();
          return { data: { path: result.key }, error: null };
        } catch (error: any) {
          console.error('[storage.upload] Error:', error);
          return { data: null, error: { message: error.message } };
        }
      },

      getPublicUrl: (path: string) => {
        // Include bucket in the path for proper file retrieval
        const fullPath = `${bucket}/${path}`;
        return {
          data: { publicUrl: `${API_URL}/storage/download/${fullPath}` },
        };
      },

      createSignedUrl: async (path: string, expiresIn: number) => {
        try {
          const { url }: any = await request(`/storage/download/${encodeURIComponent(path)}`);
          return { data: { signedUrl: url }, error: null };
        } catch (error: any) {
          return { data: null, error: { message: error.message } };
        }
      },

      remove: async (paths: string[]) => {
        try {
          await Promise.all(paths.map(path => 
            request(`/storage/${encodeURIComponent(path)}`, {
              method: 'DELETE',
            })
          ));
          return { data: null, error: null };
        } catch (error: any) {
          return { data: null, error: { message: error.message } };
        }
      },
    }),
  },

  functions: {
    invoke: async (functionName: string, options?: { body?: any; headers?: any }) => {
      try {
        const data = await request(`/functions/${functionName}`, {
          method: 'POST',
          body: options?.body ? JSON.stringify(options.body) : undefined,
          headers: options?.headers,
        });
        return { data, error: null };
      } catch (error: any) {
        return { data: null, error: { message: error.message } };
      }
    },
  },

  rpc: async (functionName: string, params: any) => {
    try {
      const data = await request(`/rpc/${functionName}`, {
        method: 'POST',
        body: JSON.stringify(params),
      });
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  channel: (channelName: string) => {
    // Create a builder that supports chaining .on() calls
    const channelBuilder: any = {
      on: (event: string, filter: any, callback?: any) => {
        // Support both 2 and 3 argument forms
        // Return self to allow chaining multiple .on() calls
        return channelBuilder;
      },
      subscribe: (callback?: (status: string) => void) => {
        // No-op - realtime not implemented
        if (callback) callback('SUBSCRIBED');
        return channelBuilder;
      },
      unsubscribe: () => {
        return Promise.resolve();
      },
    };
    return channelBuilder;
  },

  removeChannel: (channel: any) => {
    // No-op for now - realtime not implemented yet
    return Promise.resolve();
  },
};

// Para compatibilidade com o código existente
export const supabase = apiClient;
