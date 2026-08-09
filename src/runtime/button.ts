import { element } from "./html";
import { splitBoxValue } from "./layout";
import type { EmailProps } from "./types";

type BoxValue = string | number | undefined;

function toPixels(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const match = /^([\d.]+)(px|em|rem|%)$/.exec(String(value));
  if (!match) return 0;
  const number = Number.parseFloat(match[1]!);
  if (match[2] === "em" || match[2] === "rem") return number * 16;
  if (match[2] === "%") return (number / 100) * 600;
  return number;
}

function boxValue(value: unknown): BoxValue {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function parsePadding(style: EmailProps) {
  let [top, right, bottom, left] = splitBoxValue(style.padding);
  top = boxValue(style.paddingTop) ?? top;
  right = boxValue(style.paddingRight) ?? right;
  bottom = boxValue(style.paddingBottom) ?? bottom;
  left = boxValue(style.paddingLeft) ?? left;

  return {
    paddingTop: top ? toPixels(top) : undefined,
    paddingRight: right ? toPixels(right) : undefined,
    paddingBottom: bottom ? toPixels(bottom) : undefined,
    paddingLeft: left ? toPixels(left) : undefined,
  };
}

function buttonSpace(expectedWidth: number) {
  if (expectedWidth === 0) return [0, 0] as const;
  let spaces = 0;
  while ((spaces > 0 ? expectedWidth / spaces / 2 : Number.POSITIVE_INFINITY) > 5) spaces++;
  return [expectedWidth / spaces / 2, spaces] as const;
}

export function buttonPrimitive(props: EmailProps, children: string): string {
  const { style: rawStyle, target = "_blank", ...attributes } = props;
  const style = (rawStyle && typeof rawStyle === "object" ? rawStyle : {}) as EmailProps;
  const padding = parsePadding(style);
  const verticalPadding = (padding.paddingTop ?? 0) + (padding.paddingBottom ?? 0);
  const textRaise = (verticalPadding * 3) / 4;
  const [leftWidth, leftSpaces] = buttonSpace(padding.paddingLeft ?? 0);
  const [rightWidth, rightSpaces] = buttonSpace(padding.paddingRight ?? 0);

  const anchorStyle = {
    lineHeight: "100%",
    textDecoration: "none",
    display: "inline-block",
    maxWidth: "100%",
    msoPaddingAlt: "0px",
    ...style,
    ...padding,
  };
  const left = `<!--[if mso]><i style="mso-font-width:${leftWidth * 100}%;mso-text-raise:${textRaise}px" hidden>${"&#8202;".repeat(leftSpaces)}</i><![endif]-->`;
  const right = `<!--[if mso]><i style="mso-font-width:${rightWidth * 100}%" hidden>${"&#8202;".repeat(rightSpaces)}&#8203;</i><![endif]-->`;

  return element(
    "a",
    { ...attributes, style: anchorStyle, target },
    element("span", { dangerouslySetInnerHTML: { __html: left } }) +
      element(
        "span",
        {
          style: {
            maxWidth: "100%",
            display: "inline-block",
            lineHeight: "120%",
            msoPaddingAlt: "0px",
            msoTextRaise:
              typeof padding.paddingBottom === "number" ? (padding.paddingBottom * 3) / 4 : undefined,
          },
        },
        children,
      ) +
      element("span", { dangerouslySetInnerHTML: { __html: right } }),
  );
}

