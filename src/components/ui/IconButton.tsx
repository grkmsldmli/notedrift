"use client";

import type { ReactNode } from "react";

interface IconButtonProps {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

export function IconButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  className = "",
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={[
        // 32px box on a fine (mouse) pointer keeps desktop chrome compact/calm.
        // On a coarse pointer `.nd-hit` expands the hit area back to ≥44px, so
        // tablet/touch targets are never shrunk.
        "nd-hit flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
        "disabled:pointer-events-none disabled:opacity-40",
        active
          ? "bg-nd-accent/15 text-white ring-1 ring-nd-accent/40"
          : "text-nd-muted hover:bg-white/5 hover:text-nd-text",
        className,
      ].join(" ")}
    >
      {icon}
    </button>
  );
}
