"use client";

import DocumentEditor, { EditorHandle } from "@/components/DocumentEditor";
import UploadButton from "@/components/UploadButton";
import { useRef, useState } from "react";


type Message = { role: "assistant" | "user"; content: string };
type Doc = {
  id: string;
  name: string;
  content: string;
  messages: Message[];
};

export default function Home() {
  const editorRef = useRef<EditorHandle>(null!)
  const [docs, setDocs] = useState<Doc[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [input, setInput] = useState("");


  const handleUpload = (name: string, html: string) => {
    const newDoc: Doc = {
      id: crypto.randomUUID(),
      name,
      content: html,
      messages: [
        { role: "assistant", content: "Hi! How can I help with this document?" }
      ],
    };
    setDocs(prev => [...prev, newDoc]);
    setCurrentDocId(newDoc.id);
    editorRef.current.setHTMLContent(html);
  };

  const activeDoc = docs.find(d => d.id === currentDocId);
  const currentMessages = activeDoc?.messages ?? [];

const handleSend = async () => {
  if (!input.trim() || !activeDoc) return;

  // 1️⃣ Build the user message, including the full document text
  const docText = editorRef.current.getTextContent();
  const userMsg: Message = {
    role: "user",
    content: input + "\n\nHere is my document:\n" + docText,
  };

  // 2️⃣ Optimistically add the user message
  const updated = [...activeDoc.messages, userMsg];
  setDocs(prev =>
    prev.map(d =>
      d.id === activeDoc.id ? { ...d, messages: updated } : d
    )
  );
  setInput("");

  // 3️⃣ Send ONLY the messages array (old LLM style)
  const res = await fetch("http://localhost:8000/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: updated }),
  });
  const { reply } = await res.json();

  // 4️⃣ Append the assistant’s reply
  setDocs(prev =>
    prev.map(d =>
      d.id === activeDoc.id
        ? { ...d, messages: [...updated, { role: "assistant", content: reply }] }
        : d
    )
  );
};


  return (
    <main className="flex min-h-screen p-6 gap-6 bg-gray-50">
      {/* Left: Editor + Upload + Tabs */}
      <div className="flex-1 border border-gray-300 bg-white p-4 rounded shadow">
        <h1 className="text-lg font-semibold mb-2">📝 Document Editor</h1>
        <UploadButton onUpload={handleUpload} />

        {/* Document Tabs */}
        <div className="flex gap-2 mb-4">
          {docs.map(doc => (
            <button
              key={doc.id}
              onClick={() => {
                setCurrentDocId(doc.id);
                editorRef.current.setHTMLContent(doc.content);
              }}
              className={
                doc.id === currentDocId
                  ? "px-3 py-1 bg-blue-600 text-white rounded"
                  : "px-3 py-1 bg-gray-200 text-gray-700 rounded"
              }
            >
              {doc.name}
            </button>
          ))}
        </div>

        <DocumentEditor ref={editorRef} />
      </div>

      {/* Right: Chat Pane */}
      <div className="w-[350px] border-l pl-4 flex flex-col">
        <h2 className="text-md font-semibold mb-2">💬 AI Chat Assistant</h2>
        <div className="flex-1 overflow-y-auto mb-4 space-y-2">
          {currentMessages.map((msg, i) => (
            <div
              key={i}
              className={`p-2 rounded ${
                msg.role === "assistant" ? "bg-gray-100" : "bg-blue-100 self-end"
              }`}
            >
              <strong>{msg.role === "assistant" ? "AI" : "You"}:</strong>{" "}
              {msg.content}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border px-2 py-1 rounded"
          />
          <button
            onClick={handleSend}
            className="bg-blue-600 text-white px-4 py-1 rounded"
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
}