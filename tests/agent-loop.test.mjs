import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function governor(run=async()=>({ok:true})){
 const c=vm.createContext({TextEncoder,console,runToolCall:run,FSC:new Map(),vis:()=>true,h32:s=>{let n=0;for(const v of s)n=(n*31+v.charCodeAt(0))>>>0;return n}});
 vm.runInContext(section('// Per-user-request governor.','/* ===== Harness'),c);
 vm.runInContext('AGENT_RUN=newAgentRun()',c);return c;
}
const tc=(name,args={})=>({function:{name,arguments:JSON.stringify(args)}});
test('blocks alternating repeats with reordered arguments before third execution',async()=>{
 let calls=0;const c=governor(async()=>{calls++;return {ok:true}});
 for(let n=0;n<2;n++){await c.runToolCall(tc('read_file',{path:'a',start_line:1}));await c.runToolCall(tc('search_files',{pattern:'x'}))}
 await assert.rejects(c.runToolCall(tc('read_file',{start_line:1,path:'a'})),/تكررت/);assert.equal(calls,4);
});
test('a real edit permits reading the same range again; a no-op does not',async()=>{
 const c=governor(async t=>{if(t.function.name==='edit_file')c.FSC.set('a',{path:'a',content:JSON.parse(t.function.arguments).content});return {ok:true}});
 c.FSC.set('a',{path:'a',content:'old'});await c.runToolCall(tc('read_file',{path:'a'}));await c.runToolCall(tc('read_file',{path:'a'}));
 await c.runToolCall(tc('edit_file',{content:'new'}));await c.runToolCall(tc('read_file',{path:'a'}));await c.runToolCall(tc('edit_file',{content:'new'}));await c.runToolCall(tc('read_file',{path:'a'}));
 await assert.rejects(c.runToolCall(tc('read_file',{path:'a'})),/تكررت/);
});
test('hard tool limit applies before executing oversized batches',async()=>{
 let calls=0;const c=governor(async()=>{calls++;return {ok:true}});vm.runInContext('AGENT_RUN.limits.tools=3',c);
 const all=await Promise.allSettled(Array.from({length:10},(_,i)=>c.runToolCall(tc('read_file',{path:'f'+i}))));
 assert.equal(calls,3);assert.equal(all.filter(x=>x.status==='rejected').length,7);
});
test('three tool failures trip the circuit instead of requesting more fixes',async()=>{
 const c=governor(async()=>{throw Error('offline')});
 await assert.rejects(c.runToolCall(tc('test',{id:1})),/offline/);await assert.rejects(c.runToolCall(tc('test',{id:2})),/offline/);await assert.rejects(c.runToolCall(tc('test',{id:3})),/3/);
 assert.ok(vm.runInContext('AGENT_RUN.halt',c));
});
test('every transport attempt is counted, and token cap blocks before posting',()=>{
 const c=governor();vm.runInContext('AGENT_RUN.limits.requests=2;agentRequest(AGENT_RUN,{messages:[]});agentRequest(AGENT_RUN,{messages:[]})',c);
 assert.throws(()=>vm.runInContext('agentRequest(AGENT_RUN,{messages:[]})',c),/اتصالات/);
 vm.runInContext('AGENT_RUN=newAgentRun();AGENT_RUN.limits.tokens=5',c);assert.throws(()=>vm.runInContext('agentRequest(AGENT_RUN,{content:"1234567890123456789"})',c),/ميزانية/);
 assert.equal(vm.runInContext('AGENT_RUN.requests',c),0);
});
test('new request resets previous stop; chat calls remain unaffected',async()=>{
 const c=governor(async()=>({ok:true}));vm.runInContext('AGENT_RUN.halt="stopped"',c);await assert.rejects(c.runToolCall(tc('read_file')),/stopped/);
 vm.runInContext('AGENT_RUN=newAgentRun()',c);assert.equal((await c.runToolCall(tc('read_file'))).ok,true);
 vm.runInContext('AGENT_RUN=null',c);assert.equal((await c.runToolCall(tc('read_file'))).ok,true);
});
test('verification covers every changed file and keeps other failures pending',async()=>{
 const checked=[],c=vm.createContext({Set,toolFn:{verify_code:async({path})=>{checked.push(path);return {path,passed:path!=='b.js',errors:path==='b.js'?['syntax']:[]}}}});
 vm.runInContext(section('function vTrack(','/* ===== USD'),c);c.v={dirty:false,bad:false};
 c.vTrack(c.v,'write_file',{},true,{files:[{path:'a.js'},{path:'b.js'},{path:'c.js',action:'unchanged'}]});
 c.vTrack(c.v,'verify_code',{},true,{path:'a.js',passed:true});assert.equal(c.v.dirty,true);
 const r=await c.verifyPending(c.v);assert.equal(r.passed,false);assert.deepEqual(checked,['b.js']);assert.equal(c.v.bad,true);
 c.vTrack(c.v,'verify_code',{},true,{path:'a.js',passed:true});assert.equal(c.v.bad,true);
});
test('syntax check for every inline application script',()=>{
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))if(m[1].trim())assert.doesNotThrow(()=>new vm.Script(m[1]));
});
test('basic coding tools available immediately while disabled tools stay filtered',()=>{
 const c=vm.createContext({CODE:()=>true,ROUTE:{files:true},enabledToolIds:()=>['write_file','read_file','tool_search','cloud_test'],lazyToolsConfig:()=>({enabled:true}),lazyToolState:{loaded:new Set()},toolDefs:{write_file:'write',read_file:'read',tool_search:'search',cloud_test:'cloud'},cleanSchema:x=>x});
 vm.runInContext(section('const enabledTools=','async function runToolCall(')+'\nglobalThis.getTools=enabledTools;',c);
 assert.deepEqual(Array.from(c.getTools()),['write','read','search']);
});

test('existing default coding rules migrate without overwriting custom instructions',()=>{
 const c=vm.createContext({});vm.runInContext(section('const DEFAULT_RULES_CODE=','const DEFAULT_SKILLS=['),c);
 const old=vm.runInContext("DEFAULT_RULES_CODE.replace('Use task_state only for long tasks that need to resume across sessions; skip it for routine edits.','When a task spans multiple stages, use task_state save and load to persist progress.')",c);
 assert.match(c.upgradeCodeRules(old),/skip it for routine edits/);assert.equal(c.upgradeCodeRules('custom rules'),'custom rules');
});
