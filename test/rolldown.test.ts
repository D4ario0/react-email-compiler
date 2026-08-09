import { resolve } from "node:path";
import { rolldown } from "rolldown";
import { afterEach, describe, expect, it } from "vitest";
import ReactEmailCompiler from "../src/rolldown";
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

describe("Rolldown/tsdown plugin", () => {
  it("bundles .email.tsx templates without React", async () => {
    fixture = await createTemporaryFixture(
      "react-email-compiler-rolldown-",
      basicEmailFixtureFiles,
    );

    const bundle = await rolldown({
      input: fixture.path("entry.ts"),
      plugins: [ReactEmailCompiler({ runtimeModule: resolve("src/runtime.ts") })],
    });
    const result = await bundle.generate({ format: "es" });
    const chunk = result.output.find((output) => output.type === "chunk");
    if (!chunk) throw new Error("Rolldown did not emit an entry chunk");
    expect(chunk.code).not.toMatch(
      /from\s*["'](?:react|react-dom|react-email|@react-email\/render)/,
    );

    const module = await importJavaScript<{ html: string }>(chunk.code);
    expect(module.html).toContain("Hello &lt;Alex&gt;");
  });
});
