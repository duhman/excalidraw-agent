#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = { input: null, strictDiagram: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--input") {
      args.input = next;
      i += 1;
      continue;
    }
    if (arg === "--strict-diagram") {
      if (next === "true") args.strictDiagram = true;
      else if (next === "false") args.strictDiagram = false;
      else throw new Error("--strict-diagram must be true or false");
      i += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(
        "Usage: node scripts/scene_lint.mjs --input <scene.excalidraw> --strict-diagram <true|false>\n",
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.input) throw new Error("Missing required flag: --input");
  return args;
}

async function loadPackageOptional(pkgName) {
  const candidateDirs = [process.cwd(), path.resolve(__dirname, "..")];
  for (const dir of candidateDirs) {
    const req = createRequire(path.join(dir, "__skill_resolver__.cjs"));
    try {
      return req(pkgName);
    } catch {}
    try {
      const resolved = req.resolve(pkgName);
      return await import(pathToFileURL(resolved).href);
    } catch {}
  }
  return null;
}

function pickExport(mod, name) {
  if (!mod || typeof mod !== "object") return undefined;
  if (name in mod) return mod[name];
  if (mod.default && typeof mod.default === "object" && name in mod.default) {
    return mod.default[name];
  }
  return undefined;
}

function fallbackInvisibleCheck(element) {
  const width = Number(element?.width ?? 0);
  const height = Number(element?.height ?? 0);
  return width === 0 && height === 0;
}

function summarize(items) {
  return items.length === 0 ? "none" : items.map((line) => `- ${line}`).join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(args.input, "utf8");

  let json;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }

  const errors = [];
  const warnings = [];

  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Scene payload must be a JSON object.");
  }

  if (!Array.isArray(json.elements)) {
    errors.push("Missing or invalid 'elements' array.");
  }

  if (json.files !== undefined && (typeof json.files !== "object" || Array.isArray(json.files))) {
    errors.push("'files' must be an object when present.");
  }

  const elements = Array.isArray(json.elements) ? json.elements : [];
  const files = json.files && typeof json.files === "object" ? json.files : {};

  const excalidrawModule = await loadPackageOptional("@excalidraw/excalidraw");
  const isInvisiblySmallElement = pickExport(excalidrawModule, "isInvisiblySmallElement") || fallbackInvisibleCheck;

  const seenIds = new Set();
  const elementById = new Map();
  const duplicateIds = new Set();
  const danglingFiles = [];
  const tinyElements = [];
  const unboundArrows = [];
  const danglingBindings = [];
  const textOverflow = [];
  const uncontainedText = [];

  for (let i = 0; i < elements.length; i += 1) {
    const element = elements[i];
    if (!element || typeof element !== "object" || Array.isArray(element)) {
      errors.push(`elements[${i}] is not a valid object.`);
      continue;
    }

    if (typeof element.id !== "string" || element.id.trim() === "") {
      errors.push(`elements[${i}] has invalid or missing id.`);
    } else if (seenIds.has(element.id)) {
      duplicateIds.add(element.id);
    } else {
      seenIds.add(element.id);
      elementById.set(element.id, element);
    }

    if (typeof element.type !== "string" || element.type.trim() === "") {
      errors.push(`elements[${i}] has invalid or missing type.`);
    }

    if (typeof element.fileId === "string" && element.fileId && !files[element.fileId]) {
      danglingFiles.push(`${element.id || `index-${i}`} -> ${element.fileId}`);
    }

    try {
      if (isInvisiblySmallElement(element)) {
        tinyElements.push(element.id || `index-${i}`);
      }
    } catch {
      if (fallbackInvisibleCheck(element)) {
        tinyElements.push(element.id || `index-${i}`);
      }
    }
  }

  if (duplicateIds.size > 0) {
    errors.push(`Duplicate element IDs: ${Array.from(duplicateIds).join(", ")}`);
  }

  if (danglingFiles.length > 0) {
    errors.push(`Dangling file references: ${danglingFiles.join(", ")}`);
  }

  if (tinyElements.length > 0) {
    warnings.push(`Invisibly small elements: ${tinyElements.join(", ")}`);
  }

  for (const element of elements) {
    if (!element || typeof element !== "object") continue;

    if (element.type === "arrow") {
      if (!element.startBinding || !element.endBinding) {
        unboundArrows.push(element.id || "unknown-arrow");
      } else {
        const startId = element.startBinding.elementId;
        const endId = element.endBinding.elementId;
        if (!elementById.has(startId) || !elementById.has(endId)) {
          danglingBindings.push(
            `${element.id || "unknown-arrow"} -> start:${startId || "?"} end:${endId || "?"}`,
          );
        }
      }
    }

    if (element.type === "text" && typeof element.text === "string" && element.text.trim()) {
      if (!element.containerId) {
        uncontainedText.push(element.id || "unknown-text");
        continue;
      }
      const container = elementById.get(element.containerId);
      if (!container) {
        errors.push(
          `Text ${element.id || "unknown-text"} references missing container ${element.containerId}.`,
        );
        continue;
      }

      const containerWidth = Number(container.width ?? 0);
      const containerHeight = Number(container.height ?? 0);
      const textWidth = Number(element.width ?? 0);
      const textHeight = Number(element.height ?? 0);
      const padding = 12;
      if (
        containerWidth > 0 &&
        containerHeight > 0 &&
        (textWidth > containerWidth - padding || textHeight > containerHeight - padding)
      ) {
        textOverflow.push(
          `${element.id || "unknown-text"} (${Math.round(textWidth)}x${Math.round(textHeight)}) > ${container.id} (${Math.round(containerWidth)}x${Math.round(containerHeight)})`,
        );
      }
    }
  }

  if (unboundArrows.length > 0) {
    const msg = `Arrows without start/end bindings: ${unboundArrows.join(", ")}`;
    if (args.strictDiagram) errors.push(msg);
    else warnings.push(msg);
  }

  if (danglingBindings.length > 0) {
    errors.push(`Dangling arrow bindings: ${danglingBindings.join(", ")}`);
  }

  if (uncontainedText.length > 0) {
    const msg = `Text elements without containerId: ${uncontainedText.join(", ")}`;
    if (args.strictDiagram) errors.push(msg);
    else warnings.push(msg);
  }

  if (textOverflow.length > 0) {
    const msg = `Text larger than container: ${textOverflow.join("; ")}`;
    if (args.strictDiagram) errors.push(msg);
    else warnings.push(msg);
  }

  process.stdout.write(`[INFO] Scene: ${args.input}\n`);
  process.stdout.write(`[INFO] Elements: ${elements.length}\n`);
  process.stdout.write(`[INFO] File objects: ${Object.keys(files).length}\n`);

  if (warnings.length > 0) {
    process.stdout.write(`[WARN] ${warnings.length} warning(s):\n${summarize(warnings)}\n`);
  }

  if (errors.length > 0) {
    process.stderr.write(`[ERROR] ${errors.length} issue(s):\n${summarize(errors)}\n`);
    process.exit(1);
  }

  process.stdout.write("[OK] Scene lint passed\n");
}

main().catch((error) => {
  process.stderr.write(`[ERROR] ${error.message}\n`);
  process.exit(1);
});
