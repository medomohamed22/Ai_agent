import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function section(start,end){return html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)))}
function env(){const context=vm.createContext({S:{cost:{enabled:true,limit:0.1,scope:'chat',prices:{}},chats:[]},TextEncoder,console,JSON,Math,Number,fmtUSD:n=>String(n)});vm.runInContext('const COST_PRICES='+section('const COST_PRICES=','function costCfg()').split('const COST_PRICES=')[1].trim().replace(/;\s*$/,'')+';',context);vm.runInContext(section('function costCfg()','function costSettingsUI()'),context);return context}
test('budget blocks unknown model prices',()=>{const c=env();c.S.chats=[{msgs:[]}];c.chat=()=>c.S.chats[0];assert.throws(()=>vm.runInContext('costCheck([], {url:"https://api.example",model:"unknown"},"unknown")',c),/سعر/)});
test('concurrent budget reserves prevent overspending and are releasable',()=>{const c=env();c.S.cost.limit=.20;c.S.chats=[{msgs:[]}];c.chat=()=>c.S.chats[0];const p={url:'https://api.example',model:'gpt-5.4'};c.p=p;const r=vm.runInContext('costCheck([],p,p.model)',c);assert.ok(r>0);assert.throws(()=>vm.runInContext('costCheck([],p,p.model)',c),/سقف/);vm.runInContext('costPendingUSD=0',c);assert.ok(vm.runInContext('costCheck([],p,p.model)',c)>0)});
test('budget checks persisted spending',()=>{const c=env();c.S.cost.limit=.11;c.S.chats=[{msgs:[{reqs:[{cost:.10}]}]}];c.chat=()=>c.S.chats[0];c.p={url:'https://api.example',model:'gpt-5.4'};assert.throws(()=>vm.runInContext('costCheck([],p,p.model)',c),/سقف/)});
test('context meter excludes compacted historical turns',()=>{const c=vm.createContext({TextEncoder,chat:()=>({cut:1,compactSummary:'summary',msgs:[{role:'user',content:'x'.repeat(15000)},{role:'user',content:'recent'}]})});vm.runInContext(section('const compactTokens=','function compactDigest('),c);vm.runInContext(section('function contextSize()','function contextRefresh()'),c);assert.ok(vm.runInContext('contextSize()',c)<100)});
test('programmatic tool runner uses restricted read tools and bounded output',()=>{assert.match(html,/const PROGRAM_READ=new Set\(\['read_file','search_files','list_files'\]\)/);assert.match(html,/if\(\+\+calls>20\)/);assert.match(html,/maxChars|Number\(a.max_chars\)/)});
