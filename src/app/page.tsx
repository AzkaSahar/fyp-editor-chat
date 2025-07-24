"use client";

import DocumentEditor, { EditorHandle } from "@/components/DocumentEditor";
import UploadButton from "@/components/UploadButton";
import { useRef, useState } from "react";

export default function Home() {
  const editorRef = useRef<EditorHandle>(null!)
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! How can I help with your document?" },
  ]);
  const [input, setInput] = useState("");

  const handleSend = async () => {
    if (!input.trim()) return;
    const editorContent = editorRef.current?.getTextContent?.() || "";

    const updatedMessages = [
      ...messages,
      { role: "user", content: input + "\n\nHere is my document:\n" + editorContent },
    ];
    console.log("Sending:", updatedMessages);
    const res = await fetch("http://localhost:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: updatedMessages }),
    });

    const data = await res.json();
    console.log("Received:", data);

    setMessages([
      ...updatedMessages,
      { role: "assistant", content: data.reply || "No response from AI." },
    ]);
    setInput("");
  };

  return (
    <main className="flex min-h-screen p-6 gap-6 bg-gray-50">
      {/* Left: Document Editor + Upload */}
      <div className="flex-1 border border-gray-300 bg-white p-4 rounded shadow">
        <h1 className="text-lg font-semibold mb-2">📝 Document Editor</h1>
        <UploadButton editorRef={editorRef} />
        <DocumentEditor ref={editorRef} />
      </div>

      {/* Right: Chat Sidebar */}
      <div className="w-[350px] border-l pl-4 flex flex-col">
        <h2 className="text-md font-semibold mb-2">💬 AI Chat Assistant</h2>
        <div className="flex-1 overflow-y-auto mb-4 space-y-2">
          {messages.map((msg, i) => (
            <div key={i} className={`p-2 rounded ${msg.role === "ai" ? "bg-gray-100" : "bg-blue-100 self-end"}`}>
              <strong>{msg.role === "assistant" ? "AI" : "You"}:</strong> {msg.content}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border px-2 py-1 rounded"
          />
          <button onClick={handleSend} className="bg-blue-600 text-white px-4 py-1 rounded">
            Send
          </button>
        </div>
      </div>
    </main>
  );
}
