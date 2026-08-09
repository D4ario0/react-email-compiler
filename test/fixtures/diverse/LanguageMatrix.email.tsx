import type { ReactNode } from "react";
import { Body, Container, Head, Html, Link, Section, Text } from "react-email";

interface BadgeProps {
  children: ReactNode;
  tone?: string;
}

function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span data-tone={tone} style={{ fontWeight: "bold" }}>
      {children}
    </span>
  );
}

export interface LanguageMatrixProps {
  salutation?: string;
  enabled: boolean;
  fallback?: string | null;
  groups: Array<{
    title: string;
    links: Array<{ label: string; url: string }>;
  }>;
}

export function LanguageMatrixEmail({
  salutation = "Hello",
  enabled,
  fallback,
  groups,
}: LanguageMatrixProps) {
  return (
    <Html lang="en">
      <Head />
      <Body>
        <Container data-enabled={enabled}>
          <Text>
            {salutation} <Badge tone={enabled ? "positive" : "muted"}>developer</Badge>
          </Text>
          {enabled && (
            <Section>
              <Text>{fallback ?? "Fallback content"}</Text>
            </Section>
          )}
          {groups.map((group) => (
            <Section key={group.title}>
              <Text>{group.title}</Text>
              {group.links.map((link) => (
                <Link key={link.url} href={link.url}>
                  {link.label}
                </Link>
              ))}
            </Section>
          ))}
          {false}
          {null}
          {undefined}
        </Container>
      </Body>
    </Html>
  );
}
