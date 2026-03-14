import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { useStore } from "../../store";
import { api } from "../../api/client";
import type { ChatAttachment } from "../../types";

type AutoTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minRows?: number;
};

const AutoTextarea = forwardRef<HTMLTextAreaElement, AutoTextareaProps>(
  ({ minRows = 1, style, onChange, value, ...props }, ref) => {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => innerRef.current!);

    const resize = () => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    };

    useEffect(resize, [value]);

    return (
      <textarea
        ref={innerRef}
        rows={minRows}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          resize();
        }}
        style={{ ...style, overflow: "hidden" }}
        {...props}
      />
    );
  }
);

function isImageType(type: string) {
  return type.startsWith("image/");
}

export function ChatInput() {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isStreaming = useStore((s) => s.isStreaming);
  const sendChatMessage = useStore((s) => s.sendChatMessage);
  const stopStreaming = useStore((s) => s.stopStreaming);

  const sendMessage = () => {
    const content = input.trim();
    if ((!content && attachments.length === 0) || isStreaming) return;
    const atts = attachments.length > 0 ? [...attachments] : undefined;
    setInput("");
    setAttachments([]);
    sendChatMessage(content || "(attached files)", atts);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newAttachments: ChatAttachment[] = [];
      for (const file of Array.from(files)) {
        const result = await api.upload(file);
        newAttachments.push({
          url: result.url,
          name: file.name,
          type: file.type,
        });
      }
      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="p-3 border-t border-zinc-800 shrink-0" onDrop={handleDrop} onDragOver={handleDragOver}>
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="relative group flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1"
            >
              {isImageType(att.type) ? (
                <img src={att.url} alt={att.name} className="w-8 h-8 rounded object-cover" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 shrink-0">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              )}
              <span className="text-[10px] text-zinc-400 max-w-[100px] truncate">{att.name}</span>
              <button
                onClick={() => removeAttachment(i)}
                className="text-zinc-600 hover:text-zinc-300 text-xs leading-none"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming || uploading}
          className="self-end p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-40"
          title="Attach file"
        >
          {uploading ? (
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp,image/tiff,application/pdf,text/plain,text/csv,text/markdown,application/json"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <AutoTextarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? "Waiting for response..." : "Describe your flowchart..."}
          disabled={isStreaming}
          minRows={2}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none disabled:opacity-50"
        />
        {isStreaming ? (
          <button
            onClick={stopStreaming}
            className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 transition-colors self-end"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={sendMessage}
            disabled={!input.trim() && attachments.length === 0}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
