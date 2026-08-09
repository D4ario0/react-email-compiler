import * as t from "@babel/types";
import { EmailCompilerError } from "./errors";

export function cleanJsxText(value: string): string {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  let lastNonEmptyLine = 0;
  for (let index = 0; index < lines.length; index++) {
    if (/[^\t ]/.test(lines[index]!)) lastNonEmptyLine = index;
  }

  let result = "";
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index]!.replace(/\t/g, " ");
    if (index !== 0) line = line.replace(/^\s+/, "");
    if (index !== lines.length - 1) line = line.replace(/\s+$/, "");
    if (!line) continue;
    result += line;
    if (index !== lastNonEmptyLine) result += " ";
  }
  return result;
}

export function jsxNameToString(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): string {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) {
    return `${jsxNameToString(name.object)}.${jsxNameToString(name.property)}`;
  }
  return `${name.namespace.name}:${name.name.name}`;
}

export function nodeLocationKey(node: t.Node): string | undefined {
  if (node.start === null || node.start === undefined) return undefined;
  if (node.end === null || node.end === undefined) return undefined;
  return `${node.start}:${node.end}`;
}

export function jsxAttributeExpression(
  attribute: t.JSXAttribute,
  id: string,
): t.Expression {
  if (!attribute.value) return t.booleanLiteral(true);
  if (t.isStringLiteral(attribute.value)) return t.stringLiteral(attribute.value.value);
  if (t.isJSXElement(attribute.value) || t.isJSXFragment(attribute.value)) {
    throw new EmailCompilerError("Internal error: JSX attribute value was not lowered", id, attribute.value);
  }
  if (t.isJSXEmptyExpression(attribute.value.expression)) return t.booleanLiteral(true);
  if (!t.isExpression(attribute.value.expression)) {
    throw new EmailCompilerError("Unsupported JSX attribute expression", id, attribute.value.expression);
  }
  return attribute.value.expression;
}
