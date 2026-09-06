"use client";

// A six-cell numeric code input for the email sign-in OTP. Keeps the value as a
// single contiguous digit string (the parent owns it); each cell renders one
// character. The editable frontier is always the next empty cell, so there are no
// gaps: typing advances, Backspace retreats, and a pasted/autofilled "123456"
// fills every cell at once. Digits only, numeric keyboard, one-time-code autofill.

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { OTP_LENGTH, normalizeOtpInput } from "@/lib/auth/otp";

export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  invalid = false,
  autoFocus = false,
  describedById,
  ariaLabel = "6-digit sign-in code",
}: {
  value: string;
  onChange: (next: string) => void;
  /** Fires once the value reaches six digits (for auto-submit). */
  onComplete?: (full: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  describedById?: string;
  ariaLabel?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const commit = (raw: string) => {
    const clean = normalizeOtpInput(raw);
    onChange(clean);
    if (clean.length === OTP_LENGTH) onComplete?.(clean);
  };

  const focusCell = (i: number) => {
    const idx = Math.max(0, Math.min(OTP_LENGTH - 1, i));
    // Defer so focus lands after React commits the re-render.
    requestAnimationFrame(() => {
      const el = refs.current[idx];
      el?.focus();
      el?.select();
    });
  };

  const handleChange = (i: number, rawValue: string) => {
    const digits = rawValue.replace(/\D/g, "");
    if (!digits) return; // clearing is handled by Backspace
    if (digits.length === 1) {
      // Single keystroke: place at this cell (replacing the tail from here) and
      // advance to the next empty cell.
      const next = normalizeOtpInput(value.slice(0, i) + digits);
      commit(next);
      focusCell(next.length);
    } else {
      // Multiple digits arrived at once (paste into a cell, or OTP autofill).
      const next = normalizeOtpInput(digits);
      commit(next);
      focusCell(next.length);
    }
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value.length === 0) return;
      // Remove the last filled digit and step the caret back to it.
      const next = value.slice(0, -1);
      onChange(next);
      focusCell(next.length);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusCell(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusCell(Math.min(value.length, i + 1));
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/\d/.test(text)) return;
    e.preventDefault();
    const next = normalizeOtpInput(text);
    commit(next);
    focusCell(next.length);
  };

  return (
    <div
      className="flex justify-center gap-2"
      role="group"
      aria-label={ariaLabel}
      onPaste={handlePaste}
    >
      {Array.from({ length: OTP_LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d*"
          maxLength={1}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          value={value[i] ?? ""}
          aria-label={`${ariaLabel}, digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedById}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => {
            // Keep the caret at the editable frontier, then select for overwrite.
            if (i > value.length) focusCell(value.length);
            e.currentTarget.select();
          }}
          className={[
            "h-12 w-10 rounded-lg border bg-nd-bg-2 text-center text-lg font-semibold text-nd-text outline-none ring-nd-accent/50 transition focus:ring-2",
            invalid ? "border-red-400/70" : "border-nd-border",
          ].join(" ")}
        />
      ))}
    </div>
  );
}
