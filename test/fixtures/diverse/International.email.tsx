import { Body, Container, Head, Html, Preview, Text } from "react-email";

export interface InternationalProps {
  language: string;
  direction: "ltr" | "rtl";
  recipient: string;
  messages: string[];
}

export function InternationalEmail({
  language,
  direction,
  recipient,
  messages,
}: InternationalProps) {
  return (
    <Html lang={language} dir={direction}>
      <Head />
      <Preview>مرحباً — こんにちは — Hello 👋</Preview>
      <Body>
        <Container>
          <Text>مرحباً {recipient} 👋</Text>
          {messages.map((message) => (
            <Text key={message}>{message}</Text>
          ))}
          <Text>© 2026 — café &amp; résumé</Text>
        </Container>
      </Body>
    </Html>
  );
}
