import type { SVGProps } from "react";

/**
 * Room-shell glyphs, ported from the Paper export
 * (docs/design/exports/room-shell-editor.jsx) so the shell does not depend on
 * an icon-library release for its core chrome. Strokes use `currentColor` so
 * callers control hue with text color.
 */
type IconProps = SVGProps<SVGSVGElement>;

/** The MeldSpace mark: two linked nodes, one alive in amber. */
export function MeldMark({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 15 15"
      width="15"
      height="15"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <circle cx="4.4" cy="4.4" r="2.3" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="10.6" cy="10.6" r="2.3" stroke="var(--signal)" strokeWidth="1.3" />
      <path d="M6.1 6.1L8.9 8.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function DocumentIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path
        d="M3.4 2.2h4.4L10.6 5v6.8a.9.9 0 0 1-.9.9H3.4a.9.9 0 0 1-.9-.9V3.1a.9.9 0 0 1 .9-.9Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M7.7 2.4v2.7h2.7" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function FileIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <rect
        x="2.4"
        y="2.8"
        width="9.2"
        height="8.4"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="5.4" cy="5.6" r="1" stroke="currentColor" />
      <path
        d="M3.2 10.2l2.6-2.6 2 2 1.6-1.6 1.6 1.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BoardIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <rect
        x="2.2"
        y="2.8"
        width="9.6"
        height="8.4"
        rx="1.4"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M6 2.8v8.4M2.2 7h3.8" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

export function CommentIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path
        d="M2.6 3.4a1.2 1.2 0 0 1 1.2-1.2h6.4a1.2 1.2 0 0 1 1.2 1.2v4.4a1.2 1.2 0 0 1-1.2 1.2H6.2L3.6 11.4V9H3.8a1.2 1.2 0 0 1-1.2-1.2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 13 13"
      width="13"
      height="13"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <circle cx="5.6" cy="5.6" r="3.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8.3 8.3L11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 11 11"
      width="11"
      height="11"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M3 3l5 5M8 3l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronDownIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function PanelLeftIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 15 15"
      width="15"
      height="15"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <rect x="2" y="3" width="11" height="9" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.6 3v9" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function ShareIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 13 13"
      width="13"
      height="13"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <circle cx="3.2" cy="6.5" r="1.6" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="9.8" cy="3" r="1.6" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="9.8" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.7 5.8L8.3 3.7M4.7 7.2L8.3 9.3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function HistoryIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 4.4V7l1.9 1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function PeopleIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <circle cx="5.2" cy="5" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M2 11.4c0-1.8 1.4-3 3.2-3s3.2 1.2 3.2 3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M9.2 4.2a1.7 1.7 0 0 1 0 3.3M10 8.6c1.3.3 2.2 1.3 2.2 2.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DetailsIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <circle cx="7" cy="7" r="4.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 6.4v3.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="7" cy="4.4" r="0.7" fill="currentColor" />
    </svg>
  );
}

export function CheckIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path
        d="M3 7.4L5.8 10.2L11 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
