import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore } from "../../store";
import type { ChatMessage, ChatAttachment, MessageSegment, ToolCall } from "../../types";

// Shared markdown components
const mdComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="mb-0.5">{children}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-base font-bold mb-1">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isBlock = className?.includes("language-");
    return isBlock ? (
      <code className="block bg-zinc-900 rounded p-2 my-2 text-xs overflow-x-auto whitespace-pre">{children}</code>
    ) : (
      <code className="bg-zinc-900 rounded px-1 py-0.5 text-xs">{children}</code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-zinc-600 pl-2 my-2 text-zinc-400 italic">{children}</blockquote>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">{children}</a>
  ),
};

function ThinkingSegment({ content, isActive, defaultOpen }: { content: string; isActive: boolean; defaultOpen: boolean }) {
  const [manualToggle, setManualToggle] = useState<boolean | null>(null);
  const expanded = manualToggle !== null ? manualToggle : (isActive || defaultOpen);

  return (
    <div className="my-1.5">
      <button
        onClick={() => setManualToggle(expanded ? false : true)}
        className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
        {isActive ? (
          <span className="flex items-center gap-1">
            Thinking
            <span className="inline-flex gap-0.5">
              <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
            </span>
          </span>
        ) : (
          <span>Thought process</span>
        )}
      </button>
      {expanded && (
        <div className="mt-1 ml-1 border-l-2 border-zinc-700 pl-2 text-xs text-zinc-500 italic whitespace-pre-wrap max-h-[300px] overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  );
}

function ToolCallSegment({ toolCall }: { toolCall: ToolCall }) {
  return (
    <div
      className={`my-1 text-[10px] px-2 py-1 rounded ${
        toolCall.status === "executed"
          ? "bg-emerald-900/50 text-emerald-300"
          : toolCall.status === "rejected"
            ? "bg-red-900/50 text-red-300"
            : "bg-zinc-700 text-zinc-400"
      }`}
    >
      {toolCall.status === "executed" ? "Done" : toolCall.status === "rejected" ? "Failed" : "..."}: {toolCall.name}
      {toolCall.arguments && ("label" in toolCall.arguments || "title" in toolCall.arguments) && (
        <span className="ml-1 text-zinc-400">
          ({String(toolCall.arguments.label || toolCall.arguments.title || "")})
        </span>
      )}
    </div>
  );
}

// Parse <think>...</think> tags from text into interleaved segments
function parseThinkTags(text: string): Array<{ type: "thinking" | "text"; content: string }> {
  const result: Array<{ type: "thinking" | "text"; content: string }> = [];
  let remaining = text;
  while (remaining.length > 0) {
    const openIdx = remaining.indexOf("<think>");
    if (openIdx === -1) {
      if (remaining.trim()) result.push({ type: "text", content: remaining });
      break;
    }
    const before = remaining.slice(0, openIdx);
    if (before.trim()) result.push({ type: "text", content: before });
    remaining = remaining.slice(openIdx + "<think>".length);
    const closeIdx = remaining.indexOf("</think>");
    if (closeIdx === -1) {
      // Unclosed think tag — treat rest as thinking
      if (remaining.trim()) result.push({ type: "thinking", content: remaining });
      break;
    }
    const thinkContent = remaining.slice(0, closeIdx);
    if (thinkContent.trim()) result.push({ type: "thinking", content: thinkContent });
    remaining = remaining.slice(closeIdx + "</think>".length);
  }
  return result;
}

function TextSegment({ content }: { content: string }) {
  if (!content) return null;
  return (
    <div className="my-0.5">
      <Markdown remarkPlugins={[remarkGfm]} components={mdComponents as never}>
        {content}
      </Markdown>
    </div>
  );
}

function MixedContent({ content, isActiveMsg }: { content: string; isActiveMsg: boolean }) {
  // If content contains <think> tags, parse and render them as proper segments
  if (content.includes("<think>")) {
    const parts = parseThinkTags(content);
    return (
      <>
        {parts.map((part, i) =>
          part.type === "thinking" ? (
            <ThinkingSegment key={i} content={part.content} isActive={false} defaultOpen={false} />
          ) : (
            <TextSegment key={i} content={part.content} />
          )
        )}
      </>
    );
  }
  return <TextSegment content={content} />;
}

function AssistantMessage({ msg, isLast, isStreaming: streaming }: { msg: ChatMessage; isLast: boolean; isStreaming: boolean }) {
  const segments = msg.segments;
  const isActiveMsg = isLast && streaming;

  // If we have segments, render them sequentially
  if (segments && segments.length > 0) {
    return (
      <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-zinc-800 text-zinc-200">
        {segments.map((seg: MessageSegment, i: number) => {
          const isLastSegment = i === segments.length - 1;
          if (seg.type === "thinking") {
            const isActiveThinking = isActiveMsg && isLastSegment;
            return (
              <ThinkingSegment
                key={i}
                content={seg.content}
                isActive={isActiveThinking}
                defaultOpen={isActiveThinking}
              />
            );
          }
          if (seg.type === "text") {
            // Handle case where text segment contains embedded <think> tags
            if (seg.content.includes("<think>")) {
              return <MixedContent key={i} content={seg.content} isActiveMsg={isActiveMsg} />;
            }
            return <TextSegment key={i} content={seg.content} />;
          }
          if (seg.type === "tool_call") {
            return <ToolCallSegment key={i} toolCall={seg.toolCall} />;
          }
          return null;
        })}
      </div>
    );
  }

  // Fallback for old messages without segments: parse <think> tags from content
  return (
    <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-zinc-800 text-zinc-200">
      {msg.thinking && (
        <ThinkingSegment
          content={msg.thinking}
          isActive={isActiveMsg && !msg.content}
          defaultOpen={false}
        />
      )}
      {msg.content && <MixedContent content={msg.content} isActiveMsg={isActiveMsg} />}
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="mt-1 space-y-1">
          {msg.toolCalls.map((tc) => (
            <ToolCallSegment key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageList() {
  const messages = useStore((s) => s.messages);
  const isStreaming = useStore((s) => s.isStreaming);
  const isSummarizing = useStore((s) => s.isSummarizing);
  const retryLastMessage = useStore((s) => s.retryLastMessage);
  const restartFromMessage = useStore((s) => s.restartFromMessage);
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastMsg = messages[messages.length - 1];
  const showRetry =
    !isStreaming &&
    messages.length > 0 &&
    lastMsg &&
    (lastMsg.content.startsWith("Error:") || lastMsg.role === "user");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming, isSummarizing]);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
      {messages.length === 0 && (
        <div className="text-center text-zinc-600 text-sm mt-8">
          <p className="mb-2">Describe the flowchart you need.</p>
          <p className="text-xs">e.g. "Create a customer onboarding flow"</p>
        </div>
      )}
      {messages.map((msg, msgIndex) => (
        <div
          key={msg.id}
          className={`flex ${
            msg.role === "system" ? "justify-center" : msg.role === "user" ? "justify-end" : "justify-start"
          } ${msg.role === "user" ? "group/msg" : ""}`}
        >
          {msg.role === "system" ? (
            <div className="max-w-[90%] rounded-lg px-3 py-2 text-xs bg-amber-900/30 border border-amber-800/50 text-amber-200">
              <div className="font-semibold mb-1 text-amber-300">Conversation summarized</div>
              <Markdown remarkPlugins={[remarkGfm]} components={{
                p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc ml-4 mb-1">{children}</ul>,
                li: ({ children }) => <li className="mb-0.5">{children}</li>,
              }}>
                {msg.content}
              </Markdown>
            </div>
          ) : msg.role === "assistant" ? (
            <AssistantMessage
              msg={msg}
              isLast={msgIndex === messages.length - 1}
              isStreaming={isStreaming}
            />
          ) : (
            <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-blue-900/50 text-blue-100">
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {msg.attachments.map((att: ChatAttachment, i: number) =>
                    att.type.startsWith("image/") ? (
                      <img key={i} src={att.url} alt={att.name} className="max-w-[160px] max-h-[120px] rounded border border-blue-800/50 object-cover" />
                    ) : (
                      <div key={i} className="flex items-center gap-1 bg-blue-900/40 border border-blue-800/40 rounded px-1.5 py-0.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-300 shrink-0">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="text-[10px] text-blue-300 max-w-[100px] truncate">{att.name}</span>
                      </div>
                    )
                  )}
                </div>
              )}
              {msg.content && msg.content !== "(attached files)" && (
                <Markdown remarkPlugins={[remarkGfm]} components={mdComponents as never}>
                  {msg.content}
                </Markdown>
              )}
              {!isStreaming && msgIndex < messages.length - 1 && (
                <button
                  onClick={() => restartFromMessage(msg.id)}
                  className="mt-1 text-[10px] text-blue-400/0 group-hover/msg:text-blue-400/70 hover:!text-blue-300 transition-colors"
                >
                  Restart from here
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {isSummarizing && (
        <div className="flex justify-center">
          <div className="rounded-lg px-3 py-2 text-xs bg-amber-900/30 border border-amber-800/50 text-amber-200 flex items-center gap-2">
            <svg className="animate-spin h-3 w-3 text-amber-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Summarizing conversation...
          </div>
        </div>
      )}
      {isStreaming && !isSummarizing && lastMsg?.role !== "assistant" && (
        <div className="flex justify-start">
          <div className="bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400">
            <span className="inline-flex gap-1">
              <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
            </span>
          </div>
        </div>
      )}
      {showRetry && (
        <div className="flex justify-start">
          <button
            onClick={retryLastMessage}
            className="text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded px-2 py-1 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
