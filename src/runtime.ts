export type EmailProps = Record<string, unknown>;
export type CompilableEmail<Props> = (props: Props) => unknown;
export interface CompiledEmail {
  html: string;
  text: string;
}

const COMPILED_EMAIL_VALUE = Symbol.for("compiled-email.value");
const COMPILED_EMAIL_TEXT = Symbol.for("compiled-email.text");

export type CompiledEmailValue = String & {
  [COMPILED_EMAIL_VALUE]: true;
  [COMPILED_EMAIL_TEXT]: () => string;
};

export function compiledEmailValue(html: unknown, renderText: () => unknown): CompiledEmailValue {
  const value = new String(assertCompiledString(html)) as CompiledEmailValue;
  let text: string | undefined;
  Object.defineProperties(value, {
    [COMPILED_EMAIL_VALUE]: { value: true },
    [COMPILED_EMAIL_TEXT]: {
      value: () => (text ??= assertCompiledString(renderText())),
    },
  });
  return value;
}

function isCompiledEmailValue(value: unknown): value is CompiledEmailValue {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Partial<CompiledEmailValue>)[COMPILED_EMAIL_VALUE] === true,
  );
}

const renderedTextByHtml = new Map<string, string>();

function rememberRenderedText(html: string, text: string): void {
  renderedTextByHtml.delete(html);
  renderedTextByHtml.set(html, text);
  if (renderedTextByHtml.size > 128) {
    const oldest = renderedTextByHtml.keys().next().value;
    if (oldest !== undefined) renderedTextByHtml.delete(oldest);
  }
}

export async function renderEmailValue(
  value: unknown,
  options: { plainText?: boolean; pretty?: boolean } = {},
): Promise<string> {
  if (!isCompiledEmailValue(value)) {
    throw new TypeError(
      "render() received an uncompiled value. Call an AOT-compiled .email.tsx component directly.",
    );
  }
  if (options.pretty) {
    throw new TypeError("The AOT render replacement does not support pretty output");
  }
  const html = String(value);
  const text = value[COMPILED_EMAIL_TEXT]();
  if (options.plainText) return text;
  rememberRenderedText(html, text);
  return html;
}

export function toPlainTextEmailValue(html: unknown): string {
  if (isCompiledEmailValue(html)) return html[COMPILED_EMAIL_TEXT]();
  const value = String(html);
  const text = renderedTextByHtml.get(value);
  if (text !== undefined) return text;
  throw new TypeError(
    "toPlainText() received HTML that was not produced by the AOT render replacement",
  );
}

type CompiledTemplate<Props> = CompilableEmail<Props> & {
  __reactEmailText?: (props: Props) => unknown;
  __reactEmailTextFinalized?: boolean;
};

function assertCompiledString(output: unknown): string {
  if (isCompiledEmailValue(output)) return String(output);
  if (typeof output !== "string") {
    throw new TypeError(
      "The email template did not return a string. Ensure the .email.tsx module was processed by the AOT email plugin.",
    );
  }
  return output;
}

export function renderCompiledEmail<Props>(template: CompilableEmail<Props>, props: Props): string {
  return assertCompiledString(template(props));
}

export function renderCompiledEmailText<Props>(
  template: CompilableEmail<Props>,
  props: Props,
): string {
  const compiled = template as CompiledTemplate<Props>;
  const textTemplate = compiled.__reactEmailText;
  if (!textTemplate) {
    throw new TypeError(
      "The email template has no plain-text renderer. Ensure it was processed by the AOT email plugin.",
    );
  }
  const text = assertCompiledString(textTemplate(props));
  return compiled.__reactEmailTextFinalized ? text : finalizeText(text);
}

export function renderCompiledTemplate<Props>(
  template: CompilableEmail<Props>,
  props: Props,
): CompiledEmail {
  return {
    html: renderCompiledEmail(template, props),
    text: renderCompiledEmailText(template, props),
  };
}

export function attachTextRenderer<Props>(
  template: CompilableEmail<Props>,
  textTemplate: (props: Props) => unknown,
  finalized = false,
): void {
  Object.defineProperty(template, "__reactEmailText", {
    configurable: false,
    enumerable: false,
    value: textTemplate,
    writable: false,
  });
  if (finalized) {
    Object.defineProperty(template, "__reactEmailTextFinalized", {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    });
  }
}

const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

const ATTRIBUTE_NAMES: Record<string, string> = {
  acceptCharset: "accept-charset",
  charSet: "charset",
  className: "class",
  colSpan: "colspan",
  crossOrigin: "crossorigin",
  dateTime: "datetime",
  formAction: "formaction",
  formEncType: "formenctype",
  formMethod: "formmethod",
  formNoValidate: "formnovalidate",
  formTarget: "formtarget",
  frameBorder: "frameborder",
  htmlFor: "for",
  httpEquiv: "http-equiv",
  maxLength: "maxlength",
  readOnly: "readonly",
  referrerPolicy: "referrerpolicy",
  rowSpan: "rowspan",
  srcSet: "srcset",
  tabIndex: "tabindex",
  useMap: "usemap",
};

const BOOLEAN_ATTRIBUTES = new Set([
  "allowFullScreen",
  "async",
  "autoFocus",
  "autoPlay",
  "controls",
  "default",
  "defer",
  "disabled",
  "formNoValidate",
  "hidden",
  "loop",
  "multiple",
  "muted",
  "noValidate",
  "open",
  "playsInline",
  "readOnly",
  "required",
  "reversed",
  "selected",
]);

const UNITLESS_STYLES = new Set([
  "animationIterationCount",
  "borderImageOutset",
  "borderImageSlice",
  "borderImageWidth",
  "boxFlex",
  "boxFlexGroup",
  "boxOrdinalGroup",
  "columnCount",
  "columns",
  "fillOpacity",
  "flex",
  "flexGrow",
  "flexNegative",
  "flexOrder",
  "flexPositive",
  "flexShrink",
  "floodOpacity",
  "fontWeight",
  "gridArea",
  "gridColumn",
  "gridColumnEnd",
  "gridColumnSpan",
  "gridColumnStart",
  "gridRow",
  "gridRowEnd",
  "gridRowSpan",
  "gridRowStart",
  "lineClamp",
  "lineHeight",
  "opacity",
  "order",
  "orphans",
  "scale",
  "stopOpacity",
  "strokeDasharray",
  "strokeDashoffset",
  "strokeMiterlimit",
  "strokeOpacity",
  "strokeWidth",
  "tabSize",
  "widows",
  "zIndex",
  "zoom",
]);

export function escapeText(value: unknown): string {
  if (value === null || value === undefined || value === false || value === true) return "";

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

export function escapeAttribute(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

export function raw(value: unknown): string {
  if (value === null || value === undefined || value === false || value === true) return "";
  if (Array.isArray(value)) return value.map(raw).join("");
  return String(value);
}

export interface CompiledClassName {
  className?: string;
  style: EmailProps;
}

export function tailwindClassProps(
  className: unknown,
  compiled: Record<string, CompiledClassName>,
  style?: unknown,
): EmailProps {
  const value = className === null || className === undefined ? "" : String(className);
  const match = compiled[value];
  const explicitStyle = style && typeof style === "object" ? (style as EmailProps) : {};

  if (!match) {
    return {
      ...(value ? { className: value } : {}),
      ...(Object.keys(explicitStyle).length > 0 ? { style: explicitStyle } : {}),
    };
  }

  return {
    ...(match.className ? { className: match.className } : {}),
    style: { ...match.style, ...explicitStyle },
  };
}

export const textValue = raw;

const HEADING_BREAK = "\uE000";

export function finalizeText(value: string): string {
  return value
    .replaceAll("\u00a0", " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replaceAll(HEADING_BREAK, "\n")
    .trim();
}

function textLink(props: EmailProps, children: string): string {
  const href = props.href === null || props.href === undefined ? "" : String(props.href);
  if (!href || href === children) return children;
  return `${children} ${href}`;
}

export function textElement(tag: string, props: EmailProps | null | undefined, children = ""): string {
  const input = props ?? {};
  if (input["data-skip-in-text"] === true || input["data-skip-in-text"] === "true") return "";

  switch (tag) {
    case "style":
    case "script":
    case "meta":
    case "img":
      return "";
    case "br":
      return "\n";
    case "hr":
      return `\n\n${"-".repeat(40)}\n\n`; 
    case "a":
      return textLink(input, children);
    case "title":
      return children;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return `${HEADING_BREAK.repeat(3)}${children.toUpperCase()}\n\n`;
    case "p":
    case "div":
      return `\n\n${children}\n\n`;
    default:
      return children;
  }
}

export function textPrimitive(
  name: string,
  props: EmailProps | null | undefined,
  children = "",
): string {
  const input = props ?? {};
  if (input["data-skip-in-text"] === true || input["data-skip-in-text"] === "true") return "";

  switch (name) {
    case "Head":
    case "Preview":
    case "Img":
    case "Font":
      return "";
    case "Hr":
      return `\n\n${"-".repeat(40)}\n\n`; 
    case "Link":
    case "Button":
      return textLink(input, children);
    case "Text":
      return `\n\n${children.replace(/\s+/g, " ")}\n\n`;
    case "Heading":
      return `${HEADING_BREAK.repeat(3)}${children.toUpperCase()}\n\n`;
    case "CodeInline":
      // React Email emits both <code> and its Orange.fr fallback <span>.
      return children + children;
    case "Html":
    case "Body":
    case "Container":
    case "Section":
    case "Row":
    case "Column":
    case "Tailwind":
      return children;
    default:
      throw new Error(`Unsupported React Email text primitive: ${name}`);
  }
}

export function textComponent<Props extends EmailProps>(
  template: CompilableEmail<Props>,
  props: Props,
): string {
  const textTemplate = (template as CompiledTemplate<Props>).__reactEmailText;
  if (!textTemplate) {
    throw new TypeError("A nested .email.tsx component has no compiled plain-text renderer.");
  }
  return assertCompiledString(textTemplate(props));
}

function cssPropertyName(property: string): string {
  if (property.startsWith("--")) return property;

  return property
    .replace(/^ms-/, "-ms-")
    .replace(/^Webkit/, "-webkit-")
    .replace(/^Moz/, "-moz-")
    .replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

export function serializeStyle(style: unknown): string {
  if (!style || typeof style !== "object") return "";

  const declarations: string[] = [];
  for (const [property, value] of Object.entries(style)) {
    if (value === null || value === undefined || value === false || value === "") continue;

    const suffix =
      typeof value === "number" && value !== 0 && !UNITLESS_STYLES.has(property)
        ? "px"
        : "";
    declarations.push(`${cssPropertyName(property)}:${String(value)}${suffix}`);
  }

  return declarations.join(";");
}

function renderAttributes(props: EmailProps): string {
  const attributes: string[] = [];

  for (const [property, value] of Object.entries(props)) {
    if (
      property === "children" ||
      property === "dangerouslySetInnerHTML" ||
      property === "key" ||
      property === "ref" ||
      property.startsWith("on") ||
      value === null ||
      value === undefined ||
      value === false
    ) {
      continue;
    }

    if (property === "style") {
      const style = serializeStyle(value);
      if (style) attributes.push(`style="${escapeAttribute(style)}"`);
      continue;
    }

    const name = ATTRIBUTE_NAMES[property] ?? property;
    if (BOOLEAN_ATTRIBUTES.has(property)) {
      if (value) attributes.push(`${name}=""`);
      continue;
    }

    attributes.push(`${name}="${escapeAttribute(value)}"`);
  }

  return attributes.length === 0 ? "" : ` ${attributes.join(" ")}`;
}

export function element(
  tag: string,
  props: EmailProps | null | undefined,
  children = "",
): string {
  const normalizedProps = props ?? {};
  const innerHtml =
    normalizedProps.dangerouslySetInnerHTML &&
    typeof normalizedProps.dangerouslySetInnerHTML === "object" &&
    "__html" in normalizedProps.dangerouslySetInnerHTML
      ? String((normalizedProps.dangerouslySetInnerHTML as { __html: unknown }).__html)
      : children;

  const opening = `<${tag}${renderAttributes(normalizedProps)}`;
  return VOID_ELEMENTS.has(tag) ? `${opening}/>` : `${opening}>${innerHtml}</${tag}>`;
}

type BoxValue = string | number | undefined;

function splitBoxValue(value: unknown): readonly [BoxValue, BoxValue, BoxValue, BoxValue] {
  if (typeof value === "number") return [value, value, value, value];
  if (typeof value !== "string") return [undefined, undefined, undefined, undefined];

  const values = value.trim().split(/\s+/);
  if (values.length === 1) return [values[0], values[0], values[0], values[0]] as const;
  if (values.length === 2) return [values[0], values[1], values[0], values[1]] as const;
  if (values.length === 3) return [values[0], values[1], values[2], values[1]] as const;
  return [values[0], values[1], values[2], values[3]] as const;
}

function computeMargins(style: EmailProps): EmailProps {
  let margins: EmailProps = {
    marginTop: style.marginTop === undefined ? "16px" : undefined,
    marginBottom: style.marginBottom === undefined ? "16px" : undefined,
  };

  for (const [property, value] of Object.entries(style)) {
    if (property === "margin") {
      const [marginTop, marginRight, marginBottom, marginLeft] = splitBoxValue(value);
      margins = { marginTop, marginRight, marginBottom, marginLeft };
    } else if (["marginTop", "marginRight", "marginBottom", "marginLeft"].includes(property)) {
      margins[property] = value;
    }
  }

  return margins;
}

function splitTableStyle(style: EmailProps) {
  const tableStyle: EmailProps = {};
  const cellStyle: EmailProps = {};

  for (const [property, value] of Object.entries(style)) {
    if (["padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].includes(property)) {
      cellStyle[property] = value;
    } else {
      tableStyle[property] = value;
    }
  }

  return { tableStyle, cellStyle };
}

function toPixels(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const match = /^([\d.]+)(px|em|rem|%)$/.exec(String(value));
  if (!match) return 0;
  const number = Number.parseFloat(match[1]!);
  if (match[2] === "em" || match[2] === "rem") return number * 16;
  if (match[2] === "%") return (number / 100) * 600;
  return number;
}

function boxValue(value: unknown): BoxValue {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function parsePadding(style: EmailProps) {
  let [top, right, bottom, left] = splitBoxValue(style.padding);
  top = boxValue(style.paddingTop) ?? top;
  right = boxValue(style.paddingRight) ?? right;
  bottom = boxValue(style.paddingBottom) ?? bottom;
  left = boxValue(style.paddingLeft) ?? left;

  return {
    paddingTop: top ? toPixels(top) : undefined,
    paddingRight: right ? toPixels(right) : undefined,
    paddingBottom: bottom ? toPixels(bottom) : undefined,
    paddingLeft: left ? toPixels(left) : undefined,
  };
}

function buttonSpace(expectedWidth: number) {
  if (expectedWidth === 0) return [0, 0] as const;
  let spaces = 0;
  while ((spaces > 0 ? expectedWidth / spaces / 2 : Number.POSITIVE_INFINITY) > 5) spaces++;
  return [expectedWidth / spaces / 2, spaces] as const;
}

export function buttonPrimitive(props: EmailProps, children: string): string {
  const { style: rawStyle, target = "_blank", ...attributes } = props;
  const style = (rawStyle && typeof rawStyle === "object" ? rawStyle : {}) as EmailProps;
  const padding = parsePadding(style);
  const verticalPadding = (padding.paddingTop ?? 0) + (padding.paddingBottom ?? 0);
  const textRaise = (verticalPadding * 3) / 4;
  const [leftWidth, leftSpaces] = buttonSpace(padding.paddingLeft ?? 0);
  const [rightWidth, rightSpaces] = buttonSpace(padding.paddingRight ?? 0);

  const anchorStyle = {
    lineHeight: "100%",
    textDecoration: "none",
    display: "inline-block",
    maxWidth: "100%",
    msoPaddingAlt: "0px",
    ...style,
    ...padding,
  };
  const left = `<!--[if mso]><i style="mso-font-width:${leftWidth * 100}%;mso-text-raise:${textRaise}px" hidden>${"&#8202;".repeat(leftSpaces)}</i><![endif]-->`;
  const right = `<!--[if mso]><i style="mso-font-width:${rightWidth * 100}%" hidden>${"&#8202;".repeat(rightSpaces)}&#8203;</i><![endif]-->`;

  return element(
    "a",
    { ...attributes, style: anchorStyle, target },
    element("span", { dangerouslySetInnerHTML: { __html: left } }) +
      element(
        "span",
        {
          style: {
            maxWidth: "100%",
            display: "inline-block",
            lineHeight: "120%",
            msoPaddingAlt: "0px",
            msoTextRaise:
              typeof padding.paddingBottom === "number" ? (padding.paddingBottom * 3) / 4 : undefined,
          },
        },
        children,
      ) +
      element("span", { dangerouslySetInnerHTML: { __html: right } }),
  );
}

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

export function htmlPrimitive(props: EmailProps, children: string): string {
  const { lang = "en", dir = "ltr", ...attributes } = props;
  const titles = children.match(/<title>.*?<\/title>/gs)?.join("") ?? "";
  let documentChildren = titles ? children.replaceAll(/<title>.*?<\/title>/gs, "") : children;
  if (titles) {
    const headEnd = documentChildren.indexOf("</head>");
    if (headEnd >= 0) {
      const firstStyle = documentChildren.indexOf("<style", documentChildren.indexOf("<head"));
      const insertionPoint = firstStyle >= 0 && firstStyle < headEnd ? firstStyle : headEnd;
      documentChildren =
        documentChildren.slice(0, insertionPoint) + titles + documentChildren.slice(insertionPoint);
    } else {
      documentChildren = `<head>${titles}</head>${documentChildren}`;
    }
  } else if (!documentChildren.includes("<head")) {
    documentChildren = `<head></head>${documentChildren}`;
  }

  const previewStart = documentChildren.indexOf(PREVIEW_START);
  const previewEnd = documentChildren.indexOf(PREVIEW_END, previewStart);
  if (previewStart >= 0 && previewEnd >= 0) {
    const bodyStart = documentChildren.indexOf("<body");
    if (bodyStart >= 0 && previewStart < bodyStart) {
      const preview = documentChildren.slice(previewStart + PREVIEW_START.length, previewEnd);
      documentChildren =
        documentChildren.slice(0, previewStart) +
        documentChildren.slice(previewEnd + PREVIEW_END.length);
      const movedBodyStart = documentChildren.indexOf("<body");
      const bodyOpenEnd = documentChildren.indexOf(">", movedBodyStart);
      documentChildren =
        documentChildren.slice(0, bodyOpenEnd + 1) +
        preview +
        documentChildren.slice(bodyOpenEnd + 1);
    } else {
      documentChildren = documentChildren
        .replace(PREVIEW_START, "")
        .replace(PREVIEW_END, "");
    }
  }

  return DOCTYPE + element("html", { ...attributes, dir, lang }, documentChildren);
}

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
