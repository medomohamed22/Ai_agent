BrandPrompt AI — Vercel Static Build

رفع على Vercel:
1) ارفع هذا المجلد كما هو إلى GitHub أو Vercel.
2) Framework Preset: Other / No Framework.
3) Build Command: اتركه فارغًا.
4) Output Directory: اتركه فارغًا.
5) لا تحتاج Environment Variables.

API Keys:
- OpenRouter / Gemini / Exa تُدخل من داخل الواجهة.
- تُحفظ محليًا في متصفح المستخدم (IndexedDB مع localStorage fallback).
- لا يتم تضمين المفاتيح داخل ملفات المشروع ولا حفظها على Vercel.
- التخزين مرتبط بالدومين. استخدم Production URL ثابتًا حتى تظل البيانات والمفاتيح موجودة بين الزيارات.

ملاحظة:
الطلبات إلى مزودي الـ API تخرج مباشرة من المتصفح. إذا منع مزود معين CORS من دومينك، ستحتاج proxy/serverless لذلك المزود فقط؛ لكن النسخة الحالية لا تخزن المفاتيح على السيرفر.
