function apiRoot(url = '') {
  let u = String(url).trim().replace(/\/+$/, '');
  u = u.replace(/\/(chat\/completions|models|responses)$/i, '');
  return u;
}

function inferCompany(id = '', ownedBy = '') {
  const s = `${id} ${ownedBy}`.toLowerCase();
  if (s.includes('openai') || /(^|\/)gpt-|(^|\/)o\d/.test(s)) return 'OpenAI';
  if (s.includes('anthropic') || s.includes('claude')) return 'Anthropic';
  if (s.includes('google') || s.includes('gemini')) return 'Google';
  if (s.includes('deepseek')) return 'DeepSeek';
  if (s.includes('qwen') || s.includes('alibaba')) return 'Alibaba';
  if (s.includes('mistral')) return 'Mistral';
  if (s.includes('meta') || s.includes('llama')) return 'Meta';
  if (s.includes('xai') || s.includes('grok')) return 'xAI';
  if (s.includes('moonshot') || s.includes('kimi')) return 'Moonshot';
  if (s.includes('zhipu') || s.includes('glm')) return 'Zhipu';
  return ownedBy || 'Other';
}
function inferFree(model) {
  const s = `${model.id} ${model.name || ''}`.toLowerCase();
  return s.includes(':free') || s.includes(' free') || s.endsWith('-free');
}
function errorText(status, data, text) {
  const msg = data?.error?.message || data?.message || text || `HTTP ${status}`;
  if (status === 401 || status === 403) return `${status} ${msg}. Check the API key and provider URL.`;
  return `${status} ${msg}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { baseUrl, apiKey } = req.body || {};
  if (!baseUrl) return res.status(400).json({ error: 'Provider URL is required' });
  const root = apiRoot(baseUrl);
  try {
    const response = await fetch(`${root}/models`, {
      headers: { Accept:'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = null; }
    if (!response.ok) return res.status(response.status).json({ error: errorText(response.status, data, text), status: response.status });

    const raw = Array.isArray(data) ? data : (data?.data || data?.models || data?.results || []);
    const models = raw.map((m) => {
      const id = typeof m === 'string' ? m : (m.id || m.name || m.model || '');
      const ownedBy = typeof m === 'object' ? (m.owned_by || m.provider || m.company || m.publisher || '') : '';
      const item = { id, name: typeof m === 'object' ? (m.name || m.display_name || id) : id, ownedBy };
      return { ...item, company: inferCompany(id, ownedBy), free: inferFree(item) };
    }).filter((m) => m.id);
    return res.status(200).json({ models, endpoint:`${root}/models` });
  } catch (error) {
    return res.status(502).json({ error: `Could not reach provider: ${error?.message || 'network error'}` });
  }
}
