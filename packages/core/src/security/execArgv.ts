/**
 * v0.5.0 — Sanitize Node's process.execArgv before passing it to a detached
 * child spawn. Closes the --inspect=0.0.0.0:9229 pivot (H4 in the audit).
 *
 * Allowlist-first (conservative): keep ONLY flags we explicitly recognise.
 * Denylist as second line of defence for flags outside the allowlist that
 * are known to be dangerous in a server context.
 */
const ALLOWED = /^(?:-?-(?:import(?:=\S+)?|require(?:=\S+)?|experimental-[\w-]+|no-warnings|no-deprecation|enable-source-maps|title(?:=\S*)?|heap-snapshot-signal(?:=\S+)?|use-strict)\b|--)$/;

const DENIED =
  /^(?:-?-(?:inspect(?:=\S+)?|inspect-brk(?:=\S+)?|inspect-port=\S+|inspect-publish-uid=\S+|inspect-wait(?:=\S+)?|debug(?:=\S+)?|debug-brk(?:=\S+)?|cpu-prof(?:=\S+)?|cpu-prof-dir=\S+|heap-prof(?:=\S+)?|heap-prof-dir=\S+|prof(?:=\S+)?))$/;

export function sanitizeExecArgv(args: string[]): string[] {
  const out: string[] = [];
  for (const arg of args) {
    if (typeof arg !== "string") continue;
    if (DENIED.test(arg)) continue; // hard deny — never forward
    if (ALLOWED.test(arg)) out.push(arg); // soft allow
    // otherwise: drop (defensive default)
  }
  return out;
}