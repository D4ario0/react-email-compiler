import traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { concatIR, expressionIR, generateIR, staticIR } from "../ir";
import { RUNTIME_ESCAPE, RUNTIME_RAW } from "./constants";
import { EmailCompilerError } from "./errors";
import { cleanJsxText, jsxNameToString } from "./jsx-utils";

function escapeStaticText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

export function memberExpressionFromJsx(name: t.JSXMemberExpression): t.MemberExpression {
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

export function collectReactNodeTypes(program: t.Program): Map<string, Set<string>> {
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

export function concat(expressions: t.Expression[]): t.Expression {
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

export function compileChildren(
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

