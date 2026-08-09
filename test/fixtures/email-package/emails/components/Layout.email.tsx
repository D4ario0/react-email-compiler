import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "react-email";
import type * as React from "react";
import { fixtureTailwindConfig } from "../../tailwind.email";
import { Header } from "./Header.email";

export interface LayoutProps {
  assetBaseUrl?: string | undefined;
  preview: string;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Layout({
  assetBaseUrl,
  preview,
  title,
  children,
  footer,
}: LayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
      </Head>
      <Tailwind config={fixtureTailwindConfig}>
        <Body className="font-fixture text-fixture-text bg-white py-8">
          <Preview>{preview}</Preview>
          <Container className="border-fixture-border mx-auto max-w-[560px] rounded-2xl border p-8">
            <Header assetBaseUrl={assetBaseUrl} />
            <Text className="m-0 mb-5 text-xl font-semibold">{title}</Text>
            <Section>{children}</Section>
            <Hr className="border-fixture-border my-6" />
            <Text className="text-fixture-muted m-0 text-xs">
              Example Application · Transactional notification
            </Text>
            {footer}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
