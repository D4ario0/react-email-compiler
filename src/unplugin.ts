import { fileURLToPath } from "node:url";
import { createUnplugin, type UnpluginFactory } from "unplugin";
import { compileEmailModule, type CompilerOptions } from "./compiler";
import { CompilationSession } from "./session";

export type ReactEmailCompilerOptions = CompilerOptions;

const RENDER_MODULE = "@react-email/render";
const VIRTUAL_RENDER_MODULE = "\0compiled-email-render";
const runtimeFile = fileURLToPath(
  new URL(import.meta.url.includes("/src/") ? "./runtime.ts" : "./runtime.mjs", import.meta.url),
);

export const unpluginFactory: UnpluginFactory<ReactEmailCompilerOptions | undefined> = (options) => {
  const compilationSession = options?.compilationSession ?? new CompilationSession();

  return {
    name: "react-email-compiler",
    enforce: "pre",
    resolveId: {
      filter: {
        id: /^@react-email\/render$/,
      },
      handler(id) {
        if (id === RENDER_MODULE) return VIRTUAL_RENDER_MODULE;
        return null;
      },
    },
    load: {
      filter: {
        id: /^\0compiled-email-render$/,
      },
      handler(id) {
        if (id !== VIRTUAL_RENDER_MODULE) return null;
        return `
          export {
            renderEmailValue as render,
            toPlainTextEmailValue as toPlainText,
          } from ${JSON.stringify(options?.runtimeModule ?? runtimeFile)};
        `;
      },
    },
    transform: {
      filter: {
        id: /\.email\.tsx(?:\?.*)?$/,
      },
      async handler(code, id) {
        return compileEmailModule(code, id, {
          ...options,
          compilationSession,
          evaluateModule: options?.evaluateModule ?? true,
          runtimeModule: options?.runtimeModule ?? runtimeFile,
        });
      },
    },
  };
};

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
