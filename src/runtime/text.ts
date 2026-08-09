import { raw } from "./html";
import type { CompiledTemplate, CompilableEmail, EmailProps } from "./types";

function assertTextString(output: unknown): string {
  if (typeof output !== "string") {
    throw new TypeError("A compiled plain-text renderer did not return a string.");
  }
  return output;
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
  return assertTextString(textTemplate(props));
}

