function apiRoot(url = '') {
  let u = String(url).trim().replace(/\/+$/, '');
  return u.replace(/\/(chat\/completions|models|responses)$/i, '');
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
function inferFree(model) { const s = `${model.id} ${model.name || ''}`.toLowerCase(); return s.includes(':free') || s.includes(' free') || s.endsWith('-free'); }
function errorText(status, data, text) {
  const msg = data?.error?.message || data?.message || text || `HTTP ${status}`;
  if (status === 401 || status === 403) return `${status} ${msg}. Check the API key and provider URL.`;
  if (status === 429) return `429 ${msg}. The provider/model is rate-limited or has no available quota. Wait, change model, or check provider credits.`;
  return `${status} ${msg}`;
}
async function readJson(response){ const text=await response.text(); let data; try{data=JSON.parse(text)}catch{data=null} return {text,data}; }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { baseUrl, apiKey, action='models', model } = req.body || {};
  if (!baseUrl) return res.status(400).json({ error: 'Provider URL is required' });
  const root = apiRoot(baseUrl), headers={Accept:'application/json','Content-Type':'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})};
  try {
    if(action==='test'){
      if(!model) return res.status(400).json({error:'Model ID is required'});
      const response=await fetch(`${root}/chat/completions`,{method:'POST',headers,body:JSON.stringify({model,messages:[{role:'user',content:'Reply with OK only.'}],max_tokens:8,temperature:0})});
      const {text,data}=await readJson(response);
      if(!response.ok) return res.status(response.status).json({error:errorText(response.status,data,text),status:response.status});
      const content=data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
      return res.status(200).json({ok:true,reply:String(content).slice(0,120),endpoint:`${root}/chat/completions`});
    }
    const response = await fetch(`${root}/models`, { headers });
    const {text,data}=await readJson(response);
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
