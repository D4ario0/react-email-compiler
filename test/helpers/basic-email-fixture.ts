export const basicEmailFixtureFiles = {
  "Welcome.email.tsx": `
    import { Html, Text } from "react-email";
    export function Welcome({ name }: { name: string }) {
      return <Html><Text>Hello {name}</Text></Html>;
    }
  `,
  "entry.ts": `
    import { render } from "@react-email/render";
    import { Welcome } from "./Welcome.email";
    export const html = await render(Welcome({ name: "<Alex>" }));
    export const text = await render(Welcome({ name: "<Alex>" }), { plainText: true });
  `,
} as const;
