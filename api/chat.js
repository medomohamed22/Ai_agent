import { GoogleGenAI } from '@google/genai';
import { extractJson, json, readJson } from './_lib.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!process.env.GEMINI_API_KEY) return json(res, 400, { error: 'أضف GEMINI_API_KEY في Environment Variables' });
    const body = await readJson(req);
    const language = body.language || 'ar';
    const prompt = `أنت وكيل تحليل متطلبات لمنصة تنشئ مواقع ويب. رد بنفس لغة المستخدم (${language}).\nوصف المستخدم: ${body.description}\nحلل الفكرة واقترح بالضبط 5 أسئلة عالية التأثير تخص هيكلة الصفحات، الجمهور، الوظائف، البيانات، والتصميم. لا تستخدم Markdown ولا نجوم. أرجع JSON فقط بالشكل: {"summary":"...","questions":["..."],"suggestedFeatures":["..."]}`;
    const response = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: 'application/json' } });
    const data = extractJson(response.text);
    if (!Array.isArray(data.questions) || data.questions.length !== 5) throw new Error('تعذر توليد خمسة أسئلة صحيحة');
    json(res, 200, data);
  } catch (error) { json(res, 500, { error: error.message }); }
}
