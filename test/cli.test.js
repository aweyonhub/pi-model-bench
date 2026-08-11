import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { buildPiLaunch, encodeCommandArgument, parseNpmCommandShim } from "../src/cli.js";

test("encodeCommandArgument leaves simple values unchanged", () => {
  assert.equal(encodeCommandArgument("provider/model-1"), "provider/model-1");
});

test("encodeCommandArgument quotes whitespace, backslashes, and quotes", () => {
  assert.equal(
    encodeCommandArgument('say "hello" from C:\\models'),
    '"say \\"hello\\" from C:\\\\models"',
  );
});

test("parseNpmCommandShim extracts the JavaScript entry point", () => {
  const shim = '"%_prog%" "%dp0%\\node_modules\\example\\cli.js" %*';
  assert.equal(
    parseNpmCommandShim(shim, "C:\\npm\\pi.cmd"),
    resolve("C:\\npm", "node_modules\\example\\cli.js"),
  );
});

test("buildPiLaunch invokes JavaScript entry points with Node on Windows", () => {
  assert.deepEqual(buildPiLaunch("C:\\tools\\pi.js", ["--print"], "win32"), {
    command: process.execPath,
    args: ["C:\\tools\\pi.js", "--print"],
  });
});

test("buildPiLaunch starts native executables directly", () => {
  assert.deepEqual(buildPiLaunch("pi", ["--print"], "linux"), {
    command: "pi",
    args: ["--print"],
  });
  assert.deepEqual(buildPiLaunch("pi.exe", ["--print"], "win32"), {
    command: "pi.exe",
    args: ["--print"],
  });
});
