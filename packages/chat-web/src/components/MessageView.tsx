import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../api/chat';
import { AtfBlock, looksLikeAtf } from './atf';
import { CheckIcon, CopyIcon } from './icons';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access is denied outside a secure context (plain http on a non-localhost
      // host). Staying silent is better than an error the user can do nothing about.
    }
  }

  return (
    <button
      className="icon-button"
      onClick={() => void copy()}
      // Icon-only, so the label has to live in the accessible name and the tooltip.
      title={copied ? 'Copied' : label}
      aria-label={copied ? 'Copied' : label}
      type="button"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function childrenToText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(childrenToText).join('');
  return '';
}

export function MessageView({ message }: { message: ChatMessage }) {
  if (message.role !== 'assistant') {
    return <div className="message message-user">{message.content}</div>;
  }

  return (
    <div className="message message-assistant">
      <div className="markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }) {
              const text = childrenToText(children);
              const language = /language-(\w+)/.exec(className ?? '')?.[1];
              const inline = !className && !text.includes('\n');
              if (inline) {
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              }

              const isAtf = language === 'atf' || (language === undefined && looksLikeAtf(text));
              return (
                <span className="code-block">
                  <span className="code-block-tools">
                    <CopyButton text={text} />
                  </span>
                  {isAtf ? (
                    <AtfBlock text={text} />
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  )}
                </span>
              );
            },
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
