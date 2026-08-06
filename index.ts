import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { basename } from "node:path";
import { benchmarkModel, safeBaseUrl, sanitizeError } from "./src/benchmark";
import { detectLanguage, helpText, parseOptions } from "./src/options";
import { createReportPaths, writeReports } from "./src/report";
import type {
  AnyModel,
  BenchmarkOptions,
  ModelDescriptor,
  ReportData,
  RequestAuth,
} from "./src/types";

const EXTENSION_VERSION = "0.1.0";

function errorCategoryLabel(category: string | null, zh: boolean): string {
  if (!zh) return category ?? "unknown";
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
  return labels[category ?? "unknown"] ?? category ?? "未知错误";
}

function announce(
  ctx: ExtensionCommandContext,
  message: string,
  type: "info" | "warning" | "error" = "info",
): void {
  if (ctx.hasUI) ctx.ui.notify(message, type);
  else process.stderr.write(`[pi-model-bench] ${message}\n`);
}

function wildcardRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesPattern(model: AnyModel, pattern: string): boolean {
  const full = `${model.provider}/${model.id}`;
  const regex = wildcardRegex(pattern);
  return regex.test(full) || regex.test(model.id);
}

function deduplicate(models: AnyModel[]): AnyModel[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    const key = `${model.provider}/${model.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveModels(ctx: ExtensionCommandContext, options: BenchmarkOptions): AnyModel[] {
  const available = ctx.modelRegistry.getAvailable();
  let models: AnyModel[];
  switch (options.selector.kind) {
    case "current":
      models = ctx.model ? [ctx.model] : [];
      break;
    case "all":
      models = available;
      break;
    case "scoped":
      models = ctx.scopedModels.map((entry) => entry.model);
      break;
    case "provider":
      models = available.filter((model) => model.provider === options.selector.provider);
      break;
    case "models":
      models = available.filter((model) => options.selector.patterns.some((pattern) => matchesPattern(model, pattern)));
      break;
  }
  return deduplicate(models).sort((left, right) =>
    `${left.provider}/${left.id}`.localeCompare(`${right.provider}/${right.id}`),
  );
}

function describe(model: AnyModel): ModelDescriptor {
  return {
    provider: model.provider,
    model: model.id,
    name: model.name,
    api: model.api,
    baseUrl: safeBaseUrl(model.baseUrl),
  };
}

function modelList(models: AnyModel[], zh: boolean): string {
  if (models.length === 0) return zh ? "没有已配置且可用的模型。" : "No available configured models.";
  return models
    .map((model) => `${model.provider}/${model.id}  [${model.api}]  ${safeBaseUrl(model.baseUrl)}`)
    .join("\n");
}

function environmentData(ctx: ExtensionCommandContext, options: BenchmarkOptions, models: AnyModel[]): ReportData {
  const proxyNames = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"]
    .filter((name) => Boolean(process.env[name]));
  return {
    extensionVersion: EXTENSION_VERSION,
    startedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    proxyVariablesPresent: proxyNames,
    options,
    models: models.map(describe),
    results: [],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveAuth(ctx: ExtensionCommandContext, model: AnyModel): Promise<RequestAuth> {
  try {
    return await ctx.modelRegistry.getApiKeyAndHeaders(model);
  } catch (error) {
    return { ok: false, error: sanitizeError(error) };
  }
}

async function runCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
  let options: BenchmarkOptions;
  try {
    options = parseOptions(args);
  } catch (error) {
    const language = detectLanguage(args);
    announce(
      ctx,
      `❌ ${language === "zh" ? "参数错误：" : ""}${sanitizeError(error)}\n\n${helpText(language)}`,
      "error",
    );
    if (!ctx.hasUI) process.exitCode = 2;
    return;
  }
  const zh = options.language === "zh";

  if (options.help) {
    announce(ctx, helpText(options.language));
    return;
  }

  const allAvailable = ctx.modelRegistry.getAvailable()
    .sort((left, right) => `${left.provider}/${left.id}`.localeCompare(`${right.provider}/${right.id}`));
  if (options.list) {
    announce(ctx, modelList(allAvailable, zh));
    return;
  }

  const models = resolveModels(ctx, options);
  if (models.length === 0) {
    const hint = options.selector.kind === "scoped"
      ? (zh
          ? "没有配置 scoped models，请改用 --current、--all、--provider 或 --models。"
          : "No scoped models are configured. Use --current, --all, --provider, or --models.")
      : (zh ? "没有已配置模型匹配当前选择。" : "No configured models matched the selection.");
    announce(ctx, `❌ ${hint}`, "error");
    if (!ctx.hasUI) process.exitCode = 1;
    return;
  }

  const totalRequests = models.length * options.runs;
  if (!options.yes && ctx.hasUI && (models.length > 1 || totalRequests > 3)) {
    const confirmed = await ctx.ui.confirm(
      zh ? "确认运行模型测试？" : "Run model benchmark?",
      zh
        ? `${models.length} 个模型 × ${options.runs} 次 = ${totalRequests} 次付费或订阅请求。\n模式：${options.mode === "health" ? "健康检查" : "速度测试"}；最大 token：${options.maxTokens}；网络：${options.label}`
        : `${models.length} model(s) × ${options.runs} run(s) = ${totalRequests} paid/subscription request(s).\nMode: ${options.mode}; max tokens: ${options.maxTokens}; network: ${options.label}`,
    );
    if (!confirmed) {
      announce(ctx, zh ? "⚠️ 测试已取消。" : "⚠️ Benchmark cancelled.", "warning");
      return;
    }
  }

  const data = environmentData(ctx, options, models);
  const paths = createReportPaths(ctx.cwd, data.startedAt, options.outputBase, options.label);
  await writeReports(paths, data);
  announce(
    ctx,
    zh
      ? `🚀 开始执行 ${totalRequests} 次请求。每次测试完成后都会保存增量报表。`
      : `🚀 Starting ${totalRequests} request(s). Partial reports are saved after every run.`,
  );

  let completed = 0;
  try {
    for (const model of models) {
      for (let run = 1; run <= options.runs; run += 1) {
        completed += 1;
        const key = `${model.provider}/${model.id}`;
        ctx.ui.setStatus("model-bench", `[${completed}/${totalRequests}] ${key} run ${run}/${options.runs}`);
        if (!ctx.hasUI) {
          announce(
            ctx,
            zh
              ? `⏳ [${completed}/${totalRequests}] ${key}：正在请求（第 ${run}/${options.runs} 次，超时 ${Math.round(options.timeoutMs / 1_000)} 秒）…`
              : `⏳ [${completed}/${totalRequests}] ${key}: requesting (run ${run}/${options.runs}, timeout ${Math.round(options.timeoutMs / 1_000)}s)…`,
          );
        }
        const auth = await resolveAuth(ctx, model);
        const result = await benchmarkModel(model, auth, options, run, (ttftMs) => {
          if (!ctx.hasUI) {
            announce(
              ctx,
              zh
                ? `⚡ [${completed}/${totalRequests}] ${key}：已收到首 token（${ttftMs.toFixed(0)} ms），等待响应完成…`
                : `⚡ [${completed}/${totalRequests}] ${key}: first token received (${ttftMs.toFixed(0)} ms), waiting for completion…`,
            );
          }
        });
        data.results.push(result);
        await writeReports(paths, data);

        const metric = result.success
          ? (zh
              ? `首 token ${result.ttftMs?.toFixed(0) ?? "—"} ms，生成速度 ${result.decodeTps === null ? "不适用" : `${result.decodeTps.toFixed(1)} token/s`}`
              : `TTFT ${result.ttftMs?.toFixed(0) ?? "—"} ms, TPS ${result.decodeTps?.toFixed(1) ?? "—"}`)
          : `${errorCategoryLabel(result.errorCategory, zh)}: ${result.errorMessage || (zh ? "请求失败" : "request failed")}`;
        announce(
          ctx,
          `${result.success ? "✅" : "❌"} [${completed}/${totalRequests}] ${key}: ${result.success ? (zh ? "成功" : "OK") : (zh ? "失败" : "FAIL")} — ${metric}`,
          result.success ? "info" : "warning",
        );

        if (completed < totalRequests && options.delayMs > 0) await delay(options.delayMs);
      }
    }
    data.completedAt = new Date().toISOString();
    await writeReports(paths, data);
  } finally {
    ctx.ui.setStatus("model-bench", undefined);
  }

  const successes = data.results.filter((item) => item.success).length;
  const displayPaths = {
    markdown: basename(paths.markdown),
    csv: basename(paths.csv),
    json: basename(paths.json),
  };
  const completionIcon = successes === data.results.length ? "✅" : successes > 0 ? "⚠️" : "❌";
  announce(
    ctx,
    zh
      ? `${completionIcon} 测试完成：${successes}/${data.results.length} 次成功。\n中文 Markdown：${displayPaths.markdown}\nCSV：${displayPaths.csv}\nJSON：${displayPaths.json}`
      : `${completionIcon} Finished: ${successes}/${data.results.length} successful.\nMarkdown: ${displayPaths.markdown}\nCSV: ${displayPaths.csv}\nJSON: ${displayPaths.json}`,
    successes === data.results.length ? "info" : "warning",
  );
  if (!ctx.hasUI && successes !== data.results.length) process.exitCode = 1;
}

export default function modelBenchExtension(pi: ExtensionAPI): void {
  pi.registerCommand("model-bench", {
    description: "Batch-check configured models and export TTFT/TPS/E2E reports",
    handler: runCommand,
  });
}
