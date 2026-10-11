import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AIWAY_PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const root=new URL('../',import.meta.url),rows=[];
const call=(name,args)=>({role:'assistant',content:null,tool_calls:[{id:'tc'+Math.random(),type:'function',function:{name,arguments:JSON.stringify(args)}}]});
try{
 for(const [version,path] of [['original',process.argv[2]],['fixed',new URL('index.html',root)]]){
  if(!path)throw Error('Usage: node tests/agent-loop-benchmark.mjs path/to/original-index.html');
  for(const task of ['simple-create','alternating-loop']){
   const source=fs.readFileSync(path),page=await browser.newPage(),payloads=[];let meta=0;
   await page.route('https://aiway.test/**',r=>r.fulfill({status:200,contentType:'text/html',body:source}));
   await page.route('https://openrouter.ai/**',async r=>{
    if(!r.request().url().includes('/chat/completions')){meta++;return r.fulfill({status:404,body:'fixture'})}
    const b=r.request().postDataJSON();payloads.push(b);const tools=(b.tools||[]).map(t=>t.function.name);
    let m;
    if(task==='simple-create')m=!tools.includes('write_file')?call('tool_search',{query:'write_file',limit:1}):b.messages.some(x=>x.role==='tool'&&x.name==='write_file')?{role:'assistant',content:'تم إنشاء الصفحة.'}:call('write_file',{path:'index.html',content:'<!doctype html><html><head><title>Hello</title></head><body><h1>Hello</h1></body></html>'});
    else m=payloads.length%2?call('read_file',{path:'index.html'}):call('search_files',{pattern:'Hello'});
    await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'fixture'+payloads.length,choices:[{message:m}],usage:{prompt_tokens:100,completion_tokens:100}})});
   });
   await page.route(/https:\/\/(?!aiway\.test|openrouter\.ai)/,r=>r.abort());
   await page.goto('https://aiway.test/');await page.waitForTimeout(800);
   await page.evaluate(async task=>{S=DEFAULT_STATE();S.mode='code';S.providers=[{id:'fixture',url:'https://openrouter.ai/api/v1',model:'fixture-model',key:'fixture'}];S.active='fixture';await fsLoad();if(task==='alternating-loop')await fsSave('index.html','<!doctype html><html><body><h1>Hello</h1></body></html>');draw()},task);
   await page.evaluate(()=>send('اكتب صفحة index.html بسيطة'));
   const result=await page.evaluate(()=>({tools:chat()?.msgs.at(-1).tools?.length||0,stopped:!!chat()?.msgs.at(-1).stopReason}));
   rows.push({version,task,modelRequests:payloads.length,payloadBytes:payloads.reduce((n,b)=>n+Buffer.byteLength(JSON.stringify(b)),0),metadataObserved:meta,...result});
   await page.close();
  }
 }
 assert.equal(rows[0].modelRequests,3);assert.equal(rows[1].modelRequests,14);assert.equal(rows[2].modelRequests,2);assert.equal(rows[3].modelRequests,5);
 fs.writeFileSync(new URL('loop-benchmark-results.json',root),JSON.stringify({note:'Deterministic mocked model; request payload bytes are measured, not provider-billed tokens. Metadata polls are timing-dependent and not part of model counts.',rows},null,2));console.log(JSON.stringify(rows,null,2));
}finally{await browser.close()}

