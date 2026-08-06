#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(scriptPath), "..");
const extensionPath = resolve(packageRoot, "index.ts");
const cliArgs = process.argv.slice(2);

function packageVersion() {
  const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  return packageJson.version;
}

function encodeCommandArgument(value) {
  if (value.length > 0 && /^[A-Za-z0-9_./:@%+,=-]+$/u.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

if (cliArgs.length === 1 && (cliArgs[0] === "--version" || cliArgs[0] === "-v")) {
  process.stdout.write(`${packageVersion()}\n`);
} else {
  const forwardedArgs = cliArgs.length > 0 ? cliArgs : ["--help"];
  const command = `/model-bench ${forwardedArgs.map(encodeCommandArgument).join(" ")}`;
  const piBinary = process.env.PI_MODEL_BENCH_PI_BIN?.trim()
    || (process.platform === "win32" ? "pi.cmd" : "pi");

  const child = spawn(
    piBinary,
    [
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-context-files",
      "--no-tools",
      "--extension",
      extensionPath,
      "--no-session",
      "--print",
      command,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: "inherit",
    },
  );

  let failedToStart = false;
  child.once("error", (error) => {
    failedToStart = true;
    const zh = forwardedArgs.includes("--zh")
      || forwardedArgs.some((arg, index) => arg === "--lang" && /^zh(?:-cn)?$/i.test(forwardedArgs[index + 1] ?? ""))
      || forwardedArgs.some((arg) => /^--lang=zh(?:-cn)?$/i.test(arg));
    const detail = error && typeof error === "object" && "message" in error ? error.message : String(error);
    process.stderr.write(
      zh
        ? `[pi-model-bench] 无法启动 Pi。请先安装 Pi，并确认 pi 命令在 PATH 中。\n${detail}\n`
        : `[pi-model-bench] Could not start Pi. Install Pi and make sure the pi command is on PATH.\n${detail}\n`,
    );
    process.exitCode = 127;
  });

  child.once("close", (code, signal) => {
    if (failedToStart) return;
    if (typeof code === "number") {
      process.exitCode = code;
      return;
    }
    const signalExitCodes = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 };
    process.exitCode = signalExitCodes[signal] ?? 1;
  });
}
