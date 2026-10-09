import { Sandbox } from '@vercel/sandbox';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
const chromiumScript = readFileSync(new URL('./browser-audit.cjs', import.meta.url), 'utf8');
const browserPayload = (url,steps=[]) => Buffer.from(JSON.stringify({url,steps,viewport:{width:390,height:844}})).toString('base64url');
async function chromiumProbe(sb) {
  return exec(sb,'node',['-e',chromiumScript,browserPayload('data:text/html,<title>AiWay browser smoke test</title>')]);
}
// Browser binaries use NSS libraries that are not bundled in the minimal Amazon Linux image.
// Install OS packages using Vercel SDK sudo (not apt-get, not arbitrary AI shell input).
const NSS_LIBRARIES = ['libnspr4.so','libnss3.so','libnssutil3.so'];
async function browserMissingLibs(sb) {
  const r=await shell(sb,'if [ -f /tmp/chromium ]; then ldd /tmp/chromium 2>&1 | grep "not found" || true; else echo "Chromium executable not extracted yet"; fi');
  return r.stdout.trim();
}
async function ensureNssLibraries(sb) {
  const check=await exec(sb,'bash',['-lc', 'ldconfig -p 2>/dev/null | grep -E "lib(nspr4|nss3|nssutil3)\\.so" || true']);
  const missing=NSS_LIBRARIES.filter(lib=>!check.stdout.includes(lib));
  if(!missing.length)return {ok:true,installedNow:false,checkedLibraries:NSS_LIBRARIES};
  // This runs with the documented Sandbox sudo flag; avoid sudo inside a shell command.
  const install=await exec(sb,'dnf',['install','-y','nspr','nss','nss-util'],{sudo:true});
  if(install.exitCode!==0)return {ok:false,phase:'system_dependencies',exitCode:install.exitCode,stderr:install.stderr,stdout:install.stdout,missingBefore:missing,remedy:'Vercel Sandbox dnf installation failed; inspect stdout/stderr and permissions. Do not automatically retry.'};
  const after=await exec(sb,'bash',['-lc','ldconfig -p 2>/dev/null | grep -E "lib(nspr4|nss3|nssutil3)\\.so" || true']);
  const remaining=NSS_LIBRARIES.filter(lib=>!after.stdout.includes(lib));
  return {ok:remaining.length===0,phase:'system_dependencies',installedNow:true,exitCode:remaining.length?1:0,missingBefore:missing,missingAfter:remaining,stdout:install.stdout,stderr:install.stderr,remedy:remaining.length?'Packages installed but shared objects were not detected; inspect rpm -ql nspr nss nss-util and ldconfig.':undefined};
}
function validateBrowserSteps(steps) {
  if(steps===undefined)return [];
  if(!Array.isArray(steps)||steps.length>8)throw Object.assign(new Error('Up to 8 browser interactions per test'),{statusCode:400});
  return steps.map(s=>{
    if(!s||!['click','fill','check','assertVisible','assertText'].includes(s.action))throw Object.assign(new Error('Invalid browser action'),{statusCode:400});
    if(typeof s.selector!=='string'&&typeof s.text!=='string')throw Object.assign(new Error('Selector or text required'),{statusCode:400});
    const selector=String(s.selector||'').slice(0,160),text=String(s.text||'').slice(0,100);
    if(/[\r\n]/.test(selector))throw Object.assign(new Error('Invalid selector'),{statusCode:400});
    return {action:s.action,selector,text,value:String(s.value||'').slice(0,300),timeoutMs:3500};
  });
}
async function browserResult(sb,execution) {
  const marker='AIWAY_AUDIT_JSON:';
  const line=execution.stdout.split('\n').find(x=>x.startsWith(marker));
  let report;
  try{report=JSON.parse(line.slice(marker.length));}catch{report={ok:false,phase:'launch',error:execution.stderr||execution.stdout||'Browser exited without a report'};}
  let screenshot;
  if(report.screenshotCaptured){
    try { const file=await sb.readFileToBuffer({path:report.screenshotPath});
      if(file.length<180000)screenshot='data:image/jpeg;base64,'+file.toString('base64');
      else report.screenshotNote='Screenshot exceeds size limit';
    }catch(e){report.screenshotNote=String(e.message||e).slice(0,160)}
  }
  delete report.screenshotPath;
  return {ok:execution.exitCode===0&&report.ok===true,exitCode:execution.exitCode,phase:report.phase,report,screenshot};
}
// A detached process is not proof the server is listening. Reuse healthy servers,
// otherwise start a fresh one and probe from INSIDE the same microVM.
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function previewProbe(sb) {
  const check=await exec(sb,'node',['-e',
    'const http=require("node:http");const req=http.get("http://127.0.0.1:3000/",{timeout:2500},r=>{r.resume();console.log("HTTP_STATUS="+r.statusCode);process.exit(r.statusCode>=500?2:0)});req.on("error",e=>{console.error(e.code||e.message);process.exit(1)});req.on("timeout",()=>req.destroy(new Error("timeout")))'
  ]);
  return {...check,ready:check.exitCode===0};
}
async function ensurePreview(sb,command) {
  const url=sb.domain(3000);
  let probe=await previewProbe(sb);
  if(probe.ready)return {ok:true,url,ready:true,reused:true,http:probe.stdout.trim()};
  const host=new URL(url).hostname;
  const safeHost=/^[a-z0-9.-]+\.vercel\.run$/i.test(host)?host:'';
  const envPrefix=safeHost ? `export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=${JSON.stringify(safeHost)}; ` : '';
  // Preview commands are validated; command runs only in an isolated sandbox.
  const launch=await exec(sb,'bash',['-lc',`cd /vercel/sandbox && ${envPrefix}exec ${command}`],{detached:true});
  for(let attempt=0;attempt<12;attempt++){
    await sleep(850);
    probe=await previewProbe(sb);
    if(probe.ready)return {ok:true,url,ready:true,reused:false,http:probe.stdout.trim()};
  }
  const diagnostics=await exec(sb,'bash',['-lc','ps -ef | grep -E "vite|http.server|next|node" | grep -v grep | tail -12 || true']);
  return {ok:false,phase:'preview_not_listening',ready:false,exitCode:1,
    error:'Preview server did not start listening on port 3000',
    stderr:(probe.stderr||'')+'\n'+diagnostics.stdout,
    hint:'Check package scripts, dependencies and server port. No preview URL is presented as ready.'};
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
      const result=await withResume(b,sb=>ensurePreview(sb,command));
      return RESP(res,200,result);
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
    if(b.action==='chromium-install'||b.action==='chromium') {
      // One backend request owns browser readiness and inspection. The AI must not loop on setup.
      // Everything is isolated from the generated project's npm dependencies.
      const isTest=b.action==='chromium';
      const steps=validateBrowserSteps(b.steps);
      const url=String(b.url||'http://127.0.0.1:3000');
      if(isTest&&!/^http:\/\/127\.0\.0\.1:3000(?:\/|$)/.test(url)) return RESP(res,400,{ok:false,phase:'validation',error:'Only the local sandbox preview is allowed'});
      const r=await withResume(b,async sb=>{
        if(isTest){
          let preview=await previewProbe(sb);
          if(!preview.ready){
            const startCmd=String(b.previewCommand||'').trim() || 'if [ -f package.json ]; then npm run dev -- --host 0.0.0.0 --port 3000; else python3 -m http.server 3000 --bind 0.0.0.0; fi';
            const restarted=await ensurePreview(sb,validateCommand(startCmd));
            if(!restarted.ok)return {ok:false,exitCode:1,phase:'preview_not_listening',stderr:restarted.stderr,error:restarted.error};
          }
        }
        // Run setup in a deterministic order. Never label a green API response as browser success.
        const present=await shell(sb,'test -d .aiway-tools/node_modules/playwright-core && test -d .aiway-tools/node_modules/@sparticuz/chromium && echo present || true');
        let setup=null;
        if(present.stdout.trim()!=='present'){
          const failed=await shell(sb,'test -f .aiway-tools/.install-failed && cat .aiway-tools/.install-failed || true');
          if(failed.stdout.trim())return {ok:false,exitCode:1,phase:'setup_blocked',stderr:failed.stdout,remedy:'Previous npm setup failed; inspect it before retrying.'};
          const install=await shell(sb,'mkdir -p .aiway-tools && npm install --prefix .aiway-tools --no-audit --no-fund --no-save playwright-core@1.56.1 @sparticuz/chromium@141.0.0');
          setup={stdout:install.stdout,stderr:install.stderr,exitCode:install.exitCode};
          if(install.exitCode!==0){
            await shell(sb,'mkdir -p .aiway-tools && printf %s "npm setup failed; see installOutput in AiWay" > .aiway-tools/.install-failed');
            return {ok:false,phase:'install',...install,remedy:'npm installation failed; do not blindly retry.'};
          }
        }
        // Installed Node packages alone do not imply Linux system libraries are available.
        const osDependencies=await ensureNssLibraries(sb);
        if(!osDependencies.ok)return {ok:false,exitCode:osDependencies.exitCode||1,phase:'system_dependencies',osDependencies,stderr:osDependencies.stderr||'Missing NSS libraries'};
        const probe=await chromiumProbe(sb);
        if(probe.exitCode!==0){
          const diagnostic=await browserMissingLibs(sb);
          return {ok:false,...probe,phase:'launch',installOutput:setup,osDependencies:{installedNow:osDependencies.installedNow},missingLibraries:diagnostic,remedy:'NSS packages were prepared. Check remaining missing libraries and browser crash logs; do not reinstall npm dependencies.'};
        }
        if(!isTest)return {ok:true,...probe,phase:'ready',installedNow:!!setup};
        const inspection=await exec(sb,'node',['-e',chromiumScript,browserPayload(url,steps)]);
        return {...(await browserResult(sb,inspection)),installedNow:!!setup};
      });
      return RESP(res,200,{...r,ok:r.ok===true,browserProvider:'@sparticuz/chromium',attemptPolicy:'one setup attempt per sandbox; no agent install/test loop'});
    }
    await (await sandboxFor(b)).stop();return RESP(res,200,{ok:true,stopped:true});
  } catch(e) {const {status,data}=apiFailure(e);return RESP(res,status,data);}
}
