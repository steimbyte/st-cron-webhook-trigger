/**
 * v0.5.0-security — SSRF guard.
 *
 * assertPublicUrl(url, { allowPrivateNetworks })
 *   1. parses URL (TypeError on malformed)
 *   2. scheme allow-list (http, https) — otherwise PrivateNetworkError("scheme ...")
 *   3. hostname pre-check (localhost / .local / .internal / IP-literal-private)
 *   4. dns.lookup(hostname, { all: true }) — every resolved address must be public
 *      unless allowPrivateNetworks is true (warning emitted, request proceeds).
 *
 * Design references: proposal.md §1 + design.md §1. This module is dependency-free
 * beyond node:dns and node:url (no transitive deps that would re-introduce CVEs).
 */
import dns from "node:dns";

export class PrivateNetworkError extends Error {
  readonly code = "ERR_PRIVATE_NETWORK";
  constructor(
    public readonly target: string,
    reason: string,
  ) {
    super(`refused to fetch private target ${target}: ${reason}`);
    this.name = "PrivateNetworkError";
  }
}

export interface AssertOptions {
  /** Override the public-network guard. Use sparingly — only for trusted internal targets. */
  allowPrivateNetworks?: boolean;
}

type LookupAddress = { address: string; family: 4 | 6 };
type Resolver = (hostname: string, options: { all: true }) => Promise<LookupAddress[]>;

// --- DNS mock seam (underscore = internal, tests-only) -----------------------------
let _resolver: Resolver = (h, opts) =>
  dns.promises.lookup(h, opts) as unknown as Promise<LookupAddress[]>;

export function _setResolverForTests(fn: Resolver): void {
  _resolver = fn;
}

export function _resetResolverForTests(): void {
  _resolver = (h, opts) =>
    dns.promises.lookup(h, opts) as unknown as Promise<LookupAddress[]>;
}

// --- IP classification (pure) ------------------------------------------------------

/**
 * Returns true if `ip` is a private/loopback/link-local/multicast address.
 * Accepts IPv4 dotted-quad and standard IPv6 notation (incl. IPv4-mapped).
 * Pure: no DNS, no IO.
 */
export function isPrivateAddress(ip: string): boolean {
  if (!ip) return false;

  // IPv4-mapped IPv6: ::ffff:a.b.c.d — recurse into the IPv4 part.
  if (ip.startsWith("::ffff:")) {
    return isPrivateAddress(ip.slice(7));
  }

  // Strip zone id (e.g. fe80::1%eth0) for IPv6.
  const v6 = ip.split("%")[0];

  if (v6.includes(":")) {
    // IPv6
    const lo = v6.toLowerCase();
    if (lo === "::1") return true; // loopback
    if (lo === "::") return true; // unspecified
    if (lo.startsWith("fe8") || lo.startsWith("fe9") || lo.startsWith("fea") || lo.startsWith("feb")) {
      // fe80::/10 (link-local) — second nibble is 8..b
      if (/^fe[89ab][0-9a-f]:/i.test(v6)) return true;
    }
    if (lo.startsWith("fc") || lo.startsWith("fd")) {
      // fc00::/7 (ULA)
      return true;
    }
    if (lo.startsWith("ff")) {
      // ff00::/8 (multicast)
      return true;
    }
    return false;
  }

  // IPv4 — parse and range-check
  const parts = v6.split(".");
  if (parts.length !== 4) return false;
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = parseInt(p, 10);
    if (n < 0 || n > 255) return false;
    nums.push(n);
  }
  const [a, b] = nums;

  // 0.0.0.0/8 (unspecified + "this network")
  if (a === 0) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12 (172.16 - 172.31)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (link-local — AWS metadata lives here)
  if (a === 169 && b === 254) return true;
  // 224.0.0.0/4 (multicast)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 (reserved / broadcast)
  if (a >= 240) return true;

  return false;
}

// --- Public entry point ------------------------------------------------------------

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/**
 * Throws PrivateNetworkError if `url` targets a private network address.
 * Pure-Promise interface: caller must `await` (DNS is async).
 */
export async function assertPublicUrl(
  url: string | URL,
  opts: AssertOptions = {},
): Promise<void> {
  let parsed: URL;
  try {
    parsed = typeof url === "string" ? new URL(url) : url;
  } catch (err) {
    throw new TypeError(`assertPublicUrl: malformed URL ${String(url)}: ${(err as Error).message}`);
  }

  // 1. scheme (always enforced — even with override)
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new PrivateNetworkError(
      parsed.toString(),
      `scheme "${parsed.protocol}" not allowed`,
    );
  }

  const host = parsed.hostname; // IP literal or DNS hostname; brackets stripped

  // 2. override short-circuits all remaining checks (scheme is the only hard block)
  if (opts.allowPrivateNetworks === true) {
    // eslint-disable-next-line no-console
    console.warn(
      `[cronboard] SSRF guard bypassed for ${parsed.toString()} (allowPrivateNetworks=true)`,
    );
    return;
  }

  // 3. hostname pre-check (synchronous)
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) {
    throw new PrivateNetworkError(parsed.toString(), `hostname "${host}" is loopback`);
  }
  if (lower.endsWith(".local") || lower.endsWith(".internal")) {
    throw new PrivateNetworkError(parsed.toString(), `hostname "${host}" is a local TLD`);
  }

  // 4. IP-literal pre-check (skip DNS for IPs)
  if (looksLikeIpLiteral(host) && isPrivateAddress(host)) {
    throw new PrivateNetworkError(
      parsed.toString(),
      `hostname "${host}" is a private address`,
    );
  }

  // 5. DNS resolve (only for actual hostnames, after IP-literal guard)
  let addrs: LookupAddress[];
  try {
    addrs = await _resolver(host, { all: true });
  } catch (err) {
    throw new PrivateNetworkError(
      parsed.toString(),
      `DNS lookup failed for "${host}": ${(err as Error).message}`,
    );
  }
  if (!addrs || addrs.length === 0) {
    throw new PrivateNetworkError(
      parsed.toString(),
      `DNS lookup returned no addresses for "${host}"`,
    );
  }

  // 6. every resolved address must be public
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      throw new PrivateNetworkError(
        parsed.toString(),
        `resolved to private address ${a.address}`,
      );
    }
  }
}

function looksLikeIpLiteral(host: string): boolean {
  // IPv6: contains ':'
  if (host.includes(":")) return true;
  // IPv4 dotted-quad (very loose: 4 dot-separated decimals)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return false;
}