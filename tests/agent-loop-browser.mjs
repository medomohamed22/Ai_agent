import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AIWAY_PLAYWRIGHT_PATH||'playwright');
const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('index.html',root));
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
async function scenario(name,responder,seed=false){
 const page=await browser.newPage();const errors=[],requests=[];let meta=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://openrouter.ai/**',async route=>{
  if(!route.request().url().includes('/chat/completions')){meta++;return route.fulfill({status:404,body:'no metadata'})}
  const body=route.request().postDataJSON();requests.push(body);
  const message=responder(body,requests.length);
  if(message.$status)return route.fulfill({status:message.$status,contentType:'application/json',body:JSON.stringify({error:{message:message.error}})});
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'fixture-'+requests.length,choices:[{message}],usage:{prompt_tokens:100,completion_tokens:100}})});
 });
 await page.route(/https:\/\/(?!openrouter\.ai|aiway\.test)/,route=>route.abort());
 await page.route('https://aiway.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:source}));
 await page.goto('https://aiway.test/');await page.waitForTimeout(800);
 await page.evaluate(async seed=>{
  S=DEFAULT_STATE();S.mode='code';S.providers=[{id:'test',url:'https://openrouter.ai/api/v1',model:'local-fixture',key:'local-test-placeholder'}];S.active='test';S.searchOn=false;S.lazyTools={enabled:true};
  await fsLoad();if(seed)await fsSave('index.html','<!doctype html><html><head><title>Old</title></head><body><h1>Old</h1></body></html>');draw();
 },seed);
 await page.evaluate(()=>send('غيّر العنوان في index.html إلى Hello'));
 const state=await page.evaluate(()=>({last:chat().msgs.at(-1),files:[...FSC.values()].map(f=>({path:f.path,content:f.content})),ctrl:!!ctrl}));
 assert.equal(state.ctrl,false);assert.deepEqual(errors,[]);results.push({name,requests:requests.length,metadataRequests:meta,tools:state.last.tools?.map(x=>x.name)||[],stopReason:state.last.stopReason||null,content:state.last.content});
 await page.close();return {requests,state,meta};
}
const call=(name,args)=>({role:'assistant',content:null,tool_calls:[{id:'tc-'+Math.random(),type:'function',function:{name,arguments:JSON.stringify(args)}}]});
try{
 const create=await scenario('new HTML: one write then final; actual local iframe verification',(body,n)=>n===1?call('write_file',{path:'index.html',content:'<!doctype html><html><head><title>Hello</title></head><body><h1>Hello</h1><button onclick="this.textContent=\'Done\'">Go</button></body></html>'}):{role:'assistant',content:'تم إنشاء الصفحة وفحصها.'});
 assert.equal(create.requests.length,2);assert.ok(create.requests[0].tools.some(x=>x.function.name==='write_file'));assert.ok(!create.state.last.stopReason);assert.ok(create.state.files[0].content.includes('Hello'));assert.equal(create.meta,0);
 const edit=await scenario('existing HTML: read, edit, final',(body,n)=>n===1?call('read_file',{path:'index.html'}):n===2?call('edit_file',{path:'index.html',old_string:'<h1>Old</h1>',new_string:'<h1>Hello</h1>'}):{role:'assistant',content:'تم تعديل العنوان وفحصه.'},true);
 assert.equal(edit.requests.length,3);assert.ok(edit.state.files[0].content.includes('<h1>Hello</h1>'));assert.ok(!edit.state.last.stopReason);
 const loop=await scenario('alternating read/search loop trips before 14 rounds',(body,n)=>n%2?call('read_file',{path:'index.html'}):call('search_files',{pattern:'Old'}),true);
 assert.equal(loop.requests.length,5);assert.ok(loop.state.last.stopReason);assert.ok(loop.state.last.todos.some(x=>x.status!=='done'));
 const failed=await scenario('syntax failure repaired then verified before final',(body,n)=>n===1?call('write_file',{path:'index.html',content:'<!doctype html><html><body><h1>Hello</h1><script>const a = ;</script></body></html>'}):n===2?{role:'assistant',content:'تم التنفيذ.'}:n===3?call('edit_file',{path:'index.html',old_string:'const a = ;',new_string:'const a = 1;'}):{role:'assistant',content:'تم الإصلاح.'});
 assert.equal(failed.requests.length,4);assert.ok(!failed.state.last.stopReason);assert.ok(failed.state.files[0].content.includes('const a = 1;'));
 const multi=await scenario('multi-file verification checks remaining files after one passes',(body,n)=>n===1?call('write_file',{files:[{path:'a.js',content:'const a = 1;'},{path:'b.js',content:'const b = ;'}]}):n===2?{role:'assistant',content:'تم.'}:n===3?call('edit_file',{path:'b.js',old_string:'const b = ;',new_string:'const b = 2;'}):{role:'assistant',content:'تم الإصلاح والفحص.'});
 assert.equal(multi.requests.length,4);assert.ok(!multi.state.last.stopReason);assert.ok(multi.state.files.find(f=>f.path==='b.js').content.includes('const b = 2;'));
 const bad=await scenario('invalid model does not trigger tool compatibility retries',()=>({$status:400,error:'Invalid model ID'}));assert.equal(bad.requests.length,1);assert.match(bad.state.last.content,/Invalid model ID/);
 const rate=await scenario('429 stops immediately without automatic retry',()=>({$status:429,error:'Rate limit'}));assert.equal(rate.requests.length,1);assert.match(rate.state.last.content,/429/);
 fs.writeFileSync(new URL('browser-loop-results.json',root),JSON.stringify({validation:'Local Chrome + real app/IndexedDB/file tools/iframe checks; model responses are deterministic fixtures, no paid model calls.',results},null,2));
 console.log(JSON.stringify(results,null,2));
}finally{await browser.close()}
