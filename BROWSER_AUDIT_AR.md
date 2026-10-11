# إعادة اختبارات AiWay في Chromium — 11 أكتوبر 2026

## النتائج التي أمكن تنفيذها
- `npm test`: **11/11 PASS**.
- `node --check` لـ `api/sandbox.mjs` و `api/daily-check.mjs` والكود المضمّن المستخرج من `index.html`: **PASS**.
- `python tests/browser_smoke.py` في Chromium headless 144: **14/14 PASS** للفحوص المحددة (تحميل واجهة HTML، عناصر التطبيق، فتح وإغلاق الإعدادات، قائمة إعدادات الواجهة، لوحة السياق، Slash، RAG، المهام، اختيار جهد Reasoning، توسيع اللوحة، محادثة جديدة، إدخال نص، وأخطاء JavaScript بخلاف قيد IndexedDB).

## حدود حقيقية للاختبار
- الشبكة المحلية `localhost` وفتح `file://` محظوران بسياسة بيئة Chromium؛ لذلك استخدم الاختبار `page.set_content` لعرض HTML وفحص التفاعلات.
- `page.set_content` يولّد origin غير موثوق، مما يمنع IndexedDB. ظهور رسالة `Indexed Database API is denied in this context` قيد لهذا الاختبار، **وليس دليلاً على نجاح أو فشل IndexedDB عند نشر الموقع**.
- لا تشمل الاختبارات الاتصال الفعلي بمزودي النماذج، MCP، PDF.js عبر CDN، Vercel Cron، أو إنفاق توكنات حقيقيًا.
- ملف `tests/browser-code.js` القديم **لا يجتاز** `node --check`: به تعريفان مختلفان باسم `shrink`؛ أما كود `index.html` الحالي فيجتاز الفحص. الملف القديم ليس صفحة التطبيق المنشورة. تركناه كما هو لتجنب تغيير اختبارات تاريخية دون معرفة استخداماتها.
- فحص الواجهة لا يثبت وظائف API/RAG كاملة ولا دقة التحميل الفعلي للتوكنات.

## أوامر إعادة الاختبار
```bash
npm test
python tests/browser_smoke.py
python -c "import re; s=open('index.html').read();open('/tmp/aiway_inline.js','w').write('\n'.join(re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',s,re.S|re.I)))"
node --check /tmp/aiway_inline.js
node --check api/sandbox.mjs
node --check api/daily-check.mjs
```

## الملفات المضافة
- `tests/browser_smoke.py`: سكربت اختبارات Chromium تفاعلية بواسطة Playwright Python؛ يتطلب وجود `playwright` وChromium.
- `browser_results.json`: نتائج آخر تشغيل.
- `browser_home.png`: لقطة شاشة مرجعية.
