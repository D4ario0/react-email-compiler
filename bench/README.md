# Benchmark runner

The benchmark runner compares React Email with the AOT renderer across a 10-fixture corpus.

It measures:

- runtime p50, p95, mean latency, and operations per second
- per-fixture median, p95, and throughput speedups
- median and geometric-mean speedup across fixtures
- top-level and dynamic-import bundle output
- raw and gzip JavaScript size
- chunk and module counts
- React runtime presence
- cold and warm build duration

HTML and plain-text parity are verified before any fixture is timed.

## Commands

Run the complete 500 ms suite:

```sh
pnpm bench
```

Run a shorter smoke suite:

```sh
pnpm bench:quick
```

Run focused modes:

```sh
pnpm bench:runtime
pnpm bench:build
```

Override the measurement window:

```sh
BENCH_DURATION_MS=1000 pnpm bench
```

`bench:runtime` still builds the equivalent entries because runtime measurements execute production bundles. `bench:build` verifies parity and records bundle/build results but skips the repeated runtime timing loops.

## Results

Machine-readable results are written to:

```text
bench/results/latest.json
```

The JSON file is ignored because results depend on hardware, Node.js, operating system, dependency versions, and filesystem cache state.

See [`../BENCHMARK.md`](../BENCHMARK.md) for the committed representative results, fixture descriptions, methodology, aggregate calculations, and limitations.
