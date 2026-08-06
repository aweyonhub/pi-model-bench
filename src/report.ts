import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { rename, writeFile } from "node:fs/promises";
import type { BenchmarkRun, ReportData } from "./types";

export interface ReportPaths {
  markdown: string;
  csv: string;
  json: string;
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "unlabeled";
}

function timestampSlug(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function createReportPaths(cwd: string, startedAt: string, outputBase: string | undefined, label: string): ReportPaths {
  const requested = outputBase
    ? basename(outputBase).replace(/\.(?:md|csv|json)$/i, "")
    : `pi-model-bench-${timestampSlug(startedAt)}-${slug(label)}`;
  const base = slug(requested) || `pi-model-bench-${timestampSlug(startedAt)}`;
  return {
    markdown: join(cwd, `${base}.md`),
    csv: join(cwd, `${base}.csv`),
    json: join(cwd, `${base}.json`),
  };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(results: BenchmarkRun[]): string {
  const fields: Array<keyof BenchmarkRun> = [
    "startedAt", "label", "mode", "provider", "model", "modelName", "api", "baseUrl", "run",
    "success", "httpStatus", "responseHeadersMs", "ttftMs", "visibleTtftMs", "e2eMs", "decodeTps",
    "wallTps", "providerOutputTokens", "outputTokens", "tokenSource", "inputTokens", "cacheReadTokens",
    "cacheWriteTokens", "reasoningTokens", "costUsd", "stopReason", "responseModel", "outputChars",
    "thinkingChars", "chunks", "errorCategory", "errorMessage", "requestedThinking", "maxTokens", "timeoutMs",
  ];
  const lines = [fields.join(",")];
  for (const result of results) {
    lines.push(fields.map((field) => csvCell(result[field])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

function numeric(results: BenchmarkRun[], key: keyof BenchmarkRun): number[] {
  return results
    .map((item) => item[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function fmt(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits);
}

function escapeMd(value: unknown): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function errorLabel(category: string, zh: boolean): string {
  if (!zh) return category;
  const labels: Record<string, string> = {
    auth: "鉴权失败",
    access: "权限或订阅",
    quota: "额度或计费",
    rate_limit: "请求限流",
    model_or_endpoint: "模型或接口",
    invalid_request: "无效请求",
    timeout: "请求超时",
    network: "网络错误",
    upstream: "上游服务",
    empty_response: "空响应",
    aborted: "请求中止",
    unknown: "未知错误",
  };
  return labels[category] ?? category;
}

function stopLabel(reason: string, zh: boolean): string {
  if (!zh) return reason;
  const labels: Record<string, string> = {
    stop: "正常结束",
    length: "达到输出上限",
    toolUse: "工具调用",
    error: "错误",
    aborted: "已中止",
    timeout: "超时",
  };
  return labels[reason] ?? reason;
}

function sourceLabel(source: BenchmarkRun["tokenSource"], zh: boolean): string {
  if (!zh) return source;
  return source === "provider" ? "接口报告" : source === "estimated" ? "本地估算" : "无";
}

function errorSummary(results: BenchmarkRun[], zh: boolean): string {
  const counts = new Map<string, number>();
  for (const result of results) {
    if (!result.errorCategory) continue;
    counts.set(result.errorCategory, (counts.get(result.errorCategory) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => `${errorLabel(key, zh)}×${count}`).join(", ") || "—";
}

function toMarkdown(data: ReportData): string {
  const zh = data.options.language === "zh";
  const groups = new Map<string, BenchmarkRun[]>();
  for (const result of data.results) {
    const key = `${result.provider}/${result.model}`;
    const current = groups.get(key) ?? [];
    current.push(result);
    groups.set(key, current);
  }

  const promptHash = createHash("sha256").update(data.options.prompt).digest("hex").slice(0, 16);
  const lines = [
    zh ? "# Pi 模型性能测试报告" : "# Pi model benchmark",
    "",
    zh ? `- 开始时间：${data.startedAt}` : `- Started: ${data.startedAt}`,
    zh ? `- 完成时间：${data.completedAt ?? "进行中"}` : `- Completed: ${data.completedAt ?? "in progress"}`,
    zh ? `- 网络标签：${escapeMd(data.options.label)}` : `- Network label: ${escapeMd(data.options.label)}`,
    zh ? `- 测试模式：${data.options.mode === "health" ? "健康检查" : "速度测试"}` : `- Mode: ${data.options.mode}`,
    zh ? `- 模型数量：${data.models.length}` : `- Models: ${data.models.length}`,
    zh ? `- 每个模型运行次数：${data.options.runs}` : `- Runs per model: ${data.options.runs}`,
    zh ? `- 最大输出 token：${data.options.maxTokens}` : `- Max output tokens: ${data.options.maxTokens}`,
    zh
      ? `- 请求的 thinking 级别：${data.options.thinking}（尽力设置，实际取决于 provider 和模型支持）`
      : `- Requested thinking: ${data.options.thinking} (best effort; provider/model support varies)`,
    zh ? `- 单次请求超时：${data.options.timeoutMs} ms` : `- Timeout: ${data.options.timeoutMs} ms`,
    zh ? `- 测试提示词 SHA-256：${promptHash}` : `- Prompt SHA-256: ${promptHash}`,
    zh
      ? `- 运行环境：Node ${data.nodeVersion}，${data.platform}/${data.arch}，${data.timezone}`
      : `- Runtime: Node ${data.nodeVersion}, ${data.platform}/${data.arch}, ${data.timezone}`,
    zh
      ? `- 检测到的代理环境变量：${data.proxyVariablesPresent.join(", ") || "无"}`
      : `- Proxy variables present: ${data.proxyVariablesPresent.join(", ") || "none"}`,
    "",
    zh ? "## 汇总" : "## Summary",
    "",
    zh
      ? "| 模型 | 状态 | 成功次数 | 响应头 p50 ms | 首 token p50 / p95 ms | 可见首 token p50 ms | 生成速度 p50 token/s | 总耗时 p50 ms | 输出 token p50 | 费用 USD | 错误 |"
      : "| Model | Status | Success | HTTP→headers p50 ms | TTFT p50 / p95 ms | Visible TTFT p50 ms | Decode TPS p50 | E2E p50 ms | Output tokens p50 | Cost USD | Errors |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ];

  for (const model of data.models) {
    const key = `${model.provider}/${model.model}`;
    const results = groups.get(key) ?? [];
    const successful = results.filter((item) => item.success);
    const health = successful.length === results.length && results.length > 0
      ? (zh ? "正常" : "OK")
      : successful.length > 0
        ? (zh ? "部分成功" : "PARTIAL")
        : results.length > 0
          ? (zh ? "失败" : "FAIL")
          : (zh ? "待测试" : "PENDING");
    const totalCost = results.reduce((sum, item) => sum + item.costUsd, 0);
    const successText = results.length === 0 ? "0/0" : `${successful.length}/${results.length}`;
    const ttftP50 = median(numeric(successful, "ttftMs"));
    const ttftP95 = percentile(numeric(successful, "ttftMs"), 0.95);
    lines.push(
      `| ${escapeMd(key)} | ${health} | ${successText} | ${fmt(median(numeric(successful, "responseHeadersMs")))} | ${fmt(ttftP50)} / ${fmt(ttftP95)} | ${fmt(median(numeric(successful, "visibleTtftMs")))} | ${fmt(median(numeric(successful, "decodeTps")))} | ${fmt(median(numeric(successful, "e2eMs")))} | ${fmt(median(numeric(successful, "outputTokens")), 0)} | ${totalCost.toFixed(6)} | ${escapeMd(errorSummary(results, zh))} |`,
    );
  }

  lines.push(
    "",
    zh ? "## 每次测试明细" : "## Individual runs",
    "",
    zh
      ? "| 时间 | 模型 | 次数 | 结果 | HTTP | 首 token ms | 可见首 token ms | 生成速度 token/s | 总耗时 ms | 输出 token | token 来源 | 结束原因或错误 |"
      : "| Time | Model | Run | Result | HTTP | TTFT ms | Visible TTFT ms | Decode TPS | E2E ms | Tokens | Source | Stop/error |",
    "|---|---|---:|---|---:|---:|---:|---:|---:|---:|---|---|",
  );
  for (const result of data.results) {
    const outcome = result.success ? (zh ? "成功" : "OK") : (zh ? "失败" : "FAIL");
    const detail = result.success
      ? stopLabel(result.stopReason, zh)
      : `${errorLabel(result.errorCategory ?? "unknown", zh)}: ${result.errorMessage || (zh ? "没有错误详情" : "No error detail")}`;
    lines.push(
      `| ${escapeMd(result.startedAt)} | ${escapeMd(`${result.provider}/${result.model}`)} | ${result.run} | ${outcome} | ${result.httpStatus ?? "—"} | ${fmt(result.ttftMs)} | ${fmt(result.visibleTtftMs)} | ${fmt(result.decodeTps)} | ${fmt(result.e2eMs)} | ${result.outputTokens} | ${sourceLabel(result.tokenSource, zh)} | ${escapeMd(detail)} |`,
    );
  }

  lines.push(
    "",
    zh ? "## 指标说明" : "## Metric definitions",
    "",
    ...(zh
      ? [
          "- **响应头耗时**：从开始请求到收到 HTTP 响应头；仅在 provider 适配器支持时记录。",
          "- **首 token 时间（TTFT）**：从开始请求到收到第一个非空文本、thinking 或工具调用增量。",
          "- **可见首 token 时间**：从开始请求到收到第一个用户可见的非空文本增量。",
          "- **生成速度（Decode TPS）**：`(输出 token - 1) / (完成时间 - 首次输出时间)`。优先使用接口报告的 token 数，本地估算会明确标记。",
          "- **总耗时（E2E）**：从开始请求到收到流式终止事件。",
          "- 所有请求串行执行；关闭客户端重试和缓存保留；每次请求使用唯一 session/request ID。",
          "- 少于 3 次成功测试时，p50/p95 只能作为方向性参考，不能视为稳定统计结果。",
        ]
      : [
          "- **HTTP→headers**: request start until response headers are received, when the provider adapter exposes it.",
          "- **TTFT**: request start until the first non-empty text, thinking, or tool-call delta.",
          "- **Visible TTFT**: request start until the first non-empty visible text delta.",
          "- **Decode TPS**: `(output_tokens - 1) / (completion_time - first_output_time)`. Provider usage is preferred; estimates are marked.",
          "- **E2E**: request start until the terminal stream event.",
          "- Runs are serial, retries are disabled, cache retention is disabled, and every request uses a unique session/request ID.",
          "- With fewer than three successful runs, percentiles are directional rather than statistically stable.",
        ]),
    "",
  );
  return lines.join("\n");
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, content, "utf8");
  await rename(temp, path);
}

export async function writeReports(paths: ReportPaths, data: ReportData): Promise<void> {
  await Promise.all([
    atomicWrite(paths.markdown, toMarkdown(data)),
    atomicWrite(paths.csv, toCsv(data.results)),
    atomicWrite(paths.json, `${JSON.stringify(data, null, 2)}\n`),
  ]);
}
