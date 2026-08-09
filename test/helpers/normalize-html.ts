interface NormalizeHtmlOptions {
  removeEmptyHead?: boolean;
}

export function normalizeHtml(
  html: string,
  { removeEmptyHead = false }: NormalizeHtmlOptions = {},
): string {
  const normalized = html
    .replaceAll("<!--$-->", "")
    .replaceAll("<!--/$-->", "")
    .replaceAll("<!--html-->", "")
    .replaceAll("<!--head-->", "")
    .replaceAll("<!--body-->", "")
    .replaceAll("<!-- -->", "")
    .replace(/style="([^"]*)"/g, (_match, declarations: string) => {
      const sorted = declarations.split(";").filter(Boolean).sort().join(";");
      return `style="${sorted}"`;
    });
  return removeEmptyHead ? normalized.replace("<head></head>", "") : normalized;
}
