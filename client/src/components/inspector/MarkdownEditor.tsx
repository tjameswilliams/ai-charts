import { useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";

interface Props {
  value: string;
  onChange: (md: string) => void;
  placeholder?: string;
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1 rounded text-[11px] leading-none transition-colors ${
        active
          ? "bg-blue-600/40 text-blue-300"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"
      }`}
    >
      {children}
    </button>
  );
}

export function MarkdownEditor({ value, onChange, placeholder }: Props) {
  const isUpdatingRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: {
          HTMLAttributes: { class: "md-codeblock" },
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || "Add a description...",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "wysiwyg-editor outline-none min-h-[80px] px-2 py-1.5 text-sm text-zinc-200",
      },
    },
    onUpdate: ({ editor: ed }) => {
      isUpdatingRef.current = true;
      const md = ed.storage.markdown.getMarkdown();
      onChangeRef.current(md);
      // Reset after a tick so external updates don't fight with typing
      requestAnimationFrame(() => {
        isUpdatingRef.current = false;
      });
    },
  });

  // Sync external value changes (e.g. from LLM tool calls)
  useEffect(() => {
    if (!editor || isUpdatingRef.current) return;
    const currentMd = editor.storage.markdown.getMarkdown();
    if (currentMd !== value) {
      editor.commands.setContent(value || "");
    }
  }, [value, editor]);

  const addTable = useCallback(() => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border border-zinc-700 rounded bg-zinc-800 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-zinc-700 bg-zinc-850 flex-wrap">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <s>S</s>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline Code"
        >
          <span className="font-mono">&lt;/&gt;</span>
        </ToolbarButton>

        <div className="w-px h-3.5 bg-zinc-700 mx-0.5" />

        <ToolbarButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading"
        >
          H
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet List"
        >
          <span className="font-mono">•</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered List"
        >
          <span className="font-mono">1.</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          title="Task List"
        >
          <span className="font-mono">☑</span>
        </ToolbarButton>

        <div className="w-px h-3.5 bg-zinc-700 mx-0.5" />

        <ToolbarButton
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
        >
          <span className="font-mono">"</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code Block"
        >
          <span className="font-mono">{"{ }"}</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={addTable}
          title="Insert Table"
        >
          <span className="font-mono">⊞</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        >
          <span className="font-mono">—</span>
        </ToolbarButton>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}
