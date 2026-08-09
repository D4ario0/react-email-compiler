import { Body, Container, Head, Html, Preview, Text } from "react-email";

export function StaticMaintenanceEmail() {
  return (
    <Html lang="en">
      <Head />
      <Preview>Scheduled maintenance</Preview>
      <Body>
        <Container>
          <Text>Scheduled maintenance</Text>
          <Text>The service will be unavailable briefly at 02:00 UTC.</Text>
        </Container>
      </Body>
    </Html>
  );
}
