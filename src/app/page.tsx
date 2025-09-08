"use client";

import DocumentEditor, { EditorHandle } from "@/components/DocumentEditor";
import UploadButton from "@/components/UploadButton";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const isSuggestIntent = (s: string) => /^\/suggest\b/i.test(s.trim());

// Safely parse the first JSON object from a text blob
function parseFirstJSONBlock(text: string): any | null {
  try { return JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*\}$/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}
// ---- Slash menu: command registry ----
type SlashCommandId = "suggest" | "improve" | "edit" | "modify";
type SlashCommand = { id: SlashCommandId; label: string; hint: string };

const COMMANDS: SlashCommand[] = [
  { id: "suggest", label: "Suggest", hint: "Propose 1–3 precise edits for the selection" },
  { id: "improve", label: "Improve", hint: "Return one improved alternative for the selection" },
  { id: "edit",    label: "Edit",    hint: "Rewrite the selection with your instruction" },
  { id: "modify",  label: "Modify",  hint: "Adjust tone/style as requested" },
];

// Parse `/command whatever…` → {command, userIntent}
function parseSlash(line: string): { command: SlashCommandId | null; userIntent: string } {
  const m = line.trimStart().match(/^\/(\w+)\s*(.*)$/);
  if (!m) return { command: null, userIntent: "" };
  const id = m[1].toLowerCase();
  const cmd = COMMANDS.find(c => c.id === id);
  return { command: cmd?.id ?? null, userIntent: m[2] ?? "" };
}

// Simple filter for the menu after "/"
function filterCommands(query: string) {
  const q = query.toLowerCase();
  return COMMANDS.filter(c => c.id.includes(q) || c.label.toLowerCase().includes(q));
}

type Message = { role: "assistant" | "user" | "system"; content: string };
type Doc = {
  id: string;
  name: string;
  content: string;
};

type Suggestion = {
  id: string;
  target: { from: number; to: number };
  change: { kind: "replace" | "insert" | "delete"; newText?: string };
  rationale?: string;
  agent?: string;
  confidence?: number;
};

export default function Home() {
  const editorRef = useRef<EditorHandle>(null!);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! How can I help with your documents?" },
  ]);
  const [systemMessage, setSystemMessage] = useState<{ role: "system"; content: string } | null>(null);
  
  const [input, setInput] = useState("");
  const MODEL_OPTIONS = [
    { id: "openai/gpt-4o", label: "OpenAI · GPT-4o" },
    { id: "meta/llama-4-scout-17b-16e-instruct", label: "Meta · Llama 4 Scout" }, // exact slug from Playground → Raw
    { id: "deepseek/DeepSeek-V3-0324", label: "DeepSeek · Chat" }, // GH Models slug
  ];
  const [model, setModel] = useState<string>(MODEL_OPTIONS[0].id);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSug, setLoadingSug] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Slash menu state
const [menuOpen, setMenuOpen] = useState(false);
const [menuQuery, setMenuQuery] = useState("");   // text after "/"
const [menuIndex, setMenuIndex] = useState(0);    // active item index
const inputRef = useRef<HTMLInputElement>(null);


  const handleUpload = (name: string, html: string) => {
    const newDoc: Doc = {
      id: crypto.randomUUID(),
      name,
      content: html,
    };
    setDocs((prev) => {
      const updatedDocs = [...prev, newDoc];
      const combinedContext = updatedDocs
        .map((d) => `Document: ${d.name}\n${d.content}`)
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

  const activeDoc = docs.find((d) => d.id === currentDocId);

  const persistEditorToDocs = () => {
    if (!currentDocId) return;
    const latesthtml = editorRef.current.getHTMLContent();
    setDocs((prev) => prev.map((d) => (d.id === currentDocId ? { ...d, content: latesthtml } : d)));
  };

  const askSuggestions = async () => {
    setLoadingSug(true);
    try {
      const sel = editorRef.current.getSelection();
      const docText = editorRef.current.getTextContent();
      const fullLen = docText.length;

      const selectionFrom = sel.isEmpty ? 0 : sel.from;
      const selectionTo = sel.isEmpty ? fullLen : sel.to;
      const selectionText = sel.isEmpty ? docText : sel.text;

      const SYSTEM = `You are an editing assistant. 
Return ONLY JSON in this exact schema, no extra text, no markdown:
{"suggestions":[{"id":"string","target":{"from":NUMBER,"to":NUMBER},"change":{"kind":"replace|insert|delete","newText":"..."},"rationale":"string","agent":"string","confidence":0.0}]}
Rules:
- Use the EXACT absolute positions [from,to] the user gives you.
- Scope suggestions ONLY within [from,to].
- 1 to 3 suggestions max.
- Keep newText concise, valid for direct insertion.
- If no useful suggestions, return {"suggestions": []}.`;

      const USER = `document_length=${fullLen}
selection=[${selectionFrom},${selectionTo}]
selection_text:
"""${selectionText.slice(0, 3000)}"""`;

      const payload = [{ role: "system", content: SYSTEM }, { role: "user", content: USER }];

      const res = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload, model }),
      });
      const data = await res.json();
      const raw = (data.reply ?? "").trim();

      // Strict parse; fallback to extracting first JSON object
      let parsed: any = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const m = raw.match(/\{[\s\S]*\}$/);
        if (m) {
          try {
            parsed = JSON.parse(m[0]);
          } catch {}
        }
      }

      if (parsed?.suggestions && Array.isArray(parsed.suggestions)) {
        // basic sanitization
        const safe = parsed.suggestions
          .filter(
            (s: any) =>
              s?.target &&
              typeof s.target.from === "number" &&
              typeof s.target.to === "number" &&
              s?.change?.kind,
          )
          .map(
            (s: any, idx: number) =>
              ({
                id: s.id || `sug_${idx}`,
                target: { from: s.target.from, to: s.target.to },
                change: { kind: s.change.kind, newText: s.change.newText },
                rationale: s.rationale,
                agent: s.agent,
                confidence: s.confidence,
              }) as Suggestion,
          );
        setSuggestions(safe);
      } else {
        setSuggestions([]);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSug(false);
    }
  };

  const applyOne = (s: Suggestion) => {
    editorRef.current.applyEdit({
      kind: s.change.kind,
      from: s.target.from,
      to: s.target.to,
      newText: s.change.newText,
    });
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    persistEditorToDocs();
  };

  const applyAll = () => {
    suggestions.forEach((s) => {
      editorRef.current.applyEdit({
        kind: s.change.kind,
        from: s.target.from,
        to: s.target.to,
        newText: s.change.newText,
      });
    });
    setSuggestions([]);
    persistEditorToDocs();
  };

 const handleSend = async () => {
  const raw = input.trim();
  if (!raw) return;

  // Save current editor HTML into docs[]
  const latesthtml = editorRef.current.getHTMLContent();
  if (currentDocId) {
    setDocs(docs =>
      docs.map(d => (d.id === currentDocId ? { ...d, content: latesthtml } : d))
    );
  }

  // Push user message to UI
  const userMsg: Message = { role: "user", content: raw };
  setMessages(prev => [...prev, userMsg]);
  setInput("");



// ----- Close menu if open -----
setMenuOpen(false);
setMenuQuery("");

// ----- Slash command routing -----
const { command, userIntent } = parseSlash(raw);

// Gather selection context once
const sel = editorRef.current.getSelection
  ? editorRef.current.getSelection()
  : { from: 0, to: 0, text: "", isEmpty: true };

const docText = editorRef.current.getTextContent();
const fullLen = docText.length;
const clamp = (x: number) => Math.max(0, Math.min(fullLen, x));
const selectionFrom = sel.isEmpty ? 0 : clamp(sel.from);
const selectionTo   = sel.isEmpty ? fullLen : clamp(sel.to);
const selectionText = sel.isEmpty ? docText : sel.text;

// If it is a slash command, handle here
if (command) {
  const SYSTEM_MAP: Record<SlashCommandId, string> = {
    suggest: `You are an editing assistant.
Return ONLY JSON in this exact schema, no extra text, no markdown:
{"suggestions":[{"id":"string","target":{"from":NUMBER,"to":NUMBER},"change":{"kind":"replace|insert|delete","newText":"..."},"rationale":"string","agent":"string","confidence":0.0}]}
Rules:
- Use the EXACT absolute positions [from,to].
- Scope suggestions ONLY within [from,to].
- 1 to 3 suggestions max.
- Keep newText concise and ready for direct insertion.
- If no useful suggestions, return {"suggestions": []}.`,
    improve: `You are an editing assistant.
Return ONLY JSON in this exact schema, no extra text, no markdown:
{"suggestions":[{"id":"string","target":{"from":NUMBER,"to":NUMBER},"change":{"kind":"replace|insert|delete","newText":"..."},"rationale":"string","agent":"string","confidence":0.0}]}
Rules:
- Keep the SAME [from,to].
- Return exactly 1 improved suggestion for that range.
- Preserve meaning; improve clarity/flow/conciseness.
- If no improvement is possible, return {"suggestions": []}.`,
    edit: `You are an editing assistant.
Return ONLY JSON in this exact schema, no extra text, no markdown:
{"suggestions":[{"id":"string","target":{"from":NUMBER,"to":NUMBER},"change":{"kind":"replace","newText":"..."},"rationale":"string","agent":"string","confidence":0.0}]}
Rules:
- Rewrite ONLY the selection [from,to] according to the user's instruction.
- Return exactly 1 suggestion (kind=replace).
- Keep structure and semantics unless instructed.`,
    modify: `You are an editing assistant.
Return ONLY JSON in this exact schema, no extra text, no markdown:
{"suggestions":[{"id":"string","target":{"from":NUMBER,"to":NUMBER},"change":{"kind":"replace","newText":"..."},"rationale":"string","agent":"string","confidence":0.0}]}
Rules:
- Modify tone/style of the selection [from,to] per the user's instruction.
- Return exactly 1 suggestion (kind=replace).
- Keep facts intact; do not invent content.`,
  };

  const SYSTEM = SYSTEM_MAP[command];

  const USER = `document_length=${fullLen}
selection=[${selectionFrom},${selectionTo}]
selection_text:
"""${selectionText.slice(0, 3000)}"""

USER_INSTRUCTION:
${userIntent || (command === "suggest" ? "Propose edits to improve clarity and correctness." : "Apply the instruction appropriately.")}`;

  const payload = [
    { role: "system", content: SYSTEM },
    ...(systemMessage ? [systemMessage] : []),
    { role: "user", content: USER },
  ];

  const res = await fetch("http://localhost:8000/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: payload, model }),
  });
  const data = await res.json();
  const reply = (data.reply ?? "").trim();

  const parsed = parseFirstJSONBlock(reply);
  if (parsed?.suggestions && Array.isArray(parsed.suggestions)) {
    const safe = parsed.suggestions
      .filter((s: any) =>
        s?.target && typeof s.target.from === "number" && typeof s.target.to === "number" && s?.change?.kind
      )
      .map((s: any, idx: number) => ({
        id: s.id || `sug_${idx}`,
        target: { from: s.target.from, to: s.target.to },
        change: { kind: s.change.kind, newText: s.change.newText },
        rationale: s.rationale,
        agent: s.agent,
        confidence: s.confidence,
      })) as Suggestion[];

    setSuggestions(safe);
    setMessages(prev => [
      ...prev,
      { role: "assistant", content: safe.length ? `Created ${safe.length} ${command} suggestion(s).` : "No suggestions." },
    ]);
  } else {
    setMessages(prev => [...prev, { role: "assistant", content: reply || "No response." }]);
  }
  return; // stop normal chat
}

// ----- Fallback: normal chat flow (unchanged) -----
const sysMsg: Message = {
  role: "system",
  content: "This is the user's document context. Keep this in mind for all future replies:\n\n" + docText,
};
const payload = [sysMsg, ...messages, userMsg];

const res = await fetch("http://localhost:8000/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: payload, activeDocumentId: currentDocId, model }),
});
const data = await res.json();
setMessages(prev => [...prev, { role: "assistant", content: data.reply || "No response." }]);
};

const tryAgain = async (oldSug: Suggestion) => {
  try {
    setRetryingId(oldSug.id);

    // 1) Build selection window from the suggestion itself
    const docText = editorRef.current.getTextContent();
    const fullLen = docText.length;
    const clamp = (x: number) => Math.max(0, Math.min(fullLen, x));
    const from = clamp(oldSug.target.from);
    const to = clamp(oldSug.target.to);
    const selectionText = docText.slice(from, to);

    // 2) System prompt → same schema, instruct to IMPROVE the prior suggestion
    const SYSTEM = `You are an editing assistant.
Return ONLY JSON in this exact schema, no extra text, no markdown:
{"suggestions":[{"id":"string","target":{"from":NUMBER,"to":NUMBER},"change":{"kind":"replace|insert|delete","newText":"..."},"rationale":"string","agent":"string","confidence":0.0}]}
Rules:
- Keep the SAME absolute positions [from,to].
- Return exactly 1 improved suggestion for that range.
- Preserve meaning; improve clarity/flow/conciseness.
- newText must be ready for direct insertion.
- If no improvement is possible, return {"suggestions": []}.`;

    // 3) User prompt → includes previous newText so the model actually improves it
    const USER = `document_length=${fullLen}
selection=[${from},${to}]
selection_text:
"""${selectionText.slice(0, 3000)}"""

previous_suggestion:
kind=${oldSug.change.kind}
newText:
"""${(oldSug.change.newText ?? "").slice(0, 3000)}"""

INSTRUCTION:
Propose a clearly improved alternative for the same selection window.`;

    // 4) Call your existing /chat
    const res = await fetch("http://localhost:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM },
          ...(systemMessage ? [systemMessage] : []),
          { role: "user", content: USER },
        ],
        model,
      }),
    });

    // 5) Parse and update just this card
    const data = await res.json();
    const reply = (data.reply ?? "").trim();
    const parsed = parseFirstJSONBlock(reply);

    if (parsed?.suggestions && Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
      const s = parsed.suggestions[0];
      const improved: Suggestion = {
        id: oldSug.id, // replace in place
        target: { from, to },
        change: {
          kind: s.change?.kind ?? oldSug.change.kind,
          newText: s.change?.newText ?? oldSug.change.newText,
        },
        rationale: s.rationale ?? "Improved suggestion",
        agent: s.agent ?? oldSug.agent,
        confidence: typeof s.confidence === "number" ? s.confidence : oldSug.confidence,
      };

      setSuggestions(prev => prev.map(x => (x.id === oldSug.id ? improved : x)));
    } else {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "No better alternative was found for that selection." },
      ]);
    }
  } catch {
    setMessages(prev => [
      ...prev,
      { role: "assistant", content: "Retry failed. Please try again." },
    ]);
  } finally {
    setRetryingId(null);
  }
};
  return (
    <main className="flex h-screen p-6 gap-6 bg-gray-50">
      {/* Left: Editor + Upload + Tabs */}
      <div className="flex-1 h-full overflow-auto border border-gray-300 bg-white p-4 rounded shadow">
        <h1 className="text-lg font-semibold mb-2">📝 Document Editor</h1>
        <button
          onClick={askSuggestions}
          disabled={loadingSug}
          className="px-3 py-1 rounded bg-black text-white disabled:opacity-50"
          title="Generate apply-able suggestions for current selection"
        >
          {loadingSug ? "Generating…" : "AI edits"}
        </button>

        <UploadButton onUpload={handleUpload} />

        {/* Document Tabs */}
        <div className="flex gap-2 mb-4">
          {docs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => {
                if (currentDocId) {
                  const latesthtml = editorRef.current.getHTMLContent();
                  setDocs((prev) => prev.map((d) => (d.id == currentDocId ? { ...d, content: latesthtml } : d)));
                }
                setCurrentDocId(doc.id);
                editorRef.current.setHTMLContent(doc.content);
                setSuggestions([]); // clear suggestions on switch
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-md font-semibold">💬 AI Chat Assistant</h2>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
            title="Choose model"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {suggestions.length > 0 && (
  <div className="mb-3 border rounded p-2 bg-white">
    <div className="flex items-center justify-between">
      <div className="font-medium">Suggestions</div>
      <button onClick={applyAll} className="text-sm underline">
        Apply all
      </button>
    </div>

    <div className="mt-2 space-y-2 max-h-60 overflow-auto">
      {suggestions.map((s) => {
        const { kind, newText } = s.change || {};
        const { from, to } = s.target || { from: 0, to: 0 };

        // Labels for each kind
        const headerLabel =
          kind === "replace"
            ? `Replace [${from}–${to}] with:`
            : kind === "insert"
            ? `Insert at [${from}]:`
            : kind === "delete"
            ? `Delete range [${from}–${to}]`
            : `Change [${from}–${to}]`;

        // Decide whether to show inline or in a collapsible <details>
        const textToShow = (newText ?? "").trim();
        const isLong = textToShow.length > 240;
        return (
          <div key={s.id} className="border rounded p-2">
            {/* Rationale / meta */}
            <div className="text-xs opacity-70 mb-1">
              {s.rationale || s.agent || "Suggestion"}{" "}
              <span className="opacity-50">[{from}–{to}]</span>
              {typeof s.confidence === "number" && (
                <span className="ml-2 opacity-50">conf: {s.confidence.toFixed(2)}</span>
              )}
            </div>
            {/* What will actually change */}
            <div className="text-xs font-semibold text-gray-700 mb-1">{headerLabel}</div>

            {kind === "delete" ? (
              <div className="text-sm italic text-gray-700">No text to insert (this will remove content).</div>
            ) : textToShow ? (
              isLong ? (
                <details className="text-sm">
                  <summary className="cursor-pointer select-none text-gray-700">
                    Show proposed text ({textToShow.length} chars)
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words px-2 py-2 bg-gray-50 border rounded max-h-48 overflow-auto">
                    {textToShow}
                  </pre>
                </details>
              ) : (
                <pre className="text-sm whitespace-pre-wrap break-words px-2 py-2 bg-gray-50 border rounded">
                  {textToShow}
                </pre>
              )
            ) : (
              <div className="text-sm text-gray-600">No replacement text provided.</div>
            )}

            {/* Actions */}
            <div className="mt-2 flex gap-2">
              <button
                className="px-2 py-1 rounded bg-black text-white"
                onClick={() => applyOne(s)}
              >
                Apply
              </button>
              <button
                className="px-2 py-1 rounded border"
                onClick={() => setSuggestions((prev) => prev.filter((x) => x.id !== s.id))}
              >
                Reject
              </button>

              <button
    className="px-2 py-1 rounded border"
    onClick={() => tryAgain(s)}
    disabled={retryingId === s.id}
    title="Ask AI to improve this suggestion"
  >
    {retryingId === s.id ? "Trying…" : "Try again"}
  </button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}
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
                      <th className="border border-gray-300 px-3 py-2 font-medium">{props.children}</th>
                    ),
                    td: ({ node, ...props }) => (
                      <td className="border border-gray-300 px-3 py-2">{props.children}</td>
                    ),
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 relative">
  <input
    ref={inputRef}
    type="text"
    value={input}
    onChange={(e) => {
      const v = e.target.value;
      setInput(v);

      // open/close menu logic
      if (v.startsWith("/")) {
        // everything after the first "/" is the query
        const q = v.slice(1).split(/\s+/)[0] ?? "";
        setMenuQuery(q);
        setMenuOpen(true);
        setMenuIndex(0);
      } else {
        setMenuOpen(false);
        setMenuQuery("");
      }
    }}
    onKeyDown={(e) => {
      if (!menuOpen) return;

      const options = filterCommands(menuQuery);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenuIndex(i => (i + 1) % Math.max(1, options.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenuIndex(i => (i - 1 + Math.max(1, options.length)) % Math.max(1, options.length));
      } else if (e.key === "Enter") {
        // select highlighted command
        if (input.startsWith("/")) {
          e.preventDefault();
          const selected = options[menuIndex] ?? options[0] ?? null;
          if (selected) {
            // replace leading "/xxx" with the canonical "/id " token
            const rest = input.replace(/^\/\S*/, `/${selected.id}`);
            const val = rest.endsWith(" ") ? rest : rest + " ";
            setInput(val);
            setMenuOpen(false);
            // keep focus at end
            requestAnimationFrame(() => {
              const el = inputRef.current;
              if (el) el.selectionStart = el.selectionEnd = val.length;
            });
          }
        }
      } else if (e.key === "Escape") {
        setMenuOpen(false);
        setMenuQuery("");
      }
    }}
    placeholder='Type a message… (try “/suggest make it clearer”)'
    className="flex-1 border px-2 py-1 rounded"
  />

  {/* Slash menu popover */}
  {menuOpen && (
    <div className="absolute bottom-10 left-0 w-[260px] max-h-64 overflow-auto border rounded bg-white shadow">
      {filterCommands(menuQuery).map((c, idx) => (
        <button
          key={c.id}
          className={`w-full text-left px-3 py-2 hover:bg-gray-100 ${idx === menuIndex ? "bg-gray-100" : ""}`}
          onMouseEnter={() => setMenuIndex(idx)}
          onClick={() => {
            // insert token and close
            const token = `/${c.id}`;
            const val = token + (input.replace(/^\/\S*/, "") || " ");
            setInput(val.endsWith(" ") ? val : val + " ");
            setMenuOpen(false);
            requestAnimationFrame(() => {
              const el = inputRef.current;
              if (el) el.selectionStart = el.selectionEnd = (val.endsWith(" ") ? val : val + " ").length;
            });
          }}
          title={c.hint}
        >
          <div className="font-medium">{c.label} <span className="text-xs opacity-60">/{c.id}</span></div>
          <div className="text-xs opacity-70">{c.hint}</div>
        </button>
      ))}
      {filterCommands(menuQuery).length === 0 && (
        <div className="px-3 py-2 text-sm text-gray-500">No commands</div>
      )}
    </div>
  )}

  <button onClick={handleSend} className="bg-blue-600 text-white px-4 py-1 rounded">
    Send
  </button>
</div>

      </div>
    </main>
  );
}
