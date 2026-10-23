export function unstable_rethrow() {}
export function redirect(url) {
  throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { digest: `NEXT_REDIRECT;${url}` });
}
export function notFound() {
  throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
}
export const permanentRedirect = redirect;
