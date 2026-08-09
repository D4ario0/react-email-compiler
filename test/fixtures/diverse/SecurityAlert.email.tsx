import { Body, Button, Container, Head, Html, Preview, Text } from "react-email";

export interface SecurityAlertProps {
  device: string;
  location: string;
  recognized: boolean;
  reviewUrl: string;
  recoverySteps: string[];
}

export function SecurityAlertEmail({
  device,
  location,
  recognized,
  reviewUrl,
  recoverySteps,
}: SecurityAlertProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>New sign-in from {device}</Preview>
      <Body>
        <Container>
          <Text>New sign-in from {device}</Text>
          <Text>Approximate location: {location}</Text>
          {recognized ? (
            <Text>No action is required.</Text>
          ) : (
            <>
              <Text>Secure your account:</Text>
              {recoverySteps.map((step) => (
                <Text key={step}>• {step}</Text>
              ))}
              <Button href={reviewUrl}>Review activity</Button>
            </>
          )}
        </Container>
      </Body>
    </Html>
  );
}
