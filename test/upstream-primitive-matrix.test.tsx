import { render } from "@react-email/render";
import * as React from "react";
import { CodeInline, Column, Font, Heading, Row } from "react-email";
import { describe, expect, it } from "vitest";
import { escapeText, primitive } from "../src/runtime";

const doctype =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

function fragment(html: string): string {
  return html
    .replace(doctype, "")
    .replaceAll("<!--$-->", "")
    .replaceAll("<!--/$-->", "")
    .replaceAll("<!-- -->", "");
}

type PrimitiveCase = {
  name: "Heading" | "Row" | "Column" | "Font" | "CodeInline";
  Component: React.ElementType;
  props: Record<string, unknown>;
  children?: string;
};

const cases: Array<[string, PrimitiveCase]> = [
  ["Heading defaults", { name: "Heading", Component: Heading, props: {}, children: "Default" }],
  [
    "Heading levels and x-axis margin",
    { name: "Heading", Component: Heading, props: { as: "h2", mx: 4 }, children: "Level two" },
  ],
  [
    "Heading margin precedence",
    {
      name: "Heading",
      Component: Heading,
      props: { m: 20, mx: 10, my: 8, mt: 5, style: { marginLeft: "99px", color: "red" } },
      children: "Precedence",
    },
  ],
  [
    "Heading decimal and negative margins",
    {
      name: "Heading",
      Component: Heading,
      props: { as: "h6", mt: "-2.5", mb: 0 },
      children: "Boundary",
    },
  ],
  [
    "Heading invalid margins",
    {
      name: "Heading",
      Component: Heading,
      props: { m: "invalid", mt: "5", mx: "also-invalid" },
      children: "Invalid ignored",
    },
  ],
  ["Row empty", { name: "Row", Component: Row, props: {} }],
  [
    "Row attributes and styles",
    {
      name: "Row",
      Component: Row,
      props: { "data-testid": "row", "aria-label": "layout", style: { backgroundColor: "red" } },
      children: "Row child",
    },
  ],
  ["Column defaults", { name: "Column", Component: Column, props: {}, children: "Column" }],
  [
    "Column attributes and styles",
    {
      name: "Column",
      Component: Column,
      props: { width: "50%", align: "right", style: { paddingLeft: 12 } },
      children: "Right",
    },
  ],
  [
    "Font defaults",
    {
      name: "Font",
      Component: Font,
      props: { fontFamily: "Arial", fallbackFontFamily: "Helvetica" },
    },
  ],
  [
    "Font web source",
    {
      name: "Font",
      Component: Font,
      props: {
        fontFamily: "Example",
        fallbackFontFamily: "Verdana",
        webFont: { url: "https://example.com/font.woff2", format: "woff2" },
        fontStyle: "italic",
        fontWeight: 700,
      },
    },
  ],
  [
    "Font fallback list",
    {
      name: "Font",
      Component: Font,
      props: { fontFamily: "Inter", fallbackFontFamily: ["Arial", "Helvetica", "sans-serif"] },
    },
  ],
  [
    "CodeInline defaults",
    { name: "CodeInline", Component: CodeInline, props: {}, children: "const value = 42;" },
  ],
  [
    "CodeInline custom props",
    {
      name: "CodeInline",
      Component: CodeInline,
      props: { className: "custom", title: "snippet", style: { color: "purple" } },
      children: '<tag> & "quoted"',
    },
  ],
  [
    "CodeInline Unicode",
    { name: "CodeInline", Component: CodeInline, props: { dir: "rtl" }, children: "日本語 café مرحبا 🚀" },
  ],
];

describe("upstream-inspired primitive property matrix", () => {
  it.each(cases)("matches React Email for %s", async (_label, testCase) => {
    const expected = await render(
      React.createElement(testCase.Component, testCase.props, testCase.children),
    );
    const actual = primitive(
      testCase.name,
      testCase.props,
      testCase.children === undefined ? "" : escapeText(testCase.children),
    );

    expect(actual).toBe(fragment(expected));
  });
});
