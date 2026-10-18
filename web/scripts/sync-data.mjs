// Zkopíruje ../data/*.json do public/data, aby je Vite servíroval v dev režimu i zabalil do buildu.
import { mkdirSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "data");
const dst = join(here, "..", "public", "data");
mkdirSync(dst, { recursive: true });
if (!existsSync(src)) { console.log("sync-data: ../data neexistuje, přeskočeno"); process.exit(0); }
let n = 0;
for (const f of readdirSync(src)) if (f.endsWith(".json")) { copyFileSync(join(src, f), join(dst, f)); n++; }
console.log(`sync-data: ${n} souborů -> web/public/data`);
