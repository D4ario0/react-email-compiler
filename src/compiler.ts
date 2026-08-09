import { createHash } from "node:crypto";
import generate from "@babel/generator";
import { parse, type ParserOptions } from "@babel/parser";
import traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { createElement, type ElementType } from "react";
import * as ReactEmail from "react-email";
import {
  evaluateEmailModule,
  renderEmailModuleExport,
  type EvaluatedEmailModule,
  type EvaluatedEmailRender,
  type EvaluateEmailModuleOptions,
} from "./evaluator";
import { concatIR, expressionIR, generateIR, staticIR } from "./ir";
import { CompilationSession } from "./session";
import {
  inlineStyles,
  render as renderReactEmail,
  sanitizeStyleSheet,
  setupTailwind,
  type TailwindConfig,
} from "react-email";

// React selects its development/production implementation when this module is loaded.
// Bundlers may mutate NODE_ENV later, so React DOM must be loaded under the same value.
const reactModuleNodeEnv = process.env.NODE_ENV;

const SUPPORTED_PRIMITIVES = new Set([
  "Body",
  "Button",
  "CodeBlock",
  "CodeInline",
  "Column",
  "Container",
  "Font",
  "Head",
  "Heading",
  "Hr",
  "Html",
  "Img",
  "Link",
  "Markdown",
  "Preview",
  "Row",
  "Section",
  "Tailwind",
  "Text",
]);

const RUNTIME_PRIMITIVE = "__reactEmailPrimitive";
const RUNTIME_BUTTON = "__reactEmailButton";
const RUNTIME_HTML = "__reactEmailHtml";
const RUNTIME_IMG = "__reactEmailImg";
const RUNTIME_PREVIEW = "__reactEmailPreview";
const RUNTIME_SECTION = "__reactEmailSection";
const RUNTIME_ELEMENT = "__reactEmailElement";
const RUNTIME_ESCAPE = "__reactEmailEscape";
const RUNTIME_RAW = "__reactEmailRaw";
const RUNTIME_CLASS_PROPS = "__reactEmailClassProps";
const RUNTIME_ATTACH_TEXT = "__reactEmailAttachText";
const RUNTIME_COMPILED_VALUE = "__reactEmailCompiledValue";
const RUNTIME_RENDER_TEXT = "__reactEmailRenderText";
const RUNTIME_TEXT_COMPONENT = "__reactEmailTextComponent";
const RUNTIME_TEXT_ELEMENT = "__reactEmailTextElement";
const RUNTIME_TEXT_PRIMITIVE = "__reactEmailTextPrimitive";
const RUNTIME_TEXT_VALUE = "__reactEmailTextValue";

export interface CompilerOptions {
  /** Execute source modules when an AOT stage requires their runtime exports. */
  evaluateModule?: boolean | EvaluateEmailModuleOptions;
  /** Collect export metadata even when no static export requires module execution. */
  discoverExports?: boolean;
  /** Pre-render exported zero-prop components through React Email during module evaluation. */
  preRenderStaticExports?: boolean;
  /** Render primitives with fully static props through React Email and residualize their children. */
  renderStaticPrimitives?: boolean;
  /** Module imported by generated email functions. */
  runtimeModule?: string;
  /** Tailwind configuration used by every compiled .email.tsx module. */
  tailwindConfig?: TailwindConfig;
  /** Shared caches and metrics for all modules in one bundler build. */
  compilationSession?: CompilationSession;
}

export interface CompileResult {
  code: string;
  evaluatedModule?: EvaluatedEmailModule;
  map: ReturnType<typeof generate>["map"];
}

export class EmailCompilerError extends Error {
  readonly id: string;
  readonly location: { line: number; column: number } | undefined;

  constructor(message: string, id: string, node?: t.Node | null) {
    const location = node?.loc?.start;
    super(`${id}${location ? `:${location.line}:${location.column + 1}` : ""}: ${message}`);
    this.name = "EmailCompilerError";
    this.id = id;
    this.location = location ? { line: location.line, column: location.column + 1 } : undefined;
  }
}

interface TailwindStyles {
  residualClassName?: string;
  style: Record<string, string>;
}

interface PrimitiveShell {
  prefix: string;
  suffix: string;
  text?: string;
  consumesChildren?: boolean;
}

interface StaticValue {
  known: boolean;
  value?: unknown;
}

interface DynamicClassName {
  candidates: string[];
  expression: t.Expression;
}

interface CollectedClassNames {
  classNames: Set<string>;
  dynamic: WeakMap<t.JSXAttribute, DynamicClassName>;
}

function cleanJsxText(value: string): string {
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

    if (line) {
      result += line;
      if (index !== lastNonEmptyLine) result += " ";
    }
  }

  return result;
}

function escapeStaticText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

function jsxNameToString(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): string {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) return `${jsxNameToString(name.object)}.${jsxNameToString(name.property)}`;
  return `${name.namespace.name}:${name.name.name}`;
}

function memberExpressionFromJsx(name: t.JSXMemberExpression): t.MemberExpression {
  const object = t.isJSXIdentifier(name.object)
    ? t.identifier(name.object.name)
    : memberExpressionFromJsx(name.object);
  return t.memberExpression(object, t.identifier(name.property.name));
}

function propertyKeyName(property: t.TSPropertySignature): string | undefined {
  if (t.isIdentifier(property.key)) return property.key.name;
  if (t.isStringLiteral(property.key)) return property.key.value;
  return undefined;
}

function containsReactNode(node: t.Node | null | undefined): boolean {
  if (!node) return false;
  if (t.isTSTypeReference(node)) {
    if (t.isIdentifier(node.typeName) && node.typeName.name === "ReactNode") return true;
    if (
      t.isTSQualifiedName(node.typeName) &&
      t.isIdentifier(node.typeName.left) &&
      node.typeName.left.name === "React" &&
      node.typeName.right.name === "ReactNode"
    ) {
      return true;
    }
  }

  const keys = t.VISITOR_KEYS[node.type] ?? [];
  return keys.some((key) => {
    const child = (node as unknown as Record<string, unknown>)[key];
    return Array.isArray(child)
      ? child.some((entry) => t.isNode(entry) && containsReactNode(entry))
      : t.isNode(child) && containsReactNode(child);
  });
}

function collectReactNodeTypes(program: t.Program): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();

  for (const statement of program.body) {
    const declaration = t.isExportNamedDeclaration(statement) ? statement.declaration : statement;
    let members: Array<t.TSTypeElement> | undefined;
    let declarationName: string | undefined;
    if (t.isTSTypeAliasDeclaration(declaration) && t.isTSTypeLiteral(declaration.typeAnnotation)) {
      members = declaration.typeAnnotation.members;
      declarationName = declaration.id.name;
    } else if (t.isTSInterfaceDeclaration(declaration)) {
      members = declaration.body.body;
      declarationName = declaration.id.name;
    }
    if (!members || !declarationName) continue;

    const names = new Set<string>();
    for (const member of members) {
      if (!t.isTSPropertySignature(member) || !containsReactNode(member.typeAnnotation?.typeAnnotation)) continue;
      const name = propertyKeyName(member);
      if (name) names.add(name);
    }
    result.set(declarationName, names);
  }

  return result;
}

function safeBindingsForFunction(path: NodePath, reactNodeTypes: Map<string, Set<string>>): Set<string> {
  const functionPath = path.getFunctionParent();
  if (!functionPath) return new Set();
  const parameter = functionPath.node.params[0];
  if (!t.isObjectPattern(parameter)) return new Set();

  const annotation = parameter.typeAnnotation?.typeAnnotation;
  const safeProperties = new Set<string>(["children"]);
  if (t.isTSTypeReference(annotation) && t.isIdentifier(annotation.typeName)) {
    for (const property of reactNodeTypes.get(annotation.typeName.name) ?? []) {
      safeProperties.add(property);
    }
  }

  const bindings = new Set<string>();
  for (const property of parameter.properties) {
    if (!t.isObjectProperty(property)) continue;
    const key = t.isIdentifier(property.key)
      ? property.key.name
      : t.isStringLiteral(property.key)
        ? property.key.value
        : undefined;
    if (!key || !safeProperties.has(key)) continue;

    if (t.isIdentifier(property.value)) bindings.add(property.value.name);
    if (t.isAssignmentPattern(property.value) && t.isIdentifier(property.value.left)) bindings.add(property.value.left.name);
  }

  return bindings;
}

function concat(expressions: t.Expression[]): t.Expression {
  return generateIR(
    concatIR(
      expressions.map((expression) =>
        t.isStringLiteral(expression) ? staticIR(expression.value) : expressionIR(expression),
      ),
    ),
  );
}

function rawExpression(expression: t.Expression): t.CallExpression {
  return t.callExpression(t.identifier(RUNTIME_RAW), [expression]);
}

function escapedExpression(expression: t.Expression): t.CallExpression {
  return t.callExpression(t.identifier(RUNTIME_ESCAPE), [expression]);
}

function isGenerated(expression: t.Expression, generated: WeakSet<t.Node>): boolean {
  return generated.has(expression);
}

function compileDynamicChild(
  expression: t.Expression,
  safeBindings: Set<string>,
  generated: WeakSet<t.Node>,
): t.Expression {
  if (isGenerated(expression, generated)) return expression;
  if (t.isIdentifier(expression) && safeBindings.has(expression.name)) return rawExpression(expression);

  if (t.isConditionalExpression(expression)) {
    const compiled = t.conditionalExpression(
      expression.test,
      compileDynamicChild(expression.consequent, safeBindings, generated),
      compileDynamicChild(expression.alternate, safeBindings, generated),
    );
    generated.add(compiled);
    return compiled;
  }

  if (t.isLogicalExpression(expression) && expression.operator === "&&") {
    const compiled = t.conditionalExpression(
      expression.left,
      compileDynamicChild(expression.right, safeBindings, generated),
      t.stringLiteral(""),
    );
    generated.add(compiled);
    return compiled;
  }

  if (t.isLogicalExpression(expression) && expression.operator === "??") {
    const value = t.identifier("__nullishValue");
    const compiled = t.callExpression(
      t.arrowFunctionExpression(
        [value],
        t.conditionalExpression(
          t.binaryExpression("!=", value, t.nullLiteral()),
          compileDynamicChild(value, safeBindings, generated),
          compileDynamicChild(expression.right, safeBindings, generated),
        ),
      ),
      [expression.left],
    );
    generated.add(compiled);
    return compiled;
  }

  if (
    t.isCallExpression(expression) &&
    t.isMemberExpression(expression.callee) &&
    t.isIdentifier(expression.callee.property, { name: "map" })
  ) {
    const callback = expression.arguments[0];
    if (
      (t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback)) &&
      t.isExpression(callback.body) &&
      isGenerated(callback.body, generated)
    ) {
      return rawExpression(expression);
    }
  }

  return escapedExpression(expression);
}

function compileChildren(
  children: t.Node[],
  path: NodePath,
  reactNodeTypes: Map<string, Set<string>>,
  generated: WeakSet<t.Node>,
  id: string,
): t.Expression {
  const safeBindings = safeBindingsForFunction(path, reactNodeTypes);
  const expressions: t.Expression[] = [];

  for (const child of children) {
    if (t.isExpression(child)) {
      expressions.push(compileDynamicChild(child, safeBindings, generated));
      continue;
    }
    if (t.isJSXText(child)) {
      const value = cleanJsxText(child.value);
      if (value) expressions.push(t.stringLiteral(escapeStaticText(value)));
      continue;
    }
    if (t.isJSXSpreadChild(child)) {
      throw new EmailCompilerError("JSX spread children are not supported", id, child);
    }
    if (t.isJSXElement(child) || t.isJSXFragment(child)) {
      throw new EmailCompilerError("Internal error: nested JSX was not lowered", id, child);
    }
    if (!t.isJSXExpressionContainer(child)) {
      throw new EmailCompilerError("Unsupported JSX child", id, child);
    }
    if (t.isJSXEmptyExpression(child.expression)) continue;
    if (!t.isExpression(child.expression)) {
      throw new EmailCompilerError("Unsupported JSX child expression", id, child);
    }
    expressions.push(compileDynamicChild(child.expression, safeBindings, generated));
  }

  const result = concat(expressions);
  generated.add(result);
  return result;
}

function staticValue(expression: t.Expression): StaticValue {
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

function renderPrimitiveShell(
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
    const currentNodeEnv = process.env.NODE_ENV;
    if (reactModuleNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = reactModuleNodeEnv;
    let html: string;
    try {
      html = normalizeReactShell(await renderReactEmail(element));
    } finally {
      if (currentNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = currentNodeEnv;
    }
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

function staticStringChildren(children: t.JSXElement["children"]): string | undefined {
  let result = "";
  for (const child of children) {
    if (t.isJSXText(child)) {
      result += cleanJsxText(child.value);
      continue;
    }
    if (t.isJSXExpressionContainer(child) && t.isExpression(child.expression)) {
      const value = staticValue(child.expression);
      if (value.known && typeof value.value === "string") {
        result += value.value;
        continue;
      }
    }
    if (t.isJSXExpressionContainer(child) && t.isJSXEmptyExpression(child.expression)) continue;
    return undefined;
  }
  return result;
}

function jsxAttributeExpression(attribute: t.JSXAttribute, id: string): t.Expression {
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

function compileProps(
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
    properties.push(
      t.spreadElement(
        t.callExpression(t.identifier(RUNTIME_CLASS_PROPS), [
          dynamicClassName.expression,
          compiledClassTable(dynamicClassName.candidates, tailwindStyles),
          styleExpression ?? t.nullLiteral(),
        ]),
      ),
    );
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

async function compileTailwindStyles(
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

function collectClassNames(ast: t.File, id: string, tailwindEnabled: boolean): CollectedClassNames {
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

function collectExportedComponentNames(ast: t.File, componentNames: Set<string>): string[] {
  const names = new Set<string>();
  for (const statement of ast.program.body) {
    if (t.isExportNamedDeclaration(statement)) {
      const declaration = statement.declaration;
      if (t.isFunctionDeclaration(declaration) && declaration.id && componentNames.has(declaration.id.name)) {
        names.add(declaration.id.name);
      }
      for (const specifier of statement.specifiers) {
        if (t.isExportSpecifier(specifier) && t.isIdentifier(specifier.local) && componentNames.has(specifier.local.name)) {
          names.add(specifier.local.name);
        }
      }
    } else if (
      t.isExportDefaultDeclaration(statement) &&
      t.isFunctionDeclaration(statement.declaration) &&
      statement.declaration.id &&
      componentNames.has(statement.declaration.id.name)
    ) {
      names.add(statement.declaration.id.name);
    }
  }
  return [...names];
}

function collectStaticExportNames(ast: t.File, componentNames: Set<string>): string[] {
  const names: string[] = [];

  for (const statement of ast.program.body) {
    if (!t.isExportNamedDeclaration(statement) && !t.isExportDefaultDeclaration(statement)) continue;
    const declaration = statement.declaration;
    if (
      t.isFunctionDeclaration(declaration) &&
      declaration.id &&
      declaration.params.length === 0 &&
      componentNames.has(declaration.id.name)
    ) {
      names.push(declaration.id.name);
    }
  }

  return names;
}

function collectComponentNames(ast: t.File): Set<string> {
  const names = new Set<string>();

  traverse(ast, {
    FunctionDeclaration(path) {
      if (!path.node.id) return;
      if (!path.parentPath.isProgram() && !path.parentPath.isExportNamedDeclaration() && !path.parentPath.isExportDefaultDeclaration()) {
        return;
      }

      let containsJsx = false;
      path.traverse({
        JSXElement(innerPath) {
          containsJsx = true;
          innerPath.stop();
        },
        JSXFragment(innerPath) {
          containsJsx = true;
          innerPath.stop();
        },
      });
      if (containsJsx) names.add(path.node.id.name);
    },
  });

  return names;
}

function compileTextChildren(children: t.Node[], id: string): t.Expression {
  const expressions: t.Expression[] = [];

  for (const child of children) {
    if (t.isExpression(child)) {
      expressions.push(t.callExpression(t.identifier(RUNTIME_TEXT_VALUE), [child]));
      continue;
    }
    if (t.isJSXText(child)) {
      const value = cleanJsxText(child.value);
      if (value) expressions.push(t.stringLiteral(value));
      continue;
    }
    if (t.isJSXSpreadChild(child)) {
      throw new EmailCompilerError("JSX spread children are not supported", id, child);
    }
    if (t.isJSXElement(child) || t.isJSXFragment(child)) {
      throw new EmailCompilerError("Internal error: nested text JSX was not lowered", id, child);
    }
    if (!t.isJSXExpressionContainer(child)) {
      throw new EmailCompilerError("Unsupported JSX child", id, child);
    }
    if (t.isJSXEmptyExpression(child.expression)) continue;
    if (!t.isExpression(child.expression)) {
      throw new EmailCompilerError("Unsupported JSX child expression", id, child);
    }
    expressions.push(t.callExpression(t.identifier(RUNTIME_TEXT_VALUE), [child.expression]));
  }

  return concat(expressions);
}

function compileTextProps(
  attributes: Array<t.JSXAttribute | t.JSXSpreadAttribute>,
  id: string,
): t.ObjectExpression {
  const properties: Array<t.ObjectProperty | t.SpreadElement> = [];

  for (const attribute of attributes) {
    if (t.isJSXSpreadAttribute(attribute)) {
      properties.push(t.spreadElement(attribute.argument));
      continue;
    }
    const name = jsxNameToString(attribute.name);
    if (["className", "key", "ref", "dangerouslySetInnerHTML"].includes(name)) continue;
    properties.push(t.objectProperty(t.stringLiteral(name), jsxAttributeExpression(attribute, id)));
  }

  return t.objectExpression(properties);
}

function nodeLocationKey(node: t.Node): string | undefined {
  return node.start === null || node.start === undefined || node.end === null || node.end === undefined
    ? undefined
    : `${node.start}:${node.end}`;
}

function lowerTextAst(
  ast: t.File,
  id: string,
  reactEmailBindings: Map<string, string>,
  importedBindings: Map<string, string>,
  staticPrimitiveText: Map<string, string>,
): void {
  traverse(ast, {
    JSXElement: {
      exit(path) {
        const staticText = staticPrimitiveText.get(nodeLocationKey(path.node) ?? "");
        if (staticText !== undefined) {
          path.replaceWith(t.stringLiteral(staticText));
          return;
        }

        const opening = path.node.openingElement;
        const name = jsxNameToString(opening.name);
        const children = compileTextChildren(path.node.children, id);
        let replacement: t.Expression;

        if (t.isJSXIdentifier(opening.name) && /^[a-z]/.test(opening.name.name)) {
          replacement = t.callExpression(t.identifier(RUNTIME_TEXT_ELEMENT), [
            t.stringLiteral(opening.name.name),
            compileTextProps(opening.attributes, id),
            children,
          ]);
        } else if (t.isJSXIdentifier(opening.name) && reactEmailBindings.has(opening.name.name)) {
          const primitive = reactEmailBindings.get(opening.name.name)!;
          replacement = t.callExpression(t.identifier(RUNTIME_TEXT_PRIMITIVE), [
            t.stringLiteral(primitive),
            compileTextProps(opening.attributes, id),
            children,
          ]);
        } else if (t.isJSXIdentifier(opening.name)) {
          const importedFrom = importedBindings.get(opening.name.name);
          if (importedFrom && !isEmailComponentImport(importedFrom)) {
            throw new EmailCompilerError(
              `Component <${opening.name.name}> must be imported from another .email.tsx module`,
              id,
              opening.name,
            );
          }
          const props = compileTextProps(opening.attributes, id);
          props.properties.push(t.objectProperty(t.identifier("children"), children));
          replacement = t.callExpression(t.identifier(RUNTIME_TEXT_COMPONENT), [
            t.identifier(opening.name.name),
            props,
          ]);
        } else if (t.isJSXMemberExpression(opening.name) && jsxNameToString(opening.name) === "React.Fragment") {
          replacement = children;
        } else {
          throw new EmailCompilerError(`Unsupported JSX element in text renderer: ${name}`, id, opening.name);
        }

        path.replaceWith(replacement);
      },
    },
    JSXFragment: {
      exit(path) {
        path.replaceWith(compileTextChildren(path.node.children, id));
      },
    },
  });
}

function extractTextFunctions(ast: t.File, componentNames: Set<string>): t.FunctionDeclaration[] {
  const functions: t.FunctionDeclaration[] = [];

  for (const statement of ast.program.body) {
    const declaration =
      t.isExportNamedDeclaration(statement) || t.isExportDefaultDeclaration(statement)
        ? statement.declaration
        : statement;
    if (!t.isFunctionDeclaration(declaration) || !declaration.id || !componentNames.has(declaration.id.name)) {
      continue;
    }

    const originalName = declaration.id.name;
    const clone = t.cloneNode(declaration, true);
    clone.id = t.identifier(`${originalName}$text`);
    functions.push(clone);
  }

  return functions;
}

function isTypeReference(path: NodePath): boolean {
  return Boolean(path.findParent((parent) => parent.isTSType()));
}

function isEmailComponentImport(source: string): boolean {
  return /(?:^|\/)\w[\w.-]*\.email(?:\.[cm]?[jt]sx?)?$/.test(source);
}

export async function compileEmailModule(
  code: string,
  id: string,
  options: CompilerOptions = {},
): Promise<CompileResult> {
  if (!/\.email\.tsx(?:\?.*)?$/.test(id)) {
    throw new EmailCompilerError("Only .email.tsx modules can be compiled", id);
  }

  const compilationSession = options.compilationSession ?? new CompilationSession();
  compilationSession.beginModule();

  const parserOptions: ParserOptions = {
    sourceType: "module",
    sourceFilename: id,
    plugins: ["jsx", "typescript"],
  };
  const ast = parse(code, parserOptions);
  const textAst = parse(code, parserOptions);
  const componentNames = collectComponentNames(ast);
  const exportedComponentNames = collectExportedComponentNames(ast, componentNames);
  const staticExportNames = collectStaticExportNames(ast, componentNames);
  const evaluationOptions =
    typeof options.evaluateModule === "object" ? options.evaluateModule : undefined;
  const shouldEvaluateModule = Boolean(
    options.evaluateModule && (staticExportNames.length > 0 || options.discoverExports),
  );
  const evaluation = shouldEvaluateModule
    ? evaluateEmailModule(code, id, evaluationOptions)
    : undefined;
  const preRenderedStaticExports =
    options.evaluateModule && options.preRenderStaticExports !== false
      ? Promise.all(
          staticExportNames.map(async (exportName) => [
            exportName,
            await renderEmailModuleExport(code, id, exportName, {}, evaluationOptions),
          ] as const),
        ).then((entries) => new Map<string, EvaluatedEmailRender>(entries))
      : undefined;

  const reactEmailBindings = new Map<string, string>();
  const importedBindings = new Map<string, string>();
  let hasTailwind = false;

  traverse(ast, {
    ImportDeclaration(path) {
      for (const specifier of path.node.specifiers) {
        importedBindings.set(specifier.local.name, path.node.source.value);
      }
      if (path.node.source.value !== "react-email") return;
      for (const specifier of path.node.specifiers) {
        if (!t.isImportSpecifier(specifier)) {
          throw new EmailCompilerError("Namespace and default imports from react-email are not supported", id, specifier);
        }
        const imported = t.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value;
        if (!SUPPORTED_PRIMITIVES.has(imported)) {
          const staticExport = (ReactEmail as unknown as Record<string, unknown>)[imported];
          if (!staticExport || typeof staticExport !== "object") {
            throw new EmailCompilerError(`Unsupported React Email primitive or value: ${imported}`, id, specifier);
          }
          const binding = path.scope.getBinding(specifier.local.name);
          for (const reference of binding?.referencePaths ?? []) {
            reference.replaceWith(t.valueToNode(staticExport));
          }
          continue;
        }
        reactEmailBindings.set(specifier.local.name, imported);
        if (imported === "Tailwind") hasTailwind = true;
      }
    },
  });

  if (hasTailwind && !options.tailwindConfig) {
    throw new EmailCompilerError(
      "This template uses <Tailwind>, but the plugin has no tailwindConfig option",
      id,
    );
  }

  const collectedClassNames = collectClassNames(ast, id, Boolean(options.tailwindConfig));
  const tailwindStyles = await compileTailwindStyles(
    collectedClassNames.classNames,
    options.tailwindConfig,
    compilationSession,
  );
  const primitiveShells = new WeakMap<t.JSXElement, PrimitiveShell>();
  const staticPrimitiveText = new Map<string, string>();
  if (
    options.renderStaticPrimitives === false &&
    [...reactEmailBindings.values()].some((name) => name === "CodeBlock" || name === "Markdown")
  ) {
    throw new EmailCompilerError(
      "CodeBlock and Markdown require renderStaticPrimitives because parsing runs at build time",
      id,
    );
  }
  if (options.renderStaticPrimitives !== false) {
    const shellTasks: Promise<void>[] = [];
    traverse(ast, {
      JSXElement(path) {
        const opening = path.node.openingElement;
        if (!t.isJSXIdentifier(opening.name)) return;
        const primitive = reactEmailBindings.get(opening.name.name);
        if (!primitive) return;
        const props = compileProps(
          opening.attributes,
          tailwindStyles,
          collectedClassNames.dynamic,
          id,
        );
        const parserPrimitive = primitive === "CodeBlock" || primitive === "Markdown";
        if (parserPrimitive && !staticValue(props).known) {
          throw new EmailCompilerError(
            `${primitive} requires statically analyzable props so its parser can run at build time`,
            id,
            path.node,
          );
        }
        const staticChildren = primitive === "Markdown" ? staticStringChildren(path.node.children) : undefined;
        if (primitive === "Markdown" && staticChildren === undefined) {
          throw new EmailCompilerError(
            "Markdown requires static string children so Markdown parsing can run at build time",
            id,
            path.node,
          );
        }
        shellTasks.push(
          renderPrimitiveShell(primitive, props, compilationSession, staticChildren).then((shell) => {
            if (!shell) return;
            primitiveShells.set(path.node, shell);
            const location = nodeLocationKey(path.node);
            if (location && parserPrimitive && shell.text !== undefined) {
              staticPrimitiveText.set(location, shell.text);
            }
          }),
        );
      },
    });
    await Promise.all(shellTasks);
  }
  const reactNodeTypes = collectReactNodeTypes(ast.program);
  lowerTextAst(textAst, id, reactEmailBindings, importedBindings, staticPrimitiveText);
  const textFunctions = extractTextFunctions(textAst, componentNames);
  const generated = new WeakSet<t.Node>();

  traverse(ast, {
    JSXElement: {
      exit(path) {
        const opening = path.node.openingElement;
        const name = jsxNameToString(opening.name);
        const children = compileChildren(path.node.children, path, reactNodeTypes, generated, id);

        let replacement: t.Expression;
        if (t.isJSXIdentifier(opening.name) && /^[a-z]/.test(opening.name.name)) {
          replacement = t.callExpression(t.identifier(RUNTIME_ELEMENT), [
            t.stringLiteral(opening.name.name),
            compileProps(
              opening.attributes,
              tailwindStyles,
              collectedClassNames.dynamic,
              id,
            ),
            children,
          ]);
        } else if (t.isJSXIdentifier(opening.name) && reactEmailBindings.has(opening.name.name)) {
          const primitive = reactEmailBindings.get(opening.name.name)!;
          const shell = primitiveShells.get(path.node);
          const specializedRenderer = {
            Button: RUNTIME_BUTTON,
            Html: RUNTIME_HTML,
            Img: RUNTIME_IMG,
            Preview: RUNTIME_PREVIEW,
            Section: RUNTIME_SECTION,
          }[primitive];
          replacement =
            primitive === "Tailwind"
              ? children
              : shell
                ? shell.consumesChildren
                  ? t.stringLiteral(shell.prefix + shell.suffix)
                  : concat([
                      t.stringLiteral(shell.prefix),
                      children,
                      t.stringLiteral(shell.suffix),
                    ])
                : t.callExpression(t.identifier(specializedRenderer ?? RUNTIME_PRIMITIVE), [
                    ...(specializedRenderer ? [] : [t.stringLiteral(primitive)]),
                    compileProps(
                      opening.attributes,
                      tailwindStyles,
                      collectedClassNames.dynamic,
                      id,
                    ),
                    children,
                  ]);
        } else if (t.isJSXIdentifier(opening.name)) {
          const importedFrom = importedBindings.get(opening.name.name);
          if (importedFrom && !isEmailComponentImport(importedFrom)) {
            throw new EmailCompilerError(
              `Component <${opening.name.name}> must be imported from another .email.tsx module`,
              id,
              opening.name,
            );
          }
          const props = compileProps(
            opening.attributes,
            tailwindStyles,
            collectedClassNames.dynamic,
            id,
          );
          props.properties.push(t.objectProperty(t.identifier("children"), children));
          replacement = t.callExpression(t.identifier(opening.name.name), [props]);
        } else if (
          t.isJSXMemberExpression(opening.name) &&
          jsxNameToString(opening.name) === "React.Fragment"
        ) {
          replacement = children;
        } else if (t.isJSXMemberExpression(opening.name)) {
          const props = compileProps(
            opening.attributes,
            tailwindStyles,
            collectedClassNames.dynamic,
            id,
          );
          props.properties.push(t.objectProperty(t.identifier("children"), children));
          replacement = t.callExpression(memberExpressionFromJsx(opening.name), [props]);
        } else {
          throw new EmailCompilerError(`Unsupported JSX element: ${name}`, id, opening.name);
        }

        generated.add(replacement);
        path.replaceWith(replacement);
      },
    },
    JSXFragment: {
      exit(path) {
        const replacement = compileChildren(path.node.children, path, reactNodeTypes, generated, id);
        generated.add(replacement);
        path.replaceWith(replacement);
      },
    },
  });

  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source.value === "react-email") {
        path.remove();
        return;
      }
      if (path.node.source.value !== "react") return;

      const hasRuntimeReference = path.node.specifiers.some((specifier) => {
        const binding = path.scope.getBinding(specifier.local.name);
        return binding?.referencePaths.some((reference) => !isTypeReference(reference));
      });
      if (hasRuntimeReference) {
        throw new EmailCompilerError("React runtime APIs are not supported in .email.tsx files", id, path.node);
      }
      path.node.importKind = "type";
    },
  });

  ast.program.body.push(...textFunctions);
  for (const componentName of exportedComponentNames) {
    const htmlRenderer = `${componentName}$html`;
    const args = t.identifier("args");
    ast.program.body.push(
      t.variableDeclaration("const", [
        t.variableDeclarator(t.identifier(htmlRenderer), t.identifier(componentName)),
      ]),
      t.expressionStatement(
        t.assignmentExpression(
          "=",
          t.identifier(componentName),
          t.arrowFunctionExpression(
            [t.restElement(args)],
            t.callExpression(t.identifier(RUNTIME_COMPILED_VALUE), [
              t.callExpression(t.identifier(htmlRenderer), [t.spreadElement(args)]),
              t.arrowFunctionExpression(
                [],
                t.callExpression(t.identifier(RUNTIME_RENDER_TEXT), [
                  t.identifier(componentName),
                  t.memberExpression(args, t.numericLiteral(0), true),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
  for (const componentName of componentNames) {
    ast.program.body.push(
      t.expressionStatement(
        t.callExpression(t.identifier(RUNTIME_ATTACH_TEXT), [
          t.identifier(componentName),
          t.identifier(`${componentName}$text`),
        ]),
      ),
    );
  }

  const staticRenders = preRenderedStaticExports
    ? await preRenderedStaticExports
    : new Map<string, EvaluatedEmailRender>();
  if (staticRenders.size > 0) {
    traverse(ast, {
      FunctionDeclaration(path) {
        const name = path.node.id?.name;
        if (!name) return;
        const isTextRenderer = name.endsWith("$text");
        const sourceName = isTextRenderer ? name.slice(0, -"$text".length) : name;
        const rendered = staticRenders.get(sourceName);
        if (!rendered) return;
        path.node.body = t.blockStatement([
          t.returnStatement(t.stringLiteral(isTextRenderer ? rendered.text : rendered.html)),
        ]);
      },
      CallExpression(path) {
        if (!t.isIdentifier(path.node.callee, { name: RUNTIME_ATTACH_TEXT })) return;
        const template = path.node.arguments[0];
        if (!t.isIdentifier(template) || !staticRenders.has(template.name)) return;
        path.node.arguments.push(t.booleanLiteral(true));
      },
    });
  }

  ast.program.body.unshift(
    t.importDeclaration(
      [
        t.importSpecifier(t.identifier(RUNTIME_ATTACH_TEXT), t.identifier("attachTextRenderer")),
        t.importSpecifier(t.identifier(RUNTIME_COMPILED_VALUE), t.identifier("compiledEmailValue")),
        t.importSpecifier(t.identifier(RUNTIME_RENDER_TEXT), t.identifier("renderCompiledEmailText")),
        t.importSpecifier(t.identifier(RUNTIME_BUTTON), t.identifier("buttonPrimitive")),
        t.importSpecifier(t.identifier(RUNTIME_CLASS_PROPS), t.identifier("tailwindClassProps")),
        t.importSpecifier(t.identifier(RUNTIME_HTML), t.identifier("htmlPrimitive")),
        t.importSpecifier(t.identifier(RUNTIME_IMG), t.identifier("imgPrimitive")),
        t.importSpecifier(t.identifier(RUNTIME_PREVIEW), t.identifier("previewPrimitive")),
        t.importSpecifier(t.identifier(RUNTIME_SECTION), t.identifier("sectionPrimitive")),
        t.importSpecifier(t.identifier(RUNTIME_ELEMENT), t.identifier("element")),
        t.importSpecifier(t.identifier(RUNTIME_ESCAPE), t.identifier("escapeText")),
        t.importSpecifier(t.identifier(RUNTIME_PRIMITIVE), t.identifier("primitive")),
        t.importSpecifier(t.identifier(RUNTIME_RAW), t.identifier("raw")),
        t.importSpecifier(t.identifier(RUNTIME_TEXT_COMPONENT), t.identifier("textComponent")),
        t.importSpecifier(t.identifier(RUNTIME_TEXT_ELEMENT), t.identifier("textElement")),
        t.importSpecifier(t.identifier(RUNTIME_TEXT_PRIMITIVE), t.identifier("textPrimitive")),
        t.importSpecifier(t.identifier(RUNTIME_TEXT_VALUE), t.identifier("textValue")),
      ],
      t.stringLiteral(options.runtimeModule ?? "react-email-compiler/runtime"),
    ),
  );

  const output = generate(
    ast,
    {
      sourceMaps: true,
      sourceFileName: id,
      retainLines: false,
    },
    code,
  );

  const evaluatedModule = evaluation ? await evaluation : undefined;
  return {
    code: output.code,
    ...(evaluatedModule ? { evaluatedModule } : {}),
    map: output.map,
  };
}
