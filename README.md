# React Email Compiler

## When React DX meets compilers

An ahead-of-time (AOT) compiler for React Email. Author normal React Email TSX, keep runtime props and familiar component ergonomics, then ship specialized HTML and plain-text functions without React, React DOM, React Email, Prism, or Marked in the production rendering graph.

## Usability guide

### 1. Install

The compiler, React Email, and its authoring types are build-time dependencies only:

```sh
pnpm add -D react-email-compiler react react-dom react-email @react-email/render
```

### 2. Opt a template into AOT compilation

Use the explicit `.email.tsx` suffix:

```tsx
// Welcome.email.tsx
import { Html, Text } from "react-email";

export interface WelcomeEmailProps {
  name: string;
}

export function WelcomeEmail({ name }: WelcomeEmailProps) {
  return (
    <Html lang="en">
      <Text>Hello {name}</Text>
    </Html>
  );
}
```

### 3. Add the plugin before framework plugins

```ts
// vite.config.ts
import ReactEmailCompiler from "react-email-compiler/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    ReactEmailCompiler({
      // tailwindConfig, // required only when templates use <Tailwind>
    }),
  ],
});
```

In SvelteKit, place `ReactEmailCompiler()` before `sveltekit()`. Source-exported workspace packages may also need `ssr.noExternal` so Vite sends their `.email.tsx` files through the transform pipeline.

### 4. Render HTML and text

```ts
import { render, toPlainText } from "@react-email/render";
import { WelcomeEmail } from "./Welcome.email";

const html = await render(WelcomeEmail({ name: "Alex" }));
const text = toPlainText(html);
```

The plugin swaps `@react-email/render` for a small virtual implementation during the build. Application source never imports `react-email-compiler`, and the final bundle contains neither package.

The authored component is replaced under its original module ID. No generated source files or package-specific registry architecture are required.

## Benchmarks

The benchmark first verifies HTML and plain-text parity, then compares React Email with the generated AOT renderer. Run it with:

```sh
pnpm bench
```

A full 500 ms run on Node.js 24.19.0, Linux x64 produced:

### Runtime rendering

| Fixture             | Renderer     | Operations/sec |     Mean |      p95 | Throughput improvement |
| ------------------- | ------------ | -------------: | -------: | -------: | ---------------------: |
| Account email       | React Email  |            353 | 2.831 ms | 4.648 ms |               baseline |
| Account email       | AOT compiled |         12,610 | 0.079 ms | 0.133 ms |              **35.7×** |
| 100-record incident | React Email  |            157 | 6.384 ms | 9.830 ms |               baseline |
| 100-record incident | AOT compiled |          3,977 | 0.252 ms | 0.442 ms |              **25.3×** |

The account fixture reduced p95 latency by approximately **35×**. The 100-record fixture reduced p95 latency by approximately **22×**. Both paths use the public async `render()` API, including Promise and compatibility-wrapper overhead.

### Vite SSR output

| Output                         |  Build | Raw JavaScript |      Gzip | Chunks | Modules | React runtime |
| ------------------------------ | -----: | -------------: | --------: | -----: | ------: | ------------: |
| React Email, top-level import  | 316 ms |    1,496.46 kB | 446.66 kB |      2 |      95 |           Yes |
| AOT compiled, top-level import | 239 ms |       17.55 kB |   6.00 kB |      1 |       9 |            No |
| React Email, dynamic import    | 266 ms |    1,496.64 kB | 446.79 kB |      3 |      95 |           Yes |
| AOT compiled, dynamic import   | 123 ms |       17.64 kB |   6.05 kB |      2 |       9 |            No |

For this fixture, AOT compilation produced approximately:

- **85× less raw JavaScript**
- **74× less gzip JavaScript**
- **10.6× fewer bundled modules**
- **24% shorter top-level build time**
- **54% shorter dynamic-import build time**
- no React, React DOM, React Email, Prism, or Marked runtime graph

Results vary by hardware, Node version, filesystem caches, and template complexity. Machine-readable output is written to `bench/results/latest.json`; see [`bench/README.md`](./bench/README.md) for methodology.

## How does it work?

React Email is the authoring frontend, not the production renderer:

```text
React Email TSX
  ↓ identify the explicit .email.tsx boundary
  ↓ parse TypeScript and JSX
  ↓ discover components, props, branches, loops, and static values
  ↓ execute only modules that require concrete build-time exports
  ↓ render static React Email primitives, Tailwind, Markdown, and CodeBlock
  ↓ lower dynamic regions into EmailIR
  ↓ coalesce static fragments and generate HTML/text programs
React-free functions: props → { html, text }
```

Static structure is evaluated once during the build. Runtime props, conditionals, nested `.map()` calls, escaping, and dynamic attributes become direct JavaScript rather than React elements interpreted by a server renderer. A shared compilation session caches Tailwind results and primitive shells across the module graph.

This is the compiler trade: spend work once at build time so every production render loads less code and performs less work.

## Status

This package is currently suitable for internal use and `0.1.x` alpha releases.

Compatibility target:

- Node.js 20+
- React 18 or 19 at build time
- React Email 6.9.x
- ESM

## Installation

Install the complete authoring and compilation toolchain as development dependencies:

```sh
pnpm add -D react-email-compiler react react-dom react-email @react-email/render
```

They are used to author, type-check, preview, and compile templates. The plugin replaces `@react-email/render` and bundles only its internal tree-shaken helpers; none of these package imports remain in the generated application runtime graph.

## File convention

Only files ending in `.email.tsx` are compiled:

```text
emails/
  SignIn.email.tsx
  TicketPurchase.email.tsx
  components/
    EmailLayout.email.tsx
    Header.email.tsx
  inputs.ts
```

The convention is an explicit compiler boundary:

```text
*.email.tsx  → compiled
*.tsx        → untouched
*.ts         → ordinary helpers and types
```

Every shared component containing email JSX must also use `.email.tsx`:

```tsx
import { EmailLayout } from "./components/EmailLayout.email";
```

A compiled module may import:

- supported primitives from `react-email`
- components from other `.email.tsx` modules
- ordinary values and types from `.ts` modules

Importing an ordinary React component from a compiled template produces a compiler error.

## Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import ReactEmailCompiler from "react-email-compiler/vite";
import { emailTailwindConfig } from "./src/emails/tailwind.email";

export default defineConfig({
  plugins: [
    ReactEmailCompiler({
      tailwindConfig: emailTailwindConfig,
    }),
  ],
});
```

## SvelteKit

Add the compiler before the SvelteKit plugin:

```ts
// vite.config.ts
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import ReactEmailCompiler from "react-email-compiler/vite";
import { emailTailwindConfig } from "./packages/email/tailwind.email";

export default defineConfig({
  plugins: [
    ReactEmailCompiler({
      tailwindConfig: emailTailwindConfig,
    }),
    sveltekit(),
  ],
});
```

For a linked workspace package that exports its TypeScript source:

```json
{
  "name": "@acme/email",
  "type": "module",
  "exports": {
    ".": "./src/render.ts"
  },
  "dependencies": {
    "react-email-compiler": "workspace:*"
  }
}
```

If Vite externalizes the email package in your environment, force it through the SSR pipeline:

```ts
export default defineConfig({
  plugins: [ReactEmailCompiler({ tailwindConfig }), sveltekit()],
  ssr: {
    noExternal: ["@acme/email"],
  },
});
```

This keeps package precompilation optional. The consuming SvelteKit build can compile source-exported email templates directly.

## How module replacement works

The plugin replaces `.email.tsx` modules through the bundler's `transform` hook and swaps `@react-email/render` through `resolveId`/`load`. It does not rewrite source or create generated files on disk.

### 1. The bundler loads an opted-in module

```ts
import { WelcomeEmail } from "./Welcome.email";
```

Vite resolves the import to `Welcome.email.tsx`. The transform only intercepts module IDs matching `.email.tsx`; ordinary `.tsx` modules continue through the build unchanged. Separately, imports of `@react-email/render` resolve to the virtual AOT renderer.

### 2. The original module can execute during the build

Before code generation, the compiler can bundle and execute the original module in an isolated worker. This provides the actual exports, `PreviewProps`, static component output, and React Email primitive behavior.

Top-level side effects therefore run during compilation when module evaluation is enabled. Keep email modules side-effect free or set `evaluateModule: false`.

### 3. The compiler replaces JSX with string code

Input:

```tsx
import { Html, Text } from "react-email";

export function WelcomeEmail({ name }: { name: string }) {
  return (
    <Html>
      <Text>Hello {name}</Text>
    </Html>
  );
}
```

Conceptual output before bundler tree-shaking:

```ts
function WelcomeEmail$html({ name }: { name: string }) {
  return '<!DOCTYPE html ...><p>Hello ' + escapeText(name) + "</p>";
}

function WelcomeEmail$text({ name }: { name: string }) {
  return `Hello ${name}`;
}

export function WelcomeEmail(props: { name: string }) {
  return createCompiledEmailValue(
    WelcomeEmail$html(props),
    () => WelcomeEmail$text(props),
  );
}
```

The helper references resolve to a bundler-internal file owned by the plugin and are inlined or tree-shaken. They are not imported from a public `react-email-compiler/runtime` application API.

The exact generated output depends on which fragments React Email can render statically.

### 4. React runtime imports disappear

Runtime imports from `react-email`, React, and React DOM are removed. Type-only React imports may remain in intermediate TypeScript, but the TypeScript/esbuild stage erases them.

The transformed graph becomes:

```text
Welcome.email.tsx → compiled string function
Layout.email.tsx  → compiled string function
helpers.ts        → ordinary JavaScript
internal helpers  → framework-free and tree-shaken
```

Imported `.email.tsx` components are transformed independently under their original module IDs.

### 5. Replacement happens in memory

The transform returns generated code and a source map to the bundler:

```ts
return {
  code: generatedCode,
  map: sourceMap,
};
```

Vite, Rollup, or another adapter continues processing that code under the original module ID. Consumer imports do not change. The virtual renderer and internal helper path are implementation details owned entirely by the plugin.

### 6. `@react-email/render` is replaced in memory

Application-owned rendering code stays framework-native:

```ts
import { render, toPlainText } from "@react-email/render";

const html = await render(WelcomeEmail(props));
const text = toPlainText(html);
```

The resolver swaps that import for a virtual AOT renderer. The compiled component carries its generated HTML and lazy text renderer through the call to `render()`. Application architecture around subjects, registries, repositories, and template selection remains outside the compiler.

### Dynamic imports

A dynamic import still creates a separate bundler chunk:

```ts
const email = await import("@acme/email");
```

After compilation, that chunk contains generated template functions and only the tree-shaken helpers they use instead of React, React DOM, React Email, or the compiler package. Once verified, a top-level import can be used without loading the React Email runtime graph.

For source-exported packages, Vite must load the package through the transform pipeline. If it is externalized, its `.email.tsx` modules never reach the plugin; use `ssr.noExternal` when necessary.

## Rendering templates

Keep the normal React Email renderer import, but invoke the opted-in component directly:

```ts
import { render, toPlainText } from "@react-email/render";
import { WelcomeEmail, type WelcomeEmailProps } from "./emails/Welcome.email";

export async function renderWelcome(props: WelcomeEmailProps) {
  const html = await render(WelcomeEmail(props));
  return {
    html,
    text: toPlainText(html),
  };
}
```

`render(value, { plainText: true })` is also supported when only text is needed. `pretty` output and arbitrary HTML passed directly to `toPlainText()` are intentionally unsupported by the replacement.

There is no public compiler runtime API. How templates are registered, selected, assigned subjects, or exposed from a package is application architecture and remains outside the compiler contract.

## Tailwind

Pass one React Email Tailwind configuration to the plugin:

```ts
// tailwind.email.ts
export const emailTailwindConfig = {
  theme: {
    extend: {
      colors: {
        brand: "#2563eb",
        muted: "#64748b",
      },
      fontFamily: {
        email: ["Inter", "Arial", "sans-serif"],
      },
    },
  },
};
```

```ts
ReactEmailCompiler({
  tailwindConfig: emailTailwindConfig,
});
```

Static classes are resolved during compilation:

```tsx
<Text className="m-0 text-sm text-brand">Hello</Text>
```

Dynamic class props are supported when their possible defaults are statically discoverable:

```tsx
export function Header({ className = "mb-8 text-center" }) {
  return <Section className={className}>...</Section>;
}
```

Arbitrary runtime-generated Tailwind class names are rejected because the compiler cannot discover their CSS safely.

## tsdown and Rolldown

`tsdown` accepts the Rolldown adapter directly:

```ts
// tsdown.config.ts
import { defineConfig } from "tsdown";
import ReactEmailCompiler from "react-email-compiler/rolldown";
import { emailTailwindConfig } from "./tailwind.email";

export default defineConfig({
  entry: ["src/index.ts"],
  plugins: [
    ReactEmailCompiler({
      tailwindConfig: emailTailwindConfig,
    }),
  ],
});
```

Precompiling a package this way is optional. The same templates can instead be compiled by a consuming Vite application.

## Rollup

```ts
import ReactEmailCompiler from "react-email-compiler/rollup";

export default {
  plugins: [ReactEmailCompiler({ tailwindConfig })],
};
```

## esbuild

```ts
import { build } from "esbuild";
import ReactEmailCompiler from "react-email-compiler/esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  plugins: [ReactEmailCompiler({ tailwindConfig })],
});
```

## Other adapters

The package exports Unplugin adapters for:

```ts
import VitePlugin from "react-email-compiler/vite";
import RollupPlugin from "react-email-compiler/rollup";
import RolldownPlugin from "react-email-compiler/rolldown";
import EsbuildPlugin from "react-email-compiler/esbuild";
import WebpackPlugin from "react-email-compiler/webpack";
import RspackPlugin from "react-email-compiler/rspack";
import BunPlugin from "react-email-compiler/bun";
import FarmPlugin from "react-email-compiler/farm";
```

Vite, esbuild, and Rolldown are covered by integration tests. The remaining adapters currently rely on Unplugin compatibility and should be considered experimental.

## Build-time evaluation

Bundler adapters enable isolated module evaluation by default, but execution is lazy. A module only executes when an AOT stage needs concrete runtime exports, such as pre-rendering an exported zero-prop component. Dynamic templates that can be residualized from the AST avoid the evaluator entirely.

Set `discoverExports: true` to force runtime export discovery for every opted-in module.

Build-time evaluation allows the compiler to:

- discover actual module exports
- use React Email as the build-time frontend
- pre-render exported zero-prop templates
- render primitives with static props into HTML shells
- residualize dynamic children and expressions
- generate matching plain-text functions

When module evaluation is required, top-level side effects also execute during compilation:

```tsx
console.log("This runs during the build");

export function Email() {
  // ...
}
```

Keep email modules side-effect free. To disable module execution:

```ts
ReactEmailCompiler({
  evaluateModule: false,
  tailwindConfig,
});
```

Static primitive rendering remains independently configurable:

```ts
ReactEmailCompiler({
  renderStaticPrimitives: false,
});
```

## Options

```ts
interface CompilerOptions {
  /** Allow source-module execution when an AOT stage requires it. */
  evaluateModule?:
    | boolean
    | {
        cacheDirectory?: string;
        timeoutMs?: number;
      };

  /** Force runtime export discovery even when static analysis is sufficient. */
  discoverExports?: boolean;

  /** Share caches and metrics across a build. Bundler adapters create this automatically. */
  compilationSession?: CompilationSession;

  /** Pre-render exported components that accept no props. */
  preRenderStaticExports?: boolean;

  /** Render primitives with static props through React Email. */
  renderStaticPrimitives?: boolean;

  /** Import used by generated functions. */
  runtimeModule?: string;

  /** React Email Tailwind configuration. */
  tailwindConfig?: TailwindConfig;
}
```

Bundler adapters enable module evaluation by default. The standalone compiler API only evaluates when explicitly requested.

## Standalone compiler API

```ts
import { compileEmailModule } from "react-email-compiler";

const result = await compileEmailModule(source, "/absolute/path/Welcome.email.tsx", {
  evaluateModule: true,
  tailwindConfig,
});

console.log(result.code);
console.log(result.evaluatedModule?.exports);
```

Build-time rendering is also available directly:

```ts
import { evaluateEmailModule, renderEmailModuleExport } from "react-email-compiler";

const discovered = await evaluateEmailModule(source, filename);

const rendered = await renderEmailModuleExport(source, filename, "WelcomeEmail", { name: "Alex" });
```

## Supported React Email primitives

The React Email 6.9.x compatibility layer covers all 19 exported primitives:

| Primitive                               | AOT coverage                                              |
| --------------------------------------- | --------------------------------------------------------- |
| `Html`, `Head`, `Body`, `Preview`       | Static and dynamic props                                  |
| `Container`, `Section`, `Row`, `Column` | Static and dynamic props and children                     |
| `Text`, `Heading`, `Link`, `Button`     | Static and dynamic props and children                     |
| `Img`, `Hr`, `Font`                     | Static and dynamic props                                  |
| `CodeInline`                            | Static and dynamic props and children                     |
| `Tailwind`                              | Static classes and dynamic classes with static defaults   |
| `CodeBlock`                             | Statically analyzable code, language, theme, and options  |
| `Markdown`                              | Static Markdown children and statically analyzable styles |

`CodeBlock` and `Markdown` execute Prism and Marked during compilation. Their generated output contains neither parser, syntax highlighter, React, nor React Email. Dynamic parser input is rejected with an actionable compiler error rather than adding those large dependencies to the runtime bundle. React Email's exported code themes, such as `xonokai`, can be imported normally and are inlined at build time.

## Supported template behavior

- synchronous function components
- local `.email.tsx` components
- props and default values
- children and React-node props
- conditional expressions
- logical `&&` and nullish `??` rendering
- expression-bodied and nested `.map()` calls
- intrinsic HTML elements
- style objects
- static Tailwind classes
- dynamic class props with static defaults
- contextual HTML escaping
- generated plain text
- `data-skip-in-text="true"`

## Currently unsupported

- hooks and React context
- async components and Suspense in authored templates
- portals and `cloneElement`
- arbitrary third-party React components
- unconstrained dynamic Tailwind classes
- `dangerouslySetInnerHTML`
- custom `htmlToTextOptions`
- runtime-varying `CodeBlock` parser input
- runtime-varying `Markdown` source or parser styles
- byte-for-byte whitespace parity for plain text composed from multiple static `CodeBlock` or `Markdown` shells inside an otherwise dynamic template; semantic text is preserved

Unsupported constructs fail during compilation instead of silently loading React at runtime.

## Verification

The project includes differential tests against React Email for:

- a diverse fixture corpus with receipts, newsletters, security alerts, RTL content, Unicode, nested collections, and static templates
- a language matrix covering defaults, destructuring, ternaries, `&&`, `??`, fragments, nested `.map()`, nullable children, custom components, and dynamic attributes
- an upstream-inspired property matrix for heading levels, margin precedence, invalid spacing, empty rows, column attributes, font variants, and inline-code compatibility markup
- Markdown coverage for headings, formatting, blockquotes, nested and ordered lists, tables, links, images, horizontal rules, fenced code, and custom styles
- CodeBlock coverage across JavaScript, TypeScript, and CSS with multiple themes, line numbers, custom fonts, custom styles, escaping, and invalid languages
- actionable diagnostics for React APIs, unsupported primitives, unsafe HTML, invalid imports, and spread children
- a generic source-exported email package fixture
- HTML output
- exact plain-text output
- Tailwind styles
- Outlook button markup
- preview text behavior
- dynamic escaping
- repeated array items
- Vite, esbuild, and Rolldown builds
- React-free generated bundles

The readable example templates live in [`test/fixtures/diverse`](./test/fixtures/diverse). Every fixture compares HTML against `@react-email/render`. Plain text is compared byte-for-byte except for parser-shell composition cases, where the test normalizes whitespace and invisible code-spacing characters while preserving semantic content. Fully static Markdown and CodeBlock templates retain exact `toPlainText()` output.

Run the complete verification suite:

```sh
pnpm check
```

## Honorable mentions

- **zod-compiler** — an important reference for treating an ergonomic TypeScript API as a compiler frontend and replacing runtime interpretation with generated code.
- **Rich Harris and Svelte's compilation model** — the clearest precedent for preserving declarative component DX while moving framework work into compilation and emitting small, imperative runtime programs.

These are architectural inspirations and acknowledgements, not claims of source-code derivation or compatibility.
