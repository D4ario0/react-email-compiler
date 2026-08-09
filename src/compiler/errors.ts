import type * as t from "@babel/types";

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
