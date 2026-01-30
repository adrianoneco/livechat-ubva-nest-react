import { useEffect, useState } from 'react';

export default function useGroqModel(caseId: string) {
  const [model, setModel] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('groq_model_preferences');
      let prefs: Record<string, string> | null = null;
      if (raw) prefs = JSON.parse(raw);

      const byCase = prefs && prefs[caseId];
      const fallback = localStorage.getItem('groq_model');
      setModel(byCase ?? fallback ?? null);
    } catch (e) {
      setModel(localStorage.getItem('groq_model'));
    }
  }, [caseId]);

  return model;
}
