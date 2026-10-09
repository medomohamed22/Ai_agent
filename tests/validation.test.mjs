import test from 'node:test';import assert from 'node:assert/strict';import {validateFiles,validateCommand} from '../lib/validation.mjs';
test('accepts normal project files',()=>assert.equal(validateFiles([{path:'src/App.jsx',content:'hello'}]).length,1));
test('blocks path traversal',()=>assert.throws(()=>validateFiles([{path:'../secret',content:'x'}])));
test('blocks secrets upload',()=>assert.throws(()=>validateFiles([{path:'.env',content:'x'}])));
test('blocks duplicate files',()=>assert.throws(()=>validateFiles([{path:'a',content:'x'},{path:'a',content:'y'}])));
test('rejects too many files',()=>assert.throws(()=>validateFiles(Array.from({length:81},(_,i)=>({path:'f'+i,content:'x'})))));
test('validates shell command input',()=>{assert.equal(validateCommand('npm test'),'npm test');assert.throws(()=>validateCommand(''))});
