import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";
import { uuidv7 } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import type {
  AnyModel,
  BenchmarkOptions,
  BenchmarkRun,
  ErrorCategory,
  RequestAuth,
} from "./types";

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function safeBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\?.*$/, "").slice(0, 200);
  }
}

export function sanitizeError(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? "");
  return raw
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;}]+/gi, "$1[REDACTED]")
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[REDACTED]")
    .replace(/\b(sk|key|token)-[A-Za-z0-9_-]{8,}\b/gi, "$1-[REDACTED]")
    .replace(/((?:api[_-]?key|access[_-]?token|secret)["'\s]*[:=]["'\s]*)[^\s,"'}]+/gi, "$1[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function statusFromText(message: string): number | null {
  const match = message.match(/(?:status(?:\s+code)?|http|error)\D{0,8}([45]\d\d)\b/i)
    ?? message.match(/\b(400|401|402|403|404|408|409|422|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : null;
}

export function classifyError(
  message: string,
  httpStatus: number | null,
  timedOut: boolean,
  aborted: boolean,
): ErrorCategory {
  const normalized = message.toLowerCase();
  const status = httpStatus ?? statusFromText(message);
  if (timedOut || status === 408 || /timed?\s*out|timeout/.test(normalized)) return "timeout";
  if (
    status === 401
    || /invalid.*(?:api.?key|token)|unauthenticated|authentication failed|no api.?key|api.?key.*(?:missing|not found|not configured)|oauth.*(?:failed|expired)/.test(normalized)
  ) return "auth";
  if (status === 402 || /insufficient_quota|credit balance|quota exceeded|billing/.test(normalized)) return "quota";
  if (status === 403 || /permission denied|not allowed|not authorized|subscription/.test(normalized)) return "access";
  if (status === 429 || /rate.?limit|too many requests/.test(normalized)) return "rate_limit";
  if (status === 404 || /model.*not found|unknown model|endpoint.*not found/.test(normalized)) return "model_or_endpoint";
  if (
    status === 400
    || status === 409
    || status === 422
    || /unsupported (?:parameter|field|option)|invalid (?:parameter|temperature)|unknown parameter/.test(normalized)
  ) return "invalid_request";
  if (status !== null && status >= 500) return "upstream";
  if (/fetch failed|econn|enotfound|network|socket|dns|tls|certificate/.test(normalized)) return "network";
  if (aborted || /aborted|aborterror/.test(normalized)) return "aborted";
  return "unknown";
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const nonCjk = text.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, " ");
  const wordAndPunctuation = nonCjk.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0;
  return Math.max(1, cjk + wordAndPunctuation);
}

function emptyRun(
  model: AnyModel,
  options: BenchmarkOptions,
  run: number,
  startedAt: string,
): BenchmarkRun {
  return {
    startedAt,
    label: options.label,
    mode: options.mode,
    provider: model.provider,
    model: model.id,
    modelName: model.name,
    api: model.api,
    baseUrl: safeBaseUrl(model.baseUrl),
    run,
    success: false,
    httpStatus: null,
    responseHeadersMs: null,
    ttftMs: null,
    visibleTtftMs: null,
    e2eMs: 0,
    decodeTps: null,
    wallTps: null,
    providerOutputTokens: 0,
    outputTokens: 0,
    tokenSource: "none",
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: null,
    costUsd: 0,
    stopReason: "error",
    responseModel: "",
    outputChars: 0,
    thinkingChars: 0,
    chunks: 0,
    errorCategory: "unknown",
    errorMessage: "",
    requestedThinking: options.thinking,
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs,
  };
}

export async function benchmarkModel(
  model: AnyModel,
  auth: RequestAuth,
  options: BenchmarkOptions,
  run: number,
  onFirstOutput?: (ttftMs: number) => void,
): Promise<BenchmarkRun> {
  const startedAt = new Date().toISOString();
  const result = emptyRun(model, options, run, startedAt);
  if (!auth.ok) {
    result.errorMessage = sanitizeError(auth.error);
    result.errorCategory = classifyError(result.errorMessage, null, false, false);
    return result;
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);

  const start = performance.now();
  let responseAt: number | null = null;
  let firstOutputAt: number | null = null;
  let firstVisibleAt: number | null = null;
  let terminalAt: number | null = null;
  let httpStatus: number | null = null;
  let outputText = "";
  let thinkingText = "";
  let chunks = 0;
  let finalMessage: AssistantMessage | null = null;
  let terminalEvent: "done" | "error" | null = null;
  let thrownMessage = "";

  const nonce = uuidv7();
  const prompt = `${options.prompt}\n\nBenchmark request id: ${nonce}. Do not include this id in the response.`;

  try {
    const stream = streamSimple(
      model,
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }],
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        env: auth.env,
        maxTokens: options.maxTokens,
        reasoning: options.thinking === "off" ? undefined : options.thinking,
        signal: controller.signal,
        timeoutMs: options.timeoutMs,
        maxRetries: 0,
        maxRetryDelayMs: 0,
        cacheRetention: "none",
        sessionId: nonce,
        onResponse: (response) => {
          responseAt ??= performance.now();
          httpStatus = response.status;
        },
      },
    );

    for await (const event of stream as AsyncIterable<AssistantMessageEvent>) {
      const now = performance.now();
      if (
        (event.type === "text_delta" || event.type === "thinking_delta" || event.type === "toolcall_delta")
        && event.delta.length > 0
      ) {
        if (firstOutputAt === null) {
          firstOutputAt = now;
          onFirstOutput?.(round(now - start));
        }
        chunks += 1;
      }
      if (event.type === "text_delta" && event.delta.length > 0) {
        firstVisibleAt ??= now;
        outputText += event.delta;
      } else if (event.type === "thinking_delta" && event.delta.length > 0) {
        thinkingText += event.delta;
      }

      if (event.type === "done") {
        terminalAt = now;
        terminalEvent = "done";
        finalMessage = event.message;
      } else if (event.type === "error") {
        terminalAt = now;
        terminalEvent = "error";
        finalMessage = event.error;
      }
    }
  } catch (error) {
    thrownMessage = sanitizeError(error);
  } finally {
    clearTimeout(timer);
  }

  const end = terminalAt ?? performance.now();
  const usage = finalMessage?.usage;
  const providerOutputTokens = usage?.output ?? 0;
  const estimatedOutputTokens = estimateTokens(`${thinkingText} ${outputText}`.trim());
  const outputTokens = providerOutputTokens > 0 ? providerOutputTokens : estimatedOutputTokens;
  const tokenSource = providerOutputTokens > 0 ? "provider" : estimatedOutputTokens > 0 ? "estimated" : "none";
  const e2eMs = Math.max(0, end - start);
  const decodeMs = firstOutputAt === null ? null : Math.max(0, end - firstOutputAt);
  const errorMessage = sanitizeError(finalMessage?.errorMessage || thrownMessage);
  const success = terminalEvent === "done";
  const stoppedAsAborted = finalMessage?.stopReason === "aborted" || controller.signal.aborted;

  result.success = success;
  result.httpStatus = httpStatus ?? statusFromText(errorMessage);
  result.responseHeadersMs = responseAt === null ? null : round(responseAt - start);
  result.ttftMs = firstOutputAt === null ? null : round(firstOutputAt - start);
  result.visibleTtftMs = firstVisibleAt === null ? null : round(firstVisibleAt - start);
  result.e2eMs = round(e2eMs);
  result.decodeTps = decodeMs !== null && decodeMs >= 100 && outputTokens > 1
    ? round((outputTokens - 1) / (decodeMs / 1_000))
    : null;
  result.wallTps = e2eMs > 0 && outputTokens > 0 ? round(outputTokens / (e2eMs / 1_000)) : null;
  result.providerOutputTokens = providerOutputTokens;
  result.outputTokens = outputTokens;
  result.tokenSource = tokenSource;
  result.inputTokens = usage?.input ?? 0;
  result.cacheReadTokens = usage?.cacheRead ?? 0;
  result.cacheWriteTokens = usage?.cacheWrite ?? 0;
  result.reasoningTokens = usage?.reasoning ?? null;
  result.costUsd = round(usage?.cost.total ?? 0, 8);
  result.stopReason = finalMessage?.stopReason ?? (timedOut ? "timeout" : "error");
  result.responseModel = finalMessage?.responseModel ?? finalMessage?.model ?? "";
  result.outputChars = Array.from(outputText).length;
  result.thinkingChars = Array.from(thinkingText).length;
  result.chunks = chunks;
  result.errorMessage = errorMessage;
  result.errorCategory = success
    ? null
    : classifyError(errorMessage, result.httpStatus, timedOut, stoppedAsAborted);

  if (success && outputTokens === 0 && result.outputChars === 0 && result.thinkingChars === 0) {
    result.success = false;
    result.errorCategory = "empty_response";
    result.errorMessage = "Provider completed successfully but returned no output";
  }

  return result;
}
