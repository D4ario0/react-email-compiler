import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "react-email";

export interface ReceiptProps {
  customer: string;
  orderId: string;
  items: Array<{ name: string; quantity: number; price: string }>;
  discount?: string;
  receiptUrl: string;
}

export function ReceiptEmail({ customer, orderId, items, discount, receiptUrl }: ReceiptProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Receipt for order {orderId}</Preview>
      <Body style={{ backgroundColor: "#f5f5f5", fontFamily: "Arial, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "24px" }}>
          <Text>Hello {customer},</Text>
          <Text>Order {orderId} is confirmed.</Text>
          <Section>
            {items.map((item) => (
              <Text key={item.name}>
                {item.quantity} × {item.name} — {item.price}
              </Text>
            ))}
          </Section>
          {discount ? <Text>Discount applied: {discount}</Text> : null}
          <Hr />
          <Link href={receiptUrl}>View receipt</Link>
        </Container>
      </Body>
    </Html>
  );
}
