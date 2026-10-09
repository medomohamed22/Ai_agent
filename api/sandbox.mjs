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
function getName(x){if(!/^aiway-[a-zA-Z0-9-]{4,70}$/.test(x||''))throw Error('Sandbox name invalid');return x}
async function sandboxFor(body) {return await Sandbox.get({ name: getName(body.name) });}
const shell = (sb,command) => exec(sb,'timeout',['45s','bash','-lc',`cd /vercel/sandbox && ${command}`]);
const guard = x => {if(typeof x !== 'string'|| x.length>1600||!x.trim()) throw Error('Invalid shell command');return x;};
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return RESP(res,405,{error:'POST only'});
  if (!authorized(req)) return RESP(res,401,{error:'Unauthorized. Configure AIWAY_SANDBOX_SECRET (24+ characters).'});
  const b=req.body||{};
  try {
    if(b.action==='create') {
      const sb=await Sandbox.create({name:'aiway-'+randomUUID().slice(0,18),persistent:true,runtime:'node24',resources:{vcpus:1},timeout:5*60*1000,ports:[3000]});
      return RESP(res,200,{ok:true,name:sb.name,limits:{vcpus:1,sessionMinutes:5,files:MAX_FILES,bytes:MAX_BYTES}});
    }
    if (!['sync','run','preview','stop','powershell','chromium','chromium-install'].includes(b.action)) return RESP(res,400,{error:'Unknown action'});
    const sb=await sandboxFor(b);
    if(b.action==='sync') {
      const files=validateFiles(b.files);
      await sb.writeFiles(files.map(f=>({path:'/vercel/sandbox/'+f.path,content:Buffer.from(f.content,'utf8')})));
      return RESP(res,200,{ok:true,count:files.length});
    }
    if(b.action==='run') {
      const command=validateCommand(b.command);
      return RESP(res,200,{ok:true,...await shell(sb,command)});
    }
    if(b.action==='preview') {
      const command=validateCommand(b.command||'python3 -m http.server 3000 --bind 0.0.0.0');
      const result=await exec(sb,'bash',['-lc',`cd /vercel/sandbox && ${command}`],{detached:true});
      return RESP(res,200,{ok:true,...result,url:sb.domain(3000)});
    }
    if(b.action==='powershell') {
      // Install only on user request. Availability depends on the current Linux image.
      if(b.install) {
        // Microsoft-published RHEL compatible RPM; Amazon Linux compatibility must be verified on actual sandbox.
        const command="if command -v pwsh >/dev/null 2>&1; then pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'; else sudo dnf install -y https://github.com/PowerShell/PowerShell/releases/download/v7.6.6/powershell-7.6.6-1.rh.x86_64.rpm && pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'; fi";
        const r=await shell(sb,command);
        return RESP(res,200,{ok:r.exitCode===0,...r,warning:'This RPM targets RHEL-compatible Linux; verify compatibility on the Vercel Sandbox image.'});
      }
      const script=String(b.script||'').slice(0,4000);
      const encoded=Buffer.from(script,'utf16le').toString('base64');
      const r=await exec(sb,'pwsh',['-NoProfile','-NonInteractive','-EncodedCommand',encoded]);
      return RESP(res,200,{ok:r.exitCode===0,...r});
    }
    if(b.action==='chromium-install') {
      const r=await shell(sb,'npm install --no-save playwright && npx playwright install chromium --with-deps');
      return RESP(res,200,{ok:r.exitCode===0,...r,warning:'Chromium installation can exceed the Hobby memory/time or network allowance.'});
    }
    if(b.action==='chromium') {
      // Optional Playwright/Chromium check: explicitly opt in, no automatic download or unlimited installations.
      const url=String(b.url||'http://127.0.0.1:3000');
      if(!/^http:\/\/127\.0\.0\.1:3000(?:\/|$)/.test(url))throw Error('Only local sandbox preview allowed');
      const script="const { chromium } = require('playwright'); (async()=>{ const b=await chromium.launch({headless:true,args:['--no-sandbox']}); const p=await b.newPage(); const errors=[]; p.on('pageerror',e=>errors.push(String(e))); const r=await p.goto(process.argv[1],{waitUntil:'domcontentloaded',timeout:15000}); console.log(JSON.stringify({status:r?.status(),title:await p.title(),errors}));await b.close() })().catch(e=>{console.error(e.stack);process.exit(1)})";
      const r=await exec(sb,'node',['-e',script,url]);
      return RESP(res,200,{ok:r.exitCode===0,...r,hint:r.exitCode?'Install playwright and chromium in the sandbox first (npm install playwright && npx playwright install chromium --with-deps). This may exceed Hobby resources.':undefined});
    }
    await sb.stop();return RESP(res,200,{ok:true,stopped:true});
  } catch(e) {return RESP(res,400,{ok:false,error:saneText(e?.message||e)});}
}
