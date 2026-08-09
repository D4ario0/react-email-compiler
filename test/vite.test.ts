import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import ReactEmailCompiler from "../src/vite";
import { basicEmailFixtureFiles } from "./helpers/basic-email-fixture";
import { buildViteFixture, type BuiltViteFixture } from "./helpers/build-fixture";

interface FixtureExports {
  html: string;
  text: string;
}

let fixture: BuiltViteFixture<FixtureExports> | undefined;

afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});

describe("Vite plugin", () => {
  it("bundles .email.tsx templates without React", async () => {
    fixture = await buildViteFixture<FixtureExports>({
      prefix: "react-email-compiler-vite-",
      files: basicEmailFixtureFiles,
      config: {
        plugins: [ReactEmailCompiler({ runtimeModule: resolve("src/runtime.ts") })],
      },
    });

    expect(fixture.code).not.toMatch(/react(?:-dom|-email)?["']/);
    expect(fixture.code).not.toMatch(/from\s*["']react-email-compiler(?:\/runtime)?["']/);
    expect(fixture.code).not.toContain("@react-email/render");
    expect(fixture.exports.html).toContain("<!DOCTYPE html");
    expect(fixture.exports.html).toContain("Hello &lt;Alex&gt;");
    expect(fixture.exports.text).toBe("Hello <Alex>");
  });
});
