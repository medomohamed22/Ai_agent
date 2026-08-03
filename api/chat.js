import { GoogleGenAI } from '@google/genai';
import { extractJson, json, readJson } from './_lib.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!process.env.GEMINI_API_KEY) return json(res, 400, { error: 'أضف GEMINI_API_KEY في Environment Variables' });
    const body = await readJson(req);
    const language = body.language || 'ar';
    const prompt = `أنت وكيل تحليل منتجات لمنصة تنشئ مواقع ويب. رد بنفس لغة المستخدم (${language}).\nوصف المستخدم: ${body.description}\nحلل الفكرة ثم اقترح بالضبط 5 أفكار عالية التأثير يمكن للمستخدم اختيار تنفيذ فكرة واحدة أو أكثر منها. يجب أن تغطي الأفكار عند الحاجة: هيكلة الصفحات، تجربة المستخدم، الوظائف الأساسية، البيانات أو لوحة الإدارة، وعنصر مميز يزيد قيمة الموقع. لا تكتب أسئلة ولا تطلب إجابات نصية. اجعل كل اقتراح واضحًا وقابلًا للتنفيذ. لا تستخدم Markdown ولا نجوم. أرجع JSON فقط بالشكل: {"summary":"ملخص قصير للفكرة","ideas":[{"title":"عنوان قصير","description":"شرح عملي مختصر"}]}`;
    const response = await ai.models.generateContent({ model: process.env.GEMINI_MODEL || 'gemini-3.5-flash', contents: prompt, config: { responseMimeType: 'application/json' } });
    const data = extractJson(response.text);
    if (!Array.isArray(data.ideas) || data.ideas.length !== 5) throw new Error('تعذر توليد خمس أفكار صحيحة');
    json(res, 200, data);
  } catch (error) { json(res, 500, { error: error.message }); }
}
