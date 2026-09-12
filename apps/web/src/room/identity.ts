/**
 * Identity roster.
 *
 * The eight `--id-*` hues belong to people only (never chrome). A peer's color
 * is a deterministic function of a stable seed (display name or device id), so
 * the same person keeps the same hue across reloads and machines.
 *
 * See docs/research/2026-09-12-design-brief.md ("identity roster").
 */
const IDENTITY_TOKENS = [
  "var(--id-1)",
  "var(--id-2)",
  "var(--id-3)",
  "var(--id-4)",
  "var(--id-5)",
  "var(--id-6)",
  "var(--id-7)",
  "var(--id-8)",
] as const;

const IDENTITY_COUNT = IDENTITY_TOKENS.length;

export function identityIndex(seed: string | number): number {
  if (typeof seed === "number") {
    return Math.abs(Math.trunc(seed)) % IDENTITY_COUNT;
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % IDENTITY_COUNT;
}

/** A CSS color value for the hue assigned to `seed`. */
export function identityColor(seed: string | number): string {
  return IDENTITY_TOKENS[identityIndex(seed)];
}

/** Up to two uppercase initials, used inside avatar chips. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}
