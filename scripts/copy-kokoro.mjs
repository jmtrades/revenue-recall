// Stage the prebuilt on-device voice bundle as a static asset. kokoro-js ships
// a fully self-contained browser ESM (dist/kokoro.web.js); serving it from
// /vendor and importing it at runtime keeps webpack from ever parsing the
// transformers/onnx stack (whose import.meta/native bindings break the build)
// and keeps CSP at script-src 'self'. Runs as pre(dev|build); the artifact is
// gitignored and recreated from node_modules on every build.
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "kokoro-js", "dist", "kokoro.web.js");
const dest = join(root, "public", "vendor", "kokoro.web.js");

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("voice: staged kokoro.web.js → public/vendor/");
