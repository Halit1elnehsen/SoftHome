import { build } from "esbuild";
import { mkdir, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
await mkdir(root + "/js/vendor", { recursive: true });
await build({
  stdin: {
    contents: 'export { createClient } from "@supabase/supabase-js";',
    resolveDir: root,
    sourcefile: "supabase-entry.js",
  },
  bundle: true,
  minify: true,
  platform: "browser",
  format: "iife",
  globalName: "SoftHomeSupabase",
  target: ["chrome94"],
  outfile: root + "/js/vendor/supabase.js",
  legalComments: "eof",
});
for (const part of [
  "index.html",
  "js",
  "css",
  "icons",
  "manifest.json",
  "sw.js",
]) {
  await cp(
    root + "/" + part,
    root + "/../android/app/src/main/assets/" + part,
    { recursive: true },
  );
}
console.log("Bundled pinned Supabase client and synchronized Android assets.");
