import { CodeInline, Column, Font, Head, Heading, Html, Row, Text } from "react-email";

export interface PrimitiveMatrixProps {
  headingAs: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  heading: string;
  margin: string | number;
  invalidMargin?: string;
  rowLabel: string;
  leftWidth: string;
  rightWidth: string;
  inlineCode: string;
  codeClass?: string;
  includeWebFont: boolean;
}

export function PrimitiveMatrixEmail({
  headingAs,
  heading,
  margin,
  invalidMargin,
  rowLabel,
  leftWidth,
  rightWidth,
  inlineCode,
  codeClass = "matrix-code",
  includeWebFont,
}: PrimitiveMatrixProps) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Matrix Font"
          fallbackFontFamily={["Helvetica", "Verdana"]}
          {...(includeWebFont
            ? { webFont: { url: "https://example.com/matrix.woff", format: "woff" as const } }
            : {})}
          fontStyle="italic"
          fontWeight={700}
        />
      </Head>
      <Heading
        as={headingAs as "h1"}
        {...(invalidMargin === undefined ? {} : { m: invalidMargin })}
        mx={margin}
        mt={5}
        data-testid="matrix-heading"
        style={{ color: "#b91c1c", marginRight: "99px" }}
      >
        {heading}
      </Heading>
      <Row aria-label={rowLabel} style={{ backgroundColor: "#f8fafc" }}>
        <Column width={leftWidth} align="left">
          <Text>
            Empty-safe: {null} {false} <CodeInline className={codeClass}>{inlineCode}</CodeInline>
          </Text>
        </Column>
        <Column width={rightWidth} align="right">
          <Text>Unicode: café 日本語 🚀</Text>
        </Column>
      </Row>
    </Html>
  );
}
