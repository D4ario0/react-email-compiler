import { DOCTYPE, element, escapeText } from "./html";
import type { EmailProps } from "./types";

function decodeEscapedText(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");
}

const PREVIEW_START = "<!--compiled-email-preview:start-->";
const PREVIEW_END = "<!--compiled-email-preview:end-->";

export function previewPrimitive(props: EmailProps, children: string): string {
  const { useTitleTag = true, ...attributes } = props;
  const text = decodeEscapedText(children).substring(0, 200);
  const renderedText = escapeText(text);
  const whitespace = "\u00a0\u200c\u200b\u200d\u200e\u200f\ufeff".repeat(Math.max(0, 200 - text.length));

  return (
    (useTitleTag ? element("title", null, renderedText) : "") +
    PREVIEW_START +
    element(
      "div",
      {
        style: {
          display: "none",
          overflow: "hidden",
          lineHeight: "1px",
          opacity: 0,
          maxHeight: 0,
          maxWidth: 0,
        },
        "data-skip-in-text": true,
        ...attributes,
      },
      renderedText + (whitespace ? element("div", null, whitespace) : ""),
    ) +
    PREVIEW_END
  );
}

function insertDocumentTitles(children: string, titles: string): string {
  if (!titles && children.includes("<head")) return children;
  if (!titles) return `<head></head>${children}`;

  const withoutTitles = children.replaceAll(/<title>.*?<\/title>/gs, "");
  const headEnd = withoutTitles.indexOf("</head>");
  if (headEnd < 0) return `<head>${titles}</head>${withoutTitles}`;

  const firstStyle = withoutTitles.indexOf("<style", withoutTitles.indexOf("<head"));
  const insertionPoint = firstStyle >= 0 && firstStyle < headEnd ? firstStyle : headEnd;
  return withoutTitles.slice(0, insertionPoint) + titles + withoutTitles.slice(insertionPoint);
}

function relocateDocumentPreview(children: string): string {
  const previewStart = children.indexOf(PREVIEW_START);
  if (previewStart < 0) return children;

  const previewEnd = children.indexOf(PREVIEW_END, previewStart);
  if (previewEnd < 0) return children;

  const bodyStart = children.indexOf("<body");
  if (bodyStart < 0 || previewStart >= bodyStart) {
    return children.replace(PREVIEW_START, "").replace(PREVIEW_END, "");
  }

  const preview = children.slice(previewStart + PREVIEW_START.length, previewEnd);
  const withoutPreview =
    children.slice(0, previewStart) + children.slice(previewEnd + PREVIEW_END.length);
  const movedBodyStart = withoutPreview.indexOf("<body");
  const bodyOpenEnd = withoutPreview.indexOf(">", movedBodyStart);
  if (bodyOpenEnd < 0) return withoutPreview + preview;

  return (
    withoutPreview.slice(0, bodyOpenEnd + 1) +
    preview +
    withoutPreview.slice(bodyOpenEnd + 1)
  );
}

export function htmlPrimitive(props: EmailProps, children: string): string {
  const { lang = "en", dir = "ltr", ...attributes } = props;
  const titles = children.match(/<title>.*?<\/title>/gs)?.join("") ?? "";
  const documentChildren = relocateDocumentPreview(insertDocumentTitles(children, titles));
  return DOCTYPE + element("html", { ...attributes, dir, lang }, documentChildren);
}

