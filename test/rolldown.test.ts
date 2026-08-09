import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { rolldown } from "rolldown";
import { afterEach, describe, expect, it } from "vitest";
import ReactEmailCompiler from "../src/rolldown";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("Rolldown/tsdown plugin", () => {
  it("bundles .email.tsx templates without React", async () => {
    const root = await mkdtemp(join(tmpdir(), "react-email-compiler-rolldown-"));
    temporaryDirectories.push(root);
    const entry = join(root, "main.ts");

    await writeFile(
      join(root, "Welcome.email.tsx"),
      `
        import { Html, Text } from "react-email";
        export function Welcome({ name }: { name: string }) {
          return <Html><Text>Hello {name}</Text></Html>;
        }
      `,
    );
    await writeFile(
      entry,
      `
        import { render } from "@react-email/render";
        import { Welcome } from "./Welcome.email";
        export const html = await render(Welcome({ name: "<Alex>" }));
      `,
    );

    const bundle = await rolldown({
      input: entry,
      plugins: [
        ReactEmailCompiler({
          runtimeModule: resolve("src/runtime.ts"),
        }),
      ],
    });
    const result = await bundle.generate({ format: "es" });
    const chunk = result.output.find((output) => output.type === "chunk");
    expect(chunk).toBeDefined();
    expect(chunk!.code).not.toMatch(/from\s*["'](?:react|react-dom|react-email|@react-email\/render)/);

    const url = `data:text/javascript;base64,${Buffer.from(chunk!.code).toString("base64")}`;
    const module = (await import(url)) as { html: string };
    expect(module.html).toContain("Hello &lt;Alex&gt;");
  });
});
