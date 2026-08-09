import {
  CodeInline,
  Column,
  Font,
  Head,
  Heading,
  Html,
  Row,
  Text,
} from "react-email";

export interface RemainingPrimitivesProps {
  title: string;
  inlineCode: string;
}

export function RemainingPrimitivesEmail({
  title,
  inlineCode,
}: RemainingPrimitivesProps) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily={["Arial", "sans-serif"]}
          webFont={{ url: "https://example.com/inter.woff2", format: "woff2" }}
          fontWeight={400}
        />
      </Head>
      <Heading as="h2" mt={12} mb="8" style={{ color: "#123456" }}>
        {title}
      </Heading>
      <Row style={{ tableLayout: "fixed" }}>
        <Column width="50%">
          <Text>
            Run <CodeInline className="command">{inlineCode}</CodeInline>
          </Text>
        </Column>
        <Column width="50%">
          <Text>Then inspect the output.</Text>
        </Column>
      </Row>
    </Html>
  );
}
