import type {
  BenchmarkMode,
  BenchmarkOptions,
  ModelSelector,
  OutputLanguage,
  RequestedThinking,
} from "./types";
import { expandShortFlags, hasChineseShortFlag } from "./short-options.js";

export const DEFAULT_SPEED_PROMPT =
  "Repeat this eight-word pattern continuously until the response is stopped: alpha bravo charlie delta echo foxtrot golf hotel. Output only those words separated by single spaces. Do not explain, count, or stop early.";

export const DEFAULT_HEALTH_PROMPT =
  "Reply with exactly OK and nothing else.";

const THINKING_LEVELS = new Set<RequestedThinking>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export const HELP_TEXT_EN = `pi-model-bench

Usage:
  pi-model-bench
  pi-model-bench -lz
  pi-model-bench -zs
  pi-model-bench --health --all --label home-wifi
  pi-model-bench --speed --all --runs 3 --max-tokens 128 --label office-vpn

Inside Pi:
  /model-bench --health --all --label home-wifi
  /model-bench --speed --all --runs 3 --max-tokens 128 --label office-vpn
  /model-bench --models provider/model-a,provider/model-b --runs 3

Model selection (choose one; default: current):
  -c, --current             Test the active model
  -a, --all                 Test every available configured model
  -s, --scoped              Test models selected by Pi --models/enabledModels
  --provider NAME           Test every available model from one provider
  --models LIST             Comma-separated model IDs or provider/model patterns

Test options:
  -t, --health              One short access/health request per model
  --speed                   Streaming benchmark (default)
  --runs N                  Runs per model (health: 1, speed: 3)
  --max-tokens N            Output cap (health: 8, speed: 128)
  --timeout DURATION        Per-request timeout (default: 30s), e.g. 15s or 2m
  --delay DURATION          Delay between requests (default: 250ms)
  --thinking LEVEL          off|minimal|low|medium|high|xhigh|max
  --label TEXT              Network label stored in reports
  -f, --file                Write Markdown, CSV, and JSON reports (off by default)
  --output NAME             Write reports with a custom basename
  --prompt TEXT             Override the fixed benchmark prompt
  --lang LANGUAGE           Report language: en|zh (default: en)
  -z, --zh                  Shortcut for --lang zh; short flags can combine, e.g. -zs
  --yes                     Skip the multi-model confirmation
  -l, --list                List available configured models without calling them
  --help                    Show this help`;

export const HELP_TEXT_ZH = `pi-model-bench

命令行用法：
  pi-model-bench
  pi-model-bench -lz
  pi-model-bench -zs
  pi-model-bench --health --all --label home-wifi --lang zh
  pi-model-bench --speed --all --runs 3 --max-tokens 128 --label office-vpn --lang zh

在 Pi 交互界面中：
  /model-bench --health --all --label home-wifi --lang zh
  /model-bench --speed --all --runs 3 --max-tokens 128 --label office-vpn --lang zh
  /model-bench --models provider/model-a,provider/model-b --runs 3 --lang zh

模型选择（只能选择一种；默认：当前模型）：
  -c, --current             测试当前正在使用的模型
  -a, --all                 测试所有已配置且可用的模型
  -s, --scoped              测试 Pi --models/enabledModels 限定的模型
  --provider NAME           测试指定 provider 下的全部可用模型
  --models LIST             逗号分隔的模型 ID 或 provider/model 通配模式

测试参数：
  -t, --health              每个模型执行一次低消耗健康检查
  --speed                   流式速度测试（默认）
  --runs N                  每个模型运行次数（健康检查：1，速度测试：3）
  --max-tokens N            最大输出 token（健康检查：8，速度测试：128）
  --timeout DURATION        单次请求超时（默认：30s），例如 15s 或 2m
  --delay DURATION          请求间隔（默认：250ms）
  --thinking LEVEL          off|minimal|low|medium|high|xhigh|max
  --label TEXT              写入报表的网络环境标签
  -f, --file                输出 Markdown、CSV、JSON 报表（默认不输出）
  --output NAME             使用自定义文件名前缀输出报表
  --prompt TEXT             覆盖内置的固定测试提示词
  --lang LANGUAGE           输出语言：en|zh（默认：en）
  -z, --zh                  --lang zh 的快捷写法；短参数可组合，如 -zs
  --yes                     跳过多模型测试确认
  -l, --list                只列出可用模型，不发送模型请求
  --help                    显示帮助`;

export function helpText(language: OutputLanguage): string {
  return language === "zh" ? HELP_TEXT_ZH : HELP_TEXT_EN;
}

export function detectLanguage(input: string): OutputLanguage {
  return /(?:^|\s)--zh(?:\s|$)/.test(input)
    || /(?:^|\s)--lang(?:=|\s+)(?:zh|zh-cn)(?:\s|$)/i.test(input)
    || hasChineseShortFlag(input)
    ? "zh"
    : "en";
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      token += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else token += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
      continue;
    }
    token += char;
  }

  if (escaped) token += "\\";
  if (quote) throw new Error("Unclosed quote in command arguments");
  if (token) tokens.push(token);
  return tokens;
}

function parseDuration(value: string, name: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/i);
  if (!match) throw new Error(`${name} must look like 500ms, 30s, or 2m`);
  const amount = Number(match[1]);
  const unit = (match[2] ?? "ms").toLowerCase();
  const multiplier = unit === "m" ? 60_000 : unit === "s" ? 1_000 : 1;
  return Math.round(amount * multiplier);
}

function parseInteger(value: string, name: string, min: number, max: number): number {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

function requireValue(tokens: string[], index: number, name: string): string {
  const value = tokens[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

export function parseOptions(input: string): BenchmarkOptions {
  const tokens = expandShortFlags(tokenize(input));
  let mode: BenchmarkMode = "speed";
  let modeWasSet = false;
  let selector: ModelSelector = { kind: "current" };
  let selectorWasSet = false;
  let runs: number | undefined;
  let maxTokens: number | undefined;
  let timeoutMs: number | undefined;
  let delayMs = 250;
  let label = "unlabeled";
  let writeFiles = false;
  let outputBase: string | undefined;
  let thinking: RequestedThinking = "off";
  let prompt: string | undefined;
  let language: OutputLanguage = "en";
  let yes = false;
  let list = false;
  let help = false;
  const positionalPatterns: string[] = [];

  const setMode = (next: BenchmarkMode) => {
    if (modeWasSet && mode !== next) throw new Error("Choose only one of --health and --speed");
    mode = next;
    modeWasSet = true;
  };

  const setSelector = (next: ModelSelector) => {
    if (selectorWasSet) throw new Error("Choose only one model selector");
    selector = next;
    selectorWasSet = true;
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const raw = tokens[index];
    const equals = raw.match(/^(--[^=]+)=(.*)$/);
    const arg = equals?.[1] ?? raw;
    const inlineValue = equals?.[2];
    const valueFor = (name: string): string => {
      if (inlineValue !== undefined) return inlineValue;
      const value = requireValue(tokens, index, name);
      index += 1;
      return value;
    };

    switch (arg) {
      case "--health":
      case "--heath":
        setMode("health");
        break;
      case "--speed":
        setMode("speed");
        break;
      case "--current":
        setSelector({ kind: "current" });
        break;
      case "--all":
        setSelector({ kind: "all" });
        break;
      case "--scoped":
        setSelector({ kind: "scoped" });
        break;
      case "--provider":
        setSelector({ kind: "provider", provider: valueFor("--provider") });
        break;
      case "--models": {
        const patterns = valueFor("--models").split(",").map((item) => item.trim()).filter(Boolean);
        if (patterns.length === 0) throw new Error("--models requires at least one model pattern");
        setSelector({ kind: "models", patterns });
        break;
      }
      case "--runs":
        runs = parseInteger(valueFor("--runs"), "--runs", 1, 20);
        break;
      case "--max-tokens":
        maxTokens = parseInteger(valueFor("--max-tokens"), "--max-tokens", 1, 4096);
        break;
      case "--timeout":
        timeoutMs = parseDuration(valueFor("--timeout"), "--timeout");
        if (timeoutMs < 1_000 || timeoutMs > 600_000) {
          throw new Error("--timeout must be between 1s and 10m");
        }
        break;
      case "--delay":
        delayMs = parseDuration(valueFor("--delay"), "--delay");
        if (delayMs < 0 || delayMs > 10_000) {
          throw new Error("--delay must be between 0ms and 10s");
        }
        break;
      case "--thinking": {
        const level = valueFor("--thinking") as RequestedThinking;
        if (!THINKING_LEVELS.has(level)) {
          throw new Error("--thinking must be off|minimal|low|medium|high|xhigh|max");
        }
        thinking = level;
        break;
      }
      case "--label":
        label = valueFor("--label").trim().slice(0, 80) || "unlabeled";
        break;
      case "--file":
        writeFiles = true;
        break;
      case "--output":
        outputBase = valueFor("--output");
        writeFiles = true;
        break;
      case "--prompt":
        prompt = valueFor("--prompt");
        break;
      case "--lang": {
        const requested = valueFor("--lang").toLowerCase();
        if (requested === "zh" || requested === "zh-cn") language = "zh";
        else if (requested === "en" || requested === "en-us") language = "en";
        else throw new Error("--lang must be en or zh");
        break;
      }
      case "--zh":
        language = "zh";
        break;
      case "--yes":
        yes = true;
        break;
      case "--list":
        list = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
        positionalPatterns.push(arg);
    }
  }

  if (positionalPatterns.length > 0) {
    if (selectorWasSet) throw new Error("Do not combine positional models with another selector");
    selector = { kind: "models", patterns: positionalPatterns };
  }

  return {
    mode,
    selector,
    runs: runs ?? (mode === "health" ? 1 : 3),
    maxTokens: maxTokens ?? (mode === "health" ? 8 : 128),
    timeoutMs: timeoutMs ?? 30_000,
    delayMs,
    label,
    writeFiles,
    outputBase,
    thinking,
    prompt: prompt ?? (mode === "health" ? DEFAULT_HEALTH_PROMPT : DEFAULT_SPEED_PROMPT),
    language,
    yes,
    list,
    help,
  };
}
