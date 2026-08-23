const FREE_CHAT_IDS = new Set([
  'big-pickle','deepseek-v4-flash-free','hy3-free','laguna-s-2.1-free',
  'mimo-v2.5-free','nemotron-3-ultra-free','nemotron-3.5-lightning-free',
  'x-preview-f-free'
]);

function pricingNumber(v){
  if(v===null||v===undefined||v==='') return null;
  const n=Number(String(v).replace(/[^0-9.eE+-]/g,''));
  return Number.isFinite(n)?n:null;
}
function isFreeModel(item){
  const id=String(item?.id||item?.name||'').toLowerCase();
  if(!id) return false;
  if(FREE_CHAT_IDS.has(id)) return true;
  if(item?.free===true||item?.is_free===true||item?.isFree===true) return true;
  if(/(^|[/:._-])free($|[/:._-])/.test(id)) return true;
  const p=item?.pricing||item?.price||item?.cost;
  if(p&&typeof p==='object'){
    const vals=Object.values(p).map(pricingNumber).filter(v=>v!==null);
    if(vals.length&&vals.every(v=>v===0)) return true;
  }
  return false;
}
function send(res,status,data){
  res.status(status);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  return res.send(JSON.stringify(data));
}
async function readJsonResponse(r){
  const raw=await r.text();
  let j; try{j=JSON.parse(raw)}catch{j=null}
  return {raw,j};
}
async function fetchWithTimeout(url,init={},ms=90000){
  const c=new AbortController();
  const t=setTimeout(()=>c.abort(),ms);
  try{return await fetch(url,{...init,signal:c.signal,cache:'no-store'})}
  finally{clearTimeout(t)}
}

export default async function handler(req,res){
  try{
    const action=req.method==='GET'?(req.query.action||'models'):(req.body?.action||'chat');

    // Catalog source: official Zen models endpoint.
    if(action==='models'){
      const url='https://opencode.ai/zen/v1/models';
      const r=await fetchWithTimeout(url,{method:'GET',headers:{'Accept':'application/json','User-Agent':'AdPromptAI/5.0'}},15000);
      const {raw,j}=await readJsonResponse(r);
      if(!r.ok) return send(res,r.status,{error:j?.error?.message||j?.error||j?.message||raw.slice(0,260),source:url});
      if(!j) return send(res,502,{error:'OpenCode models endpoint returned non-JSON',sample:raw.slice(0,220)});
      const rows=Array.isArray(j)?j:(j.data||j.models||[]);
      const free=rows.filter(isFreeModel).map(x=>({
        ...x,
        id:String(x.id||x.name||''),
        name:x.name||x.display_name||x.id,
        free:true,
        // This site intentionally exposes only free chat-compatible inference models.
        runnable_without_key: FREE_CHAT_IDS.has(String(x.id||x.name||'').toLowerCase()) || String(x.id||'').toLowerCase().endsWith('-free')
      })).filter(x=>x.id && x.runnable_without_key);
      return send(res,200,{object:'list',source:url,data:free,models:free,total_catalog:rows.length});
    }

    if(action!=='chat') return send(res,400,{error:'Invalid action'});
    if(req.method!=='POST') return send(res,405,{error:'Method not allowed'});

    const p=req.body||{};
    const model=String(p.model||'');
    if(!model||!Array.isArray(p.messages)) return send(res,400,{error:'model and messages are required'});

    // No-key execution source: official OpenCode Inference Chat API.
    const url='https://opencode.ai/inference/openai/v1/chat/completions';
    const baseBody={
      model,
      messages:p.messages,
      temperature:p.temperature??0.35,
      max_tokens:Math.min(Math.max(Number(p.max_tokens)||5200,1200),6500),
      stream:false
    };

    // json_object is preferred when the upstream supports it. If a model/provider rejects it,
    // retry once without it instead of failing the whole workflow.
    let body={...baseBody,response_format:{type:'json_object'}};
    let r=await fetchWithTimeout(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','User-Agent':'AdPromptAI/5.0'},body:JSON.stringify(body)},100000);
    let parsed=await readJsonResponse(r);

    if(!r.ok && [400,404,422].includes(r.status)){
      body=baseBody;
      r=await fetchWithTimeout(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','User-Agent':'AdPromptAI/5.0'},body:JSON.stringify(body)},100000);
      parsed=await readJsonResponse(r);
    }

    if(!r.ok) return send(res,r.status,{error:parsed.j?.error?.message||parsed.j?.error||parsed.j?.message||parsed.raw.slice(0,350),source:url});
    if(!parsed.j) return send(res,502,{error:'OpenCode inference returned non-JSON envelope',sample:parsed.raw.slice(0,260)});
    return send(res,200,{...parsed.j,_opencode:{source:url,mode:'free-chat-inference'}});
  }catch(e){
    const timeout=e?.name==='AbortError';
    return send(res,timeout?504:500,{error:timeout?'OpenCode inference exceeded the server timeout':(e?.message||String(e))});
  }
}
