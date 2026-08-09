import { readFile } from "node:fs/promises";

const adapters = ["vite", "rollup", "rolldown", "esbuild", "webpack", "rspack", "bun", "farm"];

for (const adapter of adapters) {
  const module = await import(`react-email-compiler/${adapter}`);
  if (typeof module.default !== "function") {
    throw new TypeError(`react-email-compiler/${adapter} does not export a plugin factory`);
  }
}

const runtime = await import(new URL("../dist/runtime.mjs", import.meta.url));
const result = runtime.renderCompiledEmail(() => "<p>ok</p>", {});
if (result !== "<p>ok</p>") throw new Error("Internal runtime build is invalid");

const runtimeSource = await readFile(new URL("../dist/runtime.mjs", import.meta.url), "utf8");
if (/from\s*["'](?:react|react-dom|react-email|@react-email\/render)/.test(runtimeSource)) {
  throw new Error("The generated runtime imports React or React Email");
}

console.log("verified package exports and React-free runtime");
