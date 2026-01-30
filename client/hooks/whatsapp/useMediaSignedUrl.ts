import { useState, useEffect } from "react";

// API base URL
const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Get auth token from localStorage
function getAccessToken(): string | null {
  return localStorage.getItem('access_token');
}

// Check if the URL is a local storage path
function isLocalStoragePath(url: string): boolean {
  return url.startsWith('/storage/') || url.startsWith('storage/');
}

// Check if it's an external URL (http/https)
function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

// Check if it's an S3 key (whatsapp-media/... pattern)
function isS3Key(url: string): boolean {
  return url.startsWith('whatsapp-media/') || url.includes('/whatsapp-media/');
}

// Check if it's a legacy Supabase storage path (instance/filename format)
function isLegacySupabasePath(url: string): boolean {
  // Legacy paths look like: "ti-suporte/1769022145177-3EB0577E7D6E4192823811.jpeg"
  // They have instance name followed by filename, no /storage/ prefix
  if (isLocalStoragePath(url) || isExternalUrl(url) || isS3Key(url)) return false;
  const parts = url.split('/');
  return parts.length === 2 && !parts[0].includes(':');
}

// Normalize S3 key (remove leading slashes)
function normalizeS3Key(url: string): string {
  if (url.startsWith('/')) {
    return url.slice(1);
  }
  return url;
}

// Make authenticated fetch request
async function authenticatedFetch(url: string, body: object): Promise<Response> {
  const token = getAccessToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  });
}

export function useMediaSignedUrl(
  mediaUrl: string | null | undefined,
  conversationId?: string
) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaUrl) {
      setSignedUrl(null);
      return;
    }

    // If it's already an external URL, use it directly
    if (isExternalUrl(mediaUrl)) {
      setSignedUrl(mediaUrl);
      return;
    }

    // If it's a local storage path (legacy), use it directly
    if (isLocalStoragePath(mediaUrl)) {
      const normalizedUrl = mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;
      setSignedUrl(normalizedUrl);
      return;
    }

    // If it's an S3 key, fetch signed URL from backend
    if (isS3Key(mediaUrl)) {
      const fetchSignedUrl = async () => {
        setIsLoading(true);
        setError(null);

        try {
          const s3Key = normalizeS3Key(mediaUrl);
          const response = await authenticatedFetch(
            `${API_BASE}/functions/get-media-signed-url`,
            { filePath: s3Key, conversationId }
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();
          if (data?.signedUrl) {
            setSignedUrl(data.signedUrl);
          } else {
            throw new Error('No signed URL returned');
          }
        } catch (err: any) {
          console.error('[useMediaSignedUrl] Error fetching signed URL:', err);
          setError(err.message);
          // Fallback to direct S3 path (won't work but at least won't break)
          setSignedUrl(null);
        } finally {
          setIsLoading(false);
        }
      };

      fetchSignedUrl();
      return;
    }

    // If it's a legacy Supabase storage path, try to fetch signed URL
    if (isLegacySupabasePath(mediaUrl)) {
      const fetchSignedUrl = async () => {
        setIsLoading(true);
        setError(null);

        try {
          // Try as S3 key with whatsapp-media prefix
          const s3Key = `whatsapp-media/${mediaUrl}`;
          const response = await authenticatedFetch(
            `${API_BASE}/functions/get-media-signed-url`,
            { filePath: s3Key, conversationId }
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();
          if (data?.signedUrl) {
            setSignedUrl(data.signedUrl);
          } else {
            throw new Error('No signed URL returned');
          }
        } catch (err: any) {
          console.error('[useMediaSignedUrl] Error fetching signed URL for legacy path:', err);
          setError(err.message);
          // Fallback to local storage path
          setSignedUrl(`/storage/whatsapp-media/${mediaUrl}`);
        } finally {
          setIsLoading(false);
        }
      };

      fetchSignedUrl();
      return;
    }

    // Unknown format - try as S3 key
    const fetchSignedUrl = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await authenticatedFetch(
          `${API_BASE}/functions/get-media-signed-url`,
          { filePath: mediaUrl, conversationId }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data?.signedUrl) {
          setSignedUrl(data.signedUrl);
        } else {
          throw new Error('No signed URL returned');
        }
      } catch (err: any) {
        console.error('[useMediaSignedUrl] Error fetching signed URL:', err);
        setError(err.message);
        setSignedUrl(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSignedUrl();
  }, [mediaUrl, conversationId]);

  return { signedUrl, isLoading, error };
}

// Utility to get media URL (for components that can't use hooks)
export async function getMediaSignedUrl(
  mediaUrl: string,
  conversationId?: string
): Promise<string> {
  // If it's an external URL, return directly
  if (isExternalUrl(mediaUrl)) {
    return mediaUrl;
  }

  // If it's a local storage path, return directly
  if (isLocalStoragePath(mediaUrl)) {
    return mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;
  }

  // For S3 keys and other formats, fetch signed URL
  try {
    let s3Key = mediaUrl;
    
    // Handle legacy paths
    if (isLegacySupabasePath(mediaUrl)) {
      s3Key = `whatsapp-media/${mediaUrl}`;
    } else {
      s3Key = normalizeS3Key(mediaUrl);
    }

    const response = await authenticatedFetch(
      `${API_BASE}/functions/get-media-signed-url`,
      { filePath: s3Key, conversationId }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data?.signedUrl) {
      return data.signedUrl;
    }
    throw new Error('No signed URL returned');
  } catch (err) {
    console.error('[getMediaSignedUrl] Error:', err);
    // Fallback
    if (isLegacySupabasePath(mediaUrl)) {
      return `/storage/whatsapp-media/${mediaUrl}`;
    }
    return mediaUrl;
  }
}
