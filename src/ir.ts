import * as t from "@babel/types";

export type EmailIR = StaticIR | ExpressionIR | ConcatIR;

export interface StaticIR {
  kind: "static";
  value: string;
}

export interface ExpressionIR {
  kind: "expression";
  expression: t.Expression;
}

export interface ConcatIR {
  kind: "concat";
  parts: EmailIR[];
}

export function staticIR(value: string): StaticIR {
  return { kind: "static", value };
}

export function expressionIR(expression: t.Expression): ExpressionIR {
  return { kind: "expression", expression };
}

export function concatIR(parts: EmailIR[]): EmailIR {
  const flattened: EmailIR[] = [];

  for (const part of parts) {
    const candidates = part.kind === "concat" ? part.parts : [part];
    for (const candidate of candidates) {
      if (candidate.kind === "static" && candidate.value === "") continue;
      const previous = flattened.at(-1);
      if (previous?.kind === "static" && candidate.kind === "static") {
        previous.value += candidate.value;
      } else {
        flattened.push(candidate);
      }
    }
  }

  if (flattened.length === 0) return staticIR("");
  if (flattened.length === 1) return flattened[0]!;
  return { kind: "concat", parts: flattened };
}

export function generateIR(ir: EmailIR): t.Expression {
  if (ir.kind === "static") return t.stringLiteral(ir.value);
  if (ir.kind === "expression") return ir.expression;

  let result = generateIR(ir.parts[0]!);
  for (const part of ir.parts.slice(1)) {
    result = t.binaryExpression("+", result, generateIR(part));
  }
  return result;
}
