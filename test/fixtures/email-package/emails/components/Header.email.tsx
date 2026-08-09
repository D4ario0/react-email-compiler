import { Img, Section } from "react-email";

export interface HeaderProps {
  assetBaseUrl?: string | undefined;
  className?: string | undefined;
}

export function Header({
  assetBaseUrl,
  className = "mb-8 text-center",
}: HeaderProps) {
  const src = assetBaseUrl
    ? `${assetBaseUrl}/logo.png`
    : "https://example.com/logo.png";

  return (
    <Section className={className}>
      <Img src={src} width="120" alt="Example Application" className="mx-auto w-[120px]" />
    </Section>
  );
}
