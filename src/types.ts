import type { Api, Model, ThinkingLevel } from "@earendil-works/pi-ai";

export type BenchmarkMode = "health" | "speed";
export type RequestedThinking = "off" | ThinkingLevel;
export type OutputLanguage = "en" | "zh";

export type ModelSelector =
  | { kind: "current" }
  | { kind: "all" }
  | { kind: "scoped" }
  | { kind: "provider"; provider: string }
  | { kind: "models"; patterns: string[] };

export interface BenchmarkOptions {
  mode: BenchmarkMode;
  selector: ModelSelector;
  runs: number;
  maxTokens: number;
  timeoutMs: number;
  delayMs: number;
  label: string;
  outputBase?: string;
  thinking: RequestedThinking;
  prompt: string;
  language: OutputLanguage;
  yes: boolean;
  list: boolean;
  help: boolean;
}

export type ErrorCategory =
  | "auth"
  | "access"
  | "quota"
  | "rate_limit"
  | "model_or_endpoint"
  | "invalid_request"
  | "timeout"
  | "network"
  | "upstream"
  | "empty_response"
  | "aborted"
  | "unknown";

export interface BenchmarkRun {
  startedAt: string;
  label: string;
  mode: BenchmarkMode;
  provider: string;
  model: string;
  modelName: string;
  api: string;
  baseUrl: string;
  run: number;
  success: boolean;
  httpStatus: number | null;
  responseHeadersMs: number | null;
  ttftMs: number | null;
  visibleTtftMs: number | null;
  e2eMs: number;
  decodeTps: number | null;
  wallTps: number | null;
  providerOutputTokens: number;
  outputTokens: number;
  tokenSource: "provider" | "estimated" | "none";
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number | null;
  costUsd: number;
  stopReason: string;
  responseModel: string;
  outputChars: number;
  thinkingChars: number;
  chunks: number;
  errorCategory: ErrorCategory | null;
  errorMessage: string;
  requestedThinking: RequestedThinking;
  maxTokens: number;
  timeoutMs: number;
}

export interface ModelDescriptor {
  provider: string;
  model: string;
  name: string;
  api: string;
  baseUrl: string;
}

export interface ReportData {
  extensionVersion: string;
  startedAt: string;
  completedAt?: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  timezone: string;
  proxyVariablesPresent: string[];
  options: BenchmarkOptions;
  models: ModelDescriptor[];
  results: BenchmarkRun[];
}

export type AnyModel = Model<Api>;

export type RequestAuth =
  | {
      ok: true;
      apiKey?: string;
      headers?: Record<string, string>;
      env?: Record<string, string>;
    }
  | { ok: false; error: string };
