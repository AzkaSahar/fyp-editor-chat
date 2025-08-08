"use client";


import DocumentEditor, { EditorHandle } from "@/components/DocumentEditor";
import UploadButton from "@/components/UploadButton";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";


type Message = { role: "assistant" | "user"|"system"; content: string };
type Doc = {
  id: string;
  name: string;
  content: string;
};


export default function Home() {
  const editorRef = useRef<EditorHandle>(null!)
  const [docs, setDocs] = useState<Doc[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! How can I help with your documents?" }
    ]);
  const [systemMessage, setSystemMessage] = useState<{role:"system"; content:string} | null>(null);


  const [input, setInput] = useState("");


  const handleUpload = (name: string, html: string) => {
    const newDoc: Doc = {
      id: crypto.randomUUID(),
      name,
      content: html,
    };
    setDocs(prev => {
      const updatedDocs = [...prev, newDoc];
      const combinedContext = updatedDocs
       .map(d => `Document: ${d.name}\n${d.content}`)
       .join("\n\n");
      setSystemMessage({
        role: "system",
        content: "These are all uploaded documents. Use them for context:\n\n" + combinedContext,
        });
        return updatedDocs;
    });

    setCurrentDocId(newDoc.id);
    editorRef.current.setHTMLContent(newDoc.content);
  };


  const activeDoc = docs.find(d => d.id === currentDocId);


const handleSend = async () => {
  if (!input.trim()) return;

  // 1️⃣  Editor ka latest text docs me save karo
  
  const latesthtml = editorRef.current.getHTMLContent();
  if (currentDocId) {
    setDocs(docs =>
      docs.map(d =>
        d.id === currentDocId ? { ...d, content: latesthtml } : d
      )
    );
  }

  // 2️⃣  Har send pe naya system-message banao
  const latestText = editorRef.current.getTextContent();
  const sysMsg: Message = {
    role: "system",
    content:
      "This is the user's document context. Keep this in mind for all future replies:\n\n" +
      latestText,
  };

  // 3️⃣  User message aur UI update
  const userMsg: Message = { role: "user", content: input };
  setMessages(prev => [...prev, userMsg]);
  setInput("");

  // 4️⃣  Payload taiyar karo
  const payload = [sysMsg, ...messages, userMsg];

  // 5️⃣  Backend call
  const res = await fetch("http://localhost:8000/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: payload, activeDocumentId: currentDocId }),
  });
  const data = await res.json();

  // 6️⃣  AI reply UI me dalo
  setMessages(prev => [
    ...prev,
    { role: "assistant", content: data.reply || "No response." },
  ]);
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
                if(currentDocId){
                  const latesthtml= editorRef.current.getHTMLContent();
                  setDocs(prev=>
                    prev.map(d=>
                      d.id == currentDocId?{...d,content:latesthtml}:d
                    )
                  );
                }
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
          {messages.map((msg, i) => (
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

