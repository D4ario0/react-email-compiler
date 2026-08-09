import traverse from "@babel/traverse";
import * as t from "@babel/types";
import * as ReactEmail from "react-email";
import { SUPPORTED_PRIMITIVES } from "./constants";
import { EmailCompilerError } from "./errors";

export interface ImportAnalysis {
  hasTailwind: boolean;
  importedBindings: Map<string, string>;
  reactEmailBindings: Map<string, string>;
}

export function analyzeImports(ast: t.File, id: string): ImportAnalysis {
  const reactEmailBindings = new Map<string, string>();
  const importedBindings = new Map<string, string>();
  let hasTailwind = false;

  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      for (const specifier of path.node.specifiers) {
        importedBindings.set(specifier.local.name, source);
      }
      if (source !== "react-email") return;

      for (const specifier of path.node.specifiers) {
        if (!t.isImportSpecifier(specifier)) {
          throw new EmailCompilerError(
            "Namespace and default imports from react-email are not supported",
            id,
            specifier,
          );
        }

        const imported = t.isIdentifier(specifier.imported)
          ? specifier.imported.name
          : specifier.imported.value;
        if (SUPPORTED_PRIMITIVES.has(imported)) {
          reactEmailBindings.set(specifier.local.name, imported);
          hasTailwind ||= imported === "Tailwind";
          continue;
        }

        const staticExport = (ReactEmail as unknown as Record<string, unknown>)[imported];
        if (!staticExport || typeof staticExport !== "object") {
          throw new EmailCompilerError(
            `Unsupported React Email primitive or value: ${imported}`,
            id,
            specifier,
          );
        }

        const binding = path.scope.getBinding(specifier.local.name);
        for (const reference of binding?.referencePaths ?? []) {
          reference.replaceWith(t.valueToNode(staticExport));
        }
      }
    },
  });

  return { hasTailwind, importedBindings, reactEmailBindings };
}
