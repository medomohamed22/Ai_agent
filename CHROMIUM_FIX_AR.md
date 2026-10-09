# إصلاح Chromium في AiWay

## سبب الخطأ
أداة `cloud_chromium` القديمة كانت تستخدم `require('playwright')` داخل مجلد المشروع. بعدما يُشغّل الوكيل `npm install` لمشروع React، حزمة Playwright الاختيارية قد تكون غير موجودة أو حُذفت؛ لذلك ظهر MODULE_NOT_FOUND. كذلك Playwright Chromium القياسي لا يضمن دعم Amazon Linux 2023.

## الحل المضاف
- استخدام مكتبتَي `playwright-core@1.56.1` و`@sparticuz/chromium@141.0.0`، في مجلد أدوات منفصل `.aiway-tools` داخل Sandbox بدل مجلد مشروع React.
- الاستفادة من نسخة Chromium الموجهة إلى AWS/Linux، مع مسار المتصفح التنفيذي الذي تُرجعه المكتبة.
- عدم تنزيل Chromium الكامل من Playwright أو استخدام `apt-get` أو `--with-deps` في Amazon Linux.
- أثناء `cloud_chromium_install` ينفّذ الاختبار الفعلي: إطلاق المتصفح، ثم فتح صفحة HTML بسيطة، ويعيد `ok:true` فقط لو `exitCode:0`.
- `cloud_chromium` يستخدم نفس الحزم المعزولة ويفحص المعاينة المحلية على المنفذ 3000 ويعيد أخطاء الصفحة إن وجدت.
- إذا تعذر تشغيل Chromium بسبب مكتبات نظام ناقصة، يُرجع الخطأ مع محاولة سرد المكتبات غير المتوفرة بدل إعلان نجاح وهمي.

## النشر
استبدل `api/sandbox.mjs` و`index.html` في Root المشروع، ثم اعمل Redeploy. ليس مطلوبًا إضافة حزم Chromium إلى package.json الخاص بـVercel Function.

## الاختبار بعد النشر
افتح Coding واطلب: «جهز Chromium مرة واحدة باستخدام cloud_chromium_install، واختبر فتح المتصفح الفعلي. ثم افتح معاينة React ونفّذ cloud_chromium. اعرض exitCode وstdout وstderr ولا تدّع النجاح إذا فشل تشغيل المتصفح».

النتيجة المتوقعة للتجهيز: `phase:launch`, `ok:true`, `exitCode:0`، ومعاينة HTML بعنوان `AiWay browser smoke test`. بعدها اختبار الموقع الفعلي يرسل `title`, `status`, `pageErrors`.

**تنبيه:** Vercel Sandbox الحقيقي وحزم Linux لا يمكن تجربتهما هنا بدون حساب Vercel؛ الحزمة اختُبرت محليًا على مستوى JavaScript وفحوصات المشروع فقط. تثبيت الحزم يتطلب تنزيلها من الإنترنت، وقد يصطدم بحد الزمن أو الموارد على Hobby. كل Sandbox جديد قد يحتاج تجهيز Chromium مرة أخرى.
