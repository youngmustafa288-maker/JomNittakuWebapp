// Older phones (for example iPhones before iOS 15.4) don't have
// crypto.randomUUID, which the app uses to create students, reports and
// drafts. Add a standard version-4 UUID fallback built on getRandomValues.
if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID !== "function" && typeof globalThis.crypto.getRandomValues === "function") {
  globalThis.crypto.randomUUID = function randomUUID() {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

// iPhones before iOS 15.4 also don't have structuredClone, which the
// certificate and report pages use to copy designs and drafts. The app only
// copies plain data (no dates/files), so a JSON copy is enough.
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = function structuredClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  };
}
