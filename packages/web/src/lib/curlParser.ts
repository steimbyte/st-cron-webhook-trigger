// Curl command parser. Extracts HTTP method, URL, headers, and body from a
// single-line or multi-line `curl ...` invocation. Tolerant of:
//
//   - quoting:  curl 'https://...'   curl "https://..."   curl https://...
//   - long flags: --request, --header, --data, --data-raw, --data-binary,
//                 --data-ascii, --data-urlencode, --url, --user, --user-agent,
//                 --referer, --cookie
//   - short flags: -X, -H, -d, -u, -A, -e, -b
//   - line continuations with backslash-newline
//   - flag grouping:  curl -sS -X POST URL   (-sS consumed as -s -S)
//   - automatic method upgrade to POST when -d/--data is present and no -X
//
// Not supported: --url-query, --cookie-jar, -K/--config, --compressed,
// --http1.1/--http2, --insecure, --resolve, --connect-to, --proxy, etc.
// Those flags are silently dropped.

export interface ParsedCurl {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

const SHORT_FLAGS_WITH_ARG = new Set([
  "X", "H", "d", "u", "A", "e", "b", "I", "F",
]);

const KNOWN_LONG_FLAGS_WITH_ARG = new Set([
  "--request", "--header", "--data", "--data-raw", "--data-binary",
  "--data-ascii", "--data-urlencode", "--url", "--user", "--user-agent",
  "--referer", "--cookie", "--interface", "--form", "--form-string",
]);

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let escape = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (escape) {
      cur += ch;
      escape = false;
      continue;
    }
    // Line continuation: `\<newline>` (and optional whitespace on next line).
    if (ch === "\\" && quote === null && i + 1 < input.length && (input[i + 1] === "\n" || input[i + 1] === "\r")) {
      i++; // skip newline
      while (i + 1 < input.length && (input[i + 1] === " " || input[i + 1] === "\t")) i++;
      continue;
    }
    if (quote) {
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) { tokens.push(cur); cur = ""; }
      continue;
    }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function expandShortFlags(tokens: string[]): string[] {
  // Group short flags without args: -sS → -s -S (but stop at the first arg).
  const out: string[] = [];
  for (const t of tokens) {
    if (/^-[A-Za-z0-9]+$/.test(t) && t.length > 2) {
      // Expand only if every char after the leading dash is a known boolean flag.
      const chars = t.slice(1).split("");
      const allKnown = chars.every((c) => !SHORT_FLAGS_WITH_ARG.has(c));
      if (allKnown) {
        for (const c of chars) out.push("-" + c);
        continue;
      }
    }
    out.push(t);
  }
  return out;
}

export function parseCurl(input: string): ParsedCurl | null {
  let tokens = tokenize(input);
  if (tokens[0] && tokens[0].toLowerCase() === "curl") tokens = tokens.slice(1);
  tokens = expandShortFlags(tokens);

  let method: string | null = null;
  let url = "";
  const headers: Record<string, string> = {};
  let body: string | undefined;

  const setHeader = (raw: string) => {
    const idx = raw.indexOf(":");
    if (idx <= 0) return;
    const key = raw.slice(0, idx).trim();
    const val = raw.slice(idx + 1).trim();
    if (key) headers[key] = val;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-X" || t === "--request") {
      const v = tokens[++i];
      if (v) method = v.toUpperCase();
    } else if (t === "-H" || t === "--header") {
      const v = tokens[++i];
      if (v) setHeader(v);
    } else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary" || t === "--data-ascii" || t === "--data-urlencode") {
      const v = tokens[++i];
      if (v !== undefined) body = v;
    } else if (t === "--url") {
      const v = tokens[++i];
      if (v) url = v;
    } else if (t === "-u" || t === "--user") {
      const v = tokens[++i];
      if (v) {
        const [u, p = ""] = v.split(":");
        headers["Authorization"] = "Basic " + (typeof btoa === "function" ? btoa(`${u}:${p}`) : Buffer.from(`${u}:${p}`).toString("base64"));
      }
    } else if (t === "-A" || t === "--user-agent") {
      const v = tokens[++i];
      if (v) headers["User-Agent"] = v;
    } else if (t === "-e" || t === "--referer") {
      const v = tokens[++i];
      if (v) headers["Referer"] = v;
    } else if (t === "-b" || t === "--cookie") {
      const v = tokens[++i];
      if (v) headers["Cookie"] = v;
    } else if (KNOWN_LONG_FLAGS_WITH_ARG.has(t)) {
      // Skip the next token silently for flags we don't surface.
      i++;
    } else if (t === "-F" || t === "--form") {
      // --form 'name=value' — encode as multipart. We don't auto-translate;
      // we only lift it to a header so the user can edit.
      const v = tokens[++i];
      if (v) headers["X-Form-Field"] = v;
    } else if (t === "-K" || t === "--config" || t === "--compressed" || t === "-I" || t === "--head") {
      // No-arg or out-of-scope. Ignore.
    } else if (t.startsWith("-")) {
      // Unknown flag. Try to skip its arg (heuristic: next token isn't a flag).
      const next = tokens[i + 1];
      if (next && !next.startsWith("-")) i++;
    } else if (!url) {
      url = t;
    }
  }

  if (!url) return null;
  return {
    method: method ?? (body ? "POST" : "GET"),
    url,
    headers,
    body,
  };
}

// ─── Self-test (run via `tsx packages/web/src/lib/curlParser.ts`) ─────
const isMain = typeof process !== "undefined" && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  const cases: { label: string; input: string; expected: ParsedCurl | null }[] = [
    {
      label: "single-line POST with -H and -d",
      input: `curl -X POST "https://example.com/api" -H 'Content-Type: application/json' -d '{"a":1}'`,
      expected: {
        method: "POST",
        url: "https://example.com/api",
        headers: { "Content-Type": "application/json" },
        body: '{"a":1}',
      },
    },
    {
      label: "long-form --request --header --data",
      input: `curl --request POST --header 'x-api-key: SECRET' --data 'hello' https://api.example.com/foo`,
      expected: {
        method: "POST",
        url: "https://api.example.com/foo",
        headers: { "x-api-key": "SECRET" },
        body: "hello",
      },
    },
    {
      label: "GET default method (no body)",
      input: `curl https://example.com/health`,
      expected: {
        method: "GET",
        url: "https://example.com/health",
        headers: {},
        body: undefined,
      },
    },
    {
      label: "-d upgrades to POST",
      input: `curl https://api.example.com/x -d '{}'`,
      expected: {
        method: "POST",
        url: "https://api.example.com/x",
        headers: {},
        body: "{}",
      },
    },
    {
      label: "multi-line with line continuation",
      input: `curl -X POST \\\n  "https://langflow.steimercloud.xyz/api/v1/webhook/abc" \\\n  -H 'Content-Type: application/json' \\\n  -H 'x-api-key: <your api key>' \\\n  -d '{"any": "data"}'`,
      expected: {
        method: "POST",
        url: "https://langflow.steimercloud.xyz/api/v1/webhook/abc",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "<your api key>",
        },
        body: '{"any": "data"}',
      },
    },
    {
      label: "JSON body wrapped in single quotes (preferred pattern)",
      input: `curl -X POST https://x/y -d '{"a":1,"b":"two"}'`,
      expected: {
        method: "POST",
        url: "https://x/y",
        headers: {},
        body: '{"a":1,"b":"two"}',
      },
    },
    {
      label: "no url → null",
      input: `curl -X POST`,
      expected: null,
    },
  ];

  let passed = 0;
  for (const c of cases) {
    const got = parseCurl(c.input);
    const ok = JSON.stringify(got) === JSON.stringify(c.expected);
    console.log(`${ok ? "✓" : "✗"} ${c.label}`);
    if (!ok) {
      console.log("   expected:", JSON.stringify(c.expected));
      console.log("   got     :", JSON.stringify(got));
    } else {
      passed++;
    }
  }
  console.log(`\n${passed}/${cases.length} passed`);
  process.exit(passed === cases.length ? 0 : 1);
}