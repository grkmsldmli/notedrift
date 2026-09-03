"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { PLAN_LABELS } from "@/lib/plans";
import { useAuth } from "./AuthProvider";
import { SignInDialog } from "./SignInDialog";

/**
 * The single, restrained account entry point (top-right). Renders NOTHING when
 * Supabase isn't configured — no fake buttons that only error on click. Also
 * renders nothing while auth is still resolving, so we never flash "Sign in"
 * at an already-signed-in user. The editor never waits on any of this.
 */
export function AccountButton() {
  const { configured, status, user, plan, signOut } = useAuth();
  const [dialog, setDialog] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (!configured || status === "loading") return null;

  // Signed out → a subtle "Sign in" control.
  if (!user) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDialog(true)}
          title="Sign in"
          aria-label="Sign in"
          className="nd-hit flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
        >
          <UserRound size={17} />
          <span className="hidden sm:inline">Sign in</span>
        </button>
        {dialog && <SignInDialog onClose={() => setDialog(false)} />}
      </>
    );
  }

  // Signed in → avatar + minimal account menu.
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenu((o) => !o)}
        title="Account"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={menu}
        className="nd-hit flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ring-1 ring-nd-border transition hover:ring-nd-accent/50"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-nd-surface-2 text-sm font-semibold text-nd-text">
            {initial}
          </span>
        )}
      </button>

      {menu && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl"
        >
          <div className="px-3 py-2">
            {user.name && (
              <div className="truncate text-sm font-medium text-nd-text">
                {user.name}
              </div>
            )}
            <div className="truncate text-xs text-nd-muted">{user.email}</div>
            <div className="mt-1.5 inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-nd-muted">
              {PLAN_LABELS[plan]} plan
            </div>
          </div>
          <div className="my-1 h-px bg-nd-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false);
              void signOut();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-nd-text transition-colors hover:bg-white/5"
          >
            <LogOut size={15} className="text-nd-muted" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
