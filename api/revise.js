import { GoogleGenAI } from '@google/genai';
import { extractJson, json, readJson } from './_lib.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY غير موجود');
    const { html, instruction, language = 'ar' } = await readJson(req);
    if (!html || !instruction) throw new Error('الموقع وتعليمات التعديل مطلوبة');
    const prompt = `أنت مطور واجهات خبير. عدّل ملف HTML التالي حسب الطلب، مع الحفاظ على كل الوظائف الحالية والتجاوب وإمكانية الوصول. أعد JSON فقط بالشكل {"html":"full updated html","summary":"short summary"}. اللغة: ${language}. الطلب: ${instruction}\nHTML:\n${html}`;
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    const out = extractJson(response.text);
    if (!out.html) throw new Error('لم يتم استلام HTML معدل');
    return json(res, 200, out);
  } catch (error) { return json(res, 500, { error: error.message }); }
}
