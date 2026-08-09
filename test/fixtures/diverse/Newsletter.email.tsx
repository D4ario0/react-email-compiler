import { Body, Container, Head, Html, Link, Preview, Section, Text } from "react-email";

export interface NewsletterProps {
  title: string;
  introduction?: string;
  stories: Array<{ title: string; summary: string; url: string }>;
  footerNote?: string | null;
}

export function NewsletterEmail({ title, introduction, stories, footerNote }: NewsletterProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{title}</Preview>
      <Body>
        <Container>
          <Text style={{ fontSize: "28px", fontWeight: "bold" }}>{title}</Text>
          {introduction && <Text>{introduction}</Text>}
          {stories.map((story) => (
            <Section key={story.url} style={{ marginBottom: "20px" }}>
              <Link href={story.url}>{story.title}</Link>
              <Text>{story.summary}</Text>
            </Section>
          ))}
          {footerNote ?? <Text>No additional announcements.</Text>}
        </Container>
      </Body>
    </Html>
  );
}
