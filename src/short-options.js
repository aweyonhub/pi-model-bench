const SHORT_FLAGS = {
  a: "--all",
  c: "--current",
  f: "--file",
  h: "--help",
  l: "--list",
  s: "--scoped",
  t: "--health",
  z: "--zh",
};

export function expandShortFlags(tokens) {
  return tokens.flatMap((token) => {
    if (!/^-\w+$/u.test(token) || token.startsWith("--")) return [token];
    const flags = Array.from(token.slice(1));
    if (flags.some((flag) => !SHORT_FLAGS[flag])) return [token];
    return flags.map((flag) => SHORT_FLAGS[flag]);
  });
}

export function hasChineseShortFlag(input) {
  return /(?:^|\s)-[acflsthz]*z[acflsthz]*(?:\s|$)/.test(input);
}
