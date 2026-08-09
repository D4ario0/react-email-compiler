import { finalizeText } from "./text";
import type { CompilableEmail, CompiledTemplate } from "./types";

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

interface CompiledEmailElement {
  type: CompiledTemplate<unknown>;
  props: unknown;
}

function isCompiledEmailElement(value: unknown): value is CompiledEmailElement {
  if (!value || typeof value !== "object") return false;
  const type = (value as Partial<CompiledEmailElement>).type;
  return typeof type === "function" && typeof type.__reactEmailText === "function";
}

function resolveCompiledEmailValue(value: unknown): CompiledEmailValue | undefined {
  if (isCompiledEmailValue(value)) return value;
  if (!isCompiledEmailElement(value)) return undefined;
  const rendered = value.type(value.props);
  return isCompiledEmailValue(rendered) ? rendered : undefined;
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
  const compiled = resolveCompiledEmailValue(value);
  if (!compiled) {
    throw new TypeError(
      "render() received an uncompiled value. Pass an AOT-compiled .email.tsx component directly or as JSX.",
    );
  }
  if (options.pretty) {
    throw new TypeError("The AOT render replacement does not support pretty output");
  }
  const html = String(compiled);
  const text = compiled[COMPILED_EMAIL_TEXT]();
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

function assertCompiledString(output: unknown): string {
  if (isCompiledEmailValue(output)) return String(output);
  if (typeof output !== "string") {
    throw new TypeError(
      "The email template did not return a string. Ensure the .email.tsx module was processed by the AOT email plugin.",
    );
  }
  return output;
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

