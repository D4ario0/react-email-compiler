import { render, toPlainText } from "@react-email/render";
import * as React from "react";
import { Html, Hr, Img, Link, Text } from "react-email";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { compileEmailModule } from "../src/compiler";
import * as runtime from "../src/runtime";

function evaluateCommonJs(code: string) {
  const javascript = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };

  new Function("require", "exports", "module", javascript)(
    (specifier: string) => {
      if (specifier === "react-email-compiler/runtime") return runtime;
      throw new Error(`Unexpected generated import: ${specifier}`);
    },
    module.exports,
    module,
  );
  return module.exports;
}

function normalizeReactHtml(html: string): string {
  return html
    .replaceAll("<!--$-->", "")
    .replaceAll("<!--/$-->", "")
    .replaceAll("<!--html-->", "")
    .replaceAll("<!--head-->", "")
    .replaceAll("<!--body-->", "")
    .replaceAll("<!-- -->", "");
}

type CompatibilityProps = {
  heading: string;
  name: string;
  href: string;
};

function ReferenceCompatibility({ heading, name, href }: CompatibilityProps) {
  return (
    <Html>
      <head>
        <style>{`.hidden { display: none; }`}</style>
        <title>Compiler compatibility</title>
      </head>
      <h1>{heading}</h1>
      <p>
        Hello <b>{name}</b>
      </p>
      <Img src="https://example.com/logo.png" alt="Secret image label" />
      <span data-skip-in-text="true">Hidden preview content</span>
      <p>
        <Link href={href}>Open website</Link>
      </p>
      <p>
        <Link href={href}>{href}</Link>
      </p>
      <Hr />
      <p>
        a<br />b<br />
        <br />c
      </p>
      <p>情報Ⅰサポートチーム · café · 🚀</p>
    </Html>
  );
}

const compatibilitySource = `
  import { Html, Hr, Img, Link } from "react-email";
  export function CompatibilityEmail({ heading, name, href }: {
    heading: string;
    name: string;
    href: string;
  }) {
    return (
      <Html>
        <head>
          <style>{\`.hidden { display: none; }\`}</style>
          <title>Compiler compatibility</title>
        </head>
        <h1>{heading}</h1>
        <p>Hello <b>{name}</b></p>
        <Img src="https://example.com/logo.png" alt="Secret image label" />
        <span data-skip-in-text="true">Hidden preview content</span>
        <p><Link href={href}>Open website</Link></p>
        <p><Link href={href}>{href}</Link></p>
        <Hr />
        <p>a<br />b<br /><br />c</p>
        <p>情報Ⅰサポートチーム · café · 🚀</p>
      </Html>
    );
  }
`;

describe("upstream @react-email/render compatibility", () => {
  it("matches rendering, preload stripping, Unicode, links, skipped content and blocks", async () => {
    const compiledModule = await compileEmailModule(
      compatibilitySource,
      "/emails/Compatibility.email.tsx",
    );
    const generated = evaluateCommonJs(compiledModule.code) as {
      CompatibilityEmail(props: CompatibilityProps): string;
    };
    const props = {
      heading: "iPhone launch",
      name: "Jim & 情報Ⅰ",
      href: "https://example.com/path?q=1&lang=en",
    };

    const expectedHtml = await render(<ReferenceCompatibility {...props} />);
    const actualHtml = String(generated.CompatibilityEmail(props));

    expect(normalizeReactHtml(actualHtml)).toBe(normalizeReactHtml(expectedHtml));
    expect(actualHtml).not.toContain('rel="preload"');
    expect(runtime.renderCompiledEmailText(generated.CompatibilityEmail, props)).toBe(
      toPlainText(expectedHtml),
    );
  });

  it("renders large repeated content without hydration markers", async () => {
    const source = `
      import { Html, Text } from "react-email";
      export function LargeEmail({ items }: { items: string[] }) {
        return <Html>{items.map((item) => <Text key={item}>{item}</Text>)}</Html>;
      }
    `;
    const compiledModule = await compileEmailModule(source, "/emails/Large.email.tsx");
    const generated = evaluateCommonJs(compiledModule.code) as {
      LargeEmail(props: { items: string[] }): string;
    };
    const items = Array.from({ length: 100 }, (_, index) => `Paragraph ${index} 情報Ⅰ`);
    const ReferenceLarge = () => (
      <Html>{items.map((item) => <Text key={item}>{item}</Text>)}</Html>
    );

    const actualHtml = String(generated.LargeEmail({ items }));
    const expectedHtml = await render(<ReferenceLarge />);

    expect(normalizeReactHtml(actualHtml)).toBe(normalizeReactHtml(expectedHtml));
    expect(actualHtml).not.toMatch(/<!--\$|<!--\/\$|<!-- -->/);
    expect(runtime.renderCompiledEmailText(generated.LargeEmail, { items })).toBe(
      toPlainText(expectedHtml),
    );
  });
});
