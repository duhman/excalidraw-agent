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

function wrapLabelText(label, maxCharsPerLine) {
  const words = String(label || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

function getNodeDimensions(node, fontSize) {
  const baseWidth = node.shape === "diamond" ? 240 : node.shape === "ellipse" ? 250 : 260;
  const baseHeight = node.shape === "diamond" ? 130 : 100;
  const maxChars = node.shape === "diamond" ? 16 : 22;
  const wrappedLabel = wrapLabelText(node.label || node.id, maxChars);
  const lines = wrappedLabel.split("\n").filter(Boolean);
  const maxLineLength = Math.max(...lines.map((line) => line.length), 1);
  const textWidth = Math.round(maxLineLength * fontSize * 0.55);
  const textHeight = Math.round(lines.length * fontSize * 1.25);
  const width = Math.min(420, Math.max(baseWidth, textWidth + 44));
  const height = Math.max(baseHeight, textHeight + 34);
  return { width, height, wrappedLabel, textWidth, textHeight };
}

function computeFlowLevels(nodeOrder, edges) {
  const adjacency = new Map();
  const inDegree = new Map();
  for (const nodeId of nodeOrder) {
    adjacency.set(nodeId, []);
    inDegree.set(nodeId, 0);
  }
  for (const edge of edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue;
    adjacency.get(edge.from).push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  const levels = new Map();
  const queue = [];
  for (const nodeId of nodeOrder) {
    if ((inDegree.get(nodeId) || 0) === 0) {
      levels.set(nodeId, 0);
      queue.push(nodeId);
    }
  }

  if (queue.length === 0 && nodeOrder.length > 0) {
    levels.set(nodeOrder[0], 0);
    queue.push(nodeOrder[0]);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    const currentLevel = levels.get(current) || 0;
    for (const next of adjacency.get(current) || []) {
      const proposed = currentLevel + 1;
      const existing = levels.get(next);
      if (existing === undefined || proposed > existing) {
        levels.set(next, proposed);
      }
      inDegree.set(next, (inDegree.get(next) || 1) - 1);
      if ((inDegree.get(next) || 0) <= 0) {
        queue.push(next);
      }
    }
  }

  let fallbackLevel = 0;
  for (const nodeId of nodeOrder) {
    if (!levels.has(nodeId)) {
      levels.set(nodeId, fallbackLevel);
      fallbackLevel += 1;
    }
  }

  return levels;
}

function getEdgePoint(fromBox, toBox) {
  const dx = toBox.cx - fromBox.cx;
  const dy = toBox.cy - fromBox.cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { x: fromBox.x + fromBox.width, y: fromBox.cy }
      : { x: fromBox.x, y: fromBox.cy };
  }
  return dy > 0
    ? { x: fromBox.cx, y: fromBox.y + fromBox.height }
    : { x: fromBox.cx, y: fromBox.y };
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
  const levels = computeFlowLevels(nodeOrder, edges);
  const levelBuckets = new Map();
  const nodeOrderIndex = new Map(nodeOrder.map((nodeId, index) => [nodeId, index]));
  for (const nodeId of nodeOrder) {
    const level = levels.get(nodeId) || 0;
    if (!levelBuckets.has(level)) levelBuckets.set(level, []);
    levelBuckets.get(level).push(nodeId);
  }
  for (const bucket of levelBuckets.values()) {
    bucket.sort((a, b) => (nodeOrderIndex.get(a) || 0) - (nodeOrderIndex.get(b) || 0));
  }

  const centers = new Map();
  const boxes = new Map();
  const columnGap = 360;
  const rowGap = 190;
  const startX = 120;
  const startY = 80;

  for (const [level, bucket] of Array.from(levelBuckets.entries()).sort((a, b) => a[0] - b[0])) {
    bucket.forEach((nodeId, row) => {
      const node = nodes.get(nodeId);
      const dims = getNodeDimensions(node, fontSize);
      const x = startX + level * columnGap;
      const y = startY + row * rowGap;
      const width = dims.width;
      const height = dims.height;
      const shapeId = `node-${node.id}`;
      const shapeElement = elementBase(node.shape, shapeId, x, y, width, height, {
        boundElements: [],
      });
      elements.push(shapeElement);

      const textWidth = Math.min(width - 24, Math.max(48, dims.textWidth));
      const textHeight = dims.textHeight;
      const textX = x + (width - textWidth) / 2;
      const textY = y + (height - textHeight) / 2;
      const textId = `label-${node.id}`;
      const textElement = elementBase("text", textId, textX, textY, textWidth, textHeight, {
        text: dims.wrappedLabel,
        fontSize,
        fontFamily: 1,
        textAlign: "center",
        verticalAlign: "middle",
        baseline: Math.round(fontSize * 1.25),
        lineHeight: 1.25,
        containerId: shapeId,
        originalText: dims.wrappedLabel,
      });
      elements.push(textElement);
      shapeElement.boundElements.push({ id: textId, type: "text" });

      centers.set(node.id, {
        x: x + width / 2,
        y: y + height / 2,
      });
      boxes.set(node.id, {
        shapeId,
        x,
        y,
        width,
        height,
        cx: x + width / 2,
        cy: y + height / 2,
      });
    });
  }

  edges.forEach((edge, index) => {
    const from = boxes.get(edge.from);
    const to = boxes.get(edge.to);
    if (!from || !to) return;
    const start = getEdgePoint(from, to);
    const end = getEdgePoint(to, from);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const edgeId = `edge-${index + 1}-${edge.from}-${edge.to}`;
    const edgeEl = elementBase("arrow", edgeId, start.x, start.y, Math.abs(dx), Math.abs(dy), {
      points: [
        [0, 0],
        [dx, dy],
      ],
      startBinding: { elementId: from.shapeId, focus: 0, gap: 1 },
      endBinding: { elementId: to.shapeId, focus: 0, gap: 1 },
      startArrowhead: null,
      endArrowhead: "triangle",
      elbowed: false,
      lastCommittedPoint: null,
    });
    elements.push(edgeEl);

    const fromShape = elements.find((el) => el.id === from.shapeId);
    const toShape = elements.find((el) => el.id === to.shapeId);
    if (fromShape && Array.isArray(fromShape.boundElements)) {
      fromShape.boundElements.push({ id: edgeId, type: "arrow" });
    }
    if (toShape && Array.isArray(toShape.boundElements)) {
      toShape.boundElements.push({ id: edgeId, type: "arrow" });
    }
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
