import { useId } from "react";

/** The NoteDrift mark: a gradient rounded square enclosing a stylized "N" wave. */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId();
  const grad = `nd-logo-${id}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={grad}
          x1="4"
          y1="4"
          x2="28"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#5b8cff" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect
        x="3.2"
        y="3.2"
        width="25.6"
        height="25.6"
        rx="8"
        stroke={`url(#${grad})`}
        strokeWidth="2"
      />
      <path
        d="M8.6 22.4 C 9.1 13.4, 11.5 12.3, 13.6 15.9 C 14.9 18.1, 16 18.3, 17.1 16 C 18.6 12.8, 20.3 11.1, 22.4 10"
        stroke={`url(#${grad})`}
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
