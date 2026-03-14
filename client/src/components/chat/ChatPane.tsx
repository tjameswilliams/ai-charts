import { useStore } from "../../store";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

const chatStarters = [
  "Build a flowchart for a user authentication flow",
  "Create a diagram showing a CI/CD pipeline",
  "Map out an e-commerce order processing workflow",
  "Design a decision tree for customer support triage",
  "Chart the steps of an agile sprint cycle",
];

function StarterSuggestions() {
  const sendChatMessage = useStore((s) => s.sendChatMessage);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 gap-3">
      <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Get started</p>
      <div className="flex flex-col gap-2 w-full max-w-sm">
        {chatStarters.map((text) => (
          <button
            key={text}
            onClick={() => sendChatMessage(text)}
            className="text-left px-3 py-2 text-xs text-zinc-300 bg-zinc-800/60 border border-zinc-700/50 rounded-lg hover:bg-zinc-700/60 hover:border-zinc-600 transition-colors"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ContextBar() {
  const contextStatus = useStore((s) => s.contextStatus);
  const isSummarizing = useStore((s) => s.isSummarizing);
  const isStreaming = useStore((s) => s.isStreaming);
  const summarizeChat = useStore((s) => s.summarizeChat);
  const messages = useStore((s) => s.messages);

  if (!contextStatus || messages.length === 0) return null;

  const { used, total } = contextStatus;
  const pct = Math.min((used / total) * 100, 100);
  const barColor =
    pct >= 80 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-blue-500";
  const textColor =
    pct >= 80 ? "text-red-400" : pct >= 60 ? "text-amber-400" : "text-zinc-500";

  return (
    <div className="px-3 py-1.5 border-b border-zinc-800/50 flex items-center gap-2">
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-[10px] tabular-nums shrink-0 ${textColor}`}>
          {Math.round(pct)}%
        </span>
      </div>
      <button
        onClick={summarizeChat}
        disabled={isSummarizing || isStreaming || messages.length < 3}
        className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        title="Summarize conversation to free up context"
      >
        {isSummarizing ? "Summarizing..." : "Summarize"}
      </button>
    </div>
  );
}

export function ChatPane() {
  const messages = useStore((s) => s.messages);
  const messagesLoaded = useStore((s) => s.messagesLoaded);
  const nodes = useStore((s) => s.nodes);
  const clearMessages = useStore((s) => s.clearMessages);
  const isStreaming = useStore((s) => s.isStreaming);

  const showStarters = messagesLoaded && messages.length === 0 && nodes.length === 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Chart Builder
        </span>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            disabled={isStreaming}
            className="text-[10px] px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Clear chat history"
          >
            Clear
          </button>
        )}
      </div>
      <ContextBar />
      {showStarters ? <StarterSuggestions /> : <MessageList />}
      <ChatInput />
    </div>
  );
}
