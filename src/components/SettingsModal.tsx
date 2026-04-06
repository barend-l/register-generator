import { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODELS = [
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'anthropic/claude-haiku-4', label: 'Claude Haiku 4' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'openai/gpt-4.1', label: 'GPT-4.1' },
  { value: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'openai/gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'openai/o3-mini', label: 'o3 Mini' },
  { value: 'google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro' },
  { value: 'google/gemini-2.5-flash-preview', label: 'Gemini 2.5 Flash' },
  { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
  { value: 'deepseek/deepseek-chat-v3-0324', label: 'DeepSeek V3' },
  { value: 'deepseek/deepseek-r1', label: 'DeepSeek R1' },
  { value: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick' },
  { value: 'meta-llama/llama-4-scout', label: 'Llama 4 Scout' },
  { value: 'qwen/qwen3-235b-a22b', label: 'Qwen3 235B' },
  { value: 'mistralai/mistral-large-2411', label: 'Mistral Large' },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('anthropic/claude-sonnet-4');
  const [customModel, setCustomModel] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    const savedKey = localStorage.getItem('openrouter_api_key') || '';
    const savedModel = localStorage.getItem('openrouter_model') || 'anthropic/claude-sonnet-4';
    setApiKey(savedKey);

    const isKnown = MODELS.some(m => m.value === savedModel);
    if (isKnown) {
      setModel(savedModel);
      setUseCustom(false);
    } else {
      setCustomModel(savedModel);
      setUseCustom(true);
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem('openrouter_api_key', apiKey);
    localStorage.setItem('openrouter_model', useCustom ? customModel : model);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-primary-900 mb-4">Instellingen</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-1">
              OpenRouter API-key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-..."
              className="w-full px-3 py-2 border border-warm-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
            <p className="text-xs text-warm-500 mt-1">
              Wordt lokaal opgeslagen in je browser. <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" className="text-primary-600 hover:underline">Key aanmaken</a>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-warm-700 mb-1">
              Model
            </label>
            {!useCustom ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 border border-warm-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                {MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="provider/model-name"
                className="w-full px-3 py-2 border border-warm-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            )}
            <button
              onClick={() => setUseCustom(!useCustom)}
              className="text-xs text-primary-600 hover:underline mt-1"
            >
              {useCustom ? '← Kies uit lijst' : 'Eigen model-ID invoeren'}
            </button>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm border border-warm-300 rounded-lg hover:bg-warm-50 transition"
          >
            Annuleer
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}
