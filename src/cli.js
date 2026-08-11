import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, isAbsolute, resolve } from "node:path";

export function encodeCommandArgument(value) {
  if (value.length > 0 && /^[A-Za-z0-9_./:@%+,=-]+$/u.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function parseNpmCommandShim(content, shimPath) {
  const match = content.match(/["']?%dp0%[\\/](?<target>[^"'\r\n]+?\.m?js)["']?\s+%\*/iu);
  if (!match?.groups?.target) return null;
  return resolve(dirname(shimPath), match.groups.target);
}

function resolveCommand(command, pathValue, cwd) {
  if (isAbsolute(command) || /[\\/]/u.test(command)) {
    const candidate = resolve(cwd, command);
    return existsSync(candidate) ? candidate : null;
  }

  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    const candidate = resolve(directory.replace(/^"|"$/g, ""), command);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function buildPiLaunch(
  piBinary,
  args,
  platform = process.platform,
  pathValue = process.env.PATH ?? "",
  cwd = process.cwd(),
) {
  if (platform === "win32" && /\.(?:cmd|bat)$/iu.test(piBinary)) {
    const shimPath = resolveCommand(piBinary, pathValue, cwd);
    if (!shimPath) throw new Error(`Could not find ${piBinary} on PATH`);

    const entryPoint = parseNpmCommandShim(readFileSync(shimPath, "utf8"), shimPath);
    if (!entryPoint || !existsSync(entryPoint)) {
      throw new Error(
        `Unsupported Windows command shim: ${shimPath}. Set PI_MODEL_BENCH_PI_BIN to the Pi executable or JavaScript entry point.`,
      );
    }
    return { command: process.execPath, args: [entryPoint, ...args] };
  }

  if (platform === "win32" && /\.m?js$/iu.test(piBinary)) {
    return { command: process.execPath, args: [piBinary, ...args] };
  }

  return { command: piBinary, args };
}
