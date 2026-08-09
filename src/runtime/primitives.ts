import { buttonPrimitive } from "./button";
import { htmlPrimitive, previewPrimitive } from "./document";
import { element } from "./html";
import { computeMargins, splitTableStyle } from "./layout";
import type { EmailProps } from "./types";

function headingPrimitive(props: EmailProps, children: string): string {
  const {
    as = "h1",
    style: rawStyle,
    m,
    mx,
    my,
    mt,
    mr,
    mb,
    ml,
    ...attributes
  } = props;
  const style = (rawStyle && typeof rawStyle === "object" ? rawStyle : {}) as EmailProps;
  const margins: EmailProps = {};
  const applyMargin = (value: unknown, properties: string[]) => {
    if (value === undefined || Number.isNaN(Number.parseFloat(String(value)))) return;
    for (const property of properties) margins[property] = `${String(value)}px`;
  };
  applyMargin(m, ["margin"]);
  applyMargin(mx, ["marginLeft", "marginRight"]);
  applyMargin(my, ["marginTop", "marginBottom"]);
  applyMargin(mt, ["marginTop"]);
  applyMargin(mr, ["marginRight"]);
  applyMargin(mb, ["marginBottom"]);
  applyMargin(ml, ["marginLeft"]);
  return element(String(as), { ...attributes, style: { ...margins, ...style } }, children);
}

function rowPrimitive(props: EmailProps, children: string): string {
  const { style, ...attributes } = props;
  return element(
    "table",
    {
      align: "center",
      width: "100%",
      border: 0,
      cellPadding: "0",
      cellSpacing: "0",
      role: "presentation",
      ...attributes,
      style,
    },
    element(
      "tbody",
      { style: { width: "100%" } },
      element("tr", { style: { width: "100%" } }, children),
    ),
  );
}

function columnPrimitive(props: EmailProps, children: string): string {
  const { style, ...attributes } = props;
  return element("td", { ...attributes, "data-id": "__react-email-column", style }, children);
}

function fontPrimitive(props: EmailProps): string {
  const {
    fontFamily,
    fallbackFontFamily,
    webFont,
    fontStyle = "normal",
    fontWeight = 400,
  } = props;
  const fallbacks = Array.isArray(fallbackFontFamily)
    ? fallbackFontFamily.map(String)
    : [String(fallbackFontFamily)];
  const web = webFont && typeof webFont === "object" ? (webFont as EmailProps) : undefined;
  const src = web ? `src: url(${String(web.url)}) format('${String(web.format)}');` : "";
  const css = `
    @font-face {
      font-family: '${String(fontFamily)}';
      font-style: ${String(fontStyle)};
      font-weight: ${String(fontWeight)};
      mso-font-alt: '${fallbacks[0]}';
      ${src}
    }

    * {
      font-family: '${String(fontFamily)}', ${fallbacks.join(", ")};
    }
  `;
  return element("style", { dangerouslySetInnerHTML: { __html: css } });
}

function codeInlinePrimitive(props: EmailProps, children: string): string {
  const className = props.className;
  const rawStyle = props.style;
  const style = (rawStyle && typeof rawStyle === "object" ? rawStyle : {}) as EmailProps;
  const baseClass = className ? String(className) : "";
  const compatibilityCss = `
        meta ~ .cino {
          display: none !important;
          opacity: 0 !important;
        }

        meta ~ .cio {
          display: block !important;
        }
      `;
  return (
    element("style", null, compatibilityCss) +
    element("code", { ...props, className: `${baseClass} cino` }, children) +
    element(
      "span",
      { ...props, className: `${baseClass} cio`, style: { display: "none", ...style } },
      children,
    )
  );
}

export function sectionPrimitive(props: EmailProps, children: string): string {
  const { style: rawStyle, ...attributes } = props;
  const style = (rawStyle && typeof rawStyle === "object" ? rawStyle : {}) as EmailProps;
  const { tableStyle, cellStyle } = splitTableStyle(style);
  return element(
    "table",
    {
      align: "center",
      width: "100%",
      border: 0,
      cellPadding: "0",
      cellSpacing: "0",
      role: "presentation",
      ...attributes,
      style: tableStyle,
    },
    element("tbody", null, element("tr", null, element("td", { style: cellStyle }, children))),
  );
}

export function imgPrimitive(props: EmailProps): string {
  const { alt = "", src, width, height, style: rawStyle, ...attributes } = props;
  const style = (rawStyle && typeof rawStyle === "object" ? rawStyle : {}) as EmailProps;
  return element("img", {
    ...attributes,
    alt,
    height,
    src,
    style: { display: "block", outline: "none", border: "none", textDecoration: "none", ...style },
    width,
  });
}

export function primitive(name: string, props: EmailProps | null | undefined, children = ""): string {
  const input = props ?? {};

  switch (name) {
    case "Tailwind":
      return children;
    case "Html":
      return htmlPrimitive(input, children);
    case "Heading":
      return headingPrimitive(input, children);
    case "Row":
      return rowPrimitive(input, children);
    case "Column":
      return columnPrimitive(input, children);
    case "Font":
      return fontPrimitive(input);
    case "CodeInline":
      return codeInlinePrimitive(input, children);
    case "CodeBlock":
    case "Markdown":
      throw new TypeError(`${name} must be statically rendered by the AOT compiler`);
    case "Head":
      return element(
        "head",
        input,
        element("meta", { content: "text/html; charset=UTF-8", httpEquiv: "Content-Type" }) +
          element("meta", { name: "x-apple-disable-message-reformatting" }) +
          children,
      );
    case "Body": {
      const { style: rawStyle, dir = "ltr", lang = "en", ...attributes } = input;
      const style = (rawStyle && typeof rawStyle === "object" ? rawStyle : {}) as EmailProps;
      const bodyStyle: EmailProps = {
        background: style.background,
        backgroundColor: style.backgroundColor,
      };
      for (const property of [
        "margin",
        "marginTop",
        "marginRight",
        "marginBottom",
        "marginLeft",
        "padding",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
      ]) {
        if (style[property] !== undefined) bodyStyle[property] = 0;
      }
      const table = element(
        "table",
        { border: 0, width: "100%", cellPadding: "0", cellSpacing: "0", role: "presentation", align: "center" },
        element("tbody", null, element("tr", null, element("td", { dir, lang, style }, children))),
      );
      return element("body", { ...attributes, dir, lang, style: bodyStyle }, table);
    }
    case "Container": {
      const { style: rawStyle, ...attributes } = input;
      const style = (rawStyle && typeof rawStyle === "object" ? rawStyle : {}) as EmailProps;
      const { tableStyle, cellStyle } = splitTableStyle(style);
      return element(
        "table",
        {
          align: "center",
          width: "100%",
          ...attributes,
          border: 0,
          cellPadding: "0",
          cellSpacing: "0",
          role: "presentation",
          style: { maxWidth: "37.5em", ...tableStyle },
        },
        element("tbody", null, element("tr", { style: { width: "100%" } }, element("td", { style: cellStyle }, children))),
      );
    }
    case "Section":
      return sectionPrimitive(input, children);
    case "Text": {
      const { style: rawStyle, ...attributes } = input;
      const style = (rawStyle && typeof rawStyle === "object" ? rawStyle : {}) as EmailProps;
      return element(
        "p",
        {
          ...attributes,
          style: { fontSize: "14px", lineHeight: "24px", ...style, ...computeMargins(style) },
        },
        children,
      );
    }
    case "Hr": {
      const { style: rawStyle, ...attributes } = input;
      const style = (rawStyle && typeof rawStyle === "object" ? rawStyle : {}) as EmailProps;
      return element("hr", {
        ...attributes,
        style: {
          width: "100%",
          border: "none",
          borderColor: "transparent",
          borderTop: "1px solid #eaeaea",
          ...style,
        },
      });
    }
    case "Img":
      return imgPrimitive(input);
    case "Link": {
      const { target = "_blank", style: rawStyle, ...attributes } = input;
      const style = (rawStyle && typeof rawStyle === "object" ? rawStyle : {}) as EmailProps;
      return element(
        "a",
        { ...attributes, style: { color: "#067df7", textDecorationLine: "none", ...style }, target },
        children,
      );
    }
    case "Button":
      return buttonPrimitive(input, children);
    case "Preview":
      return previewPrimitive(input, children);
    default:
      throw new Error(`Unsupported React Email primitive: ${name}`);
  }
}
