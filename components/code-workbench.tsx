'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type FileItem = { path: string; content: string };
type ChatItem = { role: 'user' | 'assistant'; content: string };
type ChangedFile = {
  path: string;
  content: string;
  diff: string;
  validation: { valid: boolean; errors: string[]; note: string };
};

type StoredSettings = {
  mode: 'gateway' | 'custom';
  gatewayModel: string;
  providerName: string;
  baseURL: string;
  customModel: string;
};

const DEFAULT_SETTINGS: StoredSettings = {
  mode: 'gateway',
  gatewayModel: 'openai/gpt-5.4-mini',
  providerName: 'custom',
  baseURL: 'https://openrouter.ai/api/v1',
  customModel: '',
};

function downloadFile(file: FileItem) {
  const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.path.split('/').pop() || 'updated-file.txt';
  a.click();
  URL.revokeObjectURL(url);
}

export function CodeWorkbench() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activePath, setActivePath] = useState('');
  const [messages, setMessages] = useState<ChatItem[]>([
    { role: 'assistant', content: 'Upload one or more code files, then tell me exactly what you want changed. I will inspect only the relevant code and patch it surgically.' },
  ]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'files' | 'chat'>('chat');
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [lastChanges, setLastChanges] = useState<ChangedFile[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem('code-surgeon-settings');
    if (raw) {
      try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) }); } catch {}
    }
    setApiKey(sessionStorage.getItem('code-surgeon-api-key') || '');
  }, []);

  useEffect(() => {
    localStorage.setItem('code-surgeon-settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    sessionStorage.setItem('code-surgeon-api-key', apiKey);
  }, [apiKey]);

  const activeFile = useMemo(() => files.find((file) => file.path === activePath) || files[0], [files, activePath]);

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files || [])].slice(0, 20);
    const textFiles = await Promise.all(selected.map(async (file) => ({ path: file.name, content: await file.text() })));
    setFiles((current) => {
      const map = new Map(current.map((f) => [f.path, f]));
      textFiles.forEach((f) => map.set(f.path, f));
      return [...map.values()];
    });
    if (!activePath && textFiles[0]) setActivePath(textFiles[0].path);
    event.target.value = '';
  }

  function updateActive(content: string) {
    if (!activeFile) return;
    setFiles((current) => current.map((file) => file.path === activeFile.path ? { ...file, content } : file));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = prompt.trim();
    if (!message || !files.length || busy) return;
    if (settings.mode === 'custom' && (!settings.baseURL || !settings.customModel || !apiKey)) {
      setSettingsOpen(true);
      return;
    }

    const nextMessages = [...messages, { role: 'user' as const, content: message }];
    setMessages(nextMessages);
    setPrompt('');
    setBusy(true);
    setLastChanges([]);

    try {
      const provider = settings.mode === 'gateway'
        ? { type: 'gateway', model: settings.gatewayModel }
        : { type: 'openai-compatible', name: settings.providerName, baseURL: settings.baseURL, apiKey, model: settings.customModel };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          files,
          history: messages.slice(-8),
          provider,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed');

      if (data.changedFiles?.length) {
        const changed: ChangedFile[] = data.changedFiles;
        setLastChanges(changed);
        setFiles((current) => current.map((file) => {
          const replacement = changed.find((item) => item.path === file.path);
          return replacement ? { path: file.path, content: replacement.content } : file;
        }));
        setActivePath(changed[0].path);
      }

      setMessages((current) => [...current, { role: 'assistant', content: data.message }]);
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">&lt;/&gt;</div>
          <div><strong>Code Surgeon</strong><span>Patch, verify, ship.</span></div>
        </div>
        <div className="top-actions">
          <span className="model-pill">{settings.mode === 'gateway' ? settings.gatewayModel : settings.customModel || 'Custom model'}</span>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Settings">⚙</button>
        </div>
      </header>

      <div className="mobile-tabs">
        <button className={mobilePanel === 'files' ? 'active' : ''} onClick={() => setMobilePanel('files')}>Files</button>
        <button className={mobilePanel === 'chat' ? 'active' : ''} onClick={() => setMobilePanel('chat')}>Agent</button>
      </div>

      <section className="workspace">
        <aside className={`files-pane ${mobilePanel === 'files' ? 'mobile-show' : ''}`}>
          <div className="pane-heading">
            <div><span className="eyebrow">Workspace</span><h2>Files</h2></div>
            <button className="small-button" onClick={() => fileInput.current?.click()}>+ Add</button>
            <input ref={fileInput} className="hidden" type="file" multiple onChange={onFiles} />
          </div>

          <div className="file-list">
            {files.length === 0 ? (
              <button className="drop-card" onClick={() => fileInput.current?.click()}>
                <span className="drop-icon">＋</span>
                <strong>Upload code files</strong>
                <small>HTML, CSS, JS, TS, JSX, JSON…</small>
              </button>
            ) : files.map((file) => (
              <button key={file.path} className={`file-row ${activeFile?.path === file.path ? 'selected' : ''}`} onClick={() => setActivePath(file.path)}>
                <span className="file-dot" />
                <span className="file-name">{file.path}</span>
                <span className="file-size">{Math.max(1, Math.round(file.content.length / 1024))}k</span>
              </button>
            ))}
          </div>

          {activeFile && (
            <div className="editor-card">
              <div className="editor-bar"><span>{activeFile.path}</span><button onClick={() => downloadFile(activeFile)}>Download</button></div>
              <textarea spellCheck={false} value={activeFile.content} onChange={(e) => updateActive(e.target.value)} />
            </div>
          )}
        </aside>

        <section className={`chat-pane ${mobilePanel === 'chat' ? 'mobile-show' : ''}`}>
          <div className="chat-scroll">
            <div className="hero-copy">
              <span className="eyebrow">Surgical coding agent</span>
              <h1>Change the code you need.<br /><em>Nothing else.</em></h1>
              <p>The agent searches relevant snippets, applies exact patches, validates the result, and returns your updated file without regenerating everything.</p>
            </div>

            <div className="messages">
              {messages.map((item, index) => (
                <div key={index} className={`message ${item.role}`}><span className="avatar">{item.role === 'assistant' ? 'AI' : 'YOU'}</span><div>{item.content}</div></div>
              ))}
              {busy && <div className="message assistant"><span className="avatar">AI</span><div className="thinking"><i /><i /><i /> Inspecting and patching…</div></div>}
            </div>

            {lastChanges.length > 0 && (
              <div className="changes-card">
                <div className="changes-title"><span>✓ Changes ready</span><small>{lastChanges.length} file{lastChanges.length > 1 ? 's' : ''}</small></div>
                {lastChanges.map((file) => (
                  <div className="change-item" key={file.path}>
                    <div className="change-meta"><strong>{file.path}</strong><span className={file.validation.valid ? 'valid' : 'invalid'}>{file.validation.valid ? 'Validated' : 'Needs review'}</span></div>
                    <pre>{file.diff}</pre>
                    <button onClick={() => downloadFile({ path: file.path, content: file.content })}>Download updated file ↓</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form className="composer" onSubmit={submit}>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={files.length ? 'Example: Make the mobile navbar collapse into a menu, keep desktop unchanged…' : 'Upload a file first…'} disabled={!files.length || busy} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
            <div className="composer-footer">
              <span>{files.length ? `${files.length} file${files.length > 1 ? 's' : ''} in workspace` : 'No files yet'}</span>
              <button type="submit" disabled={!prompt.trim() || !files.length || busy}>{busy ? 'Working…' : 'Patch code →'}</button>
            </div>
          </form>
        </section>
      </section>

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSettingsOpen(false)}>
          <div className="modal">
            <div className="modal-head"><div><span className="eyebrow">Agent settings</span><h2>Model provider</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)}>×</button></div>
            <div className="segmented">
              <button className={settings.mode === 'gateway' ? 'active' : ''} onClick={() => setSettings({ ...settings, mode: 'gateway' })}>Vercel Gateway</button>
              <button className={settings.mode === 'custom' ? 'active' : ''} onClick={() => setSettings({ ...settings, mode: 'custom' })}>Custom URL</button>
            </div>

            {settings.mode === 'gateway' ? (
              <label>Model ID<input value={settings.gatewayModel} onChange={(e) => setSettings({ ...settings, gatewayModel: e.target.value })} placeholder="openai/gpt-5.4-mini" /><small>Requires AI_GATEWAY_API_KEY in Vercel environment variables.</small></label>
            ) : (
              <>
                <label>Provider name<input value={settings.providerName} onChange={(e) => setSettings({ ...settings, providerName: e.target.value })} placeholder="openrouter" /></label>
                <label>Base URL<input value={settings.baseURL} onChange={(e) => setSettings({ ...settings, baseURL: e.target.value })} placeholder="https://openrouter.ai/api/v1" /></label>
                <label>Model ID<input value={settings.customModel} onChange={(e) => setSettings({ ...settings, customModel: e.target.value })} placeholder="provider/model-name" /></label>
                <label>API key<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Stored for this browser session only" /><small>The key is kept in sessionStorage and sent only to your own /api/chat route for the current request.</small></label>
              </>
            )}
            <button className="primary-button" onClick={() => setSettingsOpen(false)}>Save settings</button>
          </div>
        </div>
      )}
    </main>
  );
}
