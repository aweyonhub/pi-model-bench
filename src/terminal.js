export function durationBadge(milliseconds) {
  return `${Math.round(milliseconds / 1_000)}s`;
}

export function tpsBadge(tps) {
  if (tps === null || !Number.isFinite(tps)) return "⚪—TPS";
  const icon = tps >= 150 ? "⚡" : tps > 100 ? "🟢" : tps > 50 ? "🟡" : "🔴";
  return `${icon}${tps.toFixed(1)}TPS`;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function rankModelTps(results) {
  const groups = new Map();
  for (const result of results) {
    const key = `${result.provider}/${result.model}`;
    const group = groups.get(key) ?? { key, successful: 0, total: 0, values: [] };
    group.total += 1;
    if (result.success) group.successful += 1;
    if (result.success && Number.isFinite(result.decodeTps)) group.values.push(result.decodeTps);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map(({ key, successful, total, values }) => ({
      key,
      successful,
      total,
      tps: median(values),
    }))
    .sort((left, right) => {
      if (left.tps === null) return right.tps === null ? left.key.localeCompare(right.key) : 1;
      if (right.tps === null) return -1;
      return right.tps - left.tps || left.key.localeCompare(right.key);
    });
}
