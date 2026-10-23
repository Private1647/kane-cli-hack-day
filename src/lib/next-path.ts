/**
 * Where personal sign-in may send someone afterwards (?next=): only this site's
 * participant pages, so a crafted link can't bounce anyone off-site. Anything
 * else lands on the passport.
 */
const PERSONAL_NEXT = /^\/(passport|activate|pair|readiness|help|match|team|t|studio|submit|me|register|setup)(\/[\w\-/]*)?(\?[\w=&%-]*)?$/;

export function personalNext(s?: string) {
  return s && PERSONAL_NEXT.test(s) ? s : "/passport";
}
