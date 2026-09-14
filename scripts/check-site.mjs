import { readFile, readdir, stat } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";

const root = resolve("public");

async function walk(dir) {
  const output = [];
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) output.push(...await walk(path));
    else output.push(path);
  }
  return output;
}

const files = await walk(root);
const htmlFiles = files.filter(file => file.endsWith(".html"));
const errors = [];

function targetFor(href, source) {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const pathname = href.split(/[?#]/)[0];
  if (!pathname || pathname === "/") return join(root, "index.html");
  if (pathname.endsWith("/")) return join(root, pathname, "index.html");
  return join(root, pathname);
}

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  const label = file.slice(root.length + 1);
  if (!/<html\s+lang="[^"]+"/.test(html)) errors.push(`${label}: missing html lang`);
  if (!/<meta\s+name="viewport"/.test(html)) errors.push(`${label}: missing viewport`);
  if (!/<title>[^<]+<\/title>/.test(html)) errors.push(`${label}: missing title`);
  if (!/<h1[ >]/.test(html)) errors.push(`${label}: missing h1`);
  if (!/href="#main"/.test(html)) errors.push(`${label}: missing skip link`);
  if (!/id="main"/.test(html)) errors.push(`${label}: missing main target`);

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  for (const id of ids) if (ids.filter(value => value === id).length > 1) errors.push(`${label}: duplicate id ${id}`);

  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const target = targetFor(match[1], file);
    if (!target) continue;
    try { await stat(target); }
    catch { errors.push(`${label}: broken internal link ${match[1]}`); }
  }

  for (const img of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="[^"]*"/.test(img[0])) errors.push(`${label}: image missing alt`);
  }
}

const worker = await readFile(resolve("src/index.js"), "utf8");
if (!worker.includes('url.pathname === "/api/contact"')) errors.push("Worker: contact route missing");
if (!worker.includes("verifyTurnstile")) errors.push("Worker: Turnstile verification missing");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Checked ${htmlFiles.length} HTML pages, ${files.length} public files, internal links, metadata, IDs, and Worker contact route.`);
