import { resolve } from "node:path";
import { render, toPlainText } from "@react-email/render";
import * as React from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ReactEmailCompiler from "../src/vite";
import { AccountAccessEmail } from "./fixtures/email-package/emails/AccountAccess.email";
import { IncidentEmail } from "./fixtures/email-package/emails/Incident.email";
import { fixtureTailwindConfig } from "./fixtures/email-package/tailwind.email";
import { buildViteFixture, type BuiltViteFixture } from "./helpers/build-fixture";
import { normalizeHtml } from "./helpers/normalize-html";

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

let builtFixture: BuiltViteFixture<{ compiled: CompiledResults }>;

beforeAll(async () => {
  builtFixture = await buildViteFixture({
    prefix: "react-email-fixture-parity-",
    files: {
      "entry.ts": `
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
    },
    config: {
      plugins: [
        ReactEmailCompiler({
          runtimeModule: resolve("src/runtime.ts"),
          tailwindConfig: fixtureTailwindConfig,
        }),
      ],
    },
  });
});

afterAll(async () => {
  await builtFixture?.cleanup();
});

const cases = [
  ["accountLink", AccountAccessEmail],
  ["accountCode", AccountAccessEmail],
  ["incident", IncidentEmail],
] as const;

describe("generic fixture package parity", () => {
  it("replaces the renderer and produces a compiler-free, React-free bundle", () => {
    expect(builtFixture.code).not.toMatch(
      /from\s*["'](?:react|react-dom|react-email|@react-email\/render)/,
    );
    expect(builtFixture.code).not.toContain("@react-email/render");
    expect(builtFixture.code).not.toContain("react-email-compiler");
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
      const compiled = builtFixture.exports.compiled[name];
      expect(normalizeHtml(compiled.html)).toBe(normalizeHtml(reactHtml));
      expect(compiled.text).toBe(toPlainText(reactHtml));
    });
  }
});
