import { useEffect, useRef, useState } from 'react';
import { streamChat } from './api/chat';
import type { ChatMessage, ToolStatus } from './api/chat';
import { MessageView } from './components/MessageView';

const PROVIDERS = ['mistral', 'groq', 'google', 'anthropic', 'openai'];

interface ToolCall {
  name: string;
  status: ToolStatus;
}

function upsertTool(calls: ToolCall[], name: string, status: ToolStatus): ToolCall[] {
  if (status === 'started') return [...calls, { name, status }];
  const last = calls.map((c) => c.name).lastIndexOf(name);
  if (last === -1) return calls;
  return calls.map((c, i) => (i === last ? { ...c, status } : c));
}

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [provider, setProvider] = useState('mistral');
  const [model, setModel] = useState('');
  const [byomKey, setByomKey] = useState('');
  const [streamedText, setStreamedText] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const busy = streamedText !== null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedText, toolCalls]);

  async function send() {
    const content = draft.trim();
    if (!content || busy) return;
    if (!byomKey.trim()) {
      setError('Enter your API key first.');
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
        { messages: history, provider, byomKey: byomKey.trim(), model: model.trim() || undefined },
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
              onChange={(e) => setProvider(e.target.value)}
              disabled={busy}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <label htmlFor="model">Model (optional)</label>
            <input
              id="model"
              type="text"
              placeholder="provider default"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={busy}
            />
            <label htmlFor="apikey">API key</label>
            <input
              id="apikey"
              type="password"
              placeholder="paste your key"
              value={byomKey}
              onChange={(e) => setByomKey(e.target.value)}
            />
          </div>
        </aside>

        <main className="chat">
          <div className="thread">
            <div className="thread-col">
              {messages.length === 0 && streamedText === null && (
                <p className="empty">
                  Ask about the cuneiform corpus — e.g. “Find Ur III tablets from Nippur”.
                </p>
              )}
              {messages.map((m, i) => (
                <MessageView key={i} message={m} />
              ))}
              {streamedText !== null && (
                <>
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
                placeholder="Ask a question…"
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
