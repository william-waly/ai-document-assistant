/** Logo and name. Inline SVG: crisp at any size and no image request. */
export default function Brand() {
  return (
    <span className="brand-lockup">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none">
          <path d="M9 8.5a3 3 0 0 1 3-3h13l7 7v19a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3v-23Z" fill="currentColor" opacity=".16" />
          <path d="M14 5.5h12l7 7v19a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3v-23a3 3 0 0 1 3-3Z" fill="currentColor" />
          <path d="M26 5.5v7h7M17 19h9M17 23.5h9" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19 27h5v7l-2.5-1.5L19 34v-7Z" fill="#e4b67c" stroke="white" strokeWidth="1" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="brand-name">
        AI Document<span>Assistant</span>
      </span>
    </span>
  );
}
