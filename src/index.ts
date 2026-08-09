export {
  compileEmailModule,
  EmailCompilerError,
  type CompilerOptions,
  type CompileResult,
} from "./compiler";
export {
  evaluateEmailModule,
  renderEmailModuleExport,
  type EvaluatedEmailExport,
  type EvaluatedEmailModule,
  type EvaluatedEmailRender,
  type EvaluateEmailModuleOptions,
} from "./evaluator";
export {
  concatIR,
  expressionIR,
  generateIR,
  staticIR,
  type EmailIR,
} from "./ir";
export {
  CompilationSession,
  type CompilationSessionStats,
} from "./session";
export {
  unplugin as default,
  unplugin,
  unpluginFactory,
  type ReactEmailCompilerOptions,
} from "./unplugin";
