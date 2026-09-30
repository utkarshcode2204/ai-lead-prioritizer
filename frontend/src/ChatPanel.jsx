import { useEffect, useRef, useState } from "react";
import { chatWithLead } from "./api.js";
import "./ChatPanel.css";

const QUICK = [
  "What should I emphasize on the call?",
  "Make my reply more assertive",
  "What objections should I expect?",
  "Write a short WhatsApp follow-up",
];

export default function ChatPanel({ lead, onUpdate }) {
  const messages = lead.chat || [];
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, pending]);

  async function send(text) {
    const question = text.trim();
    if (!question || pending) return;

    setError("");
    setInput("");
    setPending(question);
    try {
      const { reply } = await chatWithLead(lead._id, question);
      onUpdate({
        ...lead,
        chat: [
          ...messages,
          { role: "user", text: question },
          { role: "assistant", text: reply },
        ],
      });
    } catch (err) {
      setError(err.message);
      setInput(question);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="chat card wide">
      <h3>Ask about this lead</h3>

      <div className="chat-quick">
        {QUICK.map((q) => (
          <button
            key={q}
            className="btn btn-small"
            onClick={() => send(q)}
            disabled={!!pending}
          >
            {q}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="chat-messages">
        {messages.length === 0 && !pending && (
          <div className="empty" style={{ padding: 12 }}>
            Ask anything about {lead.name}. Answers use only this lead's details.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>{m.text}</div>
        ))}
        {pending && (
          <>
            <div className="bubble user">{pending}</div>
            <div className="bubble assistant">Thinking...</div>
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input">
        <input
          value={input}
          placeholder="e.g. How do I handle the price objection?"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          disabled={!!pending}
        />
        <button
          className="btn btn-primary"
          onClick={() => send(input)}
          disabled={!!pending || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}