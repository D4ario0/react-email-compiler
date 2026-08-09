import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { render, toPlainText } from "@react-email/render";
import * as React from "react";
import { build, type Rollup } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ReactEmailCompiler from "../src/vite";
import { fixtureTailwindConfig } from "./fixtures/email-package/tailwind.email";
import { AccountAccessEmail } from "./fixtures/email-package/emails/AccountAccess.email";
import { IncidentEmail } from "./fixtures/email-package/emails/Incident.email";

const fixtures = {
  accountLink: {
    mode: "link",
    url: "https://example.com/auth?token=<test>&campaign=login",
    code: "593204",
  },
  accountCode: {
    assetBaseUrl: "https://assets.example.com",
    mode: "code",
    url: "https://example.com/auth?token=fallback",
    code: "593204",
  },
  incident: {
    incidentId: "incident-019e235e",
    summary: "Background operation failed with <invalid> data & needs review.",
    attempts: 6,
    records: [
      { id: "record-a", status: "pending" },
      { id: "record-b", status: "retrying" },
    ],
  },
} as const;

type Rendered = { subject: string; html: string; text: string };
type CompiledResults = Record<keyof typeof fixtures, Rendered>;

let temporaryDirectory: string;
let compiled: CompiledResults;
let bundleCode: string;

function normalizeHtml(html: string): string {
  return html
    .replaceAll("<!--$-->", "")
    .replaceAll("<!--/$-->", "")
    .replaceAll("<!--html-->", "")
    .replaceAll("<!--head-->", "")
    .replaceAll("<!--body-->", "")
    .replaceAll("<!-- -->", "")
    .replace(/style="([^"]*)"/g, (_match, declarations: string) => {
      const sorted = declarations.split(";").filter(Boolean).sort().join(";");
      return `style="${sorted}"`;
    });
}

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "react-email-fixture-parity-"));
  const entry = join(temporaryDirectory, "entry.ts");

  await writeFile(
    entry,
    `
      import {
        accountAccessTemplate,
        incidentTemplate,
      } from ${JSON.stringify(resolve("test/fixtures/email-package/src/render.ts"))};
      const fixtures = ${JSON.stringify(fixtures)};
      export const compiled = {
        accountLink: await accountAccessTemplate(fixtures.accountLink),
        accountCode: await accountAccessTemplate(fixtures.accountCode),
        incident: await incidentTemplate(fixtures.incident),
      };
    `,
  );

  const result = await build({
    root: temporaryDirectory,
    configFile: false,
    logLevel: "silent",
    resolve: {
      alias: {
        "react-email-compiler/runtime": resolve("src/runtime.ts"),
      },
    },
    plugins: [
      ReactEmailCompiler({
        runtimeModule: resolve("src/runtime.ts"),
        tailwindConfig: fixtureTailwindConfig,
      }),
    ],
    build: {
      write: false,
      lib: { entry, formats: ["es"] },
    },
  });

  const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
  const chunk = outputs
    .flatMap((output) => output.output)
    .find((output): output is Rollup.OutputChunk => output.type === "chunk");
  if (!chunk) throw new Error("Vite did not produce a fixture package chunk");

  bundleCode = chunk.code;
  const url = `data:text/javascript;base64,${Buffer.from(bundleCode).toString("base64")}`;
  compiled = ((await import(url)) as { compiled: CompiledResults }).compiled;
});

afterAll(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true });
});

const cases = [
  ["accountLink", AccountAccessEmail],
  ["accountCode", AccountAccessEmail],
  ["incident", IncidentEmail],
] as const;

describe("generic fixture package parity", () => {
  it("replaces the renderer and produces a compiler-free, React-free bundle", () => {
    expect(bundleCode).not.toMatch(
      /from\s*["'](?:react|react-dom|react-email|@react-email\/render)/,
    );
    expect(bundleCode).not.toContain("@react-email/render");
    expect(bundleCode).not.toContain("react-email-compiler");
  });

  for (const [name, Template] of cases) {
    it(`matches React Email HTML and text for ${name}`, async () => {
      const props = fixtures[name];
      const reactHtml = await render(
        React.createElement(
          Template as unknown as React.ComponentType<Record<string, unknown>>,
          props,
        ),
      );

      expect(normalizeHtml(compiled[name].html)).toBe(normalizeHtml(reactHtml));
      expect(compiled[name].text).toBe(toPlainText(reactHtml));
    });
  }
});
