import { join, resolve } from "node:path";
import { render, toPlainText } from "@react-email/render";
import * as React from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ReactEmailCompiler from "../src/vite";
import { CodeBlockMatrixEmail } from "./fixtures/diverse/CodeBlockMatrix.email";
import { InternationalEmail } from "./fixtures/diverse/International.email";
import { LanguageMatrixEmail } from "./fixtures/diverse/LanguageMatrix.email";
import { MarkdownUpstreamEmail } from "./fixtures/diverse/MarkdownUpstream.email";
import { NewsletterEmail } from "./fixtures/diverse/Newsletter.email";
import { PrimitiveMatrixEmail } from "./fixtures/diverse/PrimitiveMatrix.email";
import { ReceiptEmail } from "./fixtures/diverse/Receipt.email";
import { RemainingPrimitivesEmail } from "./fixtures/diverse/RemainingPrimitives.email";
import { SecurityAlertEmail } from "./fixtures/diverse/SecurityAlert.email";
import { StaticMaintenanceEmail } from "./fixtures/diverse/StaticMaintenance.email";
import { StaticRichContentEmail } from "./fixtures/diverse/StaticRichContent.email";
import { buildViteFixture, type BuiltViteFixture } from "./helpers/build-fixture";
import { normalizeHtml } from "./helpers/normalize-html";

const fixtureDirectory = resolve("test/fixtures/diverse");
const fixtures = {
  receipt: {
    Template: ReceiptEmail,
    props: {
      customer: '<Alex & "team">',
      orderId: "order-2048",
      items: [
        { name: "Mechanical keyboard", quantity: 1, price: "$129.00" },
        { name: "USB-C cable <2m>", quantity: 2, price: "$18.50" },
      ],
      discount: "SAVE & SHIP",
      receiptUrl: "https://example.com/receipt?id=2048&format=html",
    },
  },
  newsletter: {
    Template: NewsletterEmail,
    props: {
      title: "Engineering Weekly <Issue 42>",
      stories: [
        {
          title: "AOT compilation",
          summary: "Remove runtime work & ship less JavaScript.",
          url: "https://example.com/aot?source=email&issue=42",
        },
        {
          title: "Unicode in production 🚀",
          summary: "Handling café, résumé, and 日本語 correctly.",
          url: "https://example.com/unicode",
        },
      ],
      footerNote: null,
    },
  },
  securityRecognized: {
    Template: SecurityAlertEmail,
    props: {
      device: "Firefox on Linux",
      location: "Reykjavík, Iceland",
      recognized: true,
      reviewUrl: "https://example.com/security",
      recoverySteps: [],
    },
  },
  securityUnknown: {
    Template: SecurityAlertEmail,
    props: {
      device: "Unknown <browser>",
      location: "São Paulo & nearby",
      recognized: false,
      reviewUrl: "https://example.com/security?event=42&action=review",
      recoverySteps: ["Change your password", "Enable 2FA", "Review active sessions"],
    },
  },
  international: {
    Template: InternationalEmail,
    props: {
      language: "ar",
      direction: "rtl" as const,
      recipient: "ليلى & 山田",
      messages: ["تم تأكيد حسابك", "アカウントが確認されました", "Your account is ready 🎉"],
    },
  },
  languageMatrix: {
    Template: LanguageMatrixEmail,
    props: {
      enabled: true,
      groups: [
        {
          title: "Documentation & guides",
          links: [
            { label: "Compiler <overview>", url: "https://example.com/compiler?a=1&b=2" },
            { label: "API reference", url: "https://example.com/api" },
          ],
        },
        { title: "Empty group", links: [] },
      ],
    },
  },
  remainingPrimitives: {
    Template: RemainingPrimitivesEmail,
    props: {
      title: "Complete primitive coverage <AOT>",
      inlineCode: "pnpm check && pnpm bench",
    },
  },
  primitiveMatrixDefaults: {
    Template: PrimitiveMatrixEmail,
    props: {
      headingAs: "h1" as const,
      heading: "Default-like matrix & attributes",
      margin: 0,
      rowLabel: "Two-column layout",
      leftWidth: "60%",
      rightWidth: "40%",
      inlineCode: "const x = '<safe>';",
      includeWebFont: false,
    },
  },
  primitiveMatrixOverrides: {
    Template: PrimitiveMatrixEmail,
    props: {
      headingAs: "h6" as const,
      heading: "Overrides 日本語 🚀",
      margin: "-12.5",
      invalidMargin: "invalid",
      rowLabel: "Overridden layout",
      leftWidth: "1",
      rightWidth: "99%",
      inlineCode: "pnpm check && echo café",
      codeClass: "custom-code",
      includeWebFont: true,
    },
  },
  markdownUpstream: {
    Template: MarkdownUpstreamEmail,
    props: { label: "Upstream-inspired Markdown coverage" },
    textParity: "semantic" as const,
  },
  codeBlockMatrix: {
    Template: CodeBlockMatrixEmail,
    props: { title: "Three highlighted languages" },
    textParity: "semantic" as const,
  },
  staticMaintenance: {
    Template: StaticMaintenanceEmail,
    props: {},
  },
  staticRichContent: {
    Template: StaticRichContentEmail,
    props: {},
  },
};

type Rendered = { html: string; text: string };
type FixtureName = keyof typeof fixtures;

let builtFixture: BuiltViteFixture<{ compiled: Record<FixtureName, Rendered> }>;

function normalizeSemanticText(text: string): string {
  return text
    .replaceAll("\u00a0", " ")
    .replace(/[\u200b\u200d]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

beforeAll(async () => {
  const imports = ([
    ["ReceiptEmail", "Receipt.email.tsx"],
    ["NewsletterEmail", "Newsletter.email.tsx"],
    ["PrimitiveMatrixEmail", "PrimitiveMatrix.email.tsx"],
    ["MarkdownUpstreamEmail", "MarkdownUpstream.email.tsx"],
    ["CodeBlockMatrixEmail", "CodeBlockMatrix.email.tsx"],
    ["SecurityAlertEmail", "SecurityAlert.email.tsx"],
    ["InternationalEmail", "International.email.tsx"],
    ["LanguageMatrixEmail", "LanguageMatrix.email.tsx"],
    ["RemainingPrimitivesEmail", "RemainingPrimitives.email.tsx"],
    ["StaticMaintenanceEmail", "StaticMaintenance.email.tsx"],
    ["StaticRichContentEmail", "StaticRichContent.email.tsx"],
  ] as const)
    .map(([name, file]) => `import { ${name} } from ${JSON.stringify(join(fixtureDirectory, file))};`)
    .join("\n");
  const serializableProps = Object.fromEntries(
    Object.entries(fixtures).map(([name, fixture]) => [name, fixture.props]),
  );

  builtFixture = await buildViteFixture({
    prefix: "react-email-diverse-fixtures-",
    files: {
      "entry.ts": `${imports}
        import { render, toPlainText } from "@react-email/render";
        const props = ${JSON.stringify(serializableProps)};
        const renderBoth = async (Template, value) => {
          const html = await render(Template(value));
          return { html, text: toPlainText(html) };
        };
        export const compiled = {
          receipt: await renderBoth(ReceiptEmail, props.receipt),
          newsletter: await renderBoth(NewsletterEmail, props.newsletter),
          securityRecognized: await renderBoth(SecurityAlertEmail, props.securityRecognized),
          securityUnknown: await renderBoth(SecurityAlertEmail, props.securityUnknown),
          international: await renderBoth(InternationalEmail, props.international),
          languageMatrix: await renderBoth(LanguageMatrixEmail, props.languageMatrix),
          remainingPrimitives: await renderBoth(RemainingPrimitivesEmail, props.remainingPrimitives),
          primitiveMatrixDefaults: await renderBoth(PrimitiveMatrixEmail, props.primitiveMatrixDefaults),
          primitiveMatrixOverrides: await renderBoth(PrimitiveMatrixEmail, props.primitiveMatrixOverrides),
          markdownUpstream: await renderBoth(MarkdownUpstreamEmail, props.markdownUpstream),
          codeBlockMatrix: await renderBoth(CodeBlockMatrixEmail, props.codeBlockMatrix),
          staticMaintenance: await renderBoth(StaticMaintenanceEmail, props.staticMaintenance),
          staticRichContent: await renderBoth(StaticRichContentEmail, props.staticRichContent),
        };
      `,
    },
    config: {
      plugins: [ReactEmailCompiler({ runtimeModule: resolve("src/runtime.ts") })],
    },
  });
});

afterAll(async () => {
  await builtFixture?.cleanup();
});

describe("diverse template corpus", () => {
  it("produces one React-free bundle for the complete fixture corpus", () => {
    expect(builtFixture.code).not.toMatch(
      /from\s*["'](?:react|react-dom|react-email|@react-email\/render)/,
    );
  });

  for (const [name, fixture] of Object.entries(fixtures) as Array<
    [FixtureName, (typeof fixtures)[FixtureName]]
  >) {
    it(`matches React Email HTML and text for ${name}`, async () => {
      const expectedHtml = await render(
        React.createElement(
          fixture.Template as React.ComponentType<Record<string, unknown>>,
          fixture.props,
        ),
      );

      expect(normalizeHtml(builtFixture.exports.compiled[name].html)).toBe(normalizeHtml(expectedHtml));
      const expectedText = toPlainText(expectedHtml);
      if ("textParity" in fixture && fixture.textParity === "semantic") {
        expect(normalizeSemanticText(builtFixture.exports.compiled[name].text)).toBe(normalizeSemanticText(expectedText));
      } else {
        expect(builtFixture.exports.compiled[name].text).toBe(expectedText);
      }
    });
  }
});
