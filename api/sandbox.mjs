import { Sandbox } from '@vercel/sandbox';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { validateFiles, validateCommand, MAX_FILES, MAX_BYTES } from '../lib/validation.mjs';

export const config = { maxDuration: 60 };
const RESP = (res, status, data) => res.status(status).json(data);
const saneText = s => String(s ?? '').slice(-12000);
function authorized(req) {
  const secret = process.env.AIWAY_SANDBOX_SECRET;
  if (!secret || secret.length < 24) return false;
  const incoming = req.headers['x-aiway-secret'] || '';
  const a = Buffer.from(String(incoming)), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
const exec = async(sb, cmd, args=[], opt={}) => {
  const r = await sb.runCommand({cmd,args,cwd:'/vercel/sandbox',...opt});
  if(opt.detached) return {started:true};
  return {exitCode:r.exitCode, stdout:saneText(await r.stdout()), stderr:saneText(await r.stderr())};
};
// SDK v1 exposes sandboxId; newer releases can also expose named sandboxes.
// Never trust a caller-supplied identifier without checking its format.
function sandboxIdentity(body) {
  const id=String(body.sandboxId||body.name||'');
  if (/^sbx_[a-zA-Z0-9_-]{4,160}$/.test(id)) return {sandboxId:id};
  if (/^aiway-[a-zA-Z0-9-]{4,70}$/.test(id)) return {name:id};
  const err=new Error('INVALID_SANDBOX_ID: saved sandbox identifier is missing or invalid; create a fresh sandbox');
  err.statusCode=422;throw err;
}
async function sandboxFor(body) {return Sandbox.get(sandboxIdentity(body));}
const isStopped = e => { const msg=String(e?.message||'')+' '+String(e?.code||''); return Number(e?.statusCode||e?.status||e?.response?.status)===410 || /SANDBOX_STOPPED|SANDBOX_STOPPING|snapshot.*(expired|not found)/i.test(msg); };
// Run ONE retry only when the provider confirms that the previous session stopped.
// SDK persistent named sandboxes can resume from a snapshot upon command execution.
async function withResume(body, operation) {
  let sb=await sandboxFor(body);
  try {return await operation(sb)} catch(e) {
    if(!isStopped(e)) throw e;
    await new Promise(resolve=>setTimeout(resolve,700));
    sb=await sandboxFor(body);
    return operation(sb);
  }
}
const shell = (sb,command) => exec(sb,'timeout',['48s','bash','-lc',`cd /vercel/sandbox && ${command}`]);
// Fixed absolute module path avoids MODULE_NOT_FOUND when the generated project re-runs npm install.
const chromiumScript = String.raw`const {chromium}=require('/vercel/sandbox/.aiway-tools/node_modules/playwright-core');
const chromiumBinary=require('/vercel/sandbox/.aiway-tools/node_modules/@sparticuz/chromium');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:await chromiumBinary.executablePath(),args:chromiumBinary.args});
 try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const url=process.argv[1]||'data:text/html,<title>AiWay browser smoke test</title>';
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});
 const data={title:await page.title(),status:response?.status()||200,pageErrors:errors};
 console.log(JSON.stringify(data)); if(errors.length)process.exitCode=2;
 }finally{await browser.close()}})().catch(e=>{console.error(e.stack||e);process.exitCode=1})`;
async function chromiumProbe(sb) {
  return exec(sb,'node',['-e',chromiumScript,'data:text/html,<title>AiWay browser smoke test</title>'],{});
}
function apiFailure(e) {
  const detail = saneText(e?.message || e);
  const status = Number(e?.statusCode || e?.status || e?.response?.status || 0);
  const code = String(e?.code || '');
  const limited = status === 429 || /(?:^|\D)429(?:\D|$)|rate.limit|quota|too many requests|resource.exhausted/i.test(detail);
  const auth = status === 401 || status === 403;
  const gone = status === 410 || /SANDBOX_STOPPED|SANDBOX_STOPPING|SNAPSHOT_NOT_FOUND|SNAPSHOT_EXPIRED/i.test(code+' '+detail);
  const notFound = status === 404 || /SANDBOX_NOT_FOUND|SANDBOX_EXPIRED/i.test(code + ' ' + detail);
  const hint = limited ? 'Vercel Sandbox رفض الطلب بسبب حد الاستخدام/المعدل. افتح Vercel → Usage → Sandboxes، انتظر تجدد الحد، ولا تكرر إنشاء البيئات بسرعة.'
    : auth ? 'تأكد من تفعيل Sandboxes للمشروع وصلاحيات Vercel/OIDC. AIWAY_SANDBOX_SECRET يحمي موقعك فقط ولا يمنح صلاحيات Vercel.'
    : gone ? 'جلسة Sandbox انتهت أو لقطة استعادتها لم تعد متاحة. سيحاول AiWay استعادة الجلسة أو إنشاء أخرى ومزامنة الملفات عند تنفيذ الطلب التالي.'
    : notFound ? 'Sandbox غير متاح أو انتهت صلاحيته؛ احذف الجلسة القديمة وأنشئ جلسة واحدة جديدة.'
    : 'راجع سجلات Functions وSandboxes في لوحة Vercel لمعرفة الخطأ الأصلي.';
  return { status:limited?429:auth?403:gone?410:notFound?404:(status>=400&&status<500?status:502), data:{ok:false,error:hint,detail,code,upstreamStatus:status||undefined} };
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return RESP(res,405,{error:'POST only'});
  if (!authorized(req)) return RESP(res,401,{error:'Unauthorized. Configure AIWAY_SANDBOX_SECRET (24+ characters).'});
  const b=req.body||{};
  try {
    if(b.action==='create') {
      const requestedName='aiway-'+randomUUID().slice(0,18);
      const sb=await Sandbox.create({name:requestedName,persistent:true,runtime:'node24',resources:{vcpus:1},timeout:5*60*1000,ports:[3000]});
      const sandboxId=typeof sb.sandboxId==='string'?sb.sandboxId:'';
      const name=typeof sb.name==='string'?sb.name:'';
      const identity=/^sbx_[a-zA-Z0-9_-]{4,160}$/.test(sandboxId)?sandboxId
        : /^aiway-[a-zA-Z0-9-]{4,70}$/.test(name)?name:'';
      if(!identity){await sb.stop().catch(()=>{});throw Error('SDK did not return a usable sandboxId or name; upgrade @vercel/sandbox');}
      // Probe the VM before telling the frontend creation succeeded.
      const probe=await exec(sb,'node',['--version']);
      if(probe.exitCode!==0) {await sb.stop().catch(()=>{});throw Error('SANDBOX_PROBE_FAILED: '+probe.stderr);}
      return RESP(res,200,{ok:true,name:identity,sandboxId:identity,probe,limits:{vcpus:1,sessionMinutes:5,files:MAX_FILES,bytes:MAX_BYTES}});
    }
    if (!['sync','run','preview','stop','powershell','chromium','chromium-install','status'].includes(b.action)) return RESP(res,400,{error:'Unknown action'});
    if(b.action==='status') {const sb=await sandboxFor(b);return RESP(res,200,{ok:true,name:b.sandboxId||b.name,status:sb.status||'available'});}
    if(b.action==='sync') {
      const files=validateFiles(b.files);
      await withResume(b,sb=>sb.writeFiles(files.map(f=>({path:'/vercel/sandbox/'+f.path,content:Buffer.from(f.content,'utf8')}))));
      return RESP(res,200,{ok:true,count:files.length});
    }
    if(b.action==='run') {
      const command=validateCommand(b.command);
      const r=await withResume(b,sb=>shell(sb,command));return RESP(res,200,{ok:r.exitCode===0,...r});
    }
    if(b.action==='preview') {
      const command=validateCommand(b.command||'python3 -m http.server 3000 --bind 0.0.0.0');
      const result=await withResume(b,async sb=>{
        const url=sb.domain(3000);
        const host=new URL(url).hostname;
        // Vite's host allowlist: admit only THIS sandbox preview hostname (never allowedHosts:true).
        const viteHost=/^[a-z0-9.-]+\.vercel\.run$/i.test(host) ? host : '';
        const envPrefix=viteHost ? `export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=${JSON.stringify(viteHost)}; ` : '';
        return {...(await exec(sb,'bash',['-lc',`cd /vercel/sandbox && ${envPrefix}${command}`],{detached:true})),url};
      });
      return RESP(res,200,{ok:true,...result});
    }
    if(b.action==='powershell') {
      // Install only on user request. Availability depends on the current Linux image.
      if(b.install) {
        // Microsoft-published RHEL compatible RPM; Amazon Linux compatibility must be verified on actual sandbox.
        const command="if command -v pwsh >/dev/null 2>&1; then pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'; else sudo dnf install -y https://github.com/PowerShell/PowerShell/releases/download/v7.6.6/powershell-7.6.6-1.rh.x86_64.rpm && pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'; fi";
        const r=await withResume(b,sb=>shell(sb,command));
        return RESP(res,200,{ok:r.exitCode===0,...r,warning:'This RPM targets RHEL-compatible Linux; verify compatibility on the Vercel Sandbox image.'});
      }
      const script=String(b.script||'').slice(0,4000);
      const encoded=Buffer.from(script,'utf16le').toString('base64');
      const r=await withResume(b,sb=>exec(sb,'pwsh',['-NoProfile','-NonInteractive','-EncodedCommand',encoded]));
      return RESP(res,200,{ok:r.exitCode===0,...r});
    }
    if(b.action==='chromium-install') {
      // Independent toolchain: never place Playwright in a generated project's node_modules.
      // A later npm install in /vercel/sandbox must not prune the test runner.
      const r=await withResume(b,async sb=>{
        // Chromium binary built for AWS Lambda / Amazon Linux 2023.
        // Keep Playwright in an isolated directory so the project's npm install never removes it.
        const setup=await shell(sb,`mkdir -p .aiway-tools && npm install --prefix .aiway-tools --no-audit --no-fund --no-save playwright-core@1.56.1 @sparticuz/chromium@141.0.0`);
        if(setup.exitCode!==0)return {...setup,phase:'npm'};
        const probe=await chromiumProbe(sb);
        if(probe.exitCode!==0) {
          // A working npm package + downloaded browser is not the same as a runnable browser.
          const diagnostic=await shell(sb,`ldd /tmp/chromium 2>&1 | grep 'not found' | head -20 || true`);
          return {...probe,phase:'launch',missingLibraries:diagnostic.stdout,installOutput:setup.stdout,browserProvider:'@sparticuz/chromium'};
        }
        return {...probe,phase:'launch',installOutput:setup.stdout,browserProvider:'@sparticuz/chromium'};
      });
      return RESP(res,200,{ok:r.exitCode===0,...r,notice:r.exitCode===0?'AWS-compatible Chromium and Playwright launched successfully.':'Browser setup did not complete. Read stderr / phase; Check browser launch diagnostics and missingLibraries. The AWS Chromium package is a separate upstream implementation.'});
    }
    if(b.action==='chromium') {
      // Always use the isolated Playwright package. Never resolve from the app being tested.
      const url=String(b.url||'http://127.0.0.1:3000');
      if(!/^http:\/\/127\.0\.0\.1:3000(?:\/|$)/.test(url))throw Error('Only local sandbox preview allowed');
      const r=await withResume(b,sb=>exec(sb,'node',['-e',chromiumScript,url],{}));
      return RESP(res,200,{ok:r.exitCode===0,...r,hint:r.exitCode?'Run cloud_chromium_install once; if launch fails, check missing .so libraries. No installation is attempted during this test.':'Chromium ran and inspected the local preview.'});
    }
    await (await sandboxFor(b)).stop();return RESP(res,200,{ok:true,stopped:true});
  } catch(e) {const {status,data}=apiFailure(e);return RESP(res,status,data);}
}
