#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    base: null,
    other: null,
    output: null,
    defaultStatus: "unpublished",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case "--base":
        args.base = next;
        i += 1;
        break;
      case "--other":
        args.other = next;
        i += 1;
        break;
      case "--output":
        args.output = next;
        i += 1;
        break;
      case "--default-status":
        args.defaultStatus = next;
        i += 1;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.base) throw new Error("Missing required flag: --base");
  if (!args.other) throw new Error("Missing required flag: --other");
  if (!args.output) throw new Error("Missing required flag: --output");
  if (!["published", "unpublished"].includes(args.defaultStatus)) {
    throw new Error("--default-status must be published or unpublished");
  }

  return args;
}

function printHelp() {
  process.stdout.write(
    "Usage: node scripts/library_merge.mjs --base <a.excalidrawlib> --other <b.excalidrawlib> --output <merged.excalidrawlib> --default-status <published|unpublished>\n",
  );
}

async function loadPackageOptional(pkgName) {
  const candidateDirs = [process.cwd(), path.resolve(__dirname, "..")];
  const failures = [];

  for (const dir of candidateDirs) {
    const req = createRequire(path.join(dir, "__skill_resolver__.cjs"));

    try {
      return req(pkgName);
    } catch (error) {
      failures.push(`[require from ${dir}] ${error.message}`);
    }

    try {
      const resolved = req.resolve(pkgName);
      return await import(pathToFileURL(resolved).href);
    } catch (error) {
      failures.push(`[import from ${dir}] ${error.message}`);
    }
  }

  return { __loadError: failures.join("\n") };
}

function pickExport(mod, name) {
  if (mod && typeof mod === "object") {
    if (name in mod) return mod[name];
    if (mod.default && typeof mod.default === "object" && name in mod.default) {
      return mod.default[name];
    }
  }
  return undefined;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`);
  }
}

function extractLibraryItems(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.libraryItems)) {
    return payload.libraryItems;
  }
  throw new Error(`${label} must contain a libraryItems array or be an array itself.`);
}

function fallbackNormalize(items, defaultStatus) {
  return items.map((item, index) => {
    const id = typeof item?.id === "string" && item.id ? item.id : `item-${index + 1}`;
    return {
      id,
      status: item?.status === "published" ? "published" : defaultStatus,
      created: Number.isFinite(item?.created) ? item.created : index + 1,
      elements: Array.isArray(item?.elements) ? item.elements : [],
    };
  });
}

function fallbackMerge(baseItems, otherItems) {
  const keyed = new Map();
  for (const item of [...baseItems, ...otherItems]) {
    const key = item?.id || JSON.stringify(item?.elements || item);
    keyed.set(key, item);
  }
  return Array.from(keyed.values());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const [baseRaw, otherRaw] = await Promise.all([
    fs.readFile(args.base, "utf8"),
    fs.readFile(args.other, "utf8"),
  ]);

  const baseJson = parseJson(baseRaw, args.base);
  const otherJson = parseJson(otherRaw, args.other);

  const baseItemsRaw = extractLibraryItems(baseJson, "--base payload");
  const otherItemsRaw = extractLibraryItems(otherJson, "--other payload");

  const excalidrawModule = await loadPackageOptional("@excalidraw/excalidraw");
  const restoreLibraryItems = pickExport(excalidrawModule, "restoreLibraryItems");
  const mergeLibraryItems = pickExport(excalidrawModule, "mergeLibraryItems");

  const baseItems =
    typeof restoreLibraryItems === "function"
      ? restoreLibraryItems(baseItemsRaw, args.defaultStatus)
      : fallbackNormalize(baseItemsRaw, args.defaultStatus);
  const otherItems =
    typeof restoreLibraryItems === "function"
      ? restoreLibraryItems(otherItemsRaw, args.defaultStatus)
      : fallbackNormalize(otherItemsRaw, args.defaultStatus);

  const mergedItems =
    typeof mergeLibraryItems === "function"
      ? mergeLibraryItems(baseItems, otherItems)
      : fallbackMerge(baseItems, otherItems);

  if (excalidrawModule?.__loadError) {
    process.stderr.write("[WARN] @excalidraw/excalidraw unavailable in this runtime; fallback normalization/merge used.\n");
  }

  const output = {
    type: "excalidrawlib",
    version: 2,
    source: "https://agentskills.io",
    libraryItems: mergedItems,
  };

  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.writeFile(args.output, JSON.stringify(output, null, 2), "utf8");

  process.stdout.write(
    `[OK] Wrote ${args.output} (${baseItems.length} + ${otherItems.length} -> ${mergedItems.length} items)\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`[ERROR] ${error.message}\n`);
  process.exit(1);
});
