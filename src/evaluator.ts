import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { build } from "esbuild";

export interface EvaluatedEmailExport {
  name: string;
  kind: "function" | "react-component" | "value";
  hasPreviewProps: boolean;
}

export interface EvaluatedEmailModule {
  exports: EvaluatedEmailExport[];
}

export interface EvaluatedEmailRender {
  html: string;
  text: string;
}

export interface EvaluateEmailModuleOptions {
  cacheDirectory?: string;
  timeoutMs?: number;
}

interface PreparedModule {
  filename: string;
  hash: string;
}

const evaluationCache = new Map<string, Promise<EvaluatedEmailModule>>();
const preparationCache = new Map<string, Promise<PreparedModule>>();
const require = createRequire(import.meta.url);
const buildTimeAliases = {
  react: require.resolve("react"),
  "react/jsx-dev-runtime": require.resolve("react/jsx-dev-runtime"),
  "react/jsx-runtime": require.resolve("react/jsx-runtime"),
  "react-email": require.resolve("react-email"),
};

const workerSource = String.raw`
  const { parentPort, workerData } = require("node:worker_threads");
  const { pathToFileURL } = require("node:url");

  (async () => {
    try {
      const url = pathToFileURL(workerData.filename);
      url.searchParams.set("evaluation", workerData.hash);
      const module = await import(url.href);

      if (workerData.request.operation === "discover") {
        const exports = Object.entries(module).map(([name, value]) => ({
          name,
          kind:
            typeof value === "function"
              ? "function"
              : value && typeof value === "object" && "$$typeof" in value
                ? "react-component"
                : "value",
          hasPreviewProps:
            (typeof value === "function" || (value && typeof value === "object")) &&
            Object.prototype.hasOwnProperty.call(value, "PreviewProps"),
        }));
        parentPort.postMessage({ ok: true, value: { exports } });
        return;
      }

      const reactModule = await import(workerData.reactUrl);
      const reactEmail = await import(workerData.reactEmailUrl);
      const React = reactModule.default || reactModule;
      const Component = module[workerData.request.exportName];
      if (typeof Component !== "function" && !(Component && typeof Component === "object")) {
        throw new TypeError(
          'Email export "' + workerData.request.exportName + '" is not a React component',
        );
      }
      const html = await reactEmail.render(
        React.createElement(Component, workerData.request.props || {}),
      );
      const text = reactEmail.toPlainText(html);
      parentPort.postMessage({ ok: true, value: { html, text } });
    } catch (error) {
      parentPort.postMessage({
        ok: false,
        error: error instanceof Error ? error.stack || error.message : String(error),
      });
    }
  })();
`;

function executeInWorker<Result>(
  prepared: PreparedModule,
  request: { operation: "discover" } | { operation: "render"; exportName: string; props: unknown },
  timeoutMs: number,
): Promise<Result> {
  return new Promise((resolvePromise, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: {
        ...prepared,
        reactEmailUrl: pathToFileURL(require.resolve("react-email")).href,
        reactUrl: pathToFileURL(require.resolve("react")).href,
        request,
      },
    });
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error(`Build-time email module evaluation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    worker.once("message", (message: { ok: boolean; value?: Result; error?: string }) => {
      clearTimeout(timeout);
      void worker.terminate();
      if (message.ok && message.value) resolvePromise(message.value);
      else reject(new Error(message.error ?? "Build-time email module evaluation failed"));
    });
    worker.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function prepareEmailModule(
  code: string,
  id: string,
  options: EvaluateEmailModuleOptions,
): Promise<PreparedModule> {
  const cleanId = id.replace(/\?.*$/, "");
  const hash = createHash("sha256")
    .update(cleanId)
    .update("\0")
    .update(code)
    .digest("hex")
    .slice(0, 20);
  const cacheDirectory = resolve(
    options.cacheDirectory ?? join(process.cwd(), "node_modules/.cache/react-email-compiler/evaluation"),
  );
  const cacheKey = `${cacheDirectory}:${cleanId}:${hash}`;
  const existing = preparationCache.get(cacheKey);
  if (existing) return existing;

  const preparation = (async () => {
    await mkdir(cacheDirectory, { recursive: true });
    const outfile = join(cacheDirectory, `${hash}.mjs`);
    await build({
      absWorkingDir: process.cwd(),
      alias: buildTimeAliases,
      bundle: true,
      external: Object.values(buildTimeAliases),
      format: "esm",
      jsx: "automatic",
      logLevel: "silent",
      nodePaths: [resolve(process.cwd(), "node_modules")],
      outfile,
      platform: "node",
      sourcemap: false,
      stdin: {
        contents: code,
        loader: "tsx",
        resolveDir: dirname(cleanId),
        sourcefile: cleanId,
      },
      target: "node20",
    });
    return { filename: outfile, hash };
  })();

  preparationCache.set(cacheKey, preparation);
  void preparation.then(
    () => preparationCache.delete(cacheKey),
    () => preparationCache.delete(cacheKey),
  );
  return preparation;
}

export function evaluateEmailModule(
  code: string,
  id: string,
  options: EvaluateEmailModuleOptions = {},
): Promise<EvaluatedEmailModule> {
  const cleanId = id.replace(/\?.*$/, "");
  const hash = createHash("sha256").update(cleanId).update("\0").update(code).digest("hex");
  const cacheKey = `${options.cacheDirectory ?? "default"}:${hash}`;
  const existing = evaluationCache.get(cacheKey);
  if (existing) return existing;

  const evaluation = prepareEmailModule(code, id, options).then((prepared) =>
    executeInWorker<EvaluatedEmailModule>(prepared, { operation: "discover" }, options.timeoutMs ?? 10_000),
  );
  evaluationCache.set(cacheKey, evaluation);
  void evaluation.then(
    () => evaluationCache.delete(cacheKey),
    () => evaluationCache.delete(cacheKey),
  );
  return evaluation;
}

export async function renderEmailModuleExport(
  code: string,
  id: string,
  exportName: string,
  props: unknown,
  options: EvaluateEmailModuleOptions = {},
): Promise<EvaluatedEmailRender> {
  const prepared = await prepareEmailModule(code, id, options);
  return executeInWorker<EvaluatedEmailRender>(
    prepared,
    { operation: "render", exportName, props },
    options.timeoutMs ?? 10_000,
  );
}
