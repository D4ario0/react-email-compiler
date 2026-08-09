import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build, type InlineConfig, type Rollup } from "vite";

export interface TemporaryFixture {
  root: string;
  path(relativePath: string): string;
  cleanup(): Promise<void>;
}

export async function createTemporaryFixture(
  prefix: string,
  files: Record<string, string> = {},
): Promise<TemporaryFixture> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const filename = join(root, relativePath);
      await mkdir(dirname(filename), { recursive: true });
      await writeFile(filename, contents);
    }),
  );

  return {
    root,
    path: (relativePath) => join(root, relativePath),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export function entryChunk(result: Awaited<ReturnType<typeof build>>): Rollup.OutputChunk {
  const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
  const chunks = outputs
    .flatMap((output) => output.output)
    .filter((output): output is Rollup.OutputChunk => output.type === "chunk");
  const chunk = chunks.find((output) => output.isEntry) ?? chunks[0];
  if (!chunk) throw new Error("The fixture build did not emit an entry chunk");
  return chunk;
}

export async function importJavaScript<Exports>(code: string): Promise<Exports> {
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(url) as Promise<Exports>;
}

interface ViteFixtureOptions {
  prefix: string;
  files: Record<string, string>;
  entry?: string;
  config?: Omit<InlineConfig, "root" | "configFile" | "build"> & {
    build?: Omit<NonNullable<InlineConfig["build"]>, "write" | "lib">;
  };
}

export interface BuiltViteFixture<Exports> {
  root: string;
  code: string;
  exports: Exports;
  cleanup(): Promise<void>;
}

export async function buildViteFixture<Exports>({
  prefix,
  files,
  entry = "entry.ts",
  config = {},
}: ViteFixtureOptions): Promise<BuiltViteFixture<Exports>> {
  const fixture = await createTemporaryFixture(prefix, files);
  try {
    const result = await build({
      ...config,
      root: fixture.root,
      configFile: false,
      logLevel: config.logLevel ?? "silent",
      build: {
        ...config.build,
        write: false,
        lib: { entry: fixture.path(entry), formats: ["es"] },
      },
    });
    const code = entryChunk(result).code;
    return {
      root: fixture.root,
      code,
      exports: await importJavaScript<Exports>(code),
      cleanup: fixture.cleanup,
    };
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
}
