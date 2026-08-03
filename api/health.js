import { json } from './_lib.js';
export default function handler(req, res) { json(res, 200, { ok: true, apiFiles: 7, geminiConfigured: Boolean(process.env.GEMINI_API_KEY), demoMode: String(process.env.DEMO_MODE).toLowerCase() === 'true' }); }
