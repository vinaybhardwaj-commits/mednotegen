"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

/**
 * The note editor (TipTap / ProseMirror). R0 = the editable surface.
 * Later phases attach decorations for inline ghost-text completions and
 * underline rewrites, and the compose before/after diff — all on this editor.
 */
export default function NoteEditor({
  placeholder = "Start writing or dictating the note… shorthand is fine.",
  onChange,
}: {
  placeholder?: string;
  onChange?: (text: string, html: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false, // required for Next.js SSR (avoids hydration mismatch)
    extensions: [StarterKit, Placeholder.configure({ placeholder })],
    content: "",
    onUpdate: ({ editor }) => onChange?.(editor.getText(), editor.getHTML()),
    editorProps: {
      attributes: { "aria-label": "Clinical note editor", spellcheck: "true" },
    },
  });

  return <EditorContent editor={editor} />;
}
