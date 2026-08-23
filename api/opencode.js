function pricingNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.eE+-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function classifyPricing(id, pricing, item = {}) {
  const name = String(id || '').toLowerCase();
  if (item.free === true || item.is_free === true || item.isFree === true || pricing?.free === true) return 'free';
  if (/(^|[/:._-])free($|[/:._-])/.test(name)) return 'free';
  const values = [];
  if (pricing && typeof pricing === 'object') {
    for (const key of ['prompt', 'completion', 'input', 'output', 'request', 'image', 'web_search']) {
      const n = pricingNumber(pricing[key]);
      if (n !== null) values.push(n);
    }
  }
  if (values.length && values.every(v => v === 0)) return 'free';
  if (values.some(v => v > 0)) return 'paid';
  return 'unknown';
}

function openCodeBaseUrls() {
  const configured = String(process.env.OPENCODE_BASE_URL || '').trim().replace(/\/+$/, '');
  const official = 'https://opencode.ai/zen/v1';
  return [...new Set((configured ? [configured, official] : [official]).filter(Boolean))];
}

async function fetchOpenCode(path, init = {}) {
  const suffix = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  const attempts = [];
  for (const base of openCodeBaseUrls()) {
    const url = `${base}${suffix}`;
    try {
      const response = await fetch(url, { ...init, cache: 'no-store' });
      if (response.ok) return { response, url, attempts };
      const body = await response.clone().text().catch(() => '');
      attempts.push({ url, status: response.status, body: body.replace(/\s+/g, ' ').slice(0, 260) });
      if (![404,405,408,410,429,500,502,503,504].includes(response.status)) return { response, url, attempts };
    } catch (error) {
      attempts.push({ url, error: error?.message || String(error) });
    }
  }
  const last = attempts.at(-1) || {};
  const detail = last.status ? `HTTP ${last.status}${last.body ? `: ${last.body}` : ''}` : (last.error || 'network error');
  throw new Error(`OpenCode Zen unavailable (${detail})`);
}

const RESPONSE_IDS = [/^gpt-/, /^grok-/, /^muse-spark-/];
const MESSAGE_IDS = [/^claude-/, /^qwen/];
const GEMINI_IDS = [/^gemini-/];
function openCodeProtocol(model = '') {
  const id = String(model || '').toLowerCase();
  if (GEMINI_IDS.some(r => r.test(id))) return 'gemini';
  if (MESSAGE_IDS.some(r => r.test(id))) return 'messages';
  if (RESPONSE_IDS.some(r => r.test(id))) return 'responses';
  return 'chat/completions';
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content == null ? '' : JSON.stringify(content);
  return content.map(p => p?.text || p?.content || '').filter(Boolean).join('\n');
}

function toResponsesPayload(p) {
  const messages = Array.isArray(p.messages) ? p.messages : [];
  const instructions = messages.filter(m => m.role === 'system').map(m => textOf(m.content)).join('\n\n');
  const input = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: textOf(m.content)
  }));
  return {
    model: p.model,
    instructions: instructions || undefined,
    input,
    temperature: p.temperature,
    max_output_tokens: p.max_tokens || 8192,
    stream: false
  };
}

function toAnthropicPayload(p) {
  const messages = Array.isArray(p.messages) ? p.messages : [];
  const system = messages.filter(m => m.role === 'system').map(m => textOf(m.content)).join('\n\n');
  return {
    model: p.model,
    system: system || undefined,
    messages: messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: textOf(m.content)
    })),
    max_tokens: p.max_tokens || 8192,
    temperature: p.temperature,
    stream: false
  };
}

function toGeminiPayload(p) {
  const messages = Array.isArray(p.messages) ? p.messages : [];
  const system = messages.filter(m => m.role === 'system').map(m => textOf(m.content)).join('\n\n');
  const contents = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: textOf(m.content) }]
  }));
  return {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: {
      temperature: p.temperature,
      maxOutputTokens: p.max_tokens || 8192
    }
  };
}

function responseText(d) {
  if (typeof d?.output_text === 'string') return d.output_text;
  const out = [];
  for (const item of d?.output || []) {
    for (const part of item?.content || []) {
      const t = part?.text || part?.content;
      if (typeof t === 'string' && t) out.push(t);
    }
  }
  return out.join('');
}

function anthropicText(d) {
  return (d?.content || []).map(x => x?.text || '').filter(Boolean).join('');
}

function geminiText(d) {
  return (d?.candidates?.[0]?.content?.parts || []).map(x => x?.text || '').filter(Boolean).join('');
}

function sendJson(res, status, data) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  return res.send(JSON.stringify(data));
}

export default async function handler(req, res) {
  try {
    const action = req.method === 'GET' ? (req.query.action || 'models') : (req.body?.action || 'chat');

    if (action === 'models') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      let result;
      try {
        result = await fetchOpenCode('/models', {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'AdPromptAI-Vercel/3.0',
            ...(process.env.OPENCODE_API_KEY ? { Authorization: `Bearer ${process.env.OPENCODE_API_KEY}` } : {})
          },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }

      const raw = await result.response.text();
      let d;
      try { d = JSON.parse(raw); }
      catch { return sendJson(res, 502, { error: `OpenCode returned non-JSON from ${result.url}: ${raw.slice(0,220)}` }); }
      if (!result.response.ok) return sendJson(res, result.response.status, { error: d?.error?.message || d?.error || d?.message || raw.slice(0,220), url: result.url });

      const rows = Array.isArray(d?.data) ? d.data : Array.isArray(d?.models) ? d.models : [];
      const documentedFreeIds = new Set([
        'big-pickle','x-preview-f-free','mimo-v2.5-free','hy3-free',
        'nemotron-3-ultra-free','nemotron-3.5-lightning-free',
        'deepseek-v4-flash-free','laguna-s-2.1-free','muse-spark-1.2-contributor-free'
      ]);
      const normalized = rows.map(item => {
        const id = String(item?.id || item?.name || '').trim();
        if (!id) return null;
        const pricing = item?.pricing || item?.price || null;
        let tier = classifyPricing(id, pricing, item);
        if (documentedFreeIds.has(id)) tier = 'free';
        return {
          ...item,
          id,
          name: item?.name || item?.display_name || id,
          pricing,
          tier,
          free: tier === 'free',
          api: openCodeProtocol(id)
        };
      }).filter(Boolean);

      return sendJson(res, 200, {
        object: 'list',
        source: result.url,
        data: normalized,
        models: normalized
      });
    }

    if (action !== 'chat') return sendJson(res, 400, { error: 'Invalid action' });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

    const payload = req.body || {};
    if (!payload.model || !Array.isArray(payload.messages)) return sendJson(res, 400, { error: 'model and messages are required' });

    const protocol = openCodeProtocol(payload.model);
    const commonHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'AdPromptAI-Vercel/3.0'
    };
    if (process.env.OPENCODE_API_KEY) commonHeaders.Authorization = `Bearer ${process.env.OPENCODE_API_KEY}`;

    let path, body, headers = { ...commonHeaders };
    if (protocol === 'chat/completions') {
      path = '/chat/completions';
      body = {
        model: payload.model,
        messages: payload.messages,
        temperature: payload.temperature ?? 0.55,
        max_tokens: payload.max_tokens || 8192,
        stream: false
      };
    } else if (protocol === 'responses') {
      path = '/responses';
      body = toResponsesPayload(payload);
    } else if (protocol === 'messages') {
      path = '/messages';
      body = toAnthropicPayload(payload);
      if (process.env.OPENCODE_API_KEY) headers['x-api-key'] = process.env.OPENCODE_API_KEY;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      path = `/models/${encodeURIComponent(payload.model)}:generateContent`;
      body = toGeminiPayload(payload);
      if (process.env.OPENCODE_API_KEY) headers['x-goog-api-key'] = process.env.OPENCODE_API_KEY;
    }

    const { response, url } = await fetchOpenCode(path, {
      method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store'
    });
    const raw = await response.text();
    let d;
    try { d = JSON.parse(raw); }
    catch { return sendJson(res, 502, { error: `OpenCode returned non-JSON from ${url}: ${raw.slice(0,260)}`, protocol }); }
    if (!response.ok) return sendJson(res, response.status, { error: d?.error?.message || d?.error || d?.message || raw.slice(0,260), protocol, url });

    if (protocol === 'chat/completions') return sendJson(res, 200, { ...d, _opencode: { protocol, url } });

    const text = protocol === 'responses' ? responseText(d) : protocol === 'messages' ? anthropicText(d) : geminiText(d);
    return sendJson(res, 200, {
      id: d?.id || `opencode_${Date.now()}`,
      object: 'chat.completion',
      model: payload.model,
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
      _opencode: { protocol, url }
    });
  } catch (e) {
    const message = e?.name === 'AbortError' ? 'OpenCode request timed out' : (e?.message || String(e));
    return sendJson(res, 500, { error: message });
  }
}
