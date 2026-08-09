import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "react-email": resolve("node_modules/react-email/dist/index.mjs"),
    },
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
