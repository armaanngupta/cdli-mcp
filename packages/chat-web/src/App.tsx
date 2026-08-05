import { useEffect, useRef, useState } from 'react';
import { streamChat } from './api/chat';
import type { ChatMessage, ToolStatus } from './api/chat';
import { streamPaper } from './api/paper';
import type { NodeStatus } from './api/paper';
import { MessageView } from './components/MessageView';
import {
  clearEncryptedKey,
  decryptApiKey,
  encryptApiKey,
  loadEncryptedKey,
  saveEncryptedKey,
} from './crypto/byomKey';
import type { StoredKey } from './crypto/byomKey';

const PROVIDERS = ['mistral', 'groq', 'google', 'anthropic', 'openai'];

// Coarse cap on what's sent to the backend, purely to avoid shipping a huge payload on a very
// long session — the backend applies the real token budget (chat-backend/src/context/window.ts).
const MAX_SENT_MESSAGES = 40;

const CUSTOM_MODEL = '__custom__';

// Curated per-provider picks (mirrors chat-backend's DEFAULT_MODEL plus a couple of alternates).
// Not exhaustive — "Custom…" covers anything else the provider offers.
const MODEL_OPTIONS: Record<string, string[]> = {
  mistral: ['mistral-small-latest', 'mistral-large-latest', 'codestral-latest'],
  groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-4-8'],
  openai: ['gpt-5-mini', 'gpt-5', 'gpt-5-nano'],
};

const PAPER_COMMAND = '/paper';

interface ToolCall {
  name: string;
  status: ToolStatus;
}

interface PaperNode {
  name: string;
  status: NodeStatus;
  detail: string;
}

function upsertTool(calls: ToolCall[], name: string, status: ToolStatus): ToolCall[] {
  if (status === 'started') return [...calls, { name, status }];
  const last = calls.map((c) => c.name).lastIndexOf(name);
  if (last === -1) return calls;
  return calls.map((c, i) => (i === last ? { ...c, status } : c));
}

function describeProgress(progress?: Record<string, unknown>): string {
  if (!progress) return '';
  return Object.entries(progress)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
}

// A finished node with no pending row appends rather than replacing, so the re-scoping
// loop shows each pass instead of collapsing into one line.
function upsertNode(
  nodes: PaperNode[],
  name: string,
  status: NodeStatus,
  detail: string,
): PaperNode[] {
  const pending = nodes.findIndex((n) => n.name === name && n.status === 'started');
  if (status === 'finished' && pending !== -1) {
    return nodes.map((n, i) => (i === pending ? { name, status, detail } : n));
  }
  return [...nodes, { name, status, detail }];
}

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [provider, setProvider] = useState('mistral');
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState(false);
  const [storedKey, setStoredKey] = useState<StoredKey | null>(null);
  const [unlockedKey, setUnlockedKey] = useState('');
  const [newKeyInput, setNewKeyInput] = useState('');
  const [pin, setPin] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [paperNodes, setPaperNodes] = useState<PaperNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const busy = streamedText !== null;

  useEffect(() => {
    setStoredKey(loadEncryptedKey());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedText, toolCalls]);

  async function saveKey() {
    if (!newKeyInput.trim() || !pin.trim()) {
      setKeyError('Enter both an API key and a PIN.');
      return;
    }
    const stored = await encryptApiKey(newKeyInput.trim(), pin.trim());
    saveEncryptedKey(stored);
    setStoredKey(stored);
    setUnlockedKey(newKeyInput.trim());
    setNewKeyInput('');
    setPin('');
    setKeyError(null);
  }

  async function unlockKey() {
    if (!storedKey || !pin.trim()) return;
    try {
      setUnlockedKey(await decryptApiKey(storedKey, pin.trim()));
      setPin('');
      setKeyError(null);
    } catch {
      setKeyError('Incorrect PIN.');
    }
  }

  function forgetKey() {
    clearEncryptedKey();
    setStoredKey(null);
    setUnlockedKey('');
    setPin('');
    setKeyError(null);
  }

  async function runPaper(userLine: string, topic: string) {
    if (!topic) {
      setError('Give /paper a topic — e.g. “/paper temple offerings at Girsu”.');
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', content: userLine }]);
    setDraft('');
    setError(null);
    setPaperNodes([]);
    // No token deltas on a paper run, so this only marks the app busy; the draft arrives
    // whole in the done event.
    setStreamedText('');

    let finished = '';
    try {
      await streamPaper(
        { topic, provider, byomKey: unlockedKey, model: model.trim() || undefined },
        {
          onNode: (name, status, progress) =>
            setPaperNodes((prev) => upsertNode(prev, name, status, describeProgress(progress))),
          onDone: (markdown, unverified) => {
            finished = markdown;
            if (unverified.length) {
              setError(`Draft cites artifacts that were never ingested: ${unverified.join(', ')}`);
            }
          },
          onError: (message) => setError(message),
        },
      );
    } catch (err) {
      setError(String(err));
    }

    if (finished) setMessages((prev) => [...prev, { role: 'assistant', content: finished }]);
    setStreamedText(null);
    setPaperNodes([]);
  }

  async function send() {
    const content = draft.trim();
    if (!content || busy) return;
    if (!unlockedKey) {
      setError('Unlock your API key first.');
      return;
    }

    if (content.startsWith(PAPER_COMMAND)) {
      await runPaper(content, content.slice(PAPER_COMMAND.length).trim());
      return;
    }

    const history: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(history);
    setDraft('');
    setError(null);
    setToolCalls([]);
    setStreamedText('');

    let acc = '';
    try {
      await streamChat(
        {
          messages: history.slice(-MAX_SENT_MESSAGES),
          provider,
          byomKey: unlockedKey,
          model: model.trim() || undefined,
        },
        {
          onToken: (text) => {
            acc += text;
            setStreamedText(acc);
          },
          onTool: (name, status) => setToolCalls((prev) => upsertTool(prev, name, status)),
          onDone: () => {},
          onError: (message) => setError(message),
        },
      );
    } catch (err) {
      setError(String(err));
    }

    if (acc) setMessages((prev) => [...prev, { role: 'assistant', content: acc }]);
    setStreamedText(null);
    setToolCalls([]);
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>CDLI Chat</h1>
      </header>

      <div className="body">
        <aside className="sidebar">
          <div className="user">
            {/* Placeholder — replaced by the cdli.earth account name once the
                identity bridge (Phase E) lands. */}
            <div className="avatar">C</div>
            <div>
              <div className="user-name">CDLI User</div>
              <div className="user-hint">not signed in</div>
            </div>
          </div>

          <div className="sidebar-section">
            <label htmlFor="provider">Provider</label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setModel('');
                setCustomModel(false);
              }}
              disabled={busy}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <label htmlFor="model">Model</label>
            <select
              id="model"
              value={customModel ? CUSTOM_MODEL : model}
              onChange={(e) => {
                if (e.target.value === CUSTOM_MODEL) {
                  setCustomModel(true);
                  setModel('');
                } else {
                  setCustomModel(false);
                  setModel(e.target.value);
                }
              }}
              disabled={busy}
            >
              <option value="">Provider default</option>
              {MODEL_OPTIONS[provider]?.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={CUSTOM_MODEL}>Custom…</option>
            </select>
            {customModel && (
              <input
                id="model-custom"
                type="text"
                placeholder="exact model id"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={busy}
              />
            )}
            {!storedKey && !unlockedKey && (
              <>
                <label htmlFor="apikey">API key</label>
                <input
                  id="apikey"
                  type="password"
                  placeholder="paste your key"
                  value={newKeyInput}
                  onChange={(e) => setNewKeyInput(e.target.value)}
                />
                <label htmlFor="save-pin">PIN (to encrypt it)</label>
                <input
                  id="save-pin"
                  type="password"
                  placeholder="choose a PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void saveKey()}
                />
                <button onClick={() => void saveKey()}>Save key</button>
                <p className="key-hint">
                  Encrypted with your PIN and kept only in this browser. Once unlocked it lives in
                  memory for this tab and is sent directly to your chosen provider with each message
                  — never stored on our server.
                </p>
              </>
            )}
            {storedKey && !unlockedKey && (
              <>
                <label htmlFor="unlock-pin">PIN</label>
                <input
                  id="unlock-pin"
                  type="password"
                  placeholder="enter your PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void unlockKey()}
                />
                <button onClick={() => void unlockKey()}>Unlock key</button>
                <button onClick={forgetKey}>Forget key</button>
              </>
            )}
            {unlockedKey && (
              <>
                <p className="key-hint">API key unlocked for this session.</p>
                <button onClick={forgetKey}>Forget key</button>
              </>
            )}
            {keyError && <p className="key-hint key-error">{keyError}</p>}
          </div>
        </aside>

        <main className="chat">
          <div className="thread">
            <div className="thread-col">
              {messages.length === 0 && streamedText === null && (
                <p className="empty">
                  Ask about the cuneiform corpus — e.g. “Find Ur III tablets from Nippur”.
                  <br />
                  Or write a research note with <code>/paper</code> — e.g. “/paper temple offerings
                  at Girsu”. A paper run takes a few minutes.
                </p>
              )}
              {messages.map((m, i) => (
                <MessageView key={i} message={m} />
              ))}
              {streamedText !== null && (
                <>
                  {paperNodes.map((n, i) => (
                    <div key={`node-${i}`} className={`tool tool-${n.status}`}>
                      {n.status === 'started' ? '⚙ running' : '✓'} <code>{n.name}</code>
                      {n.detail && <span className="node-detail"> {n.detail}</span>}
                    </div>
                  ))}
                  {toolCalls.map((t, i) => (
                    <div key={i} className={`tool tool-${t.status}`}>
                      {t.status === 'started' ? '⚙ calling' : t.status === 'finished' ? '✓' : '✕'}{' '}
                      <code>{t.name}</code>
                      {t.status === 'started' ? '…' : ''}
                    </div>
                  ))}
                  {streamedText !== '' && (
                    <MessageView message={{ role: 'assistant', content: streamedText }} />
                  )}
                </>
              )}
              {error && <div className="error">{error}</div>}
              <div ref={bottomRef} />
            </div>
          </div>

          <footer className="composer">
            <div className="composer-col">
              <textarea
                value={draft}
                placeholder="Ask a question, or /paper <topic>…"
                rows={2}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button onClick={() => void send()} disabled={busy || !draft.trim()}>
                {busy ? '…' : 'Send'}
              </button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
