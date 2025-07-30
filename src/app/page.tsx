"use client";

import DocumentEditor, { EditorHandle } from "@/components/DocumentEditor";
import UploadButton from "@/components/UploadButton";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export default function Home() {
  const editorRef = useRef<EditorHandle>(null!);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! How can I help with your document?" },
  ]);
  const [input, setInput] = useState("");
  const [systemMessage, setSystemMessage] = useState<ChatMessage | null>(null); // ✅ Fix: typed correctly

  const handleSend = async () => {
    if (!input.trim()) return;

    // Capture document just once
    let newSystemMessage = systemMessage;
    if (!systemMessage) {
      const editorContent = editorRef.current?.getTextContent?.() || "";
      newSystemMessage = {
        role: "system",
        content:
          "This is the user's document context. Keep this in mind for all future replies:\n\n" +
          editorContent,
      };
      setSystemMessage(newSystemMessage);
    }

    const updatedMessages: ChatMessage[] = [
      ...(newSystemMessage ? [newSystemMessage] : []),
      ...messages,
      { role: "user", content: input },
    ];

    try {
      const res = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      const data = await res.json();

      setMessages([
        ...messages,
        { role: "user", content: input },
        {
          role: "assistant",
          content: data.reply || "No response from AI.",
        },
      ]);
    } catch (error) {
      setMessages([
        ...messages,
        { role: "user", content: input },
        {
          role: "assistant",
          content: "⚠️ Error: Could not connect to backend.",
        },
      ]);
    }

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
        <div className="flex-1 overflow-y-auto mb-4 space-y-2 max-h-[80vh] pr-2">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`p-2 rounded whitespace-pre-wrap ${
                msg.role === "assistant"
                  ? "bg-gray-100"
                  : msg.role === "user"
                  ? "bg-blue-100 self-end"
                  : "bg-yellow-100"
              }`}
            >
              <strong>
                {msg.role === "assistant"
                  ? "AI"
                  : msg.role === "user"
                  ? "You"
                  : "System"}
                :
              </strong>
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
            onChange={(e) => setInput(e.target.value)}
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
