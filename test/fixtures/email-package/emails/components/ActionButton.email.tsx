import { Button, Section } from "react-email";

export interface ActionButtonProps {
  href: string;
  label: string;
}

export function ActionButton({ href, label }: ActionButtonProps) {
  return (
    <Section className="my-6 text-center">
      <Button
        href={href}
        className="inline-block rounded-lg bg-[#2563eb] px-5 py-3 font-semibold text-white no-underline"
      >
        {label}
      </Button>
    </Section>
  );
}
