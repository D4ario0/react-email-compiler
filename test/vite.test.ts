import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, type Rollup } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import ReactEmailCompiler from "../src/vite";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("Vite plugin", () => {
  it("bundles .email.tsx templates without React", async () => {
    const root = await mkdtemp(join(tmpdir(), "react-email-compiler-"));
    temporaryDirectories.push(root);

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
      join(root, "main.ts"),
      `
        import { render } from "@react-email/render";
        import { Welcome } from "./Welcome.email";
        export const html = await render(Welcome({ name: "<Alex>" }));
        export const text = await render(Welcome({ name: "<Alex>" }), { plainText: true });
      `,
    );

    const result = await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [
        ReactEmailCompiler({
          runtimeModule: resolve("src/runtime.ts"),
        }),
      ],
      build: {
        write: false,
        lib: {
          entry: join(root, "main.ts"),
          formats: ["es"],
        },
      },
    });

    const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
    const chunk = outputs
      .flatMap((output) => output.output)
      .find((output): output is Rollup.OutputChunk => output.type === "chunk");
    expect(chunk).toBeDefined();
    expect(chunk!.code).not.toMatch(/react(?:-dom|-email)?["']/);
    expect(chunk!.code).not.toMatch(/from\s*["']react-email-compiler(?:\/runtime)?["']/);
    expect(chunk!.code).not.toContain("@react-email/render");

    const url = `data:text/javascript;base64,${Buffer.from(chunk!.code).toString("base64")}`;
    const module = (await import(url)) as { html: string; text: string };
    expect(module.html).toContain("<!DOCTYPE html");
    expect(module.html).toContain("Hello &lt;Alex&gt;");
    expect(module.text).toBe("Hello <Alex>");
  });
});
