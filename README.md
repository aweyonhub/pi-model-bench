# pi-model-bench

`pi-model-bench` is a model health and performance benchmarking tool. It depends on and reuses the providers, model catalog, and credentials already configured in Pi Coding Agent, and supports both a standalone CLI and a Pi extension.

For the Chinese documentation, see [README_CN.md](./README_CN.md).

## 1. Background and features

When you have multiple providers or models, several practical questions arise: Can the model be called right now? How long does the first token take? How fast does it continue generating? Which model is more stable across different network environments?

This project directly reuses Pi's configured model catalog and credentials, runs health checks or streaming benchmarks serially, and can generate Markdown, CSV, and JSON reports.

Key features:

- **No duplicate credential setup**: Pi resolves the models, providers, and authentication.
- **Two test modes**: `--health` uses a small number of tokens to check authentication, access, quota, rate limits, endpoints, and network connectivity; `--speed` measures TTFT, visible TTFT, Decode TPS, and end-to-end latency.
- **More comparable results**: Requests run serially, client retries and cache retention are disabled, and each request uses a unique ID. This reduces bandwidth contention and cache-hit interference.
- **Optional result files**: By default, results are printed only in the terminal. With `-f`, each completed request incrementally updates `.md`, `.csv`, and `.json` files.
- **Credential-safe by default**: Reports do not contain API keys, OAuth tokens, authentication headers, or absolute working-directory paths. Error summaries are also sanitized for secrets.

This tool measures a single user's serial request experience. It is not a concurrent load-testing tool.

## 2. Installation

### Requirements

- Node.js 20 or newer
- Pi Coding Agent 0.83.0 or newer
- At least one usable model and its credentials configured in Pi

First confirm that the target model can respond normally in Pi. ChatGPT Plus/Pro OAuth models use the `openai-codex` provider and require running `/login` in Pi first.

### CLI method (recommended)

Install globally from GitHub:

```bash
npm install --global github:aweyonhub/pi-model-bench
```

Verify the installation:

```bash
pi-model-bench --version
pi-model-bench --list --zh
```

When developing this project, you can also register the local command from the repository root:

```bash
npm link
pi-model-bench --list --zh
```

The CLI is a non-interactive Pi wrapper: it does not open the TUI or create a session file. With no arguments, it runs the default speed benchmark against the current model and does not generate report files.

If `pi` is not on the standard `PATH`, specify its executable explicitly:

```bash
PI_MODEL_BENCH_PI_BIN=/path/to/pi pi-model-bench --list --zh
```

### Pi extension method

Install it in Pi:

```bash
pi install https://github.com/aweyonhub/pi-model-bench
```

After installation, restart Pi or run `/reload` in Pi. You can then use:

```text
/model-bench --help --zh
/model-bench --health --all --label home-wifi --zh
```

`pi install` installs only the interactive Pi extension; it does not create the `pi-model-bench` shell command. Use the global installation method above if you need the CLI.

## 3. Usage

### Benchmark the current model by default

```bash
pi-model-bench
```

Running without arguments is equivalent to using `--current`: it runs the default speed benchmark against the current model three times, with a maximum of 128 output tokens per request, and prints the results only in the terminal.

### List models without using quota

```bash
pi-model-bench --list --zh
```

Equivalent combined short flags:

```bash
pi-model-bench -lz
```

### Run a low-cost health check first

```bash
pi-model-bench -zat --label home-wifi
```

By default, a health check sends one request per model and allows at most eight output tokens. Run it before a batch benchmark to identify authentication, subscription, quota, or network issues.

### Test models scoped by Pi

```bash
pi-model-bench -zs
```

`-zs` combines `-z -s` and is equivalent to `--zh --scoped`. Short flags can be combined.

### Compare the models you actually use

First copy the full `provider/model` names from the `--list` output:

```bash
pi-model-bench --speed --models provider/model-a,provider/model-b --runs 5 --max-tokens 256 --label home-wifi -zf
```

This is the most practical comparison: benchmark only the models you actually use. Five runs make p50/p95 more informative than a single result. `--models` also supports `*` and `?` wildcards, for example:

```bash
pi-model-bench --health --models "provider/*max" --zh
```

### Compare networks or proxies

Keep the models, prompt, run count, thinking level, and token limit identical. Change only the label and the actual network environment:

```bash
pi-model-bench --speed --models provider/model-a,provider/model-b --runs 5 --max-tokens 256 --label direct -zf
pi-model-bench --speed --models provider/model-a,provider/model-b --runs 5 --max-tokens 256 --label office-vpn -zf
```

Then compare TTFT p50/p95, Decode TPS, failure counts, and error types in the Markdown reports.

### Test a real reasoning configuration

The default is `thinking=off`, which helps isolate network, queueing, and output speed. If you normally use a high reasoning level, benchmark it separately:

```bash
pi-model-bench --speed -a --runs 3 --thinking high --label thinking-high -zf
```

Do not rank results from different thinking levels together. Some reasoning models or providers may also be unable to disable thinking completely.

### Output files

No files are generated by default. Add `-f` to save results in the current working directory:

```bash
pi-model-bench -zaf
```

You can also use `--output NAME` to set a custom filename prefix; this automatically enables file output.

```text
pi-model-bench-20260805T150000Z-home-wifi.md
pi-model-bench-20260805T150000Z-home-wifi.csv
pi-model-bench-20260805T150000Z-home-wifi.json
```

- Markdown: View summaries, metrics, and errors directly.
- CSV: One row per request, suitable for Excel, Python, or DuckDB.
- JSON: Complete structured configuration and results for automation or long-term trend analysis.

Each request produces only one terminal result line:

```text
[pi-model-bench] ✅[15s][⚡198.4TPS][1/51] opencode-go/deepseek-v4-flash: OK — TTFT 15490 ms, TPS 198.4
```

TPS markers have four tiers: `🔴 0–50`, `🟡 51–100`, `🟢 101–149`, and `⚡ 150+`. When TPS cannot be calculated, the CLI displays `⚪—TPS`.

When `-s`, `-a`, or another selector chooses multiple models for a speed benchmark, the CLI prints a complete ranking at the end. Models are sorted by their median successful Decode TPS in descending order. Failed models and models without a usable TPS value remain listed at the end:

```text
[pi-model-bench] 📊[1/2][⚡198.4TPS][3/3] provider/fast-model
[pi-model-bench] 📊[2/2][🟡82.1TPS][3/3] provider/slow-model
```

All CLI examples above also work inside Pi: replace `pi-model-bench` with `/model-bench`.

## 4. Options and metrics

### Options

Choose only one model selector. If none is specified, the current model is used.

| Option | Description |
|---|---|
| `-c`, `--current` | Test the current model (default) |
| `-a`, `--all` | Test every configured and available model |
| `-s`, `--scoped` | Test models selected by Pi's `--models` or `enabledModels` |
| `--provider NAME` | Test every available model from one provider |
| `--models LIST` | Test comma-separated model IDs or wildcard patterns |
| `-t`, `--health` | Low-cost health check; defaults to one run and at most eight output tokens |
| `--speed` | Streaming speed benchmark (default); defaults to three runs and at most 128 output tokens |
| `--runs N` | Runs per model, from 1 to 20 |
| `--max-tokens N` | Maximum output tokens, from 1 to 4096 |
| `--timeout DURATION` | Per-request timeout, default `30s`; supports `ms`, `s`, and `m` |
| `--delay DURATION` | Delay between requests, default `250ms` |
| `--thinking LEVEL` | `off\|minimal\|low\|medium\|high\|xhigh\|max`, default `off` |
| `--label TEXT` | Network or scenario label stored in reports |
| `-f`, `--file` | Write Markdown, CSV, and JSON reports; disabled by default |
| `--output NAME` | Write reports with a custom filename prefix and enable file output |
| `--prompt TEXT` | Override the built-in fixed benchmark prompt |
| `-z`, `--zh`, `--lang zh` | Use Chinese terminal messages and Markdown reports; short flags can be combined, as in `-zs` |
| `--yes` | Skip multi-request confirmation in Pi's interactive mode; the CLI is non-interactive |
| `-l`, `--list` | List models without sending requests; `-lz` is equivalent to `--list --zh` |
| `--help` | Show help |
| `--version` / `-v` | Show the CLI version |

The total request count is `number of models × --runs`. For example, 18 models with three runs each produce 54 paid or subscription requests.

CLI exit codes: `0` for success, help, or model listing; `1` when a request fails or no model matches; `2` for invalid arguments; `127` when Pi cannot be started. If Pi exits abnormally, its exit code is passed through.

### Metrics

| Metric | Meaning | Primary use |
|---|---|---|
| Response-header latency | Time from request dispatch until HTTP response headers arrive; recorded only when the provider supports response callbacks | Observe connection, proxy, queueing, and request preprocessing latency |
| Time to first token (TTFT) | Time from request dispatch until the first non-empty text, thinking, or tool-call delta | Measure how quickly the model starts responding |
| Visible TTFT | Time from request dispatch until the first user-visible text | Measure the actual waiting experience for reasoning models |
| Decode TPS | Output tokens generated per second after the first output | Measure sustained output speed |
| End-to-end latency (E2E) | Time from request dispatch until the streaming response ends | Measure total response wait time |
| p50 | Median across multiple runs | Represent the typical experience |
| p95 | Slow-tail percentile across multiple runs | Detect occasional queueing or network jitter |

Decode TPS is calculated as:

```text
(output_tokens - 1) / (completion_time - first_output_time)
```

The tool prefers the final output-token count reported by the provider. If it is unavailable, the tool uses a local estimate and marks it in the report. One SSE or WebSocket chunk does not necessarily equal one token, so chunk counts are never used as token counts.

Health-check responses are very short. They are useful for availability checks, not Decode TPS comparisons. With only one run, p50 and p95 both represent that single sample. Use at least three runs for formal comparisons and five or more for more rigorous network comparisons.

Failures are classified as authentication, access or subscription, quota or billing, rate limit, model or endpoint, invalid request, timeout, network, upstream service, empty response, aborted request, or unknown. Reports retain a sanitized summary of the original error for troubleshooting.

## 5. Design

1. **Reuse Pi instead of building another configuration system**: The model list comes from Pi's model registry. Before each request, the extension asks Pi for the already-resolved authentication data and passes it to the corresponding provider adapter. The CLI only starts this flow non-interactively.
2. **Prioritize fair comparisons**: All requests run serially so models do not compete for local bandwidth. Client retries and cache retention are disabled so errors and network differences remain visible. Every request uses a unique session/request ID to reduce server-side cache interference.
3. **Separate availability from user experience**: Health checks use very short responses to reduce cost. Speed benchmarks use a fixed prompt designed for sustained output and separately record response start, visible response, sustained generation, and completion time.
4. **Do not pretend token counts are more precise than they are**: Provider-reported final usage is preferred. Local estimation is used only when the provider omits it, and the token source is recorded explicitly.
5. **Write files only when requested, incrementally and safely**: No files are written by default. With `-f`, all three formats are updated after every request and contain only the model metadata, metrics, usage, cost, and sanitized errors needed for analysis.

Pi typically combines `~/.pi/agent/settings.json`, `models.json`, `models-store.json`, `auth.json`, and provider environment variables such as `OPENAI_API_KEY`. This tool does not directly read or copy those credential files; it uses the authentication data resolved by Pi in memory.

For server concurrency capacity, fixed QPS, Poisson traffic, or high-concurrency load testing, use a dedicated load-testing tool. `pi-model-bench` focuses on reproducible comparisons of the single-user model experience.
