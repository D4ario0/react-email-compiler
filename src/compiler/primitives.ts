import { createHash } from "node:crypto";
import * as t from "@babel/types";
import { createElement, type ElementType } from "react";
import * as ReactEmail from "react-email";
import { render as renderReactEmail } from "react-email";
import type { CompilationSession } from "../session";
import { cleanJsxText } from "./jsx-utils";
import { renderWithReactModuleEnvironment } from "./react-render-boundary";
import type { PrimitiveShell, StaticValue } from "./types";

export function staticValue(expression: t.Expression): StaticValue {
  if (t.isStringLiteral(expression) || t.isNumericLiteral(expression) || t.isBooleanLiteral(expression)) {
    return { known: true, value: expression.value };
  }
  if (t.isNullLiteral(expression)) return { known: true, value: null };
  if (t.isTemplateLiteral(expression) && expression.expressions.length === 0) {
    return { known: true, value: expression.quasis[0]?.value.cooked ?? "" };
  }
  if (t.isUnaryExpression(expression) && ["+", "-"].includes(expression.operator)) {
    const argument = staticValue(expression.argument as t.Expression);
    if (!argument.known || typeof argument.value !== "number") return { known: false };
    return { known: true, value: expression.operator === "-" ? -argument.value : argument.value };
  }
  if (t.isArrayExpression(expression)) {
    const values: unknown[] = [];
    for (const element of expression.elements) {
      if (!element || t.isSpreadElement(element)) return { known: false };
      const item = staticValue(element);
      if (!item.known) return { known: false };
      values.push(item.value);
    }
    return { known: true, value: values };
  }
  if (t.isObjectExpression(expression)) {
    const value: Record<string, unknown> = {};
    for (const property of expression.properties) {
      if (!t.isObjectProperty(property) || property.computed) return { known: false };
      const key = t.isIdentifier(property.key)
        ? property.key.name
        : t.isStringLiteral(property.key) || t.isNumericLiteral(property.key)
          ? String(property.key.value)
          : undefined;
      if (!key || !t.isExpression(property.value)) return { known: false };
      const item = staticValue(property.value);
      if (!item.known) return { known: false };
      value[key] = item.value;
    }
    return { known: true, value };
  }
  return { known: false };
}

function normalizeReactShell(html: string): string {
  return html
    .replace(/^<!DOCTYPE[^>]*>/, "")
    .replaceAll("<!--$-->", "")
    .replaceAll("<!--/$-->", "")
    .replaceAll("<!--html-->", "")
    .replaceAll("<!--head-->", "")
    .replaceAll("<!--body-->", "")
    .replaceAll("<!-- -->", "");
}

export function renderPrimitiveShell(
  primitive: string,
  propsExpression: t.ObjectExpression,
  session: CompilationSession,
  staticChildren?: string,
): Promise<PrimitiveShell | undefined> {
  if (["Html", "Preview", "Tailwind"].includes(primitive)) return Promise.resolve(undefined);
  const props = staticValue(propsExpression);
  if (!props.known || !props.value || typeof props.value !== "object") return Promise.resolve(undefined);

  const cacheKey = `${primitive}:${JSON.stringify(props.value)}:${staticChildren ?? ""}`;
  return session.memoize("primitive-shell", cacheKey, async () => {
    const component = (ReactEmail as unknown as Record<string, unknown>)[primitive];
    if (!component) return undefined;
    const marker = `__REACT_EMAIL_COMPILER_CHILD_${createHash("sha1").update(cacheKey).digest("hex").slice(0, 12)}__`;
    const element = ["Hr", "Img", "Font", "CodeBlock"].includes(primitive)
      ? createElement(component as ElementType, props.value as Record<string, unknown>)
      : createElement(
          component as ElementType,
          props.value as Record<string, unknown>,
          primitive === "Markdown" ? staticChildren : marker,
        );
    const html = normalizeReactShell(
      await renderWithReactModuleEnvironment(() => renderReactEmail(element)),
    );
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) {
      const toPlainText = (ReactEmail as unknown as { toPlainText(html: string): string }).toPlainText;
      return { prefix: html, suffix: "", text: toPlainText(html), consumesChildren: true };
    }
    if (html.indexOf(marker, markerIndex + marker.length) >= 0) return undefined;
    return {
      prefix: html.slice(0, markerIndex),
      suffix: html.slice(markerIndex + marker.length),
    };
  });
}

export function staticStringChildren(children: t.JSXElement["children"]): string | undefined {
  let result = "";
  for (const child of children) {
    if (t.isJSXText(child)) {
      result += cleanJsxText(child.value);
      continue;
    }
    if (!t.isJSXExpressionContainer(child)) return undefined;
    if (t.isJSXEmptyExpression(child.expression)) continue;
    if (!t.isExpression(child.expression)) return undefined;

    const value = staticValue(child.expression);
    if (!value.known || typeof value.value !== "string") return undefined;
    result += value.value;
  }
  return result;
}

