import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const packageRoot = path.resolve(scriptDir, "..");
const inputDir = path.resolve(packageRoot, "assets", "icons");
const generatedDir = path.resolve(packageRoot, "src", "icons", "generated");
const registryFile = path.resolve(generatedDir, "registry.ts");
const tempSvgDir = path.resolve(packageRoot, ".cache", "icons");

function toPascalCase(value: string) {
  return value
    .split(/[^a-zA-Z0-9]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

async function listSvgFiles(dir: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listSvgFiles(fullPath)));
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".svg"))
      files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function writeEmptyRegistry() {
  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(
    registryFile,
    `export const icons = {} as const;\n\nexport type IconKey = keyof typeof icons;\nexport type IconName = never;\nexport type IconMode = never;\nexport type IconThickness = never;\nexport type IconVariant = IconMode;\n`,
  );
}

function parseFigmaVariantName(baseName: string) {
  const parts = baseName.split(",").map((part) => part.trim());
  const entries = new Map<string, string>();

  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (!key || !value) continue;
    entries.set(key, value);
  }

  const thickness = entries.get("thickness");
  const name = entries.get("name");
  const mode = entries.get("mode");

  if (!thickness || !name || !mode) return null;

  return { thickness, name, mode };
}

function sanitizeFileBase(value: string) {
  const sanitized = value
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "icon";
}

function toSnakeCase(value: string) {
  return value
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

async function main() {
  await fs.mkdir(inputDir, { recursive: true });
  const svgs = await listSvgFiles(inputDir);

  await fs.rm(generatedDir, { recursive: true, force: true });
  await fs.mkdir(generatedDir, { recursive: true });

  if (svgs.length === 0) {
    await writeEmptyRegistry();
    return;
  }

  await fs.rm(tempSvgDir, { recursive: true, force: true });
  await fs.mkdir(tempSvgDir, { recursive: true });
  const keySources = new Map<string, string>();
  const keyFileBases = new Map<string, string>();
  const entries: Array<{
    key: string;
    name: string;
    mode: string;
    thickness: string;
    fileBase: string;
  }> = [];
  const usedFileBases = new Set<string>();

  try {
    for (const svgPath of svgs) {
      const baseName = path.basename(svgPath, ".svg");
      const parsed = parseFigmaVariantName(baseName);
      if (!parsed) {
        throw new Error(`Unsupported icon filename: ${baseName}`);
      }
      const key = `${parsed.name}--${parsed.mode}--${parsed.thickness}`;
      const fileBase =
        keyFileBases.get(key) ??
        (() => {
          const base = toSnakeCase(sanitizeFileBase(key));
          let next = base;
          let counter = 1;
          while (usedFileBases.has(next)) {
            counter += 1;
            next = `${base}_${counter}`;
          }
          usedFileBases.add(next);
          keyFileBases.set(key, next);
          entries.push({
            key,
            name: parsed.name,
            mode: parsed.mode,
            thickness: parsed.thickness,
            fileBase: next,
          });
          return next;
        })();

      const outSvgPath = path.resolve(tempSvgDir, `${fileBase}.svg`);
      const svgContent = await fs.readFile(svgPath, "utf8");

      if (keySources.has(key)) {
        const existingContent = await fs.readFile(outSvgPath, "utf8");
        if (existingContent !== svgContent) {
          console.warn(
            `Duplicate icon key with different SVG content: ${key}\n- keeping: ${keySources.get(key)}\n- skipping: ${svgPath}`,
          );
        }
        continue;
      }

      keySources.set(key, svgPath);
      await fs.writeFile(outSvgPath, svgContent);
    }

    const require = createRequire(import.meta.url);
    const svgrBin = require.resolve("@svgr/cli/bin/svgr");
    const result = spawnSync(
      process.execPath,
      [
        svgrBin,
        "--no-index",
        "--typescript",
        "--icon",
        "--ext",
        "tsx",
        "--filename-case",
        "snake",
        "--out-dir",
        generatedDir,
        tempSvgDir,
      ],
      { cwd: packageRoot, stdio: "inherit" },
    );

    if (result.error) {
      console.error(result.error);
      process.exit(1);
    }

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  } finally {
    await fs.rm(tempSvgDir, { recursive: true, force: true });
  }

  const imports: string[] = [];
  const exports: string[] = [];
  const pairs: string[] = [];
  const names = new Set<string>();
  const modes = new Set<string>();
  const thicknesses = new Set<string>();

  const sortedEntries = entries.sort((a, b) => a.key.localeCompare(b.key));
  for (const entry of sortedEntries) {
    names.add(entry.name);
    modes.add(entry.mode);
    thicknesses.add(entry.thickness);
    const exportName = `${toPascalCase(entry.name)}${toPascalCase(entry.mode)}${toPascalCase(entry.thickness)}Icon`;
    imports.push(`import ${exportName} from './${entry.fileBase}';`);
    exports.push(`export { ${exportName} };`);
    pairs.push(`  '${entry.key}': ${exportName},`);
  }

  const nameUnion = Array.from(names)
    .sort((a, b) => a.localeCompare(b))
    .map((n) => `'${n}'`)
    .join(" | ");
  const modeUnion = Array.from(modes)
    .sort((a, b) => a.localeCompare(b))
    .map((n) => `'${n}'`)
    .join(" | ");
  const thicknessUnion = Array.from(thicknesses)
    .sort((a, b) => a.localeCompare(b))
    .map((n) => `'${n}'`)
    .join(" | ");

  const content = `${imports.join("\n")}\n\nexport const icons = {\n${pairs.join("\n")}\n} as const;\n\nexport type IconKey = keyof typeof icons;\nexport type IconName = ${nameUnion || "never"};\nexport type IconMode = ${modeUnion || "never"};\nexport type IconThickness = ${thicknessUnion || "never"};\nexport type IconVariant = IconMode;\n`;
  const finalContent = exports.length
    ? `${content}\n${exports.join("\n")}\n`
    : content;
  await fs.writeFile(registryFile, finalContent);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
