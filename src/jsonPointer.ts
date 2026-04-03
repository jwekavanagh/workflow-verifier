/** RFC 6901 JSON Pointer — get value only (no set). */
export function getPointer(doc: unknown, pointer: string): unknown {
  if (pointer === "") return doc;
  if (!pointer.startsWith("/")) {
    throw new Error(`Invalid JSON Pointer: must start with /, got ${JSON.stringify(pointer)}`);
  }
  const parts = pointer
    .slice(1)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = doc;
  for (const tok of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    if (Array.isArray(cur)) {
      const idx = Number.parseInt(tok, 10);
      if (String(idx) !== tok || idx < 0 || idx >= cur.length) return undefined;
      cur = cur[idx];
    } else {
      cur = (cur as Record<string, unknown>)[tok];
    }
  }
  return cur;
}
