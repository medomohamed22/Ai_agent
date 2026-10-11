// Optional once-daily Vercel Hobby cron. Configure SITE_CHECK_URL, CRON_SECRET,
// and optionally ALERT_WEBHOOK_URL in Vercel project environment settings.
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const secret=process.env.CRON_SECRET;
  if(!secret||req.headers.authorization!==`Bearer ${secret}`)return res.status(401).json({error:'Unauthorized'});
  const raw=process.env.SITE_CHECK_URL;
  if(!raw)return res.status(503).json({error:'SITE_CHECK_URL not configured'});
  let target;try{target=new URL(raw);if(target.protocol!=='https:')throw Error('HTTPS required')}catch{return res.status(400).json({error:'HTTPS SITE_CHECK_URL required'})}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  let status=0,error='';try{const r=await fetch(target,{signal:controller.signal,redirect:'error',headers:{'User-Agent':'AiWay-Daily-Health-Check/1.0'}});status=r.status;if(!r.ok)error=`HTTP ${status}`}catch(e){error=String(e.message||e).slice(0,250)}finally{clearTimeout(timer)}
  const result={url:target.origin,status,ok:!error,checkedAt:new Date().toISOString(),error};
  console.log('AiWay daily health:',JSON.stringify(result));
  if(error&&process.env.ALERT_WEBHOOK_URL){try{const endpoint=new URL(process.env.ALERT_WEBHOOK_URL);if(endpoint.protocol==='https:')await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'AiWay site check failed: '+JSON.stringify(result),...result}),signal:AbortSignal.timeout(10000)})}catch(e){console.error('webhook failed',String(e))}}
  return res.status(200).json(result)
}
