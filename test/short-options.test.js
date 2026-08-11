import assert from "node:assert/strict";
import test from "node:test";
import { expandShortFlags, hasChineseShortFlag } from "../src/short-options.js";

test("combined short flags expand in order", () => {
  assert.deepEqual(expandShortFlags(["-zs"]), ["--zh", "--scoped"]);
  assert.deepEqual(expandShortFlags(["-lz"]), ["--list", "--zh"]);
  assert.deepEqual(expandShortFlags(["-atf"]), ["--all", "--health", "--file"]);
});

test("single aliases and unknown flags remain parseable", () => {
  assert.deepEqual(expandShortFlags(["-c", "-x"]), ["--current", "-x"]);
});

test("Chinese short flag is detected inside a combination", () => {
  assert.equal(hasChineseShortFlag("-zs"), true);
  assert.equal(hasChineseShortFlag("-lz"), true);
  assert.equal(hasChineseShortFlag("-st"), false);
});
