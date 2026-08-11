# pi-model-bench

A Pi Coding Agent extension and CLI that reuse Pi's configured models and credentials to run serial API health checks and streaming benchmarks.

中文说明：[README_CN.md](./README_CN.md)

It never writes credentials to reports. Reports contain model/provider metadata, timing, usage, cost, and sanitized error summaries.

## MVP features

- `pi-model-bench` shell command without launching Pi's TUI
- `/model-bench` command inside Pi
- Low-cost `--health` checks for access, subscription, quota, endpoint, and network failures
- Repeatable `--speed` checks with TTFT, visible TTFT, decode TPS, and E2E latency
- Provider-reported output-token counts when available; clearly marked estimation fallback
- Serial requests, disabled retries, disabled cache retention, and unique request IDs
- Optional incremental Markdown, CSV, and JSON reports with `-f`
- Manual network labels such as `home-wifi`, `office-vpn`, or `mobile-5g`

## Requirements

- Node.js 20 or newer
- Pi Coding Agent 0.83.0 or newer
- At least one model and credential configured in Pi

## Shell CLI

From this directory:

```bash
node ./bin/pi-model-bench.js --list
```

Register the command while developing:

```bash
npm link
pi-model-bench --health --all --label home-wifi
```

The CLI is a thin non-interactive wrapper around Pi. It starts the Pi runtime with only this extension, does not open the TUI or save a session, and leaves credential resolution to Pi. Running it without arguments runs the default speed benchmark against the current model and does not write report files.

Short flags are available and can be combined: `-c` current, `-a` all, `-s` scoped, `-t` health, `-l` list, `-z` Chinese, and `-f` report files. For example, `pi-model-bench -lz` is equivalent to `pi-model-bench --list --zh`, while `pi-model-bench -zs` benchmarks Pi's scoped models with Chinese output.

After a speed benchmark that selects multiple models, the CLI prints every model ranked by median successful Decode TPS in descending order. Failed models and models without a usable TPS value remain visible at the end.

Set `PI_MODEL_BENCH_PI_BIN=/path/to/pi` if the Pi executable is not on the standard `PATH`.

CLI exit codes are script-friendly: `0` for success/help/list, `1` when a request fails or no model matches, `2` for invalid arguments, and `127` when Pi cannot be started. Other Pi process exit codes pass through.

## Install in Pi

```bash
pi install .
```

Then restart Pi or run `/reload` and use:

```text
/model-bench --health --all --label home-wifi
/model-bench --speed --all --runs 3 --max-tokens 128 --label office-vpn -f
/model-bench --models provider/model-a,provider/model-b --runs 3
```

Use `/model-bench --help` for every option.

`pi install` enables the command inside Pi, but does not install the shell executable. Use `npm link` during development or install the repository globally with npm for the shell command:

```bash
npm install --global github:YOUR_GITHUB_NAME/pi-model-bench
pi install https://github.com/YOUR_GITHUB_NAME/pi-model-bench
```

The package remains `private: true` to prevent accidental npm publication; this does not prevent installation from GitHub.

## Credentials

The wrapper never reads credentials itself. The extension asks Pi's model registry for each model's resolved authentication and keeps it in memory. Pi can use its own `~/.pi/agent/auth.json`, provider environment variables such as `OPENAI_API_KEY`, and custom model/provider configuration. Standard OpenAI API auth uses provider `openai`; ChatGPT Plus/Pro OAuth uses `openai-codex` after logging in through Pi.

## Safe defaults

- The default selection is only the current model.
- Health mode defaults to one request and eight output tokens per model.
- Speed mode defaults to three requests and 128 output tokens per model.
- Health and speed requests both default to a 30-second per-request timeout.
- Multi-model or more-than-three-request runs require confirmation in the TUI. The shell CLI is already non-interactive and starts the selected requests immediately.
- Requests run one at a time so models do not compete for the same connection or local bandwidth.
- Thinking defaults to `off` on a best-effort basis. Some reasoning models/providers cannot fully disable it; the requested level is recorded in every result.
- Reports are disabled by default. Use `-f` for default filenames or `--output NAME` for a custom basename.
- Reports do not contain credentials or the absolute working-directory path.
- Completion messages show relative report filenames rather than the absolute working directory.

## Measurement notes

TTFT starts immediately before dispatch and stops on the first non-empty text, thinking, or tool-call delta. Visible TTFT stops only on visible text. Lifecycle markers such as `text_start` are not counted as tokens.

Decode TPS is `(output_tokens - 1) / (completion_time - first_output_time)`. The final provider usage count is preferred because an SSE/WebSocket chunk is not necessarily one token. Very short health responses are useful for availability checks, not reliable throughput comparisons.

For network comparisons, run the same command, prompt, model list, token cap, and number of runs under each label. Three runs are a minimum; five or more give more useful p50/p95 values.
