// Copy built frontend into the backend's dist/web so the backend can serve it.
// Runs after `npm run build` in packages/web.

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const src = path.join(root, "packages", "web", "dist");
const dst = path.join(root, "packages", "core", "dist", "web");

if (!fs.existsSync(src)) {
  console.error(`No built frontend at ${src}. Run "npm run build -w packages/web" first.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log(`Copied ${src} -> ${dst}`);
