# Benchmarks

## Summary

Across 10 representative email templates, the AOT renderer achieved a **29.1× median runtime speedup** and a **26.2× median p95 speedup** over React Email.

The complete corpus bundle was **51.5× smaller raw**, **61.3× smaller gzip**, and contained no React runtime. This broader benchmark also makes the build-time tradeoff visible: the cold AOT build was slower because it pre-rendered Tailwind, Markdown, CodeBlock, and React Email primitive shells.

## Environment

| Property | Value |
| --- | --- |
| Node.js | 24.19.0 |
| Platform | Linux x64 |
| Measurement window | 500 ms per renderer and fixture |
| Public API | Async `render(Component(props))` plus `toPlainText(html)` |
| Build tool | Vite SSR production build with esbuild minification |

Results depend on CPU, operating system, Node.js version, filesystem caches, dependency versions, and template content. They are evidence for this corpus, not universal performance guarantees.

## Fixture corpus

| Fixture | Workload |
| --- | --- |
| Minimal | Minimal email with escaped dynamic text |
| Authentication | Tailwind authentication link email with nested components |
| Receipt20 | Receipt containing 20 dynamic line items |
| Newsletter10 | Newsletter containing 10 linked stories |
| SecurityAlert | Conditional security alert with recovery actions |
| UnicodeRTL | RTL email with Arabic, Japanese, accented text, and emoji |
| PrimitiveMatrix | Dynamic headings, rows, columns, fonts, styles, and inline code |
| Markdown | Static Markdown with a list, link, blockquote, and code fence |
| CodeBlock | Static highlighted TypeScript with line numbers |
| Incident100 | Tailwind email containing 100 repeated records |

Markdown and CodeBlock show especially large gains because parsing and syntax highlighting happen once during compilation. Their runtime paths return generated static output.

## Runtime results

Before measuring, the benchmark verifies normalized HTML and exact plain-text parity for every fixture.

| Fixture | React ops/sec | AOT ops/sec | React p50 | AOT p50 | Median speedup | React p95 | AOT p95 | p95 speedup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Minimal | 1,158 | 95,439 | 0.7011 ms | 0.0071 ms | **99.1×** | 1.5516 ms | 0.0178 ms | **87.0×** |
| Authentication | 261 | 10,926 | 3.3955 ms | 0.0757 ms | **44.9×** | 6.2967 ms | 0.1599 ms | **39.4×** |
| Receipt20 | 809 | 11,116 | 0.9852 ms | 0.0743 ms | **13.3×** | 2.3548 ms | 0.1554 ms | **15.2×** |
| Newsletter10 | 822 | 9,314 | 0.9523 ms | 0.0882 ms | **10.8×** | 2.3188 ms | 0.1808 ms | **12.8×** |
| SecurityAlert | 1,176 | 19,866 | 0.6655 ms | 0.0394 ms | **16.9×** | 1.7038 ms | 0.0783 ms | **21.8×** |
| UnicodeRTL | 1,277 | 29,424 | 0.6433 ms | 0.0258 ms | **25.0×** | 1.5242 ms | 0.0582 ms | **26.2×** |
| PrimitiveMatrix | 1,341 | 23,693 | 0.5814 ms | 0.0353 ms | **16.5×** | 1.4406 ms | 0.0712 ms | **20.2×** |
| Markdown | 1,229 | 473,442 | 0.6508 ms | 0.0012 ms | **531.7×** | 1.5607 ms | 0.0035 ms | **451.2×** |
| CodeBlock | 1,248 | 645,032 | 0.6468 ms | 0.0012 ms | **522.0×** | 1.5627 ms | 0.0019 ms | **828.2×** |
| Incident100 | 142 | 3,426 | 6.5798 ms | 0.2258 ms | **29.1×** | 10.0322 ms | 0.4745 ms | **21.1×** |

### Aggregate runtime results

| Metric | Result |
| --- | ---: |
| Median fixture speedup | **29.1×** |
| Geometric-mean fixture speedup | **45.2×** |
| Speedup range | **10.8×–531.7×** |
| Median p95 speedup | **26.2×** |

The median is calculated from each fixture's p50 speedup rather than from a pooled set of timing samples:

```text
fixture speedup = React Email fixture p50 / AOT fixture p50
overall median  = median(all fixture speedups)
```

This prevents high-iteration, inexpensive fixtures from dominating the aggregate.

## Bundle results

The bundle includes all 10 fixture templates and their rendering entry point.

| Renderer | Import mode | Raw JavaScript | Gzip | Chunks | Modules | React runtime |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| React Email | Top-level | 2,141.16 kB | 674.67 kB | 2 | 118 | Yes |
| AOT compiled | Top-level | 41.57 kB | 11.00 kB | 1 | 17 | No |
| React Email | Dynamic | 2,141.31 kB | 674.80 kB | 3 | 118 | Yes |
| AOT compiled | Dynamic | 41.66 kB | 11.05 kB | 2 | 17 | No |

For the top-level corpus bundle, AOT compilation produced:

- **51.5× less raw JavaScript**
- **61.3× less gzip JavaScript**
- **6.9× fewer bundled modules**
- one fewer chunk
- no React, React DOM, React Email, Prism, or Marked runtime graph

## Build results

| Renderer | Import mode | Cache state | Build time |
| --- | --- | --- | ---: |
| React Email | Top-level | Cold | 492 ms |
| React Email | Dynamic | Cold | 416 ms |
| AOT compiled | Top-level | Cold | 1,197 ms |
| AOT compiled | Dynamic | Cold | 930 ms |
| AOT compiled | Top-level | Warm compilation session | 895 ms |

For this parser-heavy corpus, the cold AOT top-level build was approximately **2.4× slower** than the React Email reference build. Reusing the compilation session reduced the AOT top-level build from 1,197 ms to 895 ms, approximately **25% faster than its cold build**.

This is the intended tradeoff: Tailwind compilation, module evaluation, Markdown parsing, syntax highlighting, and static React Email rendering move into the build so they are absent from production rendering. Build scalability remains an optimization target.

## Methodology

1. Build equivalent React Email and compiled SSR entries.
2. Include the same 10 templates and props in both entries.
3. Verify output parity before collecting timings.
4. Warm each renderer with five calls per fixture.
5. Collect up to 2,000 async render samples over at least 500 ms per fixture.
6. Calculate p50, p95, mean latency, and operations per second independently for each renderer.
7. Calculate fixture speedups from p50 latency.
8. Report the median and geometric mean across fixtures.
9. Build top-level and dynamic-import corpus entries.
10. Sum emitted chunk bytes and gzip each complete emitted JavaScript graph.
11. Count output chunks, bundled modules, and React-related modules.
12. Rebuild the compiled top-level entry with the same plugin session for the warm build measurement.

The benchmark measures the public replacement API:

```ts
import { render, toPlainText } from "@react-email/render";

const html = await render(Email(props));
const text = toPlainText(html);
```

It therefore includes Promise creation, the compatibility wrapper, HTML-to-text lookup, and generated template execution.

## Reproduction

Run the complete suite:

```sh
pnpm bench
```

Run a shorter 100 ms smoke test:

```sh
pnpm bench:quick
```

Run focused modes:

```sh
pnpm bench:runtime
pnpm bench:build
```

Machine-readable results are written to:

```text
bench/results/latest.json
```

Result JSON is ignored by Git because timings are environment-specific. Update this document only from a complete, representative run on a documented environment.

## Limitations

- These are microbenchmarks, not email delivery benchmarks.
- Network, provider API, SMTP, and database latency are intentionally excluded.
- The runtime benchmark uses fixed props after warmup; it does not measure cold process startup.
- V8 optimization and garbage collection can affect short runs.
- Build measurements include Vite's complete build pipeline, not only compiler hooks.
- The warm build reuses in-memory compiler caches but is not a full dev-server HMR benchmark.
- Static Markdown and CodeBlock naturally show larger gains than dynamic templates because their expensive parsers disappear entirely at runtime.
- Memory and allocation figures are omitted until they can be measured repeatably across supported Node.js versions.
