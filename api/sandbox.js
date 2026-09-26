import { Sandbox } from '@vercel/sandbox';

const ROOT = '/vercel/sandbox/repo';
const MAX_FILES = 240;
const MAX_FILE = 280_000;
const IGNORED = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '.cache/', 'coverage/'];
const PORTS = [3000, 3001, 4173, 5173, 8000];

function safePath(p='') {
  p = String(p).replace(/\\/g,'/').replace(/^\/+/, '');
  if (!p || p.includes('..') || p.includes('\0')) throw new Error('Unsafe path');
  return p;
}
function shellQuote(s='') { return `'${String(s).replace(/'/g, `'"'"'`)}'`; }
function validRepo(url='') { return /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?\/?$/i.test(String(url)); }
async function stdout(result, limit=120000) { try { return (await result.stdout()).slice(0, limit); } catch { return ''; } }
async function stderr(result, limit=80000) { try { return (await result.stderr()).slice(0, limit); } catch { return ''; } }

async function getSandbox(name, create = false) {
  if (name) {
    try { return await Sandbox.get({ name }); } catch {}
  }
  if (!create) throw new Error('Sandbox not found. Start the environment first.');
  return await Sandbox.create({
    name: name || `blueagent-${crypto.randomUUID().slice(0,8)}`,
    persistent: true,
    timeout: 45 * 60 * 1000,
    ports: PORTS,
  });
}

async function syncFiles(sandbox, files={}) {
  const entries = Object.entries(files).slice(0, MAX_FILES);
  await sandbox.runCommand({ cmd:'sh', args:['-lc', `mkdir -p ${shellQuote(ROOT)}`] });
  const payload = entries.map(([path, content]) => ({
    path: `${ROOT}/${safePath(path)}`,
    content: Buffer.from(String(content).slice(0, MAX_FILE)),
  }));
  if (payload.length) await sandbox.writeFiles(payload);
  return payload.length;
}

async function readProject(sandbox) {
  const find = await sandbox.runCommand({
    cmd:'sh',
    args:['-lc', `cd ${shellQuote(ROOT)} 2>/dev/null || exit 0; find . -type f -size -300k | sed 's#^./##' | head -n ${MAX_FILES}`],
  });
  const paths = (await stdout(find)).split('\n').filter(Boolean).filter(p => !IGNORED.some(x => p.startsWith(x)));
  const files = {};
  for (const path of paths) {
    const b = await sandbox.readFileToBuffer({ path: `${ROOT}/${safePath(path)}` });
    if (b) files[path] = b.toString('utf8');
  }
  return files;
}

async function run(sandbox, command) {
  command = String(command || '').trim();
  if (!command) throw new Error('Command is required');
  if (command.length > 2500) throw new Error('Command too long');
  const result = await sandbox.runCommand({ cmd:'sh', args:['-lc', command], cwd: ROOT });
  return { exitCode: result.exitCode, stdout: await stdout(result), stderr: await stderr(result) };
}

async function choosePreviewCommand(sandbox, port, customCommand='') {
  if (String(customCommand || '').trim()) return String(customCommand).trim();
  const probe = await sandbox.runCommand({
    cmd:'sh',
    args:['-lc', `cd ${shellQuote(ROOT)}; if [ -f package.json ]; then node -e "const p=require('./package.json'); console.log(p.scripts?.dev?'dev':p.scripts?.start?'start':'');" 2>/dev/null; fi`],
  });
  const script = (await stdout(probe, 1000)).trim();
  if (script === 'dev') return `npm run dev -- --host 0.0.0.0 --port ${port}`;
  if (script === 'start') return `PORT=${port} HOST=0.0.0.0 npm run start -- --host 0.0.0.0 --port ${port}`;

  // Zero-dependency static server for plain HTML projects.
  return `node -e "const h=require('http'),f=require('fs'),p=require('path'),r=process.cwd(),port=${port};h.createServer((q,s)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u==='/' )u='/index.html';let x=p.normalize(p.join(r,u));if(!x.startsWith(r)){s.statusCode=403;return s.end('Forbidden')}f.stat(x,(e,st)=>{if(!e&&st.isDirectory())x=p.join(x,'index.html');f.readFile(x,(e,b)=>{if(e){s.statusCode=404;return s.end('Not found')}const ext=p.extname(x);const m={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};s.setHeader('Content-Type',m[ext]||'application/octet-stream');s.end(b)})})}).listen(port,'0.0.0.0',()=>console.log('BlueAgent preview '+port));"`;
}

async function startPreview(sandbox, port, customCommand='') {
  const p = Number(port) || 5173;
  if (!PORTS.includes(p)) throw new Error(`Port ${p} is not exposed. Use one of: ${PORTS.join(', ')}`);
  const command = await choosePreviewCommand(sandbox, p, customCommand);
  const logFile = `/tmp/blueagent-preview-${p}.log`;

  // Do not return a URL until the process really binds to the requested port.
  await sandbox.runCommand({
    cmd:'sh',
    args:['-lc', `rm -f ${shellQuote(logFile)}; (${command}) >${shellQuote(logFile)} 2>&1`],
    cwd: ROOT,
    detached: true,
  });

  for (let i=0; i<24; i++) {
    await new Promise(r => setTimeout(r, 500));
    const check = await sandbox.runCommand({
      cmd:'sh',
      args:['-lc', `node -e "const n=require('net');const s=n.connect(${p},'127.0.0.1');s.setTimeout(400);s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.on('timeout',()=>{s.destroy();process.exit(1)})"`],
      cwd: ROOT,
    });
    if (check.exitCode === 0) {
      return { url: sandbox.domain(p), port: p, command, ready: true };
    }
  }

  const logs = await sandbox.runCommand({ cmd:'sh', args:['-lc', `tail -n 80 ${shellQuote(logFile)} 2>/dev/null || true`], cwd: ROOT });
  const text = (await stdout(logs, 16000)).trim();
  throw new Error(`Preview did not start on port ${p}.${text ? `\n\n${text}` : ' Check the preview command or install dependencies first.'}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  const { action, sandboxName, files, command, repoUrl, port=5173 } = req.body || {};
  try {
    if (action === 'create') {
      const sandbox = await getSandbox(sandboxName, true);
      if (files) await syncFiles(sandbox, files);
      return res.json({ sandboxName: sandbox.name, status:'ready' });
    }
    const sandbox = await getSandbox(sandboxName, action === 'sync');
    if (action === 'sync') return res.json({ sandboxName: sandbox.name, count: await syncFiles(sandbox, files || {}) });
    if (action === 'pull') return res.json({ sandboxName: sandbox.name, files: await readProject(sandbox) });
    if (action === 'run') return res.json({ sandboxName: sandbox.name, ...(await run(sandbox, command)) });
    if (action === 'git') {
      const op = command === 'diff' ? 'git diff -- . ":(exclude)package-lock.json"' : command === 'status' ? 'git status --short' : 'git log --oneline -10';
      return res.json({ sandboxName: sandbox.name, ...(await run(sandbox, op)) });
    }
    if (action === 'clone') {
      if (!validRepo(repoUrl)) throw new Error('Only public GitHub HTTPS repository URLs are accepted in V2.1.');
      await sandbox.runCommand({ cmd:'sh', args:['-lc', `rm -rf ${shellQuote(ROOT)} && mkdir -p ${shellQuote(ROOT)}`] });
      const r = await sandbox.runCommand({ cmd:'git', args:['clone','--depth','1',repoUrl,ROOT] });
      if (r.exitCode !== 0) throw new Error((await stderr(r)) || 'Clone failed');
      return res.json({ sandboxName: sandbox.name, files: await readProject(sandbox) });
    }
    if (action === 'preview') {
      const result = await startPreview(sandbox, port, command);
      return res.json({ sandboxName: sandbox.name, ...result });
    }
    if (action === 'stop') { await sandbox.stop(); return res.json({ ok:true }); }
    if (action === 'delete') { await sandbox.delete(); return res.json({ ok:true }); }
    return res.status(400).json({ error:'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error:e?.message || String(e) });
  }
}
