import { render, toPlainText } from "@react-email/render";
import * as React from "react";
import { Html, Tailwind, Text, type TailwindConfig } from "react-email";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { compileEmailModule, EmailCompilerError } from "../src/compiler";
import { CompilationSession } from "../src/session";
import * as runtime from "../src/runtime";
import { normalizeHtml } from "./helpers/normalize-html";

const tailwindConfig = {
  theme: {
    extend: {
      colors: {
        brand: "#2563eb",
      },
      fontSize: {
        md: ["15px", { lineHeight: "1.6" }],
      },
    },
  },
} satisfies TailwindConfig;

function evaluateCommonJs(code: string) {
  const typescript = ts;
  const javascript = typescript.transpileModule(code, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const load = (specifier: string) => {
    if (specifier === "react-email-compiler/runtime") return runtime;
    throw new Error(`Unexpected generated import: ${specifier}`);
  };

  new Function("require", "exports", "module", javascript)(load, module.exports, module);
  return module.exports;
}

function ReferenceTemplate({ name, items }: { name: string; items: string[] }) {
  return (
    <Tailwind config={tailwindConfig}>
      <Html lang="es">
        <Text className="m-0 text-md text-brand">Hello {name}</Text>
        {items.map((item) => (
          <Text className="m-0" key={item}>
            {item}
          </Text>
        ))}
      </Html>
    </Tailwind>
  );
}

const source = `
import type * as React from "react";
import { Html, Tailwind, Text } from "react-email";

type LayoutProps = { children: React.ReactNode };
type Props = { name: string; items: string[] };

const config = ${JSON.stringify(tailwindConfig)};

function Layout({ children }: LayoutProps) {
  return <Html lang="es">{children}</Html>;
}

export function Template({ name, items }: Props) {
  return (
    <Tailwind config={config}>
      <Layout>
        <Text className="m-0 text-md text-brand">Hello {name}</Text>
        {items.map((item) => (
          <Text className="m-0" key={item}>{item}</Text>
        ))}
      </Layout>
    </Tailwind>
  );
}
`;

describe("compileEmailModule", () => {
  it("compiles .email.tsx modules to React-free string functions", async () => {
    const result = await compileEmailModule(source, "/emails/Welcome.email.tsx", {
      tailwindConfig,
    });

    expect(result.code).not.toContain('from "react-email"');
    expect(result.code).not.toContain("React.createElement");
    expect(result.code).not.toContain('__reactEmailPrimitive("Text"');
    expect(result.code).toContain('from "react-email-compiler/runtime"');

    const generated = evaluateCommonJs(result.code) as {
      Template(props: { name: string; items: string[] }): string;
    };
    const props = {
      name: '<Alex & "team">',
      items: ["First", "<Second>"],
    };

    const actual = String(generated.Template(props));
    const expected = await render(<ReferenceTemplate {...props} />);
    expect(normalizeHtml(actual, { removeEmptyHead: true })).toBe(
      normalizeHtml(expected, { removeEmptyHead: true }),
    );
    expect(runtime.renderCompiledEmailText(generated.Template, props)).toBe(toPlainText(expected));
  });

  it("shares expensive AOT work across a compilation session", async () => {
    const compilationSession = new CompilationSession();
    const options = { compilationSession, tailwindConfig };

    await compileEmailModule(source, "/emails/Session.email.tsx", options);
    const afterFirstCompile = compilationSession.stats();
    await compileEmailModule(source, "/emails/Session.email.tsx", options);
    const afterSecondCompile = compilationSession.stats();

    expect(afterFirstCompile.modules).toBe(1);
    expect(afterSecondCompile.modules).toBe(2);
    expect(afterSecondCompile.cacheHits).toBeGreaterThan(afterFirstCompile.cacheHits);
  });

  it("requires the explicit .email.tsx convention", async () => {
    await expect(compileEmailModule(source, "/emails/Welcome.tsx")).rejects.toThrow(
      "Only .email.tsx modules can be compiled",
    );
  });

  it("requires a Tailwind configuration when Tailwind is used", async () => {
    await expect(compileEmailModule(source, "/emails/Welcome.email.tsx")).rejects.toBeInstanceOf(
      EmailCompilerError,
    );
  });

  it("rejects components imported from ordinary TSX modules", async () => {
    const importedComponent = `
      import { Card } from "./Card.tsx";
      export function Template() {
        return <Card>Hello</Card>;
      }
    `;

    await expect(
      compileEmailModule(importedComponent, "/emails/Imported.email.tsx"),
    ).rejects.toThrow("must be imported from another .email.tsx module");
  });

  it("rejects dynamic Tailwind class names", async () => {
    const dynamicSource = `
      import { Tailwind, Text } from "react-email";
      export function Template({ className }: { className: string }) {
        return <Tailwind><Text className={className}>Hello</Text></Tailwind>;
      }
    `;

    await expect(
      compileEmailModule(dynamicSource, "/emails/Dynamic.email.tsx", { tailwindConfig }),
    ).rejects.toThrow("need statically discoverable string defaults");
  });

  it.each([
    [
      "default React Email imports",
      `import Email from "react-email"; export function Template() { return <div>Hello</div>; }`,
      "Namespace and default imports from react-email are not supported",
    ],
    [
      "unknown React Email primitives",
      `import { Calendar } from "react-email"; export function Template() { return <Calendar>Hello</Calendar>; }`,
      "Unsupported React Email primitive or value: Calendar",
    ],
    [
      "React runtime APIs",
      `import { useState } from "react"; export function Template() { const [value] = useState("x"); return <div>{value}</div>; }`,
      "React runtime APIs are not supported",
    ],
    [
      "dangerouslySetInnerHTML",
      `export function Template({ html }: { html: string }) { return <div dangerouslySetInnerHTML={{ __html: html }} />; }`,
      "dangerouslySetInnerHTML is not supported",
    ],
    [
      "spread children",
      `export function Template({ items }: { items: string[] }) { return <div>{...items}</div>; }`,
      "JSX spread children are not supported",
    ],
  ])("reports an actionable diagnostic for %s", async (_case, invalidSource, message) => {
    await expect(
      compileEmailModule(invalidSource, "/emails/Invalid.email.tsx"),
    ).rejects.toThrow(message);
  });

  it("requires parser-driven primitives to be statically analyzable", async () => {
    const dynamicMarkdown = `
      import { Markdown } from "react-email";
      export function Template({ markdown }: { markdown: string }) {
        return <Markdown>{markdown}</Markdown>;
      }
    `;
    const dynamicCodeBlock = `
      import { CodeBlock } from "react-email";
      export function Template({ code }: { code: string }) {
        return <CodeBlock code={code} language="javascript" theme={{ base: {} }} />;
      }
    `;

    await expect(
      compileEmailModule(dynamicMarkdown, "/emails/Markdown.email.tsx"),
    ).rejects.toThrow("Markdown requires static string children");
    await expect(
      compileEmailModule(dynamicCodeBlock, "/emails/CodeBlock.email.tsx"),
    ).rejects.toThrow("CodeBlock requires statically analyzable props");
  });

  it("forwards static CodeBlock parser errors at compile time", async () => {
    const invalidLanguage = `
      import { CodeBlock } from "react-email";
      export function Template({ title }: { title: string }) {
        return <><div>{title}</div><CodeBlock code="value" language="not-a-language" theme={{ base: {} }} /></>;
      }
    `;

    await expect(
      compileEmailModule(invalidLanguage, "/emails/InvalidCodeBlock.email.tsx"),
    ).rejects.toThrow("There is no language defined on Prism");
  });

  it("precompiles dynamic className defaults used by shared email components", async () => {
    const componentSource = `
      import { Section } from "react-email";
      export function Header({ className = "mb-8 text-center" }: { className?: string }) {
        return <Section className={className}>Header</Section>;
      }
    `;

    const result = await compileEmailModule(componentSource, "/emails/Header.email.tsx", {
      tailwindConfig,
    });
    const generated = evaluateCommonJs(result.code) as {
      Header(props: { className?: string }): string;
    };

    expect(String(generated.Header({}))).toContain("margin-bottom:2rem");
    expect(String(generated.Header({}))).toContain("text-align:center");
  });
});
