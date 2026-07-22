/**
 * i18n key-parity checker.
 *
 * Loads the full en/zh/ms translation catalogs (src/lib/i18n/{en,zh,ms}.ts,
 * including every sub-catalog they import) and verifies all three locales
 * expose exactly the same set of dot-path keys.
 *
 * Run: node scripts/i18n-key-parity.mjs
 * Exits non-zero (and prints the missing keys) if any locale is missing
 * keys that exist in another locale — use this in CI / pre-commit to make
 * sure new UI copy always ships with zh + ms translations.
 */
const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..");

// Register a require() loader for .ts files scoped to this process only.
// Uses the TypeScript compiler (already a devDependency) to transpile
// on the fly to CommonJS, so we don't need ts-node/tsx installed.
require.extensions[".ts"] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

function flattenKeys(obj, prefix = "") {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, p));
    } else {
      keys.push(p);
    }
  }
  return keys;
}

function loadCatalog(exportName, file) {
  const mod = require(path.join(ROOT, file));
  return mod[exportName];
}

const LOCALES = [
  { code: "en", export: "en", file: "src/lib/i18n/en.ts" },
  { code: "zh", export: "zh", file: "src/lib/i18n/zh.ts" },
  { code: "ms", export: "ms", file: "src/lib/i18n/ms.ts" },
];

const keySets = {};
for (const locale of LOCALES) {
  const catalog = loadCatalog(locale.export, locale.file);
  keySets[locale.code] = new Set(flattenKeys(catalog));
}

const allKeys = new Set();
for (const set of Object.values(keySets)) {
  for (const k of set) allKeys.add(k);
}

let hasMissing = false;
const report = {};
for (const locale of LOCALES) {
  const missing = [...allKeys].filter((k) => !keySets[locale.code].has(k)).sort();
  report[locale.code] = missing;
  if (missing.length > 0) hasMissing = true;
}

console.log("=== i18n key-parity report ===\n");
for (const locale of LOCALES) {
  console.log(`${locale.code}: ${keySets[locale.code].size} keys`);
}
console.log(`\nUnion of all keys: ${allKeys.size}\n`);

for (const locale of LOCALES) {
  const missing = report[locale.code];
  if (missing.length === 0) {
    console.log(`✓ ${locale.code}: no missing keys`);
    continue;
  }
  console.log(`✗ ${locale.code}: missing ${missing.length} key(s):`);
  for (const k of missing) console.log(`    - ${k}`);
}

console.log("\n=== End report ===");

if (hasMissing) {
  process.exitCode = 1;
}
