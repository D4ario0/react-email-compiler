import generate from "@babel/generator";
import { parse, type ParserOptions } from "@babel/parser";
import traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import {
  evaluateEmailModule,
  renderEmailModuleExport,
  type EvaluatedEmailRender,
} from "../evaluator";
import { CompilationSession } from "../session";
import {
  collectComponentNames,
  collectExportedComponentNames,
  collectStaticExportNames,
  isEmailComponentImport,
} from "./components";
import {
  RUNTIME_ATTACH_TEXT,
  RUNTIME_BUTTON,
  RUNTIME_CLASS_PROPS,
  RUNTIME_COMPILED_VALUE,
  RUNTIME_ELEMENT,
  RUNTIME_ESCAPE,
  RUNTIME_HTML,
  RUNTIME_IMG,
  RUNTIME_PREVIEW,
  RUNTIME_PRIMITIVE,
  RUNTIME_RAW,
  RUNTIME_RENDER_TEXT,
  RUNTIME_SECTION,
  RUNTIME_TEXT_COMPONENT,
  RUNTIME_TEXT_ELEMENT,
  RUNTIME_TEXT_PRIMITIVE,
  RUNTIME_TEXT_VALUE,
} from "./constants";
import { EmailCompilerError } from "./errors";
import { analyzeImports } from "./imports";
import {
  collectReactNodeTypes,
  compileChildren,
  concat,
  memberExpressionFromJsx,
} from "./jsx";
import { jsxNameToString, nodeLocationKey } from "./jsx-utils";
import {
  renderPrimitiveShell,
  staticStringChildren,
  staticValue,
} from "./primitives";
import { extractTextFunctions, lowerTextAst } from "./text";
import {
  collectClassNames,
  compileProps,
  compileTailwindStyles,
} from "./tailwind";
import type { CompileResult, CompilerOptions, PrimitiveShell } from "./types";
export { EmailCompilerError } from "./errors";
export type { CompileResult, CompilerOptions } from "./types";
function isTypeReference(path: NodePath): boolean {
  return Boolean(path.findParent((parent) => parent.isTSType()));
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

  const { hasTailwind, importedBindings, reactEmailBindings } = analyzeImports(ast, id);

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
