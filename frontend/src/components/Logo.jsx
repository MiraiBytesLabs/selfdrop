export default function Logo() {
  return (
    <div className="logo">
      <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="24" r="3" fill="#2d6a4f" />
        <line
          x1="16"
          y1="21"
          x2="16"
          y2="10"
          stroke="#2d6a4f"
          strokeWidth="1.5"
        />
        <line
          x1="16"
          y1="14"
          x2="10"
          y2="8"
          stroke="#2d6a4f"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <line
          x1="16"
          y1="12"
          x2="22"
          y2="6"
          stroke="#2d6a4f"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <line
          x1="16"
          y1="16"
          x2="9"
          y2="12"
          stroke="#2d6a4f"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <line
          x1="16"
          y1="16"
          x2="23"
          y2="13"
          stroke="#2d6a4f"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <circle cx="10" cy="8" r="2" fill="#2d6a4f" opacity="0.5" />
        <circle cx="22" cy="6" r="2" fill="#2d6a4f" opacity="0.5" />
        <circle cx="9" cy="12" r="2" fill="#2d6a4f" opacity="0.5" />
        <circle cx="23" cy="13" r="2" fill="#2d6a4f" opacity="0.5" />
      </svg>
      <span>selfdrop</span>
    </div>
  );
}
