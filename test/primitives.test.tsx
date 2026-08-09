import { render } from "@react-email/render";
import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";
import { describe, expect, it } from "vitest";
import { element, primitive } from "../src/runtime";

function normalize(html: string): string {
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

function Reference() {
  return (
    <Html lang="es">
      <Head>
        <meta name="color-scheme" content="light" />
      </Head>
      <Body style={{ backgroundColor: "#fff", padding: "8px" }}>
        <Preview>Inbox preview</Preview>
        <Container style={{ maxWidth: "560px", padding: "24px" }}>
          <Section style={{ paddingTop: "8px" }}>
            <Img src="https://example.com/logo.png" width="170" alt="Logo" />
            <Text style={{ margin: 0 }}>
              Hello <Link href="https://example.com">website</Link>
            </Text>
            <Button href="https://example.com/action" style={{ padding: "12px 20px" }}>
              Continue
            </Button>
            <Hr />
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function Compiled(): string {
  const head = primitive(
    "Head",
    {},
    element("meta", { name: "color-scheme", content: "light" }),
  );
  const preview = primitive("Preview", {}, "Inbox preview");
  const image = primitive("Img", {
    src: "https://example.com/logo.png",
    width: "170",
    alt: "Logo",
  });
  const link = primitive("Link", { href: "https://example.com" }, "website");
  const text = primitive("Text", { style: { margin: 0 } }, `Hello ${link}`);
  const button = primitive(
    "Button",
    { href: "https://example.com/action", style: { padding: "12px 20px" } },
    "Continue",
  );
  const section = primitive(
    "Section",
    { style: { paddingTop: "8px" } },
    image + text + button + primitive("Hr", {}),
  );
  const container = primitive(
    "Container",
    { style: { maxWidth: "560px", padding: "24px" } },
    section,
  );
  const body = primitive(
    "Body",
    { style: { backgroundColor: "#fff", padding: "8px" } },
    preview + container,
  );
  return primitive("Html", { lang: "es" }, head + body);
}

describe("React Email primitive runtime", () => {
  it("matches the supported React Email primitive semantics", async () => {
    expect(normalize(Compiled())).toBe(normalize(await render(<Reference />)));
  });
});
