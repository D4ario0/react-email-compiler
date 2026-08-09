# React Email Compiler

> **When React Email DX meets compilers.**

I like React Email. I just don't want to ship its renderer when the templates could have been compiled ahead of time.

This plugin takes `.email.tsx` files and turns them into small HTML and plain-text functions. In the current benchmark that comes out to roughly **25× faster rendering and a 50× smaller email bundle**. The exact numbers are in [BENCHMARK.md](./BENCHMARK.md), where they can be properly boring and specific.

```text
.email.tsx + runtime props → HTML + plain text
```

You still write React Email. The production path doesn't need React, React DOM, React Email, Prism, Marked, or this compiler package.

## Why I made this

I was working on an app that wasn't built with React. It needed to send one OTP email. That one email pulled the React runtime and the whole React Email rendering path into the server bundle, which felt invasive for a pretty email editor.

I could have written another email framework, but React Email already has good components, good tooling, and an API people know. Replacing it would fix the bundle and create a different problem. So I kept React Email and moved the expensive part to the build instead.

This is especially handy in SvelteKit, Astro, Nuxt, Angular, or anything else that doesn't already need React. It is still useful in React apps too: React may already be shared, but React Email's renderer and the work it does for every email can still disappear.

Application code stays familiar:

- React Email components and TypeScript props
- `@react-email/render`
- dynamic props, conditions, loops, and escaping
- HTML and plain-text output

The compiler is a dev dependency. It doesn't ask the rest of your application to know that it exists.

## Install

```sh
pnpm add -D react-email-compiler react react-dom react-email @react-email/render
```

Requirements:

- Node.js 20+
- React 18 or 19 during the build
- React Email 6.9.x
- ESM

## Usage

### 1. Name compiled templates `.email.tsx`

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

The suffix is the compilation boundary. Ordinary `.tsx` files are not transformed.

### 2. Add the plugin

```ts
// vite.config.ts
import ReactEmailCompiler from "react-email-compiler/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [ReactEmailCompiler()],
});
```

Place it before framework plugins.

### 3. Render normally

React applications can keep the usual JSX API:

```tsx
import { render, toPlainText } from "@react-email/render";
import { WelcomeEmail } from "./Welcome.email";

const html = await render(<WelcomeEmail name="Alex" />);
const text = toPlainText(html);
```

Applications that do not otherwise use React can invoke the component directly and avoid `react/jsx-runtime` too:

```ts
const html = await render(WelcomeEmail({ name: "Alex" }));
```

The plugin replaces `@react-email/render` during the build. React applications reuse their existing JSX runtime; non-React applications can keep the complete email path React-free.

Plain-text-only rendering works with either form:

```tsx
const text = await render(<WelcomeEmail name="Alex" />, {
  plainText: true,
});
```

## SvelteKit

```ts
// vite.config.ts
import ReactEmailCompiler from "react-email-compiler/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [ReactEmailCompiler(), sveltekit()],
});
```

For a source-exported workspace package, prevent Vite from externalizing it:

```ts
export default defineConfig({
  plugins: [ReactEmailCompiler(), sveltekit()],
  ssr: {
    noExternal: ["@acme/email"],
  },
});
```

Package precompilation is optional. Templates can be compiled at the consuming application boundary.

## Tailwind

Pass the same React Email Tailwind configuration used by the templates:

```ts
ReactEmailCompiler({
  tailwindConfig,
});
```

```tsx
import { Html, Tailwind, Text } from "react-email";

export function WelcomeEmail({ name }: { name: string }) {
  return (
    <Tailwind config={tailwindConfig}>
      <Html>
        <Text className="m-0 text-lg text-blue-600">Hello {name}</Text>
      </Html>
    </Tailwind>
  );
}
```

Dynamic class props require statically discoverable defaults so the compiler can include their CSS.

## Other bundlers

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

Vite, esbuild, and Rolldown have direct integration tests. The remaining adapters use Unplugin compatibility and are experimental.

## Results

A 500 ms run across 10 representative templates produced:

| Metric                           |    Result |
| -------------------------------- | --------: |
| Median runtime speedup           | **29.1×** |
| Median p95 speedup               | **26.2×** |
| Gzip bundle reduction            | **61.3×** |
| Raw bundle reduction             | **51.5×** |
| Bundled module reduction         |  **6.9×** |
| React runtime in compiled output |    **No** |

The corpus includes authentication, receipts, newsletters, conditional alerts, RTL/Unicode, Markdown, CodeBlock, dynamic primitives, and a 100-record loop. Output parity is checked before timing.

AOT work is not free: the parser-heavy corpus built in 1,197 ms versus 492 ms for the React Email reference. A warm compilation session reduced the AOT build to 895 ms. The optimization exchanges build time for smaller bundles and faster rendering.

See [BENCHMARK.md](./BENCHMARK.md) for every fixture, methodology, build measurements, and limitations.

## How it works

```text
.email.tsx
  → parse TypeScript and JSX
  → identify static and dynamic regions
  → evaluate required module exports in an isolated worker
  → render static React Email primitives
  → compile Tailwind, Markdown, and CodeBlock input
  → lower runtime expressions into EmailIR
  → generate HTML and text functions
```

The bundler replaces the original module in memory. Source files are not rewritten and generated files are not written into the project.

Static structure is rendered once. Props, branches, nested `.map()` calls, attributes, and escaping remain generated JavaScript.

A shared compilation session caches Tailwind output and primitive shells. Build-time React rendering is serialized because React and React DOM select their development or production implementation from the process environment.

## Supported React Email components

All 19 React Email 6.9.x components are covered:

```text
Body        Button      CodeBlock   CodeInline   Column
Container   Font        Head        Heading     Hr
Html        Img         Link        Markdown    Preview
Row         Section     Tailwind    Text
```

`CodeBlock` and `Markdown` run their parsers during compilation. Their source, themes, and parser options must be statically analyzable. Prism and Marked are not shipped at runtime.

Supported template behavior includes:

- synchronous function components
- local and imported `.email.tsx` components
- typed props and defaults
- fragments and children
- ternaries, `&&`, and `??`
- nested expression-bodied `.map()` calls
- intrinsic HTML elements
- style objects
- contextual HTML and attribute escaping
- exact HTML and plain-text generation for the supported corpus

## Current limitations

The compiler rejects unsupported constructs instead of loading React at runtime:

- hooks and React context
- async components and Suspense
- portals and `cloneElement`
- arbitrary third-party React components
- `dangerouslySetInnerHTML`
- unconstrained dynamic Tailwind classes
- runtime-varying Markdown or CodeBlock parser input
- custom `htmlToTextOptions`
- `pretty` output from `@react-email/render`
- arbitrary HTML passed directly to `toPlainText()`

Plain text composed from multiple static Markdown or CodeBlock shells inside an otherwise dynamic template can differ in insignificant whitespace. Fully static templates retain exact `toPlainText()` output.

## Build-time module evaluation

Module evaluation is enabled by bundler adapters but runs only when an AOT stage needs concrete exports, such as a zero-prop static component.

Top-level side effects execute when a module is evaluated. Keep email modules side-effect free.

Disable evaluation if necessary:

```ts
ReactEmailCompiler({
  evaluateModule: false,
});
```

Force runtime export discovery for every compiled module:

```ts
ReactEmailCompiler({
  discoverExports: true,
});
```

## Options

```ts
interface CompilerOptions {
  evaluateModule?:
    | boolean
    | {
        cacheDirectory?: string;
        timeoutMs?: number;
      };
  discoverExports?: boolean;
  preRenderStaticExports?: boolean;
  renderStaticPrimitives?: boolean;
  tailwindConfig?: TailwindConfig;
}
```

## Status

This is a hobby project and `0.1.x` is alpha. The compiler has a fairly serious test suite, but I would still verify generated output before rolling it across every email in a production system.

Right now it targets React Email 6.9.x. React Email changes, compiler bugs happen, and there are still unsupported React patterns listed above.

## Development

```sh
pnpm check
pnpm bench
```

The verification suite includes:

- 59 compiler, parity, runtime, and integration tests
- HTML comparison against `@react-email/render`
- plain-text comparison against `toPlainText()`
- Vite, esbuild, and Rolldown builds
- React-free distribution checks
- a 10-fixture runtime and bundle benchmark

Benchmark details are in [BENCHMARK.md](./BENCHMARK.md).

## Acknowledgements

This little compiler obviously stands on other people's work.

- [React Email](https://react.email) is the reason this project exists. I want to keep its components and DX, not replace them.
- I came across [Gajus Kuizinas](https://github.com/gajus)'s [zod-compiler](https://github.com/gajus/zod-compiler) a couple of weeks before starting this. It reaches a very similar conclusion for Zod: keep the API people like and compile away the repeated runtime work.
- Rich Harris and the Svelte ecosystem are the bigger influence. Svelte made the idea feel normal: a framework can be a great authoring experience without requiring the whole framework to do the work at runtime.

## License

GPL-2.0-only
