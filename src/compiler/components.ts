import traverse from "@babel/traverse";
import * as t from "@babel/types";

function exportedFunctionName(statement: t.Statement): string | undefined {
  if (t.isExportNamedDeclaration(statement)) {
    const declaration = statement.declaration;
    return t.isFunctionDeclaration(declaration) ? declaration.id?.name : undefined;
  }
  if (!t.isExportDefaultDeclaration(statement)) return undefined;
  return t.isFunctionDeclaration(statement.declaration) ? statement.declaration.id?.name : undefined;
}

export function collectExportedComponentNames(
  ast: t.File,
  componentNames: Set<string>,
): string[] {
  const names = new Set<string>();
  for (const statement of ast.program.body) {
    const declarationName = exportedFunctionName(statement);
    if (declarationName && componentNames.has(declarationName)) names.add(declarationName);
    if (!t.isExportNamedDeclaration(statement)) continue;

    for (const specifier of statement.specifiers) {
      if (!t.isExportSpecifier(specifier) || !t.isIdentifier(specifier.local)) continue;
      if (componentNames.has(specifier.local.name)) names.add(specifier.local.name);
    }
  }
  return [...names];
}

export function collectStaticExportNames(
  ast: t.File,
  componentNames: Set<string>,
): string[] {
  const names: string[] = [];
  for (const statement of ast.program.body) {
    const declarationName = exportedFunctionName(statement);
    if (!declarationName || !componentNames.has(declarationName)) continue;
    const declaration = t.isExportNamedDeclaration(statement)
      ? statement.declaration
      : t.isExportDefaultDeclaration(statement)
        ? statement.declaration
        : undefined;
    if (t.isFunctionDeclaration(declaration) && declaration.params.length === 0) {
      names.push(declarationName);
    }
  }
  return names;
}

export function collectComponentNames(ast: t.File): Set<string> {
  const names = new Set<string>();
  traverse(ast, {
    FunctionDeclaration(path) {
      if (!path.node.id) return;
      const parent = path.parentPath;
      if (!parent.isProgram() && !parent.isExportNamedDeclaration() && !parent.isExportDefaultDeclaration()) {
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

export function isEmailComponentImport(source: string): boolean {
  return /(?:^|\/)\w[\w.-]*\.email(?:\.[cm]?[jt]sx?)?$/.test(source);
}
