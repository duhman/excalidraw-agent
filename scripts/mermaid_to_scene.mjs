#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseBool(value, flagName) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid value for ${flagName}: ${value}. Use true or false.`);
}

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    fontSize: 16,
    regenerateIds: true,
    pretty: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case "--input":
        args.input = next;
        i += 1;
        break;
      case "--output":
        args.output = next;
        i += 1;
        break;
      case "--font-size":
        args.fontSize = Number(next);
        i += 1;
        break;
      case "--regenerate-ids":
        args.regenerateIds = parseBool(next, "--regenerate-ids");
        i += 1;
        break;
      case "--pretty":
        args.pretty = parseBool(next, "--pretty");
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

  if (!args.input) throw new Error("Missing required flag: --input");
  if (!args.output) throw new Error("Missing required flag: --output");
  if (!Number.isFinite(args.fontSize) || args.fontSize <= 0) {
    throw new Error("--font-size must be a positive number.");
  }

  return args;
}

function printHelp() {
  const help = `Usage:
  node scripts/mermaid_to_scene.mjs \\
    --input <mmd|-> \\
    --output <scene.excalidraw> \\
    --font-size <n> \\
    --regenerate-ids <true|false> \\
    --pretty <true|false>
`;
  process.stdout.write(help);
}

async function readInput(input) {
  if (input === "-") {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  return fs.readFile(input, "utf8");
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
  if (!mod || typeof mod !== "object") return undefined;
  if (name in mod) return mod[name];
  if (mod.default && typeof mod.default === "object" && name in mod.default) {
    return mod.default[name];
  }
  return undefined;
}

function hashNumber(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash) + 1;
}

function elementBase(type, id, x, y, width, height, extra = {}) {
  const seed = hashNumber(`${type}:${id}:${x}:${y}`);
  const versionNonce = hashNumber(`nonce:${id}`);
  return {
    type,
    id,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "hachure",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed,
    version: 1,
    versionNonce,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...extra,
  };
}

function parseNodeExpression(raw) {
  const text = raw.trim();
  const match = text.match(/^([A-Za-z0-9_:-]+)\s*(?:\[(.*)\]|\{(.*)\}|\((.*)\))?$/);
  if (!match) {
    return { id: text, label: text, shape: "rectangle" };
  }
  const [, id, square, curly, round] = match;
  if (square !== undefined) return { id, label: square || id, shape: "rectangle" };
  if (curly !== undefined) return { id, label: curly || id, shape: "diamond" };
  if (round !== undefined) return { id, label: round || id, shape: "ellipse" };
  return { id, label: id, shape: "rectangle" };
}

function convertFallbackFromMermaid(mermaidText, fontSize) {
  const lines = mermaidText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));

  const nodeOrder = [];
  const nodes = new Map();
  const edges = [];

  for (const line of lines) {
    if (/^flowchart\b/i.test(line) || /^graph\b/i.test(line)) {
      continue;
    }

    const withoutLabels = line.replace(/\|[^|]+\|/g, "");
    if (withoutLabels.includes("-->")) {
      const parts = withoutLabels.split("-->").map((part) => part.trim());
      if (parts.length >= 2) {
        const left = parseNodeExpression(parts[0]);
        const right = parseNodeExpression(parts[parts.length - 1]);
        for (const node of [left, right]) {
          if (!nodes.has(node.id)) {
            nodes.set(node.id, node);
            nodeOrder.push(node.id);
          }
        }
        edges.push({ from: left.id, to: right.id });
        continue;
      }
    }

    const standalone = parseNodeExpression(line);
    if (!nodes.has(standalone.id)) {
      nodes.set(standalone.id, standalone);
      nodeOrder.push(standalone.id);
    }
  }

  if (nodeOrder.length === 0) {
    throw new Error("Fallback parser could not identify any Mermaid nodes.");
  }

  const elements = [];
  const centers = new Map();

  nodeOrder.forEach((nodeId, index) => {
    const node = nodes.get(nodeId);
    const width = node.shape === "diamond" ? 190 : 230;
    const height = node.shape === "ellipse" ? 96 : 88;
    const x = 120;
    const y = 80 + index * 150;

    const shapeId = `node-${node.id}`;
    elements.push(elementBase(node.shape, shapeId, x, y, width, height));

    const label = node.label || node.id;
    const textWidth = Math.max(40, Math.round(label.length * fontSize * 0.58));
    const textHeight = Math.max(24, Math.round(fontSize * 1.4));
    const textX = x + (width - textWidth) / 2;
    const textY = y + (height - textHeight) / 2;

    elements.push(
      elementBase("text", `label-${node.id}`, textX, textY, textWidth, textHeight, {
        text: label,
        fontSize,
        fontFamily: 1,
        textAlign: "center",
        verticalAlign: "middle",
        baseline: textHeight,
        lineHeight: 1.2,
        containerId: null,
        originalText: label,
      }),
    );

    centers.set(node.id, {
      x: x + width / 2,
      y: y + height / 2,
    });
  });

  edges.forEach((edge, index) => {
    const from = centers.get(edge.from);
    const to = centers.get(edge.to);
    if (!from || !to) return;

    const dx = to.x - from.x;
    const dy = to.y - from.y;

    elements.push(
      elementBase("arrow", `edge-${index + 1}-${edge.from}-${edge.to}`, from.x, from.y, Math.abs(dx), Math.abs(dy), {
        points: [
          [0, 0],
          [dx, dy],
        ],
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: "triangle",
        elbowed: false,
        lastCommittedPoint: null,
      }),
    );
  });

  return { elements, files: {} };
}

function normalizeSceneData(sceneData) {
  const elements = Array.isArray(sceneData.elements) ? sceneData.elements : [];
  const files = sceneData.files && typeof sceneData.files === "object" ? sceneData.files : {};

  const usedIds = new Set();
  const normalized = elements.map((element, index) => {
    const fallbackId = `el-${index + 1}`;
    let id = typeof element.id === "string" && element.id.trim() ? element.id : fallbackId;
    while (usedIds.has(id)) id = `${id}-dup`;
    usedIds.add(id);

    return {
      ...element,
      id,
      type: element.type || "rectangle",
      x: Number.isFinite(element.x) ? element.x : 0,
      y: Number.isFinite(element.y) ? element.y : 0,
      width: Number.isFinite(element.width) ? element.width : 0,
      height: Number.isFinite(element.height) ? element.height : 0,
      angle: Number.isFinite(element.angle) ? element.angle : 0,
      strokeColor: element.strokeColor || "#1e1e1e",
      backgroundColor: element.backgroundColor || "transparent",
      fillStyle: element.fillStyle || "hachure",
      strokeWidth: Number.isFinite(element.strokeWidth) ? element.strokeWidth : 1,
      strokeStyle: element.strokeStyle || "solid",
      roughness: Number.isFinite(element.roughness) ? element.roughness : 1,
      opacity: Number.isFinite(element.opacity) ? element.opacity : 100,
      groupIds: Array.isArray(element.groupIds) ? element.groupIds : [],
      seed: Number.isFinite(element.seed) ? element.seed : hashNumber(id),
      version: Number.isFinite(element.version) ? element.version : 1,
      versionNonce: Number.isFinite(element.versionNonce)
        ? element.versionNonce
        : hashNumber(`nonce:${id}`),
      isDeleted: Boolean(element.isDeleted),
      boundElements: element.boundElements ?? null,
      updated: Number.isFinite(element.updated) ? element.updated : 1,
      link: element.link ?? null,
      locked: Boolean(element.locked),
    };
  });

  return {
    elements: normalized,
    appState: sceneData.appState && typeof sceneData.appState === "object"
      ? sceneData.appState
      : { viewBackgroundColor: "#ffffff" },
    files,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mermaidText = await readInput(args.input);

  if (!mermaidText.trim()) {
    throw new Error("Mermaid input is empty.");
  }

  const mermaidModule = await loadPackageOptional("@excalidraw/mermaid-to-excalidraw");
  const excalidrawModule = await loadPackageOptional("@excalidraw/excalidraw");

  const parseMermaidToExcalidraw = pickExport(mermaidModule, "parseMermaidToExcalidraw");
  const convertToExcalidrawElements = pickExport(excalidrawModule, "convertToExcalidrawElements");
  const restore = pickExport(excalidrawModule, "restore");

  let conversionMode = "fallback";
  let sceneData;

  if (typeof parseMermaidToExcalidraw === "function" && typeof convertToExcalidrawElements === "function") {
    try {
      const parsed = await parseMermaidToExcalidraw(mermaidText, {
        fontSize: args.fontSize,
      });

      const convertedElements = convertToExcalidrawElements(parsed.elements, {
        regenerateIds: args.regenerateIds,
      });

      sceneData = {
        elements: convertedElements,
        appState: { viewBackgroundColor: "#ffffff" },
        files: parsed.files || {},
      };
      conversionMode = "official";
    } catch (error) {
      process.stderr.write(`[WARN] Official Mermaid conversion failed: ${error.message}\n`);
    }
  }

  if (!sceneData) {
    const fallback = convertFallbackFromMermaid(mermaidText, args.fontSize);
    sceneData = {
      elements: fallback.elements,
      appState: { viewBackgroundColor: "#ffffff" },
      files: fallback.files,
    };
  }

  if (typeof restore === "function") {
    try {
      const restored = restore(sceneData, null, null, {
        refreshDimensions: true,
        repairBindings: true,
        normalizeIndices: true,
      });
      sceneData = {
        elements: restored.elements ?? sceneData.elements,
        appState: restored.appState ?? sceneData.appState,
        files: restored.files ?? sceneData.files,
      };
    } catch (error) {
      process.stderr.write(`[WARN] restore() unavailable or failed, using local normalization: ${error.message}\n`);
      sceneData = normalizeSceneData(sceneData);
    }
  } else {
    sceneData = normalizeSceneData(sceneData);
    if (excalidrawModule?.__loadError) {
      process.stderr.write("[WARN] @excalidraw/excalidraw unavailable in this runtime; local normalization applied.\n");
    }
  }

  const output = {
    type: "excalidraw",
    version: 2,
    source: "https://agentskills.io",
    elements: sceneData.elements,
    appState: sceneData.appState,
    files: sceneData.files,
  };

  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.writeFile(
    args.output,
    JSON.stringify(output, null, args.pretty ? 2 : undefined),
    "utf8",
  );

  process.stdout.write(
    `[OK] Wrote ${args.output} (${output.elements.length} elements, ${Object.keys(output.files || {}).length} files, mode=${conversionMode})\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`[ERROR] ${error.message}\n`);
  process.exit(1);
});
