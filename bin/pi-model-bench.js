#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPiLaunch, encodeCommandArgument } from "../src/cli.js";

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(scriptPath), "..");
const extensionPath = resolve(packageRoot, "index.ts");
const cliArgs = process.argv.slice(2);

function packageVersion() {
  const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  return packageJson.version;
}

if (cliArgs.length === 1 && (cliArgs[0] === "--version" || cliArgs[0] === "-v")) {
  process.stdout.write(`${packageVersion()}\n`);
} else {
  const forwardedArgs = cliArgs;
  const command = `/model-bench ${forwardedArgs.map(encodeCommandArgument).join(" ")}`;
  const piBinary = process.env.PI_MODEL_BENCH_PI_BIN?.trim()
    || (process.platform === "win32" ? "pi.cmd" : "pi");
  const piArgs = [
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
  ];
  let child;
  let failedToStart = false;
  const reportLaunchError = (error) => {
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
  };

  try {
    const launch = buildPiLaunch(piBinary, piArgs);
    child = spawn(
      launch.command,
      launch.args,
      {
        cwd: process.cwd(),
        env: process.env,
        shell: false,
        stdio: "inherit",
      },
    );
  } catch (error) {
    reportLaunchError(error);
  }

  if (child) {
    child.once("error", reportLaunchError);
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
}
