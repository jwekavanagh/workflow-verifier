/**
 * Restricts Auth.js `callbackUrl` to same-site paths (no open redirect).
 * Allowed: exactly `/`, `/pricing`, `/account`, `/claim` with no query or hash.
 */
export function sanitizeInternalCallbackUrl(value: string | null): string {
  if (value === null || value === "") {
    return "/account";
  }
  let url: URL;
  try {
    url = new URL(value, "https://example.internal");
  } catch {
    return "/account";
  }
  if (url.username !== "" || url.password !== "") {
    return "/account";
  }
  if (url.hostname !== "example.internal") {
    return "/account";
  }
  if (url.search !== "" || url.hash !== "") {
    return "/account";
  }
  const path = url.pathname;
  if (path === "/" || path === "/pricing" || path === "/account" || path === "/claim") {
    return path;
  }
  return "/account";
}

/** Options passed to `signIn("email", …)` after sanitizing `callbackUrl`. */
export function emailSignInOptions(email: string, rawCallback: string | null) {
  return {
    email,
    redirect: false as const,
    callbackUrl: sanitizeInternalCallbackUrl(rawCallback),
  };
}
