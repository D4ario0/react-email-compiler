import { resolve } from "node:path";
import { build } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";
import ReactEmailCompiler from "../src/esbuild";
import { basicEmailFixtureFiles } from "./helpers/basic-email-fixture";
import {
  createTemporaryFixture,
  importJavaScript,
  type TemporaryFixture,
} from "./helpers/build-fixture";

let fixture: TemporaryFixture | undefined;

afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});

describe("esbuild plugin", () => {
  it("bundles .email.tsx templates without React", async () => {
    fixture = await createTemporaryFixture(
      "react-email-compiler-esbuild-",
      basicEmailFixtureFiles,
    );

    const result = await build({
      bundle: true,
      entryPoints: [fixture.path("entry.ts")],
      format: "esm",
      platform: "node",
      plugins: [ReactEmailCompiler({ runtimeModule: resolve("src/runtime.ts") })],
      write: false,
    });
    const code = result.outputFiles[0]!.text;
    expect(code).not.toMatch(/from\s*["'](?:react|react-dom|react-email|@react-email\/render)/);

    const module = await importJavaScript<{ html: string }>(code);
    expect(module.html).toContain("Hello &lt;Alex&gt;");
  });
});
