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

export function PrimitiveMatrixEmail(props: PrimitiveMatrixProps) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Matrix Font"
          fallbackFontFamily={["Helvetica", "Verdana"]}
          {...(props.includeWebFont
            ? { webFont: { url: "https://example.com/matrix.woff", format: "woff" as const } }
            : {})}
          fontStyle="italic"
          fontWeight={700}
        />
      </Head>
      <Heading
        as={props.headingAs as "h1"}
        {...(props.invalidMargin === undefined ? {} : { m: props.invalidMargin })}
        mx={props.margin}
        mt={5}
        data-testid="matrix-heading"
        style={{ color: "#b91c1c", marginRight: "99px" }}
      >
        {props.heading}
      </Heading>
      <Row aria-label={props.rowLabel} style={{ backgroundColor: "#f8fafc" }}>
        <Column width={props.leftWidth} align="left">
          <Text>
            Empty-safe: {null} {false} <CodeInline className={props.codeClass}>{props.inlineCode}</CodeInline>
          </Text>
        </Column>
        <Column width={props.rightWidth} align="right">
          <Text>Unicode: café 日本語 🚀</Text>
        </Column>
      </Row>
    </Html>
  );
}
