import type { ReactNode } from "react";

interface MessageContentProps {
  content: string;
  /** Called when the reader clicks a [n] marker in the text. */
  onCite?: (ref: number) => void;
}

/** Renders paragraphs, lists, **bold**, `code` and [n] citation markers.
 *  Everything becomes React text nodes: nothing from the model is ever inserted as HTML. */
function inline(text: string, onCite?: (ref: number) => void): ReactNode[] {
  const pieces = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+(?:\s*,\s*\d+)*\])/g);
  return pieces.map((piece, index) => {
    if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) {
      return <strong key={index}>{piece.slice(2, -2)}</strong>;
    }
    if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2) {
      return <code key={index}>{piece.slice(1, -1)}</code>;
    }
    if (/^\[\d/.test(piece)) {
      const refs = piece.slice(1, -1).split(",").map((n) => Number(n.trim()));
      return (
        <span key={index}>
          {refs.map((ref) => (
            <button
              key={ref}
              type="button"
              className="cite-ref"
              aria-label={`Vis kilde ${ref}`}
              onClick={() => onCite?.(ref)}
            >
              [{ref}]
            </button>
          ))}
        </span>
      );
    }
    return <span key={index}>{piece}</span>;
  });
}

export default function MessageContent({ content, onCite }: MessageContentProps) {
  const blocks = content.split(/\n\s*\n/).filter(Boolean);
  return (
    <div className="message-content">
      {blocks.map((block, index) => {
        const code = block.match(/^```([^\n]*)\n([\s\S]*?)\n?```$/);
        if (code) {
          return (
            <pre key={index} data-language={code[1] || undefined}>
              <code>{code[2]}</code>
            </pre>
          );
        }
        const lines = block.split("\n").filter(Boolean);
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return (
            <ul key={index}>
              {lines.map((line, item) => (
                <li key={item}>{inline(line.replace(/^\s*[-*]\s+/, ""), onCite)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
          return (
            <ol key={index}>
              {lines.map((line, item) => (
                <li key={item}>{inline(line.replace(/^\s*\d+[.)]\s+/, ""), onCite)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 && <br />}
                {inline(line, onCite)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
