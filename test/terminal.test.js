import assert from "node:assert/strict";
import test from "node:test";
import { durationBadge, rankModelTps, tpsBadge } from "../src/terminal.js";

test("duration badge rounds milliseconds to seconds", () => {
  assert.equal(durationBadge(15_490), "15s");
});

test("TPS badge uses the four requested speed tiers", () => {
  assert.equal(tpsBadge(50), "🔴50.0TPS");
  assert.equal(tpsBadge(51), "🟡51.0TPS");
  assert.equal(tpsBadge(101), "🟢101.0TPS");
  assert.equal(tpsBadge(150), "⚡150.0TPS");
  assert.equal(tpsBadge(198.4), "⚡198.4TPS");
});

test("TPS badge marks unavailable throughput", () => {
  assert.equal(tpsBadge(null), "⚪—TPS");
});

test("model TPS ranking uses medians, descending order, and keeps failures", () => {
  const results = [
    { provider: "p", model: "slow", success: true, decodeTps: 40 },
    { provider: "p", model: "fast", success: true, decodeTps: 200 },
    { provider: "p", model: "fast", success: true, decodeTps: 100 },
    { provider: "p", model: "failed", success: false, decodeTps: null },
  ];
  assert.deepEqual(rankModelTps(results), [
    { key: "p/fast", successful: 2, total: 2, tps: 150 },
    { key: "p/slow", successful: 1, total: 1, tps: 40 },
    { key: "p/failed", successful: 0, total: 1, tps: null },
  ]);
});
