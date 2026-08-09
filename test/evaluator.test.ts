import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileEmailModule } from "../src/compiler";
import { evaluateEmailModule, renderEmailModuleExport } from "../src/evaluator";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("build-time module evaluator", () => {
  it("executes an opted-in module in a worker and discovers its exports", async () => {
    const directory = await mkdtemp(join(tmpdir(), "react-email-evaluator-"));
    temporaryDirectories.push(directory);
    const marker = join(directory, "executed.txt");
    const id = join(directory, "Welcome.email.tsx");
    const source = `
      import { writeFileSync } from "node:fs";
      import { Text } from "react-email";
      writeFileSync(${JSON.stringify(marker)}, "executed");

      export const metadata = { subject: "Welcome" };
      export function Welcome({ name }: { name: string }) {
        return <Text>Hello {name}</Text>;
      }
      Welcome.PreviewProps = { name: "Alex" };
    `;

    const evaluated = await evaluateEmailModule(source, id, {
      cacheDirectory: join(directory, "cache"),
    });

    expect(await readFile(marker, "utf8")).toBe("executed");
    expect(evaluated.exports).toContainEqual({
      name: "Welcome",
      kind: "function",
      hasPreviewProps: true,
    });
    expect(evaluated.exports).toContainEqual({
      name: "metadata",
      kind: "value",
      hasPreviewProps: false,
    });
  });

  it("renders an exported component with the real React Email frontend", async () => {
    const directory = await mkdtemp(join(tmpdir(), "react-email-evaluator-"));
    temporaryDirectories.push(directory);
    const id = join(directory, "Rendered.email.tsx");
    const source = `
      import { Html, Text } from "react-email";
      export function RenderedEmail({ name }: { name: string }) {
        return <Html><Text>Hello {name}</Text></Html>;
      }
    `;

    const result = await renderEmailModuleExport(
      source,
      id,
      "RenderedEmail",
      { name: "<Alex>" },
      { cacheDirectory: join(directory, "cache") },
    );

    expect(result.html).toContain("<!DOCTYPE html");
    expect(result.html).toContain("Hello <!-- -->&lt;Alex&gt;");
    expect(result.text).toBe("Hello <Alex>");
  });

  it("propagates errors from statically pre-rendered components", async () => {
    const directory = await mkdtemp(join(tmpdir(), "react-email-evaluator-"));
    temporaryDirectories.push(directory);
    const id = join(directory, "Throwing.email.tsx");
    const source = `
      export function ThrowingEmail() {
        if (Date.now() > 0) throw new Error("render failed during compilation");
        return <div>unreachable</div>;
      }
    `;

    await expect(
      compileEmailModule(source, id, {
        evaluateModule: { cacheDirectory: join(directory, "cache") },
      }),
    ).rejects.toThrow("render failed during compilation");
  });

  it("exposes discovery metadata through the compiler result", async () => {
    const directory = await mkdtemp(join(tmpdir(), "react-email-evaluator-"));
    temporaryDirectories.push(directory);
    const id = join(directory, "Static.email.tsx");
    const source = `
      import { Text } from "react-email";
      export function StaticEmail() {
        return <Text>Static</Text>;
      }
    `;

    const result = await compileEmailModule(source, id, {
      evaluateModule: { cacheDirectory: join(directory, "cache") },
    });

    expect(result.evaluatedModule?.exports).toContainEqual({
      name: "StaticEmail",
      kind: "function",
      hasPreviewProps: false,
    });
    expect(result.code).toContain("<!DOCTYPE html");
    expect(result.code).not.toContain('__reactEmailPrimitive("Text"');
  });
});
