import { Sandbox } from '@vercel/sandbox';

const MAX_STEPS = 10;
const MAX_FILES = 220;
const MAX_FILE_SIZE = 280_000;
const ROOT = '/vercel/sandbox/repo';

function apiRoot(url=''){ let u=String(url).trim().replace(/\/+$/,''); return u.replace(/\/(chat\/completions|models|responses)$/i,''); }
function safePath(p=''){ p=String(p).replace(/\\/g,'/').replace(/^\/+/, ''); if(!p||p.includes('..')||p.includes('\0')) throw new Error('Unsafe path'); return p; }
function index(files){ return Object.entries(files).slice(0,MAX_FILES).map(([p,c])=>`${p} (${String(c).length} chars)`).join('\n'); }
function shellQuote(s=''){ return `'${String(s).replace(/'/g, `'"'"'`)}'`; }
const wait=ms=>new Promise(r=>setTimeout(r,ms));

const tools = [
  {type:'function',function:{name:'list_files',description:'List project file paths. Use this before reading files.',parameters:{type:'object',properties:{query:{type:'string'}}}}},
  {type:'function',function:{name:'read_file',description:'Read one project file.',parameters:{type:'object',properties:{path:{type:'string'}},required:['path']}}},
  {type:'function',function:{name:'write_file',description:'Create or fully replace one project file.',parameters:{type:'object',properties:{path:{type:'string'},content:{type:'string'}},required:['path','content']}}},
  {type:'function',function:{name:'edit_file',description:'Replace one exact snippet in a file. Read it first. Prefer this for small edits to save tokens.',parameters:{type:'object',properties:{path:{type:'string'},search:{type:'string'},replace:{type:'string'}},required:['path','search','replace']}}},
  {type:'function',function:{name:'delete_file',description:'Delete a project file when required.',parameters:{type:'object',properties:{path:{type:'string'}},required:['path']}}},
  {type:'function',function:{name:'search_files',description:'Search text across project files.',parameters:{type:'object',properties:{query:{type:'string'}},required:['query']}}},
  {type:'function',function:{name:'run_command',description:'Run a shell command inside the isolated Vercel Sandbox. Use for installs, builds, tests and inspection. Never claim success without checking exitCode.',parameters:{type:'object',properties:{command:{type:'string'}},required:['command']}}},
  {type:'function',function:{name:'git_status',description:'Show concise git status inside the sandbox.',parameters:{type:'object',properties:{}}}},
  {type:'function',function:{name:'git_diff',description:'Show git diff after changes.',parameters:{type:'object',properties:{}}}}
];

async function providerRequest(baseUrl,apiKey,body){
  const endpoint=`${apiRoot(baseUrl)}/chat/completions`;
  const request=async payload=>{
    let last;
    for(let attempt=0;attempt<3;attempt++){
      const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json',...(apiKey?{Authorization:`Bearer ${apiKey}`}:{})},body:JSON.stringify(payload)});
      const txt=await r.text(); let j; try{j=JSON.parse(txt)}catch{j=null}
      if(r.ok) return j;
      const msg=j?.error?.message||j?.message||txt||`Provider error ${r.status}`;
      const err=new Error(`${r.status} ${msg}${r.status===401||r.status===403?' — check API key and provider URL.':''}`); err.status=r.status; err.raw=msg;
      last=err;
      // Respect short Retry-After windows for rate limits/transient provider failures.
      if((r.status===429||r.status===502||r.status===503||r.status===504)&&attempt<2){
        const raw=r.headers.get('retry-after'); const sec=Number(raw); const delay=Number.isFinite(sec)&&sec>=0?Math.min(sec*1000,6000):700*(attempt+1);
        await wait(delay); continue;
      }
      throw err;
    }
    throw last;
  };
  try{return await request(body)}catch(e){
    if(e.status===400 && /temperature|unsupported parameter|unknown parameter/i.test(e.raw||'')){
      const {temperature,...retry}=body; return await request(retry);
    }
    throw e;
  }
}

async function ensureSandbox(name,files){
  let sb=null;
  if(name){ try{ sb=await Sandbox.get({name}); }catch{} }
  if(!sb) sb=await Sandbox.create({name:name||`blueagent-${crypto.randomUUID().slice(0,8)}`,persistent:true,timeout:45*60*1000,ports:[3000,3001,5173,8000]});
  await sb.runCommand({cmd:'sh',args:['-lc',`mkdir -p ${shellQuote(ROOT)}`]});
  const payload=Object.entries(files).slice(0,MAX_FILES).map(([p,c])=>({path:`${ROOT}/${safePath(p)}`,content:Buffer.from(String(c).slice(0,MAX_FILE_SIZE))}));
  if(payload.length) await sb.writeFiles(payload);
  return sb;
}
async function shell(sb,cmd){ const r=await sb.runCommand({cmd:'sh',args:['-lc',String(cmd).slice(0,2500)],cwd:ROOT}); return {exitCode:r.exitCode,stdout:(await r.stdout()).slice(0,50000),stderr:(await r.stderr()).slice(0,30000)}; }

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const {baseUrl,apiKey,model,messages=[],files:inputFiles={},language='ar',sandboxName}=req.body||{};
  if(!baseUrl||!model) return res.status(400).json({error:'Provider URL and model are required'});
  const files=Object.fromEntries(Object.entries(inputFiles).slice(0,MAX_FILES).map(([p,c])=>[safePath(p),String(c).slice(0,MAX_FILE_SIZE)]));
  const changes=[], trace=[];
  let sb=null;
  const getSandbox=async()=>{ if(!sb) sb=await ensureSandbox(sandboxName,files); return sb; };
  try{
    const system=language==='ar'
      ? `أنت BlueAgent V2، وكيل برمجي محترف. نفذ طلب المستخدم فعليًا بالأدوات. اقرأ أقل عدد ممكن من الملفات واستخدم edit_file للتعديلات الصغيرة لتوفير التوكنات. لا تشغّل Sandbox أو أوامر shell إلا عندما تحتاج run_command أو Git فعلًا. لا تستخدم أوامر مدمرة أو تحاول الوصول لأسرار. بعد التعديل اختبر عند الحاجة، ثم أعطِ ملخصًا عربيًا قصيرًا.\n\nفهرس المشروع:\n${index(files)||'(فارغ)'}`
      : `You are BlueAgent V2, a professional coding agent. Actually perform the task with tools. Read the minimum files needed and prefer edit_file for small edits to save tokens. Do not start the sandbox or shell unless run_command/Git is actually needed. Avoid destructive commands and secret access. Test when useful, then give a concise English summary.\n\nProject index:\n${index(files)||'(empty)'}`;
    const convo=[{role:'system',content:system},...messages.slice(-12).map(m=>({role:m.role,content:String(m.content||'').slice(0,12000)}))];
    let finalText='';
    for(let step=0;step<MAX_STEPS;step++){
      const data=await providerRequest(baseUrl,apiKey,{model,messages:convo,tools,tool_choice:'auto',temperature:0.15});
      const msg=data?.choices?.[0]?.message; if(!msg) throw new Error('Provider returned no assistant message');
      const calls=msg.tool_calls||[]; convo.push({role:'assistant',content:msg.content||'',...(calls.length?{tool_calls:calls}:{})});
      if(!calls.length){ finalText=msg.content||(language==='ar'?'تم.':'Done.'); break; }
      for(const call of calls){
        const name=call?.function?.name; let a={}; try{a=JSON.parse(call?.function?.arguments||'{}')}catch{}
        let result;
        try{
          if(name==='list_files'){ const q=String(a.query||'').toLowerCase(); result=Object.keys(files).filter(p=>!q||p.toLowerCase().includes(q)).slice(0,200); }
          else if(name==='read_file'){ const p=safePath(a.path); if(!(p in files)) throw new Error(`File not found: ${p}`); result={path:p,content:files[p]}; }
          else if(name==='write_file'){ const p=safePath(a.path), c=String(a.content??''); if(c.length>MAX_FILE_SIZE) throw new Error('File too large'); const existed=p in files; files[p]=c; if(sb) await sb.writeFiles([{path:`${ROOT}/${p}`,content:Buffer.from(c)}]); changes.push({type:existed?'updated':'created',path:p}); result={ok:true,path:p}; }
          else if(name==='edit_file'){ const p=safePath(a.path); if(!(p in files)) throw new Error(`File not found: ${p}`); const s=String(a.search), rep=String(a.replace); if(!s||!files[p].includes(s)) throw new Error('Exact search snippet not found'); files[p]=files[p].replace(s,rep); if(sb) await sb.writeFiles([{path:`${ROOT}/${p}`,content:Buffer.from(files[p])}]); changes.push({type:'updated',path:p}); result={ok:true,path:p}; }
          else if(name==='delete_file'){ const p=safePath(a.path); delete files[p]; if(sb) await shell(sb,`rm -f -- ${shellQuote(p)}`); changes.push({type:'deleted',path:p}); result={ok:true,path:p}; }
          else if(name==='search_files'){ const q=String(a.query||'').toLowerCase(); result=[]; for(const [p,c] of Object.entries(files)){ String(c).split('\n').forEach((line,i)=>{if(result.length<80&&line.toLowerCase().includes(q)) result.push({path:p,line:i+1,text:line.slice(0,220)});}); if(result.length>=80)break; } }
          else if(name==='run_command'){ const box=await getSandbox(); result=await shell(box,a.command); }
          else if(name==='git_status'){ const box=await getSandbox(); result=await shell(box,'git status --short'); }
          else if(name==='git_diff'){ const box=await getSandbox(); result=await shell(box,'git diff -- . ":(exclude)package-lock.json"'); }
          else throw new Error(`Unknown tool: ${name}`);
          trace.push({tool:name,ok:true,path:a.path||null,command:name==='run_command'?String(a.command).slice(0,160):null});
        }catch(e){ result={error:e?.message||String(e)}; trace.push({tool:name,ok:false,error:result.error,path:a.path||null}); }
        convo.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
      }
    }
    if(!finalText) finalText=language==='ar'?'وصل الوكيل إلى حد الخطوات. راجع النتائج واطلب منه الإكمال.':'The agent reached its step limit. Review the result and ask it to continue.';
    return res.json({text:finalText,files,changes,trace,sandboxName:sb?.name||sandboxName||''});
  }catch(e){
    const status=Number(e?.status)||500;
    return res.status(status>=400&&status<600?status:500).json({error:e?.message||'Agent failed',providerStatus:e?.status||null});
  }
}
