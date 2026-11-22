const GUEST_NAME_KEY = "meldspace.peer-name";
const DEVICE_ID_KEY = "meldspace:device-id";

/**
 * RFC 4122 v4 id. `crypto.randomUUID` only exists in secure contexts, so a LAN
 * demo served over http needs this fallback — otherwise the device id below
 * degrades to a per-load value and checkpoint authorship becomes unstable.
 */
function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Stable per-browser author id until #17 binds Better Auth identity to
 * `device.register`. Persisted in localStorage so checkpoints keep the same
 * author across reloads on one device. Once the join flow registers the
 * device with the control plane, the returned (server) id replaces the
 * locally generated one under the same key.
 */
export function readDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const fresh = randomId();
    window.localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    return `ephemeral-${Date.now().toString(36)}`;
  }
}

/** Adopt the device id the control plane issued at `device.register`. */
export function adoptDeviceId(deviceId: string): void {
  if (typeof window === "undefined" || !deviceId) return;
  try {
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  } catch {
    /* unregistered identity stays local-only */
  }
}

/** A stable per-browser alias, used when nobody is signed in. */
export function readGuestName(): string {
  if (typeof window === "undefined") return "Guest";
  try {
    const existing = window.localStorage.getItem(GUEST_NAME_KEY);
    if (existing) return existing;
    const generated = `Guest ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    window.localStorage.setItem(GUEST_NAME_KEY, generated);
    return generated;
  } catch {
    return "Guest";
  }
}
