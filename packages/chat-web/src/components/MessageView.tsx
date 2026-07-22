import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../api/chat';

export function MessageView({ message }: { message: ChatMessage }) {
  return (
    <div className={`message message-${message.role}`}>
      {message.role === 'assistant' ? (
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      ) : (
        message.content
      )}
    </div>
  );
}
