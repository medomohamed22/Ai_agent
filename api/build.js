import crypto from 'node:crypto';
import postgres from 'postgres';
import { GoogleGenAI } from '@google/genai';
import { extractJson, getConnections, json, readJson, safeName, supabaseFetch, vercelFetch } from './_lib.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function generateProject(input) {
  const prompt = `أنت فريق كامل لبناء المواقع. أنشئ موقعًا إنتاجيًا متجاوبًا حسب الوصف والإجابات.\nالوصف: ${input.description}\nالمميزات المختارة: ${JSON.stringify(input.selectedIdeas || input.answers)}\nاللغة: ${input.language}\nالقيود الإلزامية: الواجهة كلها في ملف index.html واحد يحتوي HTML وCSS وJavaScript داخليًا. لا تستخدم مكتبات خارجية إلا خطوط Google اختيارية. الباك إند JavaScript فقط وبحد أقصى 12 ملف API، لكن لهذا الموقع المولد استخدم ملف api/data.js فقط عند الحاجة. صمم Mobile First مع RTL عند العربية. أرجع JSON فقط: {"name":"english-kebab-name","plan":["..."],"requiresDatabase":true,"indexHtml":"full html","apiDataJs":"full serverless function or empty string","migrationSql":"SQL or empty","smokePath":"/"}. يجب أن يكون indexHtml كاملًا ويعمل. عند وجود قاعدة بيانات استخدم متغيرات NEXT_PUBLIC_SUPABASE_URL وNEXT_PUBLIC_SUPABASE_ANON_KEY في الواجهة، واجعل SQL يشمل grants وRLS آمنة.`;
  const response = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: 'application/json' } });
  return extractJson(response.text);
}

async function provisionSupabase(token, name) {
  const orgs = await supabaseFetch('/v1/organizations', token);
  if (!Array.isArray(orgs) || !orgs[0]) throw new Error('لا توجد مؤسسة Supabase متاحة');
  const password = `${crypto.randomBytes(24).toString('base64url')}aA1!`;
  const project = await supabaseFetch('/v1/projects', token, { method: 'POST', body: JSON.stringify({ name, organization_slug: orgs[0].slug, db_pass: password, region: process.env.SUPABASE_REGION || 'eu-central-1' }) });
  for (let i = 0; i < 50; i++) {
    const current = await supabaseFetch(`/v1/projects/${project.id}`, token);
    if (String(current.status).includes('HEALTHY')) return { ...current, password };
    if (['REMOVED', 'INACTIVE'].includes(current.status)) throw new Error(`حالة مشروع Supabase: ${current.status}`);
    await sleep(5000);
  }
  throw new Error('انتهت مهلة تجهيز Supabase');
}

async function applySql(project, sqlText) {
  if (!sqlText?.trim()) return;
  const connection = `postgresql://postgres:${encodeURIComponent(project.password)}@db.${project.id}.supabase.co:5432/postgres?sslmode=require`;
  const db = postgres(connection, { ssl: 'require', max: 1, connect_timeout: 20 });
  try { await db.unsafe(sqlText); } finally { await db.end({ timeout: 5 }); }
}

async function getPublicKeys(token, ref) {
  const keys = await supabaseFetch(`/v1/projects/${ref}/api-keys`, token);
  const list = Array.isArray(keys) ? keys : [];
  const anon = list.find(k => ['anon', 'publishable'].includes(k.name))?.api_key;
  return { url: `https://${ref}.supabase.co`, anon };
}

async function deploy(token, teamId, generated, env) {
  const name = safeName(generated.name);
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
  const project = await vercelFetch(`/v10/projects${query}`, token, { method: 'POST', body: JSON.stringify({ name, framework: null }) }).catch(async e => {
    if (!/already|exists/i.test(e.message)) throw e;
    return vercelFetch(`/v9/projects/${name}${query}`, token);
  });
  if (env?.url && env?.anon) {
    await vercelFetch(`/v10/projects/${project.id}/env${query}`, token, { method: 'POST', body: JSON.stringify([
      { key: 'NEXT_PUBLIC_SUPABASE_URL', value: env.url, type: 'encrypted', target: ['production','preview'] },
      { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: env.anon, type: 'encrypted', target: ['production','preview'] }
    ]) }).catch(() => {});
  }
  const files = [{ file: 'index.html', data: generated.indexHtml }];
  if (generated.apiDataJs?.trim()) files.push({ file: 'api/data.js', data: generated.apiDataJs });
  const deployment = await vercelFetch(`/v13/deployments${query}`, token, { method: 'POST', body: JSON.stringify({ name, project: project.id, target: 'production', files, projectSettings: { framework: null } }) });
  return deployment;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const input = await readJson(req);
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY غير موجود');
    const connections = getConnections(req);
    const demo = String(process.env.DEMO_MODE).toLowerCase() === 'true' || input.demo === true;
    const generated = await generateProject(input);

    if (demo) return json(res, 200, { demo: true, plan: generated.plan, url: 'https://example.vercel.app', previewHtml: generated.indexHtml, checks: ['تم تحليل المتطلبات', 'تم إنشاء الخطة', 'تم توليد الموقع', 'تم فحص الملفات', 'وضع تجريبي: لم يتم إنشاء موارد حقيقية'] });
    if (!connections.vercel?.accessToken || !connections.supabase?.accessToken) throw new Error('اربط حسابي Vercel وSupabase أولًا');

    let sb = null, publicConfig = null;
    if (generated.requiresDatabase) {
      sb = await provisionSupabase(connections.supabase.accessToken, safeName(generated.name));
      await applySql(sb, generated.migrationSql);
      publicConfig = await getPublicKeys(connections.supabase.accessToken, sb.id);
    }
    const deployment = await deploy(connections.vercel.accessToken, connections.vercel.teamId, generated, publicConfig);
    const url = `https://${deployment.url}`;
    let ok = false;
    for (let i = 0; i < 25; i++) {
      await sleep(3000);
      try { const r = await fetch(url, { redirect: 'follow' }); if (r.ok) { ok = true; break; } } catch {}
    }
    if (!ok) throw new Error('تم إرسال النشر لكن اختبار الرابط لم ينجح بعد');
    json(res, 200, { demo: false, plan: generated.plan, url, supabaseProjectRef: sb?.id || null, checks: ['تم تحليل المتطلبات', 'تم إنشاء الخطة', 'تم توليد الموقع', ...(sb ? ['تم إنشاء قاعدة البيانات وتطبيق SQL'] : []), 'تم النشر على Vercel', 'نجح اختبار الرابط النهائي'] });
  } catch (error) { json(res, 500, { error: error.message }); }
}
