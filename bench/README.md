# Benchmarks

The benchmark suite compares React Email with compiled templates across two dimensions:

1. Runtime HTML and plain-text rendering throughput.
2. Vite SSR output for top-level and dynamic imports.

Fixtures:

- `Account`: a small Tailwind transactional email.
- `Incident100`: a Tailwind email containing 100 dynamically rendered records and Unicode content.

Output parity is verified before timing begins. A benchmark fails rather than comparing renderers that produce different HTML or text.

## Run

```sh
pnpm bench
```

For a quick local run:

```sh
pnpm bench:quick
```

Change the minimum measurement duration:

```sh
BENCH_DURATION_MS=1000 pnpm bench
```

Results are printed as tables and written to:

```text
bench/results/latest.json
```

Bundle measurements include:

- build duration
- raw and gzip JavaScript size
- chunk count
- bundled module count
- React runtime detection

Results depend on hardware, Node version, and operating system. Do not compare files produced on different machines as if they were controlled performance regressions.
