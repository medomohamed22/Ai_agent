import { Sandbox } from '@vercel/sandbox';

const ROOT = '/vercel/sandbox/repo';
const MAX_FILES = 240;
const MAX_FILE = 280_000;
const IGNORED = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '.cache/', 'coverage/'];

function safePath(p='') {
  p = String(p).replace(/\\/g,'/').replace(/^\/+/, '');
  if (!p || p.includes('..') || p.includes('\0')) throw new Error('Unsafe path');
  return p;
}
function shellQuote(s='') { return `'${String(s).replace(/'/g, `'"'"'`)}'`; }
function validRepo(url='') { return /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?\/?$/i.test(String(url)); }
async function getSandbox(name, create = false) {
  if (name) {
    try { return await Sandbox.get({ name }); } catch {}
  }
  if (!create) throw new Error('Sandbox not found. Create one first.');
  return await Sandbox.create({ name: name || `blueagent-${crypto.randomUUID().slice(0,8)}`, persistent: true, timeout: 45 * 60 * 1000, ports: [3000, 3001, 5173, 8000] });
}
async function syncFiles(sandbox, files={}) {
  const entries = Object.entries(files).slice(0, MAX_FILES);
  await sandbox.runCommand({ cmd:'sh', args:['-lc', `mkdir -p ${shellQuote(ROOT)}`] });
  const payload = entries.map(([path, content]) => ({ path: `${ROOT}/${safePath(path)}`, content: Buffer.from(String(content).slice(0, MAX_FILE)) }));
  if (payload.length) await sandbox.writeFiles(payload);
  return payload.length;
}
async function readProject(sandbox) {
  const find = await sandbox.runCommand({ cmd:'sh', args:['-lc', `cd ${shellQuote(ROOT)} 2>/dev/null || exit 0; find . -type f -size -300k | sed 's#^./##' | head -n ${MAX_FILES}`] });
  const paths = (await find.stdout()).split('\n').filter(Boolean).filter(p => !IGNORED.some(x => p.startsWith(x)));
  const files = {};
  for (const path of paths) {
    const b = await sandbox.readFileToBuffer({ path: `${ROOT}/${safePath(path)}` });
    if (b) files[path] = b.toString('utf8');
  }
  return files;
}
async function run(sandbox, command, detached=false) {
  command = String(command || '').trim();
  if (!command) throw new Error('Command is required');
  if (command.length > 2500) throw new Error('Command too long');
  const result = await sandbox.runCommand({ cmd:'sh', args:['-lc', command], cwd: ROOT, detached });
  if (detached) return { exitCode: 0, stdout: 'Started in background', stderr: '' };
  return { exitCode: result.exitCode, stdout: (await result.stdout()).slice(0, 120_000), stderr: (await result.stderr()).slice(0, 80_000) };
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
      if (!validRepo(repoUrl)) throw new Error('Only public GitHub HTTPS repository URLs are accepted in V2.');
      await sandbox.runCommand({ cmd:'sh', args:['-lc', `rm -rf ${shellQuote(ROOT)} && mkdir -p ${shellQuote(ROOT)}`] });
      const r = await sandbox.runCommand({ cmd:'git', args:['clone','--depth','1',repoUrl,ROOT] });
      if (r.exitCode !== 0) throw new Error((await r.stderr()) || 'Clone failed');
      return res.json({ sandboxName: sandbox.name, files: await readProject(sandbox) });
    }
    if (action === 'preview') {
      const p = Number(port) || 5173;
      const cmd = command || `npm run dev -- --host 0.0.0.0 --port ${p}`;
      await run(sandbox, cmd, true);
      return res.json({ sandboxName: sandbox.name, url: sandbox.domain(p), port: p });
    }
    if (action === 'stop') { await sandbox.stop(); return res.json({ ok:true }); }
    if (action === 'delete') { await sandbox.delete(); return res.json({ ok:true }); }
    return res.status(400).json({ error:'Unknown action' });
  } catch (e) { return res.status(500).json({ error:e?.message || String(e) }); }
}
