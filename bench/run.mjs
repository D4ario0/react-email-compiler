import { gzipSync } from "node:zlib";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build as viteBuild } from "vite";
import ReactEmailCompiler from "../dist/vite.mjs";

const root = resolve(import.meta.dirname, "..");
const cacheRoot = resolve(root, "node_modules/.cache/react-email-compiler/benchmark");
const generatedRoot = join(cacheRoot, "generated");
const outputRoot = join(cacheRoot, "output");
const resultsRoot = resolve(root, "bench/results");
const durationMs = Number(process.env.BENCH_DURATION_MS ?? 500);
const benchmarkMode = process.env.BENCH_MODE ?? "all";
const runtimeModule = resolve(root, "dist/runtime.mjs");
const packageFixtures = resolve(root, "test/fixtures/email-package/emails");
const diverseFixtures = resolve(root, "test/fixtures/diverse");

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
      fontFamily: { fixture: ["Arial", "sans-serif"] },
      fontSize: { md: ["15px", { lineHeight: "1.6" }] },
    },
  },
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

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 0.5);
}

function geometricMean(values) {
  return Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length);
}

async function measureAsync(fn) {
  for (let index = 0; index < 5; index++) await fn();
  const samples = [];
  const started = performance.now();
  while (performance.now() - started < durationMs && samples.length < 2_000) {
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

function flattenOutputs(result) {
  return (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
}

function summarizeOutput(result, buildMs, mode, renderer, temperature) {
  const output = flattenOutputs(result);
  const chunks = output.filter((item) => item.type === "chunk");
  const code = chunks.map((chunk) => chunk.code).join("\n");
  const modules = new Set(chunks.flatMap((chunk) => Object.keys(chunk.modules)));
  const entry = chunks.find((chunk) => chunk.isEntry);
  const dynamicChunks = chunks.filter((chunk) => !chunk.isEntry);
  return {
    renderer,
    mode,
    temperature,
    buildMs,
    rawBytes: Buffer.byteLength(code),
    gzipBytes: gzipSync(code).byteLength,
    chunks: chunks.length,
    modules: modules.size,
    entryBytes: entry ? Buffer.byteLength(entry.code) : 0,
    dynamicChunkBytes: dynamicChunks.reduce((total, chunk) => total + Buffer.byteLength(chunk.code), 0),
    containsReactRuntime: [...modules].some((id) =>
      /(?:^|node_modules\/)(?:react|react-dom|react-email|@react-email\/render)(?:\/|$)/.test(id),
    ),
  };
}

const compiledPlugin = ReactEmailCompiler({ runtimeModule, tailwindConfig });

async function buildEntry({ entry, renderer, mode, temperature = "cold", write = false }) {
  const started = performance.now();
  const result = await viteBuild({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: renderer === "compiled" ? [compiledPlugin] : [],
    ssr: { noExternal: true },
    build: {
      emptyOutDir: true,
      minify: "esbuild",
      outDir: join(outputRoot, `${renderer}-${mode}-${temperature}`),
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
    summary: summarizeOutput(
      result,
      performance.now() - started,
      mode,
      renderer,
      temperature,
    ),
  };
}

await rm(cacheRoot, { recursive: true, force: true });
await mkdir(generatedRoot, { recursive: true });
await mkdir(resultsRoot, { recursive: true });

const minimalTemplate = join(generatedRoot, "Minimal.email.tsx");
const markdownTemplate = join(generatedRoot, "MarkdownBenchmark.email.tsx");
const codeTemplate = join(generatedRoot, "CodeBenchmark.email.tsx");

await writeFile(minimalTemplate, `
  import { Html, Text } from "react-email";
  export function MinimalEmail({ message }) {
    return <Html lang="en"><Text>{message}</Text></Html>;
  }
`);
await writeFile(markdownTemplate, `
  import { Html, Markdown } from "react-email";
  export function MarkdownBenchmarkEmail() {
    return <Html lang="en"><Markdown>{${JSON.stringify("# Release notes\n\n- Added **AOT compilation**\n- Preserved [React Email DX](https://react.email)\n\n> Build once, render quickly.\n\n```ts\nconst html = await render(Email(props));\n```")}}</Markdown></Html>;
  }
`);
await writeFile(codeTemplate, `
  import { CodeBlock, Html, dracula } from "react-email";
  export function CodeBenchmarkEmail() {
    return <Html lang="en"><CodeBlock
      code=${JSON.stringify("type Email = { html: string; text: string };\nconst result: Email = compile(template);")}
      language="typescript"
      lineNumbers
      theme={dracula}
    /></Html>;
  }
`);

const fixtures = [
  {
    name: "Minimal",
    description: "Minimal dynamic text email",
    path: minimalTemplate,
    exportName: "MinimalEmail",
    props: { message: 'Hello <benchmark> & "compiler"' },
  },
  {
    name: "Authentication",
    description: "Tailwind authentication link email",
    path: join(packageFixtures, "AccountAccess.email.tsx"),
    exportName: "AccountAccessEmail",
    props: {
      mode: "link",
      url: "https://example.com/auth?token=<benchmark>&campaign=runtime",
      code: "593204",
    },
  },
  {
    name: "Receipt20",
    description: "Receipt with 20 line items",
    path: join(diverseFixtures, "Receipt.email.tsx"),
    exportName: "ReceiptEmail",
    props: {
      customer: "Alex & team",
      orderId: "benchmark-order",
      items: Array.from({ length: 20 }, (_, index) => ({
        name: `Product ${index} <edition>`,
        quantity: (index % 3) + 1,
        price: `$${(index * 7.25 + 10).toFixed(2)}`,
      })),
      discount: "BENCHMARK20",
      receiptUrl: "https://example.com/receipt?id=benchmark&format=html",
    },
  },
  {
    name: "Newsletter10",
    description: "Newsletter with 10 linked stories",
    path: join(diverseFixtures, "Newsletter.email.tsx"),
    exportName: "NewsletterEmail",
    props: {
      title: "Compiler Weekly 🚀",
      introduction: "A representative linked-content email.",
      stories: Array.from({ length: 10 }, (_, index) => ({
        title: `Story ${index}`,
        summary: `Summary ${index} with café, 日本語, and <escaped> content.`,
        url: `https://example.com/story/${index}?source=email&issue=42`,
      })),
      footerNote: "End of issue.",
    },
  },
  {
    name: "SecurityAlert",
    description: "Conditional alert with recovery actions",
    path: join(diverseFixtures, "SecurityAlert.email.tsx"),
    exportName: "SecurityAlertEmail",
    props: {
      device: "Unknown <browser>",
      location: "São Paulo & nearby",
      recognized: false,
      reviewUrl: "https://example.com/security?event=42&action=review",
      recoverySteps: ["Change your password", "Enable 2FA", "Review active sessions"],
    },
  },
  {
    name: "UnicodeRTL",
    description: "RTL and multilingual Unicode content",
    path: join(diverseFixtures, "International.email.tsx"),
    exportName: "InternationalEmail",
    props: {
      language: "ar",
      direction: "rtl",
      recipient: "ليلى & 山田",
      messages: ["تم تأكيد حسابك", "アカウントが確認されました", "Your account is ready 🎉"],
    },
  },
  {
    name: "PrimitiveMatrix",
    description: "Dynamic structural primitives and web font",
    path: join(diverseFixtures, "PrimitiveMatrix.email.tsx"),
    exportName: "PrimitiveMatrixEmail",
    props: {
      headingAs: "h3",
      heading: "Dynamic primitive matrix",
      margin: "-12.5",
      invalidMargin: "invalid",
      rowLabel: "Two-column benchmark",
      leftWidth: "60%",
      rightWidth: "40%",
      inlineCode: "pnpm check && pnpm bench",
      codeClass: "benchmark-code",
      includeWebFont: true,
    },
  },
  {
    name: "Markdown",
    description: "Static Markdown with list, link, quote, and code",
    path: markdownTemplate,
    exportName: "MarkdownBenchmarkEmail",
    props: {},
  },
  {
    name: "CodeBlock",
    description: "Static highlighted TypeScript with line numbers",
    path: codeTemplate,
    exportName: "CodeBenchmarkEmail",
    props: {},
  },
  {
    name: "Incident100",
    description: "Tailwind email with 100 repeated records",
    path: join(packageFixtures, "Incident.email.tsx"),
    exportName: "IncidentEmail",
    props: {
      incidentId: "benchmark-incident",
      summary: "A Unicode operation 情報Ⅰ failed with <invalid> input & requires review.",
      attempts: 8,
      records: Array.from({ length: 100 }, (_, index) => ({
        id: `record-${index}`,
        status: index % 2 === 0 ? "pending" : "retrying",
      })),
    },
  },
];

const imports = fixtures
  .map((fixture, index) => `import { ${fixture.exportName} as Template${index} } from ${JSON.stringify(fixture.path)};`)
  .join("\n");
const fixtureData = JSON.stringify(
  Object.fromEntries(fixtures.map((fixture) => [fixture.name, fixture.props])),
);
const templateMap = fixtures
  .map((fixture, index) => `${JSON.stringify(fixture.name)}: Template${index}`)
  .join(",\n");

const referenceRenderer = join(generatedRoot, "reference-renderer.ts");
const compiledRenderer = join(generatedRoot, "compiled-renderer.ts");

await writeFile(referenceRenderer, `
  import { createElement } from "react";
  import { render, toPlainText } from "@react-email/render";
  ${imports}
  const templates = { ${templateMap} };
  const props = ${fixtureData};
  export async function renderFixture(name) {
    const html = await render(createElement(templates[name], props[name]));
    return { html, text: toPlainText(html) };
  }
`);

await writeFile(compiledRenderer, `
  import { render, toPlainText } from "@react-email/render";
  ${imports}
  const templates = { ${templateMap} };
  const props = ${fixtureData};
  export async function renderFixture(name) {
    const html = await render(templates[name](props[name]));
    return { html, text: toPlainText(html) };
  }
`);

const entries = [];
for (const renderer of ["reference", "compiled"]) {
  const rendererModule = renderer === "reference" ? referenceRenderer : compiledRenderer;
  const topLevel = join(generatedRoot, `${renderer}-top-level.ts`);
  const dynamic = join(generatedRoot, `${renderer}-dynamic.ts`);
  await writeFile(topLevel, `export { renderFixture } from ${JSON.stringify(rendererModule)};`);
  await writeFile(dynamic, `export const loadRenderer = () => import(${JSON.stringify(rendererModule)});`);
  entries.push({ renderer, mode: "top-level", entry: topLevel });
  entries.push({ renderer, mode: "dynamic", entry: dynamic });
}

const bundleResults = [];
let referenceModule;
let compiledModule;
let compiledTopLevelEntry;
for (const item of entries) {
  const built = await buildEntry({ ...item, write: item.mode === "top-level" });
  bundleResults.push(built.summary);
  if (item.renderer === "compiled" && item.mode === "top-level") compiledTopLevelEntry = item.entry;
  if (item.mode === "top-level") {
    const moduleUrl = pathToFileURL(
      join(outputRoot, `${item.renderer}-${item.mode}-cold`, "entry.mjs"),
    );
    moduleUrl.searchParams.set("benchmark", String(Date.now()));
    const loaded = await import(moduleUrl.href);
    if (item.renderer === "reference") referenceModule = loaded;
    else compiledModule = loaded;
  }
}

if (!referenceModule || !compiledModule || !compiledTopLevelEntry) {
  throw new Error("Benchmark renderer bundles failed to load");
}

const warmBuild = await buildEntry({
  entry: compiledTopLevelEntry,
  renderer: "compiled",
  mode: "top-level",
  temperature: "warm",
});
bundleResults.push(warmBuild.summary);

for (const fixture of fixtures) {
  const reference = await referenceModule.renderFixture(fixture.name);
  const compiled = await compiledModule.renderFixture(fixture.name);
  if (normalizeHtml(reference.html) !== normalizeHtml(compiled.html) || reference.text !== compiled.text) {
    throw new Error(`${fixture.name} output parity failed before benchmarking`);
  }
}

const runtimeResults = [];
if (benchmarkMode !== "build") {
  for (const fixture of fixtures) {
    const reference = await measureAsync(() => referenceModule.renderFixture(fixture.name));
    const compiled = await measureAsync(() => compiledModule.renderFixture(fixture.name));
    runtimeResults.push({ fixture: fixture.name, renderer: "react-email", ...reference });
    runtimeResults.push({ fixture: fixture.name, renderer: "compiled", ...compiled });
  }
}

const runtimeByFixture = new Map(
  runtimeResults.map((result) => [`${result.fixture}:${result.renderer}`, result]),
);
const speedups = fixtures.map((fixture) => {
  const reference = runtimeByFixture.get(`${fixture.name}:react-email`);
  const compiled = runtimeByFixture.get(`${fixture.name}:compiled`);
  if (!reference || !compiled) return null;
  return {
    fixture: fixture.name,
    medianSpeedup: reference.p50Ms / compiled.p50Ms,
    p95Speedup: reference.p95Ms / compiled.p95Ms,
    throughputSpeedup: compiled.opsPerSecond / reference.opsPerSecond,
  };
}).filter(Boolean);

const aggregate = speedups.length === 0 ? null : {
  fixtureCount: speedups.length,
  medianSpeedup: median(speedups.map((item) => item.medianSpeedup)),
  geometricMeanSpeedup: geometricMean(speedups.map((item) => item.medianSpeedup)),
  minimumSpeedup: Math.min(...speedups.map((item) => item.medianSpeedup)),
  maximumSpeedup: Math.max(...speedups.map((item) => item.medianSpeedup)),
  medianP95Speedup: median(speedups.map((item) => item.p95Speedup)),
};

const result = {
  metadata: {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    durationMs,
    mode: benchmarkMode,
  },
  fixtures: fixtures.map(({ name, description }) => ({ name, description })),
  runtime: runtimeResults,
  speedups,
  aggregate,
  bundles: bundleResults,
};

await writeFile(join(resultsRoot, "latest.json"), `${JSON.stringify(result, null, 2)}\n`);

if (runtimeResults.length > 0) {
  console.log("\nRuntime rendering\n");
  console.table(speedups.map((item) => {
    const reference = runtimeByFixture.get(`${item.fixture}:react-email`);
    const compiled = runtimeByFixture.get(`${item.fixture}:compiled`);
    if (!reference || !compiled) throw new Error(`Missing runtime result for ${item.fixture}`);
    return {
      fixture: item.fixture,
      "React p50 ms": Number(reference.p50Ms.toFixed(4)),
      "AOT p50 ms": Number(compiled.p50Ms.toFixed(4)),
      "median speedup": `${item.medianSpeedup.toFixed(1)}×`,
      "p95 speedup": `${item.p95Speedup.toFixed(1)}×`,
    };
  }));
  console.log("Aggregate", {
    "median speedup": `${aggregate.medianSpeedup.toFixed(1)}×`,
    "geometric mean": `${aggregate.geometricMeanSpeedup.toFixed(1)}×`,
    range: `${aggregate.minimumSpeedup.toFixed(1)}×–${aggregate.maximumSpeedup.toFixed(1)}×`,
    "median p95 speedup": `${aggregate.medianP95Speedup.toFixed(1)}×`,
  });
}

console.log("\nBundle and build output\n");
console.table(bundleResults.map((item) => ({
  renderer: item.renderer,
  mode: item.mode,
  temperature: item.temperature,
  "build ms": Math.round(item.buildMs),
  "raw kB": Number((item.rawBytes / 1_000).toFixed(2)),
  "gzip kB": Number((item.gzipBytes / 1_000).toFixed(2)),
  chunks: item.chunks,
  modules: item.modules,
  React: item.containsReactRuntime,
})));

console.log(`\nResults written to ${join(resultsRoot, "latest.json")}\n`);
