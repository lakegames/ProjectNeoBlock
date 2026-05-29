const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sanitizeName(name) {
  return String(name)
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "-");
}

function isTokenObject(v) {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    "$type" in v &&
    "$value" in v
  );
}

function resolveTokenValue(token) {
  const ext = token.$extensions && token.$extensions["com.figma.aliasData"];
  if (
    ext &&
    typeof ext.targetVariableName === "string" &&
    ext.targetVariableName.length > 0
  ) {
    return `var(--${sanitizeName(ext.targetVariableName)})`;
  }

  const value = token.$value;
  if (
    token.$type === "color" &&
    value &&
    typeof value === "object" &&
    typeof value.hex === "string"
  ) {
    return value.hex;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function pushSegment(segments, next) {
  if (segments.length === 0) return [next];
  const last = segments[segments.length - 1];
  if (next.startsWith(`${last}-`)) return [...segments.slice(0, -1), next];
  return [...segments, next];
}

function flattenTokens(node, segments) {
  const out = [];
  for (const [rawKey, value] of Object.entries(node)) {
    if (rawKey === "$extensions") continue;
    const key = sanitizeName(rawKey);
    const nextSegments = pushSegment(segments, key);

    if (isTokenObject(value)) {
      const name = nextSegments.join("-");
      out.push({ name, value: resolveTokenValue(value) });
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push(...flattenTokens(value, nextSegments));
    }
  }
  return out;
}

function collectFromFiles(files) {
  const kv = new Map();
  for (const f of files) {
    const data = readJson(f);
    for (const { name, value } of flattenTokens(data, [])) {
      kv.set(name, value);
    }
  }
  const items = [...kv.entries()].map(([name, value]) => ({ name, value }));
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

function toCssBlock(selector, items) {
  const lines = [];
  lines.push(`${selector} {`);
  for (const { name, value } of items) {
    lines.push(`  --${name}: ${value};`);
  }
  lines.push("}");
  return lines.join("\n");
}

function main() {
  const tokenDir = path.join(__dirname, "..", "app", "TOKENFILE");
  const outFile = path.join(__dirname, "..", "app", "tokens.css");

  const commonFiles = [
    path.join(tokenDir, "base-numbers", "Mode 1.tokens.json"),
    path.join(tokenDir, "font-weight", "Mode 1.tokens.json"),
    path.join(tokenDir, "token-colors", "Mode 1.tokens.json"),
    path.join(tokenDir, "base-variable", "Bold.tokens.json"),
    path.join(tokenDir, "base-variable", "Light.tokens.json"),
    path.join(tokenDir, "base-variable", "Standard.tokens.json"),
  ];

  const lightFiles = [
    path.join(tokenDir, "Light.tokens.json"),
    path.join(tokenDir, "control", "light.tokens.json"),
  ];
  const darkFiles = [
    path.join(tokenDir, "Dark.tokens.json"),
    path.join(tokenDir, "control", "deep.tokens.json"),
  ];

  const common = collectFromFiles(commonFiles);
  const light = collectFromFiles(lightFiles);
  const dark = collectFromFiles(darkFiles);

  const neoblockThemeVars = [
    {
      name: "nb-color-bg",
      value: "var(--control-normal-lightBackground-white)",
    },
    {
      name: "nb-color-surface",
      value: "var(--control-normal-lightBackground-whiteOnly)",
    },
    { name: "nb-color-surface-hover", value: "var(--neutral-3)" },
    { name: "nb-color-surface-active", value: "var(--neutral-4)" },
    { name: "nb-color-fg", value: "var(--text-normal-title-black)" },
    { name: "nb-color-muted-fg", value: "var(--text-normal-text-black)" },
    { name: "nb-color-border", value: "var(--border-normal-light)" },
    { name: "nb-color-border-strong", value: "var(--border-normal-primary)" },
    {
      name: "nb-color-muted",
      value: "var(--control-normal-lightBackground-white)",
    },
    { name: "nb-color-muted-hover", value: "var(--neutral-7)" },
    { name: "nb-color-muted-active", value: "var(--neutral-8)" },
    { name: "nb-color-primary", value: "var(--control-theme-Background)" },
    { name: "nb-color-primary-hover", value: "var(--primary-7)" },
    { name: "nb-color-primary-active", value: "var(--primary-8)" },
    { name: "nb-color-primary-fg", value: "var(--text-normal-title-white)" },
    {
      name: "nb-color-primary-soft",
      value: "var(--control-theme-lightBackground)",
    },
    { name: "nb-color-primary-soft-hover", value: "var(--primary-3)" },
    { name: "nb-color-primary-soft-active", value: "var(--primary-4)" },
    { name: "nb-color-primary-ink", value: "var(--text-theme-primary-black)" },
    { name: "nb-color-danger", value: "var(--control-fail-Background)" },
    { name: "nb-color-danger-hover", value: "var(--error-9)" },
    { name: "nb-color-danger-active", value: "var(--error-10)" },
    { name: "nb-color-danger-fg", value: "var(--text-normal-title-white)" },
    { name: "nb-color-danger-soft", value: "var(--box-fail-lightBackground)" },
    { name: "nb-color-danger-soft-hover", value: "var(--error-2)" },
    { name: "nb-color-danger-soft-active", value: "var(--error-3)" },
    { name: "nb-color-special", value: "var(--control-infomation-Background)" },
    { name: "nb-color-special-hover", value: "var(--info-9)" },
    { name: "nb-color-special-active", value: "var(--info-10)" },
    { name: "nb-color-special-fg", value: "var(--text-normal-title-white)" },
    {
      name: "nb-color-special-soft",
      value: "var(--box-infomation-lightBackground)",
    },
    { name: "nb-color-special-soft-hover", value: "var(--info-2)" },
    { name: "nb-color-special-soft-active", value: "var(--info-3)" },
    {
      name: "nb-color-special-ink",
      value: "var(--text-infomation-primary-black)",
    },
    {
      name: "nb-color-input-bg",
      value: "var(--control-normal-lightBackground-white)",
    },
    { name: "nb-color-ring", value: "var(--control-theme-lightBackground)" },
  ];

  const commonWithNeoblockTheme = [...common, ...neoblockThemeVars].sort(
    (a, b) => a.name.localeCompare(b.name),
  );

  const css = [
    toCssBlock(":root", commonWithNeoblockTheme),
    "",
    toCssBlock(':root[data-theme="light"]', light),
    "",
    toCssBlock(':root[data-theme="dark"]', dark),
    "",
  ].join("\n");

  fs.writeFileSync(outFile, css, "utf8");
}

main();
