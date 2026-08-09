import { CodeBlock, Heading, Html, dracula, oneLight, xonokai } from "react-email";

export function CodeBlockMatrixEmail({ title }: { title: string }) {
  return (
    <Html lang="en">
      <Heading as="h3">{title}</Heading>
      <CodeBlock
        code={'const escaped = "<tag> & value";\nconsole.log(escaped);'}
        language="javascript"
        theme={xonokai}
      />
      <CodeBlock
        code={'type User = { id: string };\nconst user: User = { id: "42" };'}
        language="typescript"
        lineNumbers
        fontFamily="Fira Code, monospace"
        theme={dracula}
      />
      <CodeBlock
        code={'body { color: #123456; }\n@media (max-width: 600px) { body { color: red; } }'}
        language="css"
        theme={oneLight}
        style={{ border: "2px solid #ddd" }}
      />
    </Html>
  );
}
