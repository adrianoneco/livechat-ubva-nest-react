// Small helper to normalize and validate Groq API key and base URL
export function getGroqConfig() {
  const rawKey = process.env.GROQ_API_KEY || '';
  // Trim and remove accidental trailing colons or whitespace
  const key = rawKey.trim().replace(/:+$/g, '');

  const base = (process.env.GROQ_API_BASE || 'https://api.groq.com').replace(/\/$/, '');

  if (!key) {
    console.warn('[groq] GROQ_API_KEY is not set or empty; AI features will be disabled');
  }

  return { key, base };
}

export function buildGroqHeaders() {
  const { key } = getGroqConfig();
  if (!key) return {};
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

export function groqEndpoint(path = '/openai/v1/chat/completions') {
  const { base } = getGroqConfig();
  return `${base}${path}`;
}
