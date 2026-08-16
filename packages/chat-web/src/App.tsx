import { Fragment, useEffect, useRef, useState } from 'react';
import { streamChat } from './api/chat';
import type { ArtifactCard, ChatMessage, ToolStatus } from './api/chat';
import { classifyError } from './api/errors';
import { displayName, fetchToken } from './api/identity';
import cdliLogo from './assets/cdli-logo.png';
import { downloadPaperPdf, streamPaper } from './api/paper';
import { ArtifactCards } from './components/ArtifactCard';
import { EditIcon, RegenerateIcon } from './components/icons';
import { CopyButton, MessageView } from './components/MessageView';
import {
  clearEncryptedKey,
  decryptApiKey,
  encryptApiKey,
  loadEncryptedKey,
  saveEncryptedKey,
} from './crypto/byomKey';
import type { StoredKey } from './crypto/byomKey';

const PROVIDERS = ['mistral', 'groq', 'google', 'anthropic', 'openai', 'openrouter'];

// Coarse cap on what's sent to the backend, purely to avoid shipping a huge payload on a very
// long session — the backend applies the real token budget (chat-backend/src/context/window.ts).
const MAX_SENT_MESSAGES = 40;

const CUSTOM_MODEL = '__custom__';

interface ModelOption {
  id: string;
  label?: string;
  /** Marks a provider's recommended pick, shown first with a star. */
  starred?: boolean;
}

// Curated per-provider picks (mirrors chat-backend's DEFAULT_MODEL plus alternates).
// Not exhaustive — "Custom…" covers anything else the provider offers. Entries without a
// label predate the curated list and display their raw id.
const MODEL_OPTIONS: Record<string, ModelOption[]> = {
  mistral: [
    { id: 'mistral-medium-latest', label: 'Mistral Medium 3.5', starred: true },
    { id: 'mistral-small-latest', label: 'Mistral Small 4' },
    { id: 'mistral-large-latest', label: 'Mistral Large 3' },
    // Both still answer, though Mistral's docs list devstral among the deprecated lines.
    { id: 'devstral-medium-latest', label: 'Devstral 2 (deprecated)' },
    { id: 'codestral-latest', label: 'Codestral (coding)' },
  ],
  groq: [
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', starred: true },
    { id: 'groq/compound', label: 'Groq Compound', starred: true },
    { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
    { id: 'qwen/qwen3.6-27b', label: 'Qwen3.6 27B' },
    { id: 'groq/compound-mini', label: 'Groq Compound Mini' },
    { id: 'llama-3.3-70b-versatile' },
    { id: 'llama-3.1-8b-instant' },
  ],
  google: [
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', starred: true },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
    { id: 'gemini-2.5-flash' },
    { id: 'gemini-2.5-pro' },
    { id: 'gemini-2.0-flash' },
  ],
  anthropic: [
    { id: 'claude-opus-5', label: 'Claude Opus 5', starred: true },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', starred: true },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { id: 'claude-fable-5', label: 'Claude Fable 5' },
    // Still served, but superseded by the 5 generation.
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (legacy)' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (legacy)' },
  ],
  openai: [
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', starred: true },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    // Deprecated by OpenAI, API shutdown 2026-12-10. Kept until then; do not default to these.
    { id: 'gpt-5-mini', label: 'GPT-5 mini (deprecated)' },
    { id: 'gpt-5', label: 'GPT-5 (deprecated)' },
    { id: 'gpt-5-nano', label: 'GPT-5 nano (deprecated)' },
  ],
  // OpenRouter model ids are vendor-namespaced; one key reaches every vendor. "Custom…"
  // covers the full catalogue.
  openrouter: [
    { id: 'openrouter/auto-beta', label: 'OpenRouter Auto', starred: true },
    { id: 'anthropic/claude-opus-5', label: 'Claude Opus 5' },
    { id: 'openai/gpt-5.6-sol', label: 'GPT-5.6 Sol' },
    { id: 'google/gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
    { id: 'x-ai/grok-4.5', label: 'Grok 4.5' },
    { id: 'deepseek/deepseek-v4-pro-0813', label: 'DeepSeek V4 Pro' },
    { id: 'openai/gpt-4o-mini' },
    { id: 'anthropic/claude-3.5-sonnet' },
    { id: 'google/gemini-2.0-flash-001' },
  ],
};

const PAPER_COMMAND = '/paper';

// Slash commands that bias an ordinary chat turn rather than routing elsewhere. /paper is
// separate: it runs a different service entirely.
const SLASH_COMMANDS = {
  '/search': 'search',
  '/artifact': 'artifact',
  '/cqp': 'cqp',
} as const;

type SlashCommand = (typeof SLASH_COMMANDS)[keyof typeof SLASH_COMMANDS];

// Everything the composer will complete, /paper included — it is a slash command to the
// user even though it runs a different service.
const COMMAND_MENU = [
  { name: '/search', argument: '<criteria>', hint: 'Search the catalogue' },
  { name: '/artifact', argument: '<P-number>', hint: 'Look up one artifact' },
  { name: '/cqp', argument: '<query>', hint: 'Run a CQP corpus query' },
  { name: '/paper', argument: '<topic>', hint: 'Write a research note (takes minutes)' },
];

/**
 * Commands to offer for the current draft. Only while the command word itself is being
 * typed — once there is a space the user has moved on to the argument.
 */
function commandMatches(draft: string) {
  if (!/^\/\S*$/.test(draft)) return [];
  const typed = draft.toLowerCase();
  return COMMAND_MENU.filter((c) => c.name.startsWith(typed));
}

const COMMAND_HINT: Record<SlashCommand, string> = {
  search: 'Give /search some criteria — e.g. “/search Ur III tablets from Umma”.',
  artifact: 'Give /artifact an identifier — e.g. “/artifact P100141”.',
  cqp: 'Give /cqp a query — e.g. “/cqp w1:[ ( conll:FORM = "lugal" ) ]”.',
};

/** Split a leading slash command off the draft. Unknown slashes are left as ordinary text. */
function parseCommand(text: string): { command?: SlashCommand; rest: string } {
  const match = /^(\/[a-z]+)(\s+|$)/i.exec(text);
  const command = match && SLASH_COMMANDS[match[1].toLowerCase() as keyof typeof SLASH_COMMANDS];
  return command ? { command, rest: text.slice(match![1].length).trim() } : { rest: text };
}

// What the backend pins the funded tier to (chat-backend/src/llm/credentials.ts). Shown on
// funded answers, where the provider and model pickers are ignored.
const FUNDED_MODEL = 'mistral-small-latest';

// A paper result is an assistant message that is also downloadable as a PDF; the title drives
// the filename. Extra fields over ChatMessage — stripped before the history is sent.
type Message = ChatMessage & {
  paperTitle?: string;
  cards?: ArtifactCard[];
  // Kept per message rather than read from current state: the model can be switched
  // mid-thread, and a finished answer should say what actually produced it.
  model?: string;
  // The tools this turn used. Retained after the turn so a finished answer still shows
  // that it was grounded in the corpus rather than answered from memory.
  tools?: string[];
  // Set on a user turn that used a slash command. Stored rather than re-parsed so
  // regenerate and retry reproduce the same biased turn.
  command?: SlashCommand;
};

// Domain examples for a fresh thread: one per capability, so the empty state doubles as a
// hint that this searches a real catalogue rather than answering from the model's memory.
const STARTERS = [
  'Find Ur III administrative tablets from Nippur',
  'What is on tablet P100141?',
  'Which languages are represented in the CDLI catalogue?',
  '/paper temple offerings at Girsu',
];

function toWire(messages: Message[]): ChatMessage[] {
  return messages.map(({ role, content }) => ({ role, content }));
}

function dedupeCards(cards: ArtifactCard[]): ArtifactCard[] {
  const seen = new Map<string, ArtifactCard>();
  for (const card of cards) if (!seen.has(card.p_number)) seen.set(card.p_number, card);
  return [...seen.values()];
}

function paperTitle(markdown: string): string {
  return markdown.match(/^#\s+(.+)$/m)?.[1].trim() ?? 'CDLI research note';
}

function pdfFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  return `${slug || 'paper'}.pdf`;
}

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

// The pipeline order, so a finished node can name what runs next as the live activity —
// the backend only emits a "started" event for the very first node.
const PIPELINE = ['discovery', 'scoping', 'ingestion', 'clustering', 'evaluation', 'synthesis'];

const NODE_DOING: Record<string, string> = {
  discovery: 'Searching the CDLI catalogue',
  scoping: 'Selecting the most relevant artifacts',
  ingestion: 'Reading inscriptions',
  clustering: 'Grouping artifacts into themes',
  evaluation: 'Weighing the evidence',
  synthesis: 'Writing the paper',
  citations: 'Checking citations',
};

function nodeDone(name: string, progress?: Record<string, unknown>): string {
  const n = (key: string) => Number(progress?.[key] ?? 0);
  switch (name) {
    case 'discovery':
      return `Found ${n('cards') || n('artifact_ids')} candidate artifacts`;
    case 'scoping':
      return `Shortlisted ${n('ranked_ids')} artifacts`;
    case 'ingestion':
      return `Summarised ${n('summaries')} inscriptions`;
    case 'clustering':
      return `Grouped into ${n('themes')} themes`;
    case 'evaluation':
      return 'Evidence assessed';
    case 'synthesis':
      return 'Draft written';
    case 'citations':
      return 'Citations checked';
    default:
      return name;
  }
}

function nextActivity(name: string): string | null {
  const at = PIPELINE.indexOf(name);
  if (at === -1) return NODE_DOING.citations ?? null;
  const next = PIPELINE[at + 1];
  return next ? NODE_DOING[next] : NODE_DOING.citations;
}

// Three staggered dots — the "something is happening" cue during a long node or a chat pause.
function Dots() {
  return (
    <span className="dots" aria-hidden="true">
      <span>·</span>
      <span>·</span>
      <span>·</span>
    </span>
  );
}

export function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [provider, setProvider] = useState('mistral');
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState(false);
  const [storedKey, setStoredKey] = useState<StoredKey | null>(null);
  const [unlockedKey, setUnlockedKey] = useState('');
  // Null means anonymous — either not signed in on cdli.earth, or the endpoint isn't
  // reachable (it doesn't exist outside the framework stack). Never blocks the BYOM path.
  const [identityToken, setIdentityToken] = useState<string | null>(null);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [pin, setPin] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [paperSteps, setPaperSteps] = useState<string[]>([]);
  // The live, animated "what's happening now" line — the next/current pipeline step for a
  // paper, or "Thinking" for a chat turn before the first token arrives.
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Not a failure — the paper rendered, but node 6 flagged citations. Shown as a warning.
  const [warning, setWarning] = useState<string | null>(null);
  // Cards for the turn in flight; they move onto the message once it completes.
  const [turnCards, setTurnCards] = useState<ArtifactCard[]>([]);
  // The exact history of the last turn, so retry re-runs it rather than rebuilding it.
  const [lastHistory, setLastHistory] = useState<Message[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [confirmRestart, setConfirmRestart] = useState(false);
  // Auto-scroll only while the user is already at the bottom; otherwise reading back
  // through a thread is yanked away on every token.
  const [atBottom, setAtBottom] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  // Highlighted row in the slash-command menu.
  const [menuIndex, setMenuIndex] = useState(0);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Bumped on restart. A turn aborted mid-flight still runs its tail, which would otherwise
  // append its partial answer to the conversation the user just cleared.
  const turnIdRef = useRef(0);

  const busy = streamedText !== null;
  // A user's own key always wins — the backend's resolveCredentials only reaches for the
  // funded key when no BYOM key is sent.
  const usingFunded = !unlockedKey && identityToken !== null;
  const accountName = displayName(identityToken);
  const menu = commandMatches(draft);
  // Clamped rather than reset, so narrowing the list cannot leave the highlight off the end.
  const highlighted = Math.min(menuIndex, Math.max(menu.length - 1, 0));
  // Why the composer cannot send right now, if anything. /paper has the stricter
  // requirement, so which check applies depends on what is typed.
  const blocker = draft.trim().startsWith(PAPER_COMMAND)
    ? unlockedKey
      ? null
      : 'A paper run needs your own API key — it makes 15–30 model calls.'
    : credentialProblem();

  useEffect(() => {
    setStoredKey(loadEncryptedKey());
    void fetchToken().then(setIdentityToken);
  }, []);

  async function refreshIdentity(): Promise<string | null> {
    const fresh = await fetchToken();
    setIdentityToken(fresh);
    return fresh;
  }

  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedText, toolCalls, paperSteps, activity, atBottom]);

  useEffect(() => {
    if (!confirmRestart) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setConfirmRestart(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmRestart]);

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
    // Deliberately not covered by the funded tier: one run is 15-30 model calls against a
    // chat turn's 1-2, so /paper stays BYOM-only until per-run cost is agreed.
    if (!unlockedKey) {
      setError(
        'A paper run needs your own API key — it makes 15–30 model calls, so it is not ' +
          "covered by CDLI's free tier.",
      );
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', content: userLine }]);
    setDraft('');
    setError(null);
    setWarning(null);
    setPaperSteps([]);
    // Retry re-runs a chat turn; a failed paper run must not silently re-send an older one.
    setLastHistory(null);
    setActivity(NODE_DOING.discovery);
    // No token deltas on a paper run, so this only marks the app busy; the draft arrives
    // whole in the done event.
    setStreamedText('');

    const controller = new AbortController();
    abortRef.current = controller;
    const turnId = turnIdRef.current;

    let finished = '';
    try {
      await streamPaper(
        { topic, provider, byomKey: unlockedKey, model: model.trim() || undefined },
        {
          onNode: (name, status, progress) => {
            if (status === 'started') {
              setActivity(NODE_DOING[name] ?? null);
            } else {
              setPaperSteps((prev) => [...prev, nodeDone(name, progress)]);
              setActivity(nextActivity(name));
            }
          },
          onSection: (label, index, of) =>
            setActivity(`Writing section ${index} of ${of}: ${label}`),
          onDone: (markdown, unverified) => {
            finished = markdown;
            if (unverified.length) {
              setWarning(
                `The draft cited ${unverified.length} artifact(s) that were not in the retrieved ` +
                  `set and have been left unverified: ${unverified.join(', ')}.`,
              );
            }
          },
          onError: (message) => setError(message),
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted) setError(String(err));
    }
    if (turnId !== turnIdRef.current) return;
    abortRef.current = null;

    if (finished)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: finished, paperTitle: paperTitle(finished) },
      ]);
    setStreamedText(null);
    setActivity(null);
    setPaperSteps([]);
  }

  async function downloadPdf(m: Message) {
    try {
      await downloadPaperPdf(m.content, pdfFilename(m.paperTitle ?? 'paper'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  /** Complete the draft to a command and leave the caret ready for its argument. */
  function pickCommand(name: string) {
    setDraft(`${name} `);
    setMenuIndex(0);
    composerRef.current?.focus();
  }

  /** Returns true when the menu consumed the key, so the composer should not also act. */
  function menuKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (menu.length === 0) return false;
    switch (e.key) {
      case 'ArrowDown':
        setMenuIndex((i) => (Math.min(i, menu.length - 1) + 1) % menu.length);
        return true;
      case 'ArrowUp':
        setMenuIndex((i) => (Math.min(i, menu.length - 1) + menu.length - 1) % menu.length);
        return true;
      case 'Tab':
      case 'Enter':
        pickCommand(menu[highlighted].name);
        return true;
      case 'Escape':
        // Dismiss by making the draft no longer a bare command word.
        setDraft(`${draft} `);
        return true;
      default:
        return false;
    }
  }

  // A small tolerance, so "at the bottom" survives sub-pixel rounding and the growth of the
  // last line while tokens arrive.
  function onThreadScroll() {
    const el = threadRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  function jumpToLatest() {
    setAtBottom(true);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  /** The conversation as Markdown — nothing is persisted, so this is the only way to keep it. */
  function transcript(): string {
    return messages
      .map((m) => `## ${m.role === 'user' ? 'You' : 'CDLI Chat'}\n\n${m.content}`)
      .join('\n\n');
  }

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(transcript());
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      // Clipboard is unavailable outside a secure context; the download still works.
    }
  }

  function downloadTranscript() {
    const url = URL.createObjectURL(new Blob([transcript()], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cdli-chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function restartChat() {
    turnIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setDraft('');
    setError(null);
    setWarning(null);
    setToolCalls([]);
    setPaperSteps([]);
    setTurnCards([]);
    setActivity(null);
    setStreamedText(null);
    setLastHistory(null);
    setEditing(null);
    setConfirmRestart(false);
  }

  /**
   * Run one chat turn against `history`, whose last entry is the user turn being answered.
   * Shared by send, regenerate, edit-and-resend and retry so they can't drift apart.
   */
  async function runTurn(history: Message[]) {
    setMessages(history);
    setLastHistory(history);
    setDraft('');
    setError(null);
    setWarning(null);
    setToolCalls([]);
    setTurnCards([]);
    setActivity('Thinking');
    setStreamedText('');

    const controller = new AbortController();
    abortRef.current = controller;
    const turnId = turnIdRef.current;

    let acc = '';
    let cards: ArtifactCard[] = [];
    const used: string[] = [];
    try {
      await streamChat(
        {
          messages: toWire(history).slice(-MAX_SENT_MESSAGES),
          provider,
          // Sent only when the user has their own key; its absence is what selects the
          // funded path server-side.
          byomKey: unlockedKey || undefined,
          model: model.trim() || undefined,
          // Read off the turn being answered, so regenerate and retry stay biased the
          // same way the original request was.
          command: history[history.length - 1]?.command,
        },
        {
          onToken: (text) => {
            acc += text;
            setStreamedText(acc);
            // Tokens are flowing — the text itself is the indicator now.
            setActivity(null);
          },
          onTool: (name, status) => {
            setToolCalls((prev) => upsertTool(prev, name, status));
            if (status === 'started' && !used.includes(name)) used.push(name);
            // The tool row carries its own animation while it runs; between a finished tool
            // and the next token, fall back to a generic "Thinking".
            setActivity(status === 'started' ? null : 'Thinking');
          },
          onArtifacts: (incoming) => {
            cards = dedupeCards([...cards, ...incoming]);
            setTurnCards(cards);
          },
          onDone: () => {},
          onError: (message) => setError(message),
        },
        controller.signal,
        { token: identityToken, refresh: refreshIdentity },
      );
    } catch (err) {
      // A stop is a user action, not a failure — keep whatever streamed and stay quiet.
      if (!controller.signal.aborted) setError(String(err));
    }
    // The chat was restarted while this turn was in flight; its result belongs to a
    // conversation that no longer exists.
    if (turnId !== turnIdRef.current) return;
    abortRef.current = null;

    // Partial text is kept on a stop: it is what the user chose to keep.
    if (acc)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: acc,
          cards,
          tools: used,
          model: usingFunded ? FUNDED_MODEL : model.trim() || `${provider} default`,
        },
      ]);
    setStreamedText(null);
    setActivity(null);
    setToolCalls([]);
    setTurnCards([]);
  }

  function credentialProblem(): string | null {
    if (unlockedKey || identityToken) return null;
    return storedKey
      ? 'Unlock your API key, or sign in to cdli.earth to use the free tier.'
      : 'Sign in to cdli.earth to use the free tier, or add your own API key.';
  }

  async function send(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || busy) return;

    // Checked before the key guard: /paper has its own, stricter requirement.
    if (content.startsWith(PAPER_COMMAND)) {
      await runPaper(content, content.slice(PAPER_COMMAND.length).trim());
      return;
    }

    const problem = credentialProblem();
    if (problem) {
      setError(problem);
      return;
    }

    const { command, rest } = parseCommand(content);
    if (command && !rest) {
      setError(COMMAND_HINT[command]);
      return;
    }

    await runTurn([...messages, { role: 'user', content, command }]);
  }

  /** Re-answer the last user turn, discarding the assistant reply that followed it. */
  async function regenerate() {
    if (busy) return;
    const lastUser = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUser === -1) return;
    const problem = credentialProblem();
    if (problem) {
      setError(problem);
      return;
    }
    await runTurn(messages.slice(0, lastUser + 1));
  }

  /** Edit a past user turn and re-run from there; everything after it is discarded. */
  async function resendEdited(index: number) {
    const content = editDraft.trim();
    if (!content || busy) return;
    setEditing(null);
    const problem = credentialProblem();
    if (problem) {
      setError(problem);
      return;
    }
    // Re-parsed rather than inherited: the edit may have added or removed the command.
    const { command, rest } = parseCommand(content);
    if (command && !rest) {
      setError(COMMAND_HINT[command]);
      return;
    }

    await runTurn([...messages.slice(0, index), { role: 'user', content, command }]);
  }

  async function retry() {
    if (busy || !lastHistory) return;
    await runTurn(lastHistory);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? 'Hide settings' : 'Show settings'}
            aria-expanded={sidebarOpen}
          >
            ☰
          </button>
          <h1 className="wordmark">
            <img src={cdliLogo} alt="CDLI" className="wordmark-logo" />
            <span>Chat</span>
          </h1>
        </div>
        <div className="topbar-actions">
          <button
            className="restart-button"
            onClick={() => void copyTranscript()}
            disabled={messages.length === 0}
            aria-label="Copy the whole conversation as Markdown"
          >
            {copiedAll ? '✓ Copied' : 'Copy all'}
          </button>
          <button
            className="restart-button"
            onClick={downloadTranscript}
            disabled={messages.length === 0}
            aria-label="Download the conversation as a Markdown file"
          >
            ⬇ Export
          </button>
          <button
            className="restart-button"
            onClick={() => setConfirmRestart(true)}
            disabled={messages.length === 0 && !busy}
            aria-label="Clear this conversation and start over"
          >
            ↻ Restart chat
          </button>
        </div>
      </header>

      {confirmRestart && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setConfirmRestart(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restart-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="restart-title">Restart chat?</h2>
            <p>
              This clears every message in this conversation. Nothing is stored, so it cannot be
              recovered.
            </p>
            <p className="modal-note">
              Your API key and sign-in are kept — only the conversation is cleared.
            </p>
            <div className="modal-actions">
              <button onClick={() => setConfirmRestart(false)}>Cancel</button>
              <button className="modal-danger" onClick={restartChat} autoFocus>
                Restart chat
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`body${sidebarOpen ? ' sidebar-open' : ''}`}>
        <aside className="sidebar">
          <div className="user">
            {/* Name comes from the token's `name` claim (see api/identity.ts). Anonymous
                until the framework mints one. */}
            <div className="avatar">{(accountName ?? 'A').charAt(0).toUpperCase()}</div>
            <div>
              <div className="user-name">{accountName ?? 'Anonymous'}</div>
              <div className="user-hint">
                {usingFunded && "using CDLI's free tier"}
                {identityToken && unlockedKey && 'using your own key'}
                {!identityToken && unlockedKey && 'not signed in · using your own key'}
                {!identityToken && !unlockedKey && (
                  <>
                    not signed in — <a href="/login">sign in</a> for the free tier
                  </>
                )}
              </div>
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
              // resolveCredentials ignores provider and model on the funded path, so a live
              // picker would silently lie about which model answers.
              disabled={busy || usingFunded}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {usingFunded && (
              <p className="key-hint">
                On CDLI&rsquo;s free tier the model is fixed to <code>mistral-small-latest</code>.
                Add your own key to choose a provider and model.
              </p>
            )}
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
              disabled={busy || usingFunded}
            >
              <option value="">Provider default</option>
              {MODEL_OPTIONS[provider]?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.starred ? '★ ' : ''}
                  {m.label ?? m.id}
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
                disabled={busy || usingFunded}
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
          {/* A non-scrolling anchor for the jump control: positioned inside .thread it would
              be laid out against the scrolled content and drift up with it. */}
          <div className="thread-wrap">
            <div className="thread" ref={threadRef} onScroll={onThreadScroll}>
              <div className={`thread-col${messages.length === 0 ? ' thread-empty' : ''}`}>
                {messages.length === 0 && streamedText === null && (
                  <div className="empty">
                    <p>
                      Ask about the cuneiform corpus, or write a research note with{' '}
                      <code>/paper</code> — a paper run takes a few minutes.
                    </p>
                    <p className="empty-commands">
                      <code>/search</code> catalogue criteria · <code>/artifact</code> a P-number ·{' '}
                      <code>/cqp</code> a corpus query
                    </p>
                    <div className="starters">
                      {STARTERS.map((s) => (
                        <button key={s} className="starter" onClick={() => void send(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div className="turn" key={i}>
                    {editing === i ? (
                      <div className="edit-box">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={3}
                          autoFocus
                        />
                        <div className="edit-actions">
                          <button onClick={() => void resendEdited(i)}>Resend</button>
                          <button onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <MessageView message={m} />
                    )}
                    {editing !== i && (
                      <div className={`message-actions actions-${m.role}`}>
                        <CopyButton text={m.content} />
                        {m.role === 'user' && !busy && (
                          <button
                            className="icon-button"
                            title="Edit and resend"
                            aria-label="Edit and resend"
                            onClick={() => {
                              setEditing(i);
                              setEditDraft(m.content);
                            }}
                          >
                            <EditIcon />
                          </button>
                        )}
                        {m.role === 'assistant' && !busy && i === messages.length - 1 && (
                          <button
                            className="icon-button"
                            title="Regenerate"
                            aria-label="Regenerate this answer"
                            onClick={() => void regenerate()}
                          >
                            <RegenerateIcon />
                          </button>
                        )}
                      </div>
                    )}
                    {m.cards && m.cards.length > 0 && <ArtifactCards cards={m.cards} />}
                    {m.role === 'assistant' && (m.model || m.tools?.length) && (
                      <div className="turn-meta">
                        {m.tools?.length ? (
                          <span>
                            Used{' '}
                            {m.tools.map((t, j) => (
                              <Fragment key={t}>
                                {j > 0 && ', '}
                                <code>{t}</code>
                              </Fragment>
                            ))}
                          </span>
                        ) : (
                          <span>No corpus tools used</span>
                        )}
                        {m.model && <span className="turn-model">{m.model}</span>}
                      </div>
                    )}
                    {m.paperTitle && (
                      <button className="download-pdf" onClick={() => void downloadPdf(m)}>
                        ⬇ Download PDF
                      </button>
                    )}
                  </div>
                ))}
                {streamedText !== null && (
                  // Announced to screen readers, which otherwise get nothing at all while a
                  // turn streams. "polite" so it does not interrupt on every token.
                  <div className="live-region" aria-live="polite" aria-busy="true">
                    {paperSteps.map((step, i) => (
                      <div key={`step-${i}`} className="tool tool-finished">
                        ✓ {step}
                      </div>
                    ))}
                    {toolCalls.map((t, i) => (
                      <div key={i} className={`tool tool-${t.status}`}>
                        {t.status === 'started' ? '⚙ calling' : t.status === 'finished' ? '✓' : '✕'}{' '}
                        <code>{t.name}</code>
                        {t.status === 'started' && <Dots />}
                      </div>
                    ))}
                    {activity && (
                      <div className="tool activity">
                        {activity}
                        <Dots />
                      </div>
                    )}
                    {streamedText !== '' && (
                      <MessageView message={{ role: 'assistant', content: streamedText }} />
                    )}
                    {turnCards.length > 0 && <ArtifactCards cards={turnCards} />}
                  </div>
                )}
                {warning && <div className="warning">{warning}</div>}
                {error &&
                  (() => {
                    const e = classifyError(error);
                    return (
                      <div className="error">
                        <div>{e.message}</div>
                        {lastHistory && !busy && (
                          <button className="retry-button" onClick={() => void retry()}>
                            ↻ Retry
                          </button>
                        )}
                        <details className="error-detail">
                          <summary>Details</summary>
                          <pre>{e.detail}</pre>
                        </details>
                      </div>
                    );
                  })()}
                <div ref={bottomRef} />
              </div>
            </div>
            {!atBottom && messages.length > 0 && (
              <button className="jump-latest" onClick={jumpToLatest} aria-label="Jump to latest">
                ↓ Latest
              </button>
            )}
          </div>

          <footer className="composer">
            {menu.length > 0 && (
              <div className="command-menu" role="listbox" aria-label="Slash commands">
                {menu.map((c, i) => (
                  <button
                    key={c.name}
                    className={`command-option${i === highlighted ? ' command-option-active' : ''}`}
                    role="option"
                    aria-selected={i === highlighted}
                    // onMouseDown, not onClick: click fires after the textarea has already
                    // blurred, which closes the menu before the handler runs.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickCommand(c.name);
                    }}
                    onMouseEnter={() => setMenuIndex(i)}
                  >
                    <span className="command-name">{c.name}</span>
                    <span className="command-arg">{c.argument}</span>
                    <span className="command-hint">{c.hint}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="composer-col">
              <textarea
                ref={composerRef}
                value={draft}
                placeholder="Ask a question, or type / for commands…   (Shift+Enter for a new line)"
                rows={2}
                aria-label="Message"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (menuKeyDown(e)) {
                    e.preventDefault();
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {busy ? (
                <button className="stop-button" onClick={stop} aria-label="Stop generating">
                  ■ Stop
                </button>
              ) : (
                <button
                  onClick={() => void send()}
                  // The credential check used to happen only on submit, so the reason for a
                  // refusal appeared after the attempt rather than before it.
                  disabled={!draft.trim() || blocker !== null}
                  title={blocker ?? undefined}
                >
                  Send
                </button>
              )}
            </div>
            {blocker && <p className="composer-hint">{blocker}</p>}
          </footer>
        </main>
      </div>
    </div>
  );
}
