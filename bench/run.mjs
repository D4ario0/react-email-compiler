import { gzipSync } from "node:zlib";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build as viteBuild } from "vite";
import ReactEmailCompiler from "../dist/vite.mjs";

const root = resolve(import.meta.dirname, "..");
const cacheRoot = resolve(root, "node_modules/.cache/react-email-compiler/benchmark");
const generatedRoot = join(cacheRoot, "generated");
const outputRoot = join(cacheRoot, "output");
const resultsRoot = resolve(root, "bench/results");
const durationMs = Number(process.env.BENCH_DURATION_MS ?? 500);

const fixtureRoot = resolve(root, "test/fixtures/email-package");
const accountTemplate = join(fixtureRoot, "emails/AccountAccess.email.tsx");
const incidentTemplate = join(fixtureRoot, "emails/Incident.email.tsx");
const runtimeModule = resolve(root, "dist/runtime.mjs");

const tailwindConfig = {
  theme: {
    extend: {
      colors: {
        fixture: {
          text: "#172033",
          muted: "#64748b",
          border: "#d8dee9",
          brand: "#2563eb",
        },
      },
      fontFamily: {
        fixture: ["Arial", "sans-serif"],
      },
      fontSize: {
        md: ["15px", { lineHeight: "1.6" }],
      },
    },
  },
};

const accountProps = {
  mode: "link",
  url: "https://example.com/auth?token=<benchmark>&campaign=runtime",
  code: "593204",
};
const incidentProps = {
  incidentId: "benchmark-incident",
  summary: "A Unicode operation 情報Ⅰ failed with <invalid> input & requires review.",
  attempts: 8,
  records: Array.from({ length: 100 }, (_, index) => ({
    id: `record-${index}`,
    status: index % 2 === 0 ? "pending" : "retrying",
  })),
};

function normalizeHtml(html) {
  return html
    .replaceAll("<!--$-->", "")
    .replaceAll("<!--/$-->", "")
    .replaceAll("<!--html-->", "")
    .replaceAll("<!--head-->", "")
    .replaceAll("<!--body-->", "")
    .replaceAll("<!-- -->", "")
    .replace(/style="([^"]*)"/g, (_match, declarations) => {
      const sorted = declarations.split(";").filter(Boolean).sort().join(";");
      return `style="${sorted}"`;
    });
}

function percentile(sorted, value) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] ?? 0;
}

async function measureAsync(fn) {
  for (let index = 0; index < 3; index++) await fn();
  const samples = [];
  const started = performance.now();
  while (performance.now() - started < durationMs && samples.length < 1_000) {
    const before = performance.now();
    await fn();
    samples.push(performance.now() - before);
  }
  const elapsed = performance.now() - started;
  samples.sort((a, b) => a - b);
  return {
    iterations: samples.length,
    meanMs: elapsed / samples.length,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    opsPerSecond: (samples.length / elapsed) * 1_000,
  };
}

function measureSync(fn) {
  for (let index = 0; index < 20; index++) fn();
  const samples = [];
  const started = performance.now();
  while (performance.now() - started < durationMs && samples.length < 100_000) {
    const before = performance.now();
    fn();
    samples.push(performance.now() - before);
  }
  const elapsed = performance.now() - started;
  samples.sort((a, b) => a - b);
  return {
    iterations: samples.length,
    meanMs: elapsed / samples.length,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    opsPerSecond: (samples.length / elapsed) * 1_000,
  };
}

function flattenOutputs(result) {
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap((item) => item.output);
}

function summarizeOutput(result, buildMs, mode, renderer) {
  const output = flattenOutputs(result);
  const chunks = output.filter((item) => item.type === "chunk");
  const code = chunks.map((chunk) => chunk.code).join("\n");
  const modules = new Set(chunks.flatMap((chunk) => Object.keys(chunk.modules)));
  const entry = chunks.find((chunk) => chunk.isEntry);
  const dynamicChunks = chunks.filter((chunk) => !chunk.isEntry);

  return {
    renderer,
    mode,
    buildMs,
    rawBytes: Buffer.byteLength(code),
    gzipBytes: gzipSync(code).byteLength,
    chunks: chunks.length,
    modules: modules.size,
    entryBytes: entry ? Buffer.byteLength(entry.code) : 0,
    dynamicChunkBytes: dynamicChunks.reduce((total, chunk) => total + Buffer.byteLength(chunk.code), 0),
    containsReactRuntime: modules.size > 0 && [...modules].some((id) =>
      /(?:^|node_modules\/)(?:react|react-dom|react-email|@react-email\/render)(?:\/|$)/.test(id),
    ),
  };
}

async function buildEntry({ entry, renderer, mode, write = false }) {
  const started = performance.now();
  const result = await viteBuild({
    root,
    configFile: false,
    logLevel: "silent",
    resolve: {
      alias: {
        "react-email-compiler/runtime": runtimeModule,
      },
    },
    plugins: renderer === "compiled"
      ? [ReactEmailCompiler({ runtimeModule, tailwindConfig })]
      : [],
    ssr: {
      noExternal: true,
    },
    build: {
      emptyOutDir: true,
      minify: "esbuild",
      outDir: join(outputRoot, `${renderer}-${mode}`),
      rollupOptions: {
        input: entry,
        output: {
          chunkFileNames: "chunks/[name]-[hash].mjs",
          entryFileNames: "entry.mjs",
        },
      },
      ssr: true,
      write,
    },
  });
  return {
    result,
    summary: summarizeOutput(result, performance.now() - started, mode, renderer),
  };
}

await rm(cacheRoot, { recursive: true, force: true });
await mkdir(generatedRoot, { recursive: true });
await mkdir(resultsRoot, { recursive: true });

const referenceRenderer = join(generatedRoot, "reference-renderer.ts");
const compiledRenderer = join(generatedRoot, "compiled-renderer.ts");

await writeFile(referenceRenderer, `
  import { createElement } from "react";
  import { render, toPlainText } from "@react-email/render";
  import { AccountAccessEmail } from ${JSON.stringify(accountTemplate)};
  import { IncidentEmail } from ${JSON.stringify(incidentTemplate)};

  async function renderTemplate(template, props) {
    const html = await render(createElement(template, props));
    return { html, text: toPlainText(html) };
  }

  export const renderAccount = (props) => renderTemplate(AccountAccessEmail, props);
  export const renderIncident = (props) => renderTemplate(IncidentEmail, props);
`);

await writeFile(compiledRenderer, `
  import { render, toPlainText } from "@react-email/render";
  import { AccountAccessEmail } from ${JSON.stringify(accountTemplate)};
  import { IncidentEmail } from ${JSON.stringify(incidentTemplate)};

  async function renderTemplate(template, props) {
    const html = await render(template(props));
    return { html, text: toPlainText(html) };
  }

  export const renderAccount = (props) => renderTemplate(AccountAccessEmail, props);
  export const renderIncident = (props) => renderTemplate(IncidentEmail, props);
`);

const entries = [];
for (const renderer of ["reference", "compiled"]) {
  const rendererModule = renderer === "reference" ? referenceRenderer : compiledRenderer;
  const topLevel = join(generatedRoot, `${renderer}-top-level.ts`);
  const dynamic = join(generatedRoot, `${renderer}-dynamic.ts`);
  await writeFile(topLevel, `export { renderAccount, renderIncident } from ${JSON.stringify(rendererModule)};`);
  await writeFile(dynamic, `
    export const loadRenderer = () => import(${JSON.stringify(rendererModule)});
  `);
  entries.push({ renderer, mode: "top-level", entry: topLevel });
  entries.push({ renderer, mode: "dynamic", entry: dynamic });
}

const bundleResults = [];
let referenceModule;
let compiledModule;
for (const item of entries) {
  const built = await buildEntry({ ...item, write: item.mode === "top-level" });
  bundleResults.push(built.summary);
  if (item.mode === "top-level") {
    const moduleUrl = pathToFileURL(join(outputRoot, `${item.renderer}-${item.mode}`, "entry.mjs"));
    moduleUrl.searchParams.set("benchmark", String(Date.now()));
    const loaded = await import(moduleUrl.href);
    if (item.renderer === "reference") referenceModule = loaded;
    else compiledModule = loaded;
  }
}

if (!referenceModule || !compiledModule) throw new Error("Benchmark renderer bundles failed to load");

for (const [name, props] of [["Account", accountProps], ["Incident100", incidentProps]]) {
  const method = name === "Account" ? "renderAccount" : "renderIncident";
  const reference = await referenceModule[method](props);
  const compiled = await compiledModule[method](props);
  if (normalizeHtml(reference.html) !== normalizeHtml(compiled.html) || reference.text !== compiled.text) {
    throw new Error(`${name} output parity failed before benchmarking`);
  }
}

const runtimeResults = [];
for (const [name, props] of [["Account", accountProps], ["Incident100", incidentProps]]) {
  const method = name === "Account" ? "renderAccount" : "renderIncident";
  runtimeResults.push({
    fixture: name,
    renderer: "react-email",
    ...(await measureAsync(() => referenceModule[method](props))),
  });
  runtimeResults.push({
    fixture: name,
    renderer: "compiled",
    ...(await measureAsync(() => compiledModule[method](props))),
  });
}

const result = {
  metadata: {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    durationMs,
  },
  runtime: runtimeResults,
  bundles: bundleResults,
};

await writeFile(join(resultsRoot, "latest.json"), `${JSON.stringify(result, null, 2)}\n`);

console.log("\nRuntime rendering\n");
console.table(runtimeResults.map((item) => ({
  fixture: item.fixture,
  renderer: item.renderer,
  "ops/sec": Math.round(item.opsPerSecond),
  "mean ms": Number(item.meanMs.toFixed(4)),
  "p95 ms": Number(item.p95Ms.toFixed(4)),
  iterations: item.iterations,
})));

console.log("\nBundle output\n");
console.table(bundleResults.map((item) => ({
  renderer: item.renderer,
  mode: item.mode,
  "build ms": Math.round(item.buildMs),
  "raw kB": Number((item.rawBytes / 1_000).toFixed(2)),
  "gzip kB": Number((item.gzipBytes / 1_000).toFixed(2)),
  chunks: item.chunks,
  modules: item.modules,
  React: item.containsReactRuntime,
})));

console.log(`\nResults written to ${join(resultsRoot, "latest.json")}\n`);
