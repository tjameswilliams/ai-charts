import { useState, useRef, useEffect } from "react";

interface InlineEditorProps {
  position: { x: number; y: number };
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

export function InlineEditor({ position, initialValue, onSave, onCancel }: InlineEditorProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const isMultiLine = initialValue.includes("\n");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      onCancel();
      return;
    }
    if (isMultiLine) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        onSave(value);
      }
    } else {
      if (e.key === "Enter") {
        onSave(value);
      }
    }
  };

  const sharedProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(e.target.value),
    onKeyDown: handleKeyDown,
    className:
      "bg-zinc-800 border border-zinc-600 text-zinc-100 rounded px-2 py-1 text-sm outline-none focus:border-blue-500",
    style: { minWidth: 160 },
  };

  return (
    <div
      className="z-50"
      style={{ position: "fixed", left: position.x, top: position.y }}
    >
      {isMultiLine ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          rows={3}
          {...sharedProps}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          {...sharedProps}
        />
      )}
    </div>
  );
}
