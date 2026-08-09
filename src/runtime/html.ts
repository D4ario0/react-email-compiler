import type { EmailProps } from "./types";

export const DOCTYPE =
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

