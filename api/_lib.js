import crypto from 'node:crypto';

export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('جسم الطلب ليس JSON صحيحًا'); }
}

export function baseUrl(req) {
  return process.env.APP_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
}

function key() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET غير مضبوط أو قصير');
  return crypto.createHash('sha256').update(value).digest();
}

export function seal(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function unseal(token) {
  const data = Buffer.from(token, 'base64url');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString());
}

export function cookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';').map(v => v.trim());
  const found = cookies.find(v => v.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

export function setCookie(res, name, value, maxAge = 60 * 60 * 24 * 30) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

export function clearCookie(res, name) {
  res.setHeader('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function randomString(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
export function sha256(value) { return crypto.createHash('sha256').update(value).digest('base64url'); }
export function safeName(value = 'ai-site') {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 45) || `ai-site-${Date.now()}`;
}

export function getConnections(req) {
  const raw = cookie(req, 'builder_connections');
  if (!raw) return {};
  try { return unseal(raw); } catch { return {}; }
}

export function saveConnections(res, connections) {
  setCookie(res, 'builder_connections', seal(connections));
}

export function extractJson(text) {
  const cleaned = String(text || '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error('Gemini لم يرجع JSON صالحًا');
}

export async function vercelFetch(path, token, options = {}) {
  const response = await fetch(`https://api.vercel.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data.error?.message || data.message || `Vercel API ${response.status}`);
  return data;
}

export async function supabaseFetch(path, token, options = {}) {
  const response = await fetch(`https://api.supabase.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data.message || data.error || `Supabase API ${response.status}`);
  return data;
}
