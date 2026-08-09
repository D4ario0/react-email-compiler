import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    vite: "src/vite.ts",
    rollup: "src/rollup.ts",
    rolldown: "src/rolldown.ts",
    esbuild: "src/esbuild.ts",
    webpack: "src/webpack.ts",
    rspack: "src/rspack.ts",
    bun: "src/bun.ts",
    farm: "src/farm.ts",
    runtime: "src/runtime.ts",
  },
  format: "esm",
  dts: true,
  clean: true,
  deps: {
    neverBundle: [
      "react-email",
      "esbuild",
      "rolldown",
      "@oxc-project/types",
      "@rolldown/pluginutils",
    ],
  },
});
