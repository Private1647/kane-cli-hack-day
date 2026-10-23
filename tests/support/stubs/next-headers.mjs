// A cookie jar per test: tests/support/session.mjs fills it before a call.
export const jar = new Map();
export async function cookies() {
  return {
    get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name, value) => void jar.set(name, value),
    delete: (name) => void jar.delete(name),
  };
}
export async function headers() {
  return new Headers({ "x-forwarded-for": "127.0.0.1" });
}
