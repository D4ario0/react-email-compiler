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
  it("accepts the normal React JSX render API", async () => {
    fixture = await buildViteFixture<FixtureExports>({
      prefix: "react-email-compiler-vite-jsx-",
      entry: "entry.tsx",
      files: {
        "Welcome.email.tsx": basicEmailFixtureFiles["Welcome.email.tsx"],
        "entry.tsx": `
          import { render } from "@react-email/render";
          import { Welcome } from "./Welcome.email";
          export const html = await render(<Welcome name="<React user>" />);
          export const text = await render(<Welcome name="<React user>" />, { plainText: true });
        `,
      },
      config: {
        resolve: {
          alias: {
            "react/jsx-dev-runtime": resolve("node_modules/react/jsx-dev-runtime.js"),
          },
        },
        plugins: [ReactEmailCompiler({ runtimeModule: resolve("src/runtime.ts") })],
      },
    });

    expect(fixture.exports.html).toContain("Hello &lt;React user&gt;");
    expect(fixture.exports.text).toBe("Hello <React user>");
    expect(fixture.code).not.toContain("@react-email/render");
    expect(fixture.code).not.toMatch(/from\s*["']react-email["']/);
  });

  it("bundles the direct invocation API without React", async () => {
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
