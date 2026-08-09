import type { EmailProps } from "./types";

type BoxValue = string | number | undefined;

export function splitBoxValue(value: unknown): readonly [BoxValue, BoxValue, BoxValue, BoxValue] {
  if (typeof value === "number") return [value, value, value, value];
  if (typeof value !== "string") return [undefined, undefined, undefined, undefined];

  const values = value.trim().split(/\s+/);
  if (values.length === 1) return [values[0], values[0], values[0], values[0]] as const;
  if (values.length === 2) return [values[0], values[1], values[0], values[1]] as const;
  if (values.length === 3) return [values[0], values[1], values[2], values[1]] as const;
  return [values[0], values[1], values[2], values[3]] as const;
}

export function computeMargins(style: EmailProps): EmailProps {
  let margins: EmailProps = {
    marginTop: style.marginTop === undefined ? "16px" : undefined,
    marginBottom: style.marginBottom === undefined ? "16px" : undefined,
  };

  for (const [property, value] of Object.entries(style)) {
    if (property === "margin") {
      const [marginTop, marginRight, marginBottom, marginLeft] = splitBoxValue(value);
      margins = { marginTop, marginRight, marginBottom, marginLeft };
    } else if (["marginTop", "marginRight", "marginBottom", "marginLeft"].includes(property)) {
      margins[property] = value;
    }
  }

  return margins;
}

export function splitTableStyle(style: EmailProps) {
  const tableStyle: EmailProps = {};
  const cellStyle: EmailProps = {};

  for (const [property, value] of Object.entries(style)) {
    if (["padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].includes(property)) {
      cellStyle[property] = value;
    } else {
      tableStyle[property] = value;
    }
  }

  return { tableStyle, cellStyle };
}

