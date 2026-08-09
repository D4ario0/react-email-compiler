import { CodeBlock, Head, Html, Markdown, xonokai } from "react-email";

export function StaticRichContentEmail() {
  return (
    <Html lang="en">
      <Head />
      <CodeBlock
        code={'const answer: number = 42;\nconsole.log(answer);'}
        language="typescript"
        lineNumbers
        theme={xonokai}
      />
      <Markdown>{'# Release notes\n\n- Added **AOT** compilation\n- Supports [links](https://example.com)\n\n`pnpm build`'}</Markdown>
    </Html>
  );
}
