import { createHash } from "node:crypto";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import {
  inlineStyles,
  sanitizeStyleSheet,
  setupTailwind,
  type TailwindConfig,
} from "react-email";
import type { CompilationSession } from "../session";
import { RUNTIME_CLASS_PROPS } from "./constants";
import { EmailCompilerError } from "./errors";
import { jsxAttributeExpression, jsxNameToString } from "./jsx-utils";
import type {
  CollectedClassNames,
  DynamicClassName,
  TailwindStyles,
} from "./types";

function compiledClassTable(
  candidates: string[],
  tailwindStyles: Map<string, TailwindStyles>,
): t.ObjectExpression {
  return t.objectExpression(
    candidates.map((candidate) => {
      const compiled = tailwindStyles.get(candidate) ?? { style: {} };
      const valueProperties: t.ObjectProperty[] = [];
      if (compiled.residualClassName) {
        valueProperties.push(
          t.objectProperty(t.identifier("className"), t.stringLiteral(compiled.residualClassName)),
        );
      }
      valueProperties.push(
        t.objectProperty(
          t.identifier("style"),
          t.objectExpression(
            Object.entries(compiled.style).map(([key, value]) =>
              t.objectProperty(t.identifier(key), t.stringLiteral(value)),
            ),
          ),
        ),
      );
      return t.objectProperty(t.stringLiteral(candidate), t.objectExpression(valueProperties));
    }),
  );
}

export function compileProps(
  attributes: Array<t.JSXAttribute | t.JSXSpreadAttribute>,
  tailwindStyles: Map<string, TailwindStyles>,
  dynamicClassNames: WeakMap<t.JSXAttribute, DynamicClassName>,
  id: string,
): t.ObjectExpression {
  const properties: Array<t.ObjectProperty | t.SpreadElement> = [];
  let className: string | undefined;
  let dynamicClassName: DynamicClassName | undefined;
  let styleExpression: t.Expression | undefined;

  for (const attribute of attributes) {
    if (t.isJSXSpreadAttribute(attribute)) {
      properties.push(t.spreadElement(attribute.argument));
      continue;
    }

    const name = jsxNameToString(attribute.name);
    if (name === "key" || name === "ref") continue;
    if (name === "dangerouslySetInnerHTML") {
      throw new EmailCompilerError("dangerouslySetInnerHTML is not supported in email templates", id, attribute);
    }
    if (name === "className") {
      if (t.isStringLiteral(attribute.value)) {
        className = attribute.value.value;
      } else {
        dynamicClassName = dynamicClassNames.get(attribute);
        if (!dynamicClassName) {
          throw new EmailCompilerError("Unsupported dynamic className", id, attribute);
        }
      }
      continue;
    }
    if (name === "style") {
      styleExpression = jsxAttributeExpression(attribute, id);
      continue;
    }

    properties.push(t.objectProperty(t.stringLiteral(name), jsxAttributeExpression(attribute, id)));
  }

  if (dynamicClassName) {
    if (dynamicClassName.candidates.length === 0 || tailwindStyles.size === 0) {
      properties.push(t.objectProperty(t.identifier("className"), dynamicClassName.expression));
      if (styleExpression) {
        properties.push(t.objectProperty(t.identifier("style"), styleExpression));
      }
    } else {
      properties.push(
        t.spreadElement(
          t.callExpression(t.identifier(RUNTIME_CLASS_PROPS), [
            dynamicClassName.expression,
            compiledClassTable(dynamicClassName.candidates, tailwindStyles),
            styleExpression ?? t.nullLiteral(),
          ]),
        ),
      );
    }
    return t.objectExpression(properties);
  }

  const compiledClassName = className ? tailwindStyles.get(className) : undefined;
  if (compiledClassName?.residualClassName) {
    properties.push(t.objectProperty(t.identifier("className"), t.stringLiteral(compiledClassName.residualClassName)));
  } else if (className && !compiledClassName) {
    properties.push(t.objectProperty(t.identifier("className"), t.stringLiteral(className)));
  }

  if (compiledClassName && Object.keys(compiledClassName.style).length > 0) {
    const styleParts: Array<t.ObjectProperty | t.SpreadElement> = Object.entries(
      compiledClassName.style,
    ).map(([key, value]) => t.objectProperty(t.identifier(key), t.stringLiteral(value)));
    if (styleExpression) styleParts.push(t.spreadElement(styleExpression));
    properties.push(t.objectProperty(t.identifier("style"), t.objectExpression(styleParts)));
  } else if (styleExpression) {
    properties.push(t.objectProperty(t.identifier("style"), styleExpression));
  }

  return t.objectExpression(properties);
}

export async function compileTailwindStyles(
  classNames: Set<string>,
  config: TailwindConfig | undefined,
  session: CompilationSession,
): Promise<Map<string, TailwindStyles>> {
  if (!config || classNames.size === 0) return new Map();

  const cacheKey = createHash("sha256")
    .update(
      JSON.stringify(config, (_key, value) =>
        typeof value === "function" ? value.toString() : value,
      ),
    )
    .update("\0")
    .update([...classNames].sort().join("\0"))
    .digest("hex");

  return session.memoize("tailwind-styles", cacheKey, async () => {
    const result = new Map<string, TailwindStyles>();
    const setup = await setupTailwind({ config });
    const classes = [...classNames]
      .flatMap((className) => className.trim().split(/\s+/))
      .filter(Boolean);
    setup.addUtilities(classes);
    const styleSheet = setup.getStyleSheet();
    sanitizeStyleSheet(styleSheet);

    for (const className of classNames) {
      const names = className.trim().split(/\s+/).filter(Boolean);
      const style = inlineStyles(styleSheet, names);
      const residual = names.filter(
        (name) => Object.keys(inlineStyles(styleSheet, [name])).length === 0,
      );
      result.set(className, {
        ...(residual.length > 0 ? { residualClassName: residual.join(" ") } : {}),
        style,
      });
    }

    return result;
  });
}

function staticStringValues(expression: t.Expression, bindings: Map<string, string[]>): string[] {
  if (t.isStringLiteral(expression)) return [expression.value];
  if (t.isTemplateLiteral(expression) && expression.expressions.length === 0) {
    return [expression.quasis[0]?.value.cooked ?? ""];
  }
  if (t.isConditionalExpression(expression)) {
    return [
      ...staticStringValues(expression.consequent, bindings),
      ...staticStringValues(expression.alternate, bindings),
    ];
  }
  if (t.isIdentifier(expression)) return bindings.get(expression.name) ?? [];
  return [];
}

export function collectClassNames(ast: t.File, id: string, tailwindEnabled: boolean): CollectedClassNames {
  const classNames = new Set<string>();
  const dynamic = new WeakMap<t.JSXAttribute, DynamicClassName>();
  const bindings = new Map<string, string[]>();

  traverse(ast, {
    AssignmentPattern(path) {
      if (!t.isIdentifier(path.node.left) || !t.isExpression(path.node.right)) return;
      const values = staticStringValues(path.node.right, bindings);
      if (values.length > 0) bindings.set(path.node.left.name, values);
    },
    VariableDeclarator(path) {
      if (!t.isIdentifier(path.node.id) || !path.node.init || !t.isExpression(path.node.init)) return;
      const values = staticStringValues(path.node.init, bindings);
      if (values.length > 0) bindings.set(path.node.id.name, values);
    },
  });

  traverse(ast, {
    JSXAttribute(path) {
      if (!t.isJSXIdentifier(path.node.name, { name: "className" })) return;
      if (t.isStringLiteral(path.node.value)) {
        classNames.add(path.node.value.value);
        return;
      }
      if (!t.isJSXExpressionContainer(path.node.value) || !t.isExpression(path.node.value.expression)) {
        throw new EmailCompilerError("Unsupported className value", id, path.node);
      }

      const candidates = staticStringValues(path.node.value.expression, bindings);
      if (tailwindEnabled && candidates.length === 0) {
        throw new EmailCompilerError(
          "Dynamic Tailwind className values need statically discoverable string defaults",
          id,
          path.node,
        );
      }
      for (const candidate of candidates) classNames.add(candidate);
      dynamic.set(path.node, { candidates, expression: path.node.value.expression });
    },
  });

  return { classNames, dynamic };
}
