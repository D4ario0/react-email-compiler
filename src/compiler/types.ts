import type generate from "@babel/generator";
import type * as t from "@babel/types";
import type { TailwindConfig } from "react-email";
import type { EvaluatedEmailModule, EvaluateEmailModuleOptions } from "../evaluator";
import type { CompilationSession } from "../session";

export interface CompilerOptions {
  evaluateModule?: boolean | EvaluateEmailModuleOptions;
  discoverExports?: boolean;
  preRenderStaticExports?: boolean;
  renderStaticPrimitives?: boolean;
  runtimeModule?: string;
  tailwindConfig?: TailwindConfig;
  compilationSession?: CompilationSession;
}

export interface CompileResult {
  code: string;
  evaluatedModule?: EvaluatedEmailModule;
  map: ReturnType<typeof generate>["map"];
}

export interface TailwindStyles {
  residualClassName?: string;
  style: Record<string, string>;
}

export interface PrimitiveShell {
  prefix: string;
  suffix: string;
  text?: string;
  consumesChildren?: boolean;
}

export interface StaticValue {
  known: boolean;
  value?: unknown;
}

export interface DynamicClassName {
  candidates: string[];
  expression: t.Expression;
}

export interface CollectedClassNames {
  classNames: Set<string>;
  dynamic: WeakMap<t.JSXAttribute, DynamicClassName>;
}
