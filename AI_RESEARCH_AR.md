# تحديث AiWay لأدوات الوكيل السحابية

المستندات الرسمية التي تمت مراجعتها:
- https://vercel.com/academy/filesystem-agents/wire-up-sandbox
- https://vercel.com/academy/vercel-sandbox/your-first-sandbox
- https://developers.openai.com/api/docs/guides/function-calling
- https://developers.openai.com/api/docs/guides/tools-computer-use
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

التغييرات: تجنب مزامنة ملفات Workspace عندما لم تتغير؛ إيقاف إعادة تنفيذ أمر Bash تلقائياً بعد انتهاء Sandbox لأن الأمر قد يكون نفذ جزئياً؛ تمييز خطأ الجلسة المستعادة؛ وإرشادات للأداة للتمييز بين نجاح استدعائها ونجاح الاختبار فعلياً.

عند 410 يعاد إنشاء Sandbox ومزامنة ملفات Workspace لكن يحتاج الوكيل أو المستخدم تقييم حالة التشغيل قبل إعادة الأمر. لا تضمن عملية الاستعادة حفظ الحزم المثبتة أو حالة العمليات إذا أُنشئت بيئة جديدة.

الحد الحالي لكل طلب: ست استدعاءات سحابية، وثلاث جولات اختبار. قد يفشل Chromium على Amazon Linux 2023 بسبب مكتبات نظام ناقصة، حتى إذا نجح تنزيل Playwright. تنفيذ `npm install` وChromium في استدعاء Function محدود بالوقت وقد يرجع 504؛ تصميمه كـ job غير متزامن مع تخزين الحالة يعتبر تطويراً لاحقاً ضرورياً للمهام الكبيرة.

هذه النسخة لم تُختبر على حساب Vercel فعلي.
