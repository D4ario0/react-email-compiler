export {
  attachTextRenderer,
  compiledEmailValue,
  renderCompiledEmailText,
  renderEmailValue,
  toPlainTextEmailValue,
  type CompiledEmailValue,
} from "./runtime/value";
export {
  element,
  escapeAttribute,
  escapeText,
  raw,
  serializeStyle,
  tailwindClassProps,
  type CompiledClassName,
} from "./runtime/html";
export {
  finalizeText,
  textComponent,
  textElement,
  textPrimitive,
  textValue,
} from "./runtime/text";
export { buttonPrimitive } from "./runtime/button";
export { htmlPrimitive, previewPrimitive } from "./runtime/document";
export { imgPrimitive, primitive, sectionPrimitive } from "./runtime/primitives";
export type { CompilableEmail, EmailProps } from "./runtime/types";
