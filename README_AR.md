# AiWay + Vercel Sandbox (تجريبي — للاستخدام الشخصي)

هذه الحزمة تحتوي واجهة AiWay الأصلية مع إضافات Cloud Terminal وCloud Test وCloud Preview وخادم Vercel Function يتصل بخدمة Vercel Sandbox الحقيقية. ملفات Workspace محفوظة في IndexedDB بالمتصفح، وتتم مزامنتها إلى Sandbox عند تشغيل الأوامر. يبدأ Sandbox بذاكرة 2GB ومعالج vCPU واحد وجلسة 5 دقائق. **هذه الحدود محلية للحزمة وليست ضمانًا بعدم استهلاك رصيد Hobby الشهري.**

## التشغيل على Vercel

1. فك الضغط وارفع **مجلد المشروع** (وليس ملف HTML فقط) إلى مستودع GitHub خاص ثم اربطه بـ Vercel. Framework Preset: Other، Root Directory: جذر المجلد، Install Command: `npm install`، واترك Output Directory فارغًا؛ ملف `index.html` موجود مباشرة في جذر المشروع بجانب `api` و`package.json`.
2. أضف إلى إعدادات Environment Variables في Vercel المتغير `AIWAY_SANDBOX_SECRET` بقيمة عشوائية قوية لا تقل عن 24 حرفًا. مثال لتوليده: `openssl rand -hex 32`.
3. SDK يستخدم ربط OIDC الخاص بمشروع Vercel بشكل تلقائي في الإنتاج. للاختبار المحلي نفّذ `vercel link` ثم `vercel env pull .env.local` (أو استخدم `VERCEL_TOKEN` و`VERCEL_TEAM_ID` و`VERCEL_PROJECT_ID`). لا تضع هذه المفاتيح داخل كود HTML.
4. افتح الموقع، اختر وضع **Coding**، واضغط **Cloud Terminal**، وأدخل نفس المفتاح في الحقل ثم **حفظ** وبعدها **إنشاء**.
5. اطلب من نموذج البرمجة إنشاء المشروع بملفات داخل Workspace واستخدام `cloud_test` لاختبارات البناء، ثم `cloud_preview` لتشغيل سيرفر حقيقي. عند ظهور أخطاء، سيعيد نتائجها للنموذج ليعدل الملفات (بحد أقصى ثلاث جولات اختبار لكل طلب). المعاينة داخل إطار وقد يمنعها السيرفر أو سياسات المتصفح في بعض الحالات؛ استخدم رابط Open preview ↗ حينئذ.

## أوامر أمثلة

- React/Vite: `npm install && npm run build` ثم معاينة `npm run dev -- --host 0.0.0.0 --port 3000`
- Python: `python3 -m unittest discover -v` ثم معاينة static `python3 -m http.server 3000 --bind 0.0.0.0`
- PowerShell: اضغط **Install pwsh** لتجربة RPM من Microsoft ثم `pwsh`/PowerShell بالزر. متطلبات وتوافق Amazon Linux قد تستلزم إعدادًا إضافيًا.
- Chromium: اضغط **Install Chromium** لتثبيت playwright والمتصفح، ثم شغّل معاينة السيرفر واضغط **Chromium** لفحص التحميل والأخطاء. التثبيت قد يحتاج وقتًا/ذاكرة أو حزم لا تتوافق مع بيئة Hobby. تأكد من شروط المنصة.

## القيود المهمة

- هذا إصدار **خاص بمالك واحد** فقط، وليس خدمة عامة آمنة لتشغيل أوامر مستخدمين مجهولين. تشارك سر واحد يعطي حامل السر صلاحية تنفيذ أوامر داخل Sandboxes المشروع. لا تنشر السر، ولا تعرض الواجهة مع وصول لمستخدمين آخرين قبل بناء منظومة حسابات وتفويض منفصلة، وحدود server-side لكل مستخدم ومراقبة الاستهلاك.
- حد الثلاث جولات مطبق في الواجهة فقط، وليس حصانة ضد مستخدم خبيث. لا توجد قاعدة بيانات لإدارة حصص شهرية. Vercel قد يوقف العمل عند تجاوز رصيد Hobby. راقب Usage وSandbox metrics.
- مزامنة الملفات ترسل الملفات الحالية فقط ولا تحذف بالضرورة الملفات التي كانت موجودة قديمًا على sandbox. حفظ الملفات الأساسي عبر IndexedDB مرتبط بجهاز ومتصفح المستخدم. استعادة البيئة البعيدة تعتمد على ميزة sandbox persistence (قد تستهلك مساحة تخزين محسوبة).
- لا يمكن معاينة برامج GUI أو Windows .exe كأنها تطبيق ويب. رابط المعاينة يحتاج سيرفر يستمع على 0.0.0.0:3000 وليس localhost فقط. ينتهي البث عند توقف جلسة Sandbox ولا يعني نشر إنتاج دائم.
- PowerShell هو Linux PowerShell وليس Windows PowerShell. Chromium تشغيل اختياري وليس مضمون النجاح في كل صورة لينكس أو داخل مهلة Vercel Function.
- تم اختبار نحو JavaScript و6 اختبارات للتحقق من مسارات الملفات في هذه الحزمة محلياً، **ولم يتم تنفيذ Sandbox حقيقي على حساب Vercel** لعدم توفر بيانات الاعتماد/اتصال مناسب هنا. راجع النقاط أعلاه ونفّذ اختبارًا مباشرًا بعد النشر.

## الاختبارات المحلية

`npm install && npm test` ثم `vercel dev` عند توفر credentials. لا ترفع `.env.local` إلى GitHub.

## مصادر رسمية

- https://vercel.com/docs/sandbox
- https://vercel.com/changelog/sandbox-persistence-is-now-ga
- https://vercel.com/docs/plans/hobby
- https://vercel.com/sandbox
- https://learn.microsoft.com/powershell/scripting/install/install-rhel

## إصلاح أخطاء 429 ورسائل Sandbox (تحديث)
- `429` في مزوّد النموذج `apodex` **من مزوّد الذكاء الاصطناعي**، وليس من Vercel Sandbox. اختَر موديلًا آخر أو انتظر إعادة فتح الحد عند المزوّد، ثم أعد المحاولة؛ لا توجد حيلة في الـBackend لتجاوز حصص المزوّد.
- `429` في أدوات Cloud Terminal/Sandbox يعني **رفضًا من Vercel أو إحدى خدمات الـSandbox بسبب الحد**؛ افتح لوحة Vercel → Usage → Sandboxes ثم Function Logs للسبب. لا تكرر الضغط على "إنشاء" أو "Install" أثناء منع الاستخدام، ولا يمكن ضمان تشغيل Sandbox إذا استُنفدت حصة حساب Hobby.
- الـBackend الآن يعيد أكواد HTTP واضحة وأسبابًا مقروءة مع حالة `status` للـSandbox؛ وبناء/اختبار غير ناجح يعيد `stdout`/`stderr` حتى يقدر وكيل البرمجة يصلح الكود.
- أداة Cloud Test تحسب جولة الاختبار بعد وصول نتيجة فعلية، وليس عند فشل مزوّد Sandbox بحد الطلبات.
- اعمل Redeploy بعد تعديل Environment Variables. ابدأ بـ **Create** ثم **Run Bash** واكتب `node --version` قبل تثبيت أدوات كبيرة.
- **مهم**: إصلاح عرض الأخطاء لا يرفع حدود الخطط المجانية ولا يصلح نقص صلاحيات Vercel تلقائيًا. هذه نسخة إصلاح محلية وتتطلب اختبارات فعلية على حسابك.

## إصلاح مشكلة Sandbox name invalid (2026-10-09)
- السبب: إصدارات SDK قد ترجع `sandbox.sandboxId` بدل `sandbox.name`، فكانت الواجهة تحفظ معرفاً فارغاً ثم يفشل `Sandbox.get({name})`.
- الخادم الآن يفضل `sandboxId` ويستخدم `Sandbox.get({sandboxId})`، مع دعم الأسماء الصحيحة للإصدارات الحديثة.
- عند الإنشاء يجري اختبار `node --version` داخل Sandbox الحقيقي قبل إعلان نجاح الإنشاء، ويعيد `probe` للواجهة. هذه خطوة تنفيذ فعلية وليست فحصاً شكلياً.
- إذا كان لديك اسم جلسة قديم غير صالح، ستتعرف عليه الواجهة وتحاول إنشاء جلسة جديدة تلقائياً. لتجربة نظيفة يمكنك مسح Site Data للموقع (سيحذف Workspace المحلي أيضاً؛ صدّر ملفاتك أولاً إن فعلت).
- بعد النشر اختبر: إنشاء ثم `node --version` ثم `pwd` ثم `echo hello`. أي فشل جديد يحتاج Vercel Functions Logs لتحديده؛ لم نختبر تشغيل Vercel فعلياً هنا.
