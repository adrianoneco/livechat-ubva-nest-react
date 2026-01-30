import React, { useEffect, useState } from 'react';

type CaseId =
  | 'chat_simple'
  | 'chat_fast'
  | 'chat_complex'
  | 'chat_long_texts'
  | 'audio_precise'
  | 'audio_fast'
  | 'audio_en_quick'
  | 'safety_moderation';

const PRESET: Record<CaseId, string> = {
  chat_simple: 'gemma2-9b',
  chat_fast: 'llama3-8b',
  chat_complex: 'llama3-70b',
  chat_long_texts: 'llama-3.1-8b-instant',
  audio_precise: 'whisper-large-v3',
  audio_fast: 'whisper-large-v3-turbo',
  audio_en_quick: 'distil-whisper-en',
  safety_moderation: 'llama-guard-3-8b',
};

const CASES: { id: CaseId; label: string; description?: string }[] = [
  { id: 'chat_simple', label: 'Chat: simples e barato' },
  { id: 'chat_fast', label: 'Chat: rápido e geral' },
  { id: 'chat_complex', label: 'Chat: raciocínio complexo' },
  { id: 'chat_long_texts', label: 'Chat: textos muito longos' },
  { id: 'audio_precise', label: 'Áudio → Texto: máxima precisão' },
  { id: 'audio_fast', label: 'Áudio → Texto: velocidade' },
  { id: 'audio_en_quick', label: 'Áudio → Texto: inglês rápido' },
  { id: 'safety_moderation', label: 'Segurança: moderação de conteúdo' },
];

export default function GroqModelSettings() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('groq_model_preferences');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    setLoading(true);
    fetch('/supabase/functions/v1/list-groq-models')
      .then((r) => r.json())
      .then((data) => {
        if (data?.data) setModels(data.data);
        else if (Array.isArray(data?.models)) setModels(data.models);
        else if (Array.isArray(data)) setModels(data);
        else setError('Resposta inesperada ao listar modelos');
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function applyPreset() {
    setPrefs(Object.fromEntries(Object.entries(PRESET)) as Record<string, string>);
  }

  function save() {
    localStorage.setItem('groq_model_preferences', JSON.stringify(prefs));
    alert('Preferências salvas localmente.');
  }

  function update(id: CaseId, model: string) {
    setPrefs((p) => ({ ...p, [id]: model }));
  }

  return (
    <div className="p-4">
      <h3 className="text-lg font-medium">Preferências de IA (GROQ)</h3>
      <p className="text-sm text-muted mt-1">Escolha o modelo preferido para cada caso de uso.</p>

      <div className="mt-4 space-y-4">
        {loading && <p>Carregando modelos...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && (
          <div>
            <div className="flex gap-2 mb-3">
              <button className="btn" onClick={applyPreset}>Aplicar preset recomendado</button>
              <button className="btn btn-primary" onClick={save}>Salvar preferências</button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {CASES.map((c) => (
                <div key={c.id} className="border rounded p-3">
                  <div className="font-medium">{c.label}</div>
                  <div className="mt-2">
                    <select
                      value={prefs[c.id] ?? ''}
                      onChange={(e) => update(c.id, e.target.value)}
                      className="border p-2 rounded w-full"
                    >
                      <option value="">(usar padrão)</option>
                      {models.map((m: any) => {
                        const id = m.id ?? m.name ?? m.model;
                        return (
                          <option key={id} value={id}>
                            {id}
                          </option>
                        );
                      })}
                    </select>
                    <div className="mt-2 text-sm text-muted">Recomendado: {PRESET[c.id]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
