import { ArrowUpRight, MessageSquareText, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { ConversationSummary } from "../api";
import { timeAgo } from "../format";

interface ConversationRowProps {
  conversation: ConversationSummary;
  compact?: boolean;
  onDelete?: (conversation: ConversationSummary) => void;
  /** Zero-based position, shown as "01", "02" ... */
  index?: number;
}

export default function ConversationRow({ conversation, compact = false, onDelete, index }: ConversationRowProps) {
  return (
    <div className={`conversation-row${compact ? " conversation-row--compact" : ""}`}>
      <Link className="conversation-link" to={`/chat/${conversation.id}`}>
        {index !== undefined && (
          <span className="row-index" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
        <span className="conversation-icon">
          <MessageSquareText size={17} />
        </span>
        <span className="conversation-copy">
          <strong>{conversation.title}</strong>
          <small>{timeAgo(conversation.last_message_at ?? conversation.created_at)}</small>
        </span>
        <span className="conversation-messages">{conversation.message_count} meldinger</span>
        <ArrowUpRight size={16} className="conversation-arrow" aria-hidden="true" />
      </Link>
      {onDelete && (
        <button
          type="button"
          className="icon-button row-action"
          title={`Slett samtalen «${conversation.title}»`}
          aria-label={`Slett samtalen «${conversation.title}»`}
          onClick={() => onDelete(conversation)}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}
