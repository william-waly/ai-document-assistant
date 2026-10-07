import { Link } from "react-router-dom";
import type { ChatMessage, SourceInfo } from "../api";

/** Turns "...as stated [1][2]." into text with the markers styled as superscripts.
 *  Everything stays plain text nodes: nothing from the model is ever injected as HTML. */
function withCitations(text: string) {
  return text.split(/(\[\d+(?:\s*,\s*\d+)*\])/g).map((part, index) =>
    /^\[\d/.test(part) ? (
      <sup key={index} className="cite">
        {part}
      </sup>
    ) : (
      part
    ),
  );
}

function SourceList({ sources }: { sources: SourceInfo[] }) {
  return (
    <ul className="sources" aria-label="Kilder">
      {sources.map((source) => (
        <li key={source.ref}>
          <details>
            <summary>
              <span className="cite">[{source.ref}]</span> {source.filename} – side {source.page_number}
            </summary>
            <blockquote className="source-quote">{source.snippet}</blockquote>
            <Link to={`/documents/${source.document_id}`}>Åpne dokumentet</Link>
          </details>
        </li>
      ))}
    </ul>
  );
}

export default function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="msg msg-user">
        <p>{message.content}</p>
      </div>
    );
  }
  // No sources means the assistant could not find the answer in the documents.
  const noInfo = message.sources.length === 0;
  return (
    <div className={`msg msg-assistant${noInfo ? " msg-noinfo" : ""}`}>
      <p>{withCitations(message.content)}</p>
      {!noInfo && <SourceList sources={message.sources} />}
    </div>
  );
}
