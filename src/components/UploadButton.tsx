// components/UploadButton.tsx
"use client";
import { uploadDocument } from "@/utils/upload";
import { EditorHandle } from "./DocumentEditor";
import { RefObject } from "react";

type Props = {
  editorRef: RefObject<EditorHandle>;
};

export default function UploadButton({ editorRef }: Props) {
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editorRef.current) return;

    try {
      const html = await uploadDocument(file); // previously `text`
      editorRef.current.setHTMLContent(html);  // updated method
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  return (
    <div className="mb-4">
      <input type="file" accept=".pdf,.docx,.txt" onChange={handleFileChange} />
    </div>
  );
}

