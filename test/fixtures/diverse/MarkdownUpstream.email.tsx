import { Html, Markdown, Text } from "react-email";

export function MarkdownUpstreamEmail({ label }: { label: string }) {
  return (
    <Html lang="en">
      <Text>{label}</Text>
      <Markdown
        markdownContainerStyles={{ padding: "4px", backgroundColor: "#ffffff" }}
        markdownCustomStyles={{
          bold: { color: "#dc2626", fontWeight: 800 },
          table: { borderCollapse: "collapse", width: "100%" },
          td: { border: "1px solid #ddd", padding: "3px" },
          blockQuote: { borderLeft: "4px solid #999", paddingLeft: "8px" },
        }}
      >
        {`# Markdown Test Document

This has **bold**, *italic*, ~~deleted~~, and \`inline code\`.

> Quoted text
> - Quoted item

1. First
2. Second

- parent
  - nested child

| Name | Status |
| :--- | ---: |
| Compiler | Ready |

[guide](https://example.com/?a=1&b=2 "Complete Guide")

![logo](https://example.com/logo.png "Product Logo")

---

\`\`\`javascript
const value = "<safe>";
console.log(value);
\`\`\``}
      </Markdown>
    </Html>
  );
}
