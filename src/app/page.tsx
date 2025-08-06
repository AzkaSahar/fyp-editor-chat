"use client";

import DocumentEditor, { EditorHandle } from "@/components/DocumentEditor";
import UploadButton from "@/components/UploadButton";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = { role: "assistant" | "user"; content: string };
type Doc = {
  id: string;
  name: string;
  content: string;
  systemMessage?: {role:"system"; content:string}
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

  // 1. Grab or create the one-off system message for this doc
  let sysMsg = activeDoc.systemMessage;
  if (!sysMsg) {
    const docText = editorRef.current.getTextContent();
    sysMsg = {
      role: "system" as const,
      content:
        "This is the user's document context. Keep this in mind for all future replies:\n\n" +
        docText,
    };
    // Persist it on the active doc
    setDocs(prev =>
      prev.map(d =>
        d.id === activeDoc.id ? { ...d, systemMessage: sysMsg } : d
      )
    );
  }

  // 2. Build the user message
  const userMsg: Message = {
    role: "user",
    content: input,
  };

  // 3. Update UI immediately with the user message
  setDocs(prev =>
    prev.map(d =>
      d.id === activeDoc.id
        ? { ...d, messages: [...d.messages, userMsg] }
        : d
    )
  );
  setInput("");

  // 4. Prepare the payload: [ system, ...history, user ]
  const payload = [sysMsg, ...activeDoc.messages, userMsg];

  // 5. Send to your backend
  const res = await fetch("http://localhost:8000/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: payload }),
  });
  const { reply } = await res.json();

  // 6. Append the assistant’s reply to the UI
  setDocs(prev =>
    prev.map(d =>
      d.id === activeDoc.id
        ? { ...d, messages: [...d.messages, { role: "assistant", content: reply }] }
        : d
    )
  );
};

  return (
    <main className="flex h-screen p-6 gap-6 bg-gray-50">
      {/* Left: Editor + Upload + Tabs */}
      <div className="flex-1 h-full overflow-auto border border-gray-300 bg-white p-4 rounded shadow">
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
      <div className="w-[350px] h-full border-l pl-4 flex flex-col">
        <h2 className="text-md font-semibold mb-2">💬 AI Chat Assistant</h2>
        <div className="flex-1 overflow-y-auto space-y-2">
          {currentMessages.map((msg, i) => (
            <div
              key={i}
              className={`p-2 rounded ${
                msg.role === "assistant" ? "bg-gray-100" : "bg-blue-100 self-end"
              }`}
            >
              <strong>{msg.role === "assistant" ? "AI" : "You"}:</strong>{" "}
              <div className="prose prose-sm max-w-none mt-1 overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto">
              <table className="table-auto border-collapse border border-gray-300 w-full text-sm text-left">
                {props.children}
              </table>
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-gray-100">{props.children}</thead>
          ),
          th: ({ node, ...props }) => (
            <th className="border border-gray-300 px-3 py-2 font-medium">
              {props.children}
            </th>
          ),
          td: ({ node, ...props }) => (
            <td className="border border-gray-300 px-3 py-2">
              {props.children}
            </td>
          ),
        }}
      >
              {msg.content}
              </ReactMarkdown>  
              </div>
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