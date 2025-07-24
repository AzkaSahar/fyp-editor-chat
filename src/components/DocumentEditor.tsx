"use client";

import { useImperativeHandle, forwardRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline"
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight"
import Color from "@tiptap/extension-color"
import FontFamily from "@tiptap/extension-font-family"
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table";
import { TableHeader } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
export type EditorHandle = {
  setHTMLContent: (html: string) => void;
  getTextContent: () => string;
};

const DocumentEditor = forwardRef<EditorHandle>((_, ref) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Highlight,
      Color,
      FontFamily,
      BulletList,
      OrderedList,
      ListItem,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
    ],
    content: "<p>Upload a document or start writing...</p>",
    editorProps: {
      attributes: {
        class: "min-h-[400px] border p-2 rounded",
      },
    },
    // 👇👇 Prevent SSR hydration mismatch
    immediatelyRender: false,
  });

  useImperativeHandle(ref, () => ({
    setHTMLContent(html: string) {
      editor?.commands.setContent(html);  // Set HTML directly
    },
    getTextContent() {
      return editor?.getText() || "";
    },
  }));

  if (!editor) return <div>Loading editor...</div>;

  return <EditorContent editor={editor} className="prose max-w-none min-h-[500px] p-4 bg-white border rounded shadow-sm" />
;
});

DocumentEditor.displayName = "DocumentEditor";
export default DocumentEditor;
