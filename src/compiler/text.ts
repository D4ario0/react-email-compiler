import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { concatIR, expressionIR, generateIR, staticIR } from "../ir";
import { isEmailComponentImport } from "./components";
import {
  RUNTIME_TEXT_COMPONENT,
  RUNTIME_TEXT_ELEMENT,
  RUNTIME_TEXT_PRIMITIVE,
  RUNTIME_TEXT_VALUE,
} from "./constants";
import { EmailCompilerError } from "./errors";
import {
  cleanJsxText,
  jsxAttributeExpression,
  jsxNameToString,
  nodeLocationKey,
} from "./jsx-utils";

function concat(expressions: t.Expression[]): t.Expression {
  return generateIR(
    concatIR(
      expressions.map((expression) =>
        t.isStringLiteral(expression) ? staticIR(expression.value) : expressionIR(expression),
      ),
    ),
  );
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

export function lowerTextAst(
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
          replacement = t.callExpression(t.identifier(RUNTIME_TEXT_PRIMITIVE), [
            t.stringLiteral(reactEmailBindings.get(opening.name.name)!),
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
        } else if (
          t.isJSXMemberExpression(opening.name) &&
          jsxNameToString(opening.name) === "React.Fragment"
        ) {
          replacement = children;
        } else {
          throw new EmailCompilerError(
            `Unsupported JSX element in text renderer: ${name}`,
            id,
            opening.name,
          );
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

export function extractTextFunctions(
  ast: t.File,
  componentNames: Set<string>,
): t.FunctionDeclaration[] {
  const functions: t.FunctionDeclaration[] = [];
  for (const statement of ast.program.body) {
    const declaration =
      t.isExportNamedDeclaration(statement) || t.isExportDefaultDeclaration(statement)
        ? statement.declaration
        : statement;
    if (!t.isFunctionDeclaration(declaration) || !declaration.id) continue;
    if (!componentNames.has(declaration.id.name)) continue;

    const clone = t.cloneNode(declaration, true);
    clone.id = t.identifier(`${declaration.id.name}$text`);
    functions.push(clone);
  }
  return functions;
}
