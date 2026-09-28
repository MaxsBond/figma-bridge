#!/usr/bin/env node
// Figma Bridge MCP server: stdio MCP for Claude Code on one side, a localhost
// WebSocket to the "Figma Bridge" Figma plugin on the other. Everything runs
// through the Plugin API in the open file, so no REST/MCP rate limits apply.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.FIGMA_BRIDGE_PORT || 3055);
const OUT_DIR = process.env.FIGMA_BRIDGE_OUT_DIR || path.join(process.cwd(), 'figma-exports');
const TIMEOUT_MS = Number(process.env.FIGMA_BRIDGE_TIMEOUT_MS || 120000);
const INLINE_LIMIT = 15000;

const log = (...args) => console.error('[figma-bridge]', ...args);

// ---------- WebSocket side ----------

let plugin = null;
let bridgeError = null;
const pending = new Map();

// Resolves once the WebSocket server is listening; on failure it records
// bridgeError, and the next tool call tries to bind again (the port may have
// been freed by another session since).
function startBridge() {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({
      host: '127.0.0.1',
      port: PORT,
      maxPayload: 256 * 1024 * 1024,
      // The plugin UI is a sandboxed iframe, so its Origin is "null". Regular web
      // pages send their real origin and are refused.
      verifyClient: ({ origin }) => !origin || origin === 'null',
    });
    wss.on('listening', () => {
      bridgeError = null;
      log(`waiting for the Figma plugin on ws://127.0.0.1:${PORT}`);
      resolve();
    });
    wss.on('error', (err) => {
      bridgeError = err.code === 'EADDRINUSE'
        ? `Port ${PORT} is already taken (probably another Claude session runs figma-bridge). Close it or set FIGMA_BRIDGE_PORT.`
        : err.message;
      log(bridgeError);
      wss.close();
      resolve();
    });
    wss.on('connection', onPluginConnection);
  });
}

startBridge();

function onPluginConnection(ws) {
  if (plugin) plugin.close(1000, 'replaced by a newer plugin connection');
  plugin = ws;
  log('plugin connected');
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type !== 'response') return;
    const req = pending.get(msg.id);
    if (!req) return;
    pending.delete(msg.id);
    clearTimeout(req.timer);
    if (msg.ok) req.resolve(decodeBinary(msg.result));
    else req.reject(new Error(msg.error));
  });
  ws.on('close', () => {
    if (plugin === ws) plugin = null;
    log('plugin disconnected');
  });
}

function decodeBinary(value) {
  if (Array.isArray(value)) return value.map(decodeBinary);
  if (value && typeof value === 'object') {
    if (typeof value.__bytes === 'string' && Object.keys(value).length === 1) return Buffer.from(value.__bytes, 'base64');
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = decodeBinary(v);
    return out;
  }
  return value;
}

async function call(method, params = {}) {
  if (bridgeError) await startBridge();
  if (bridgeError) throw new Error(bridgeError);
  if (!plugin) {
    return Promise.reject(new Error(
      'Figma plugin is not connected. In Figma Desktop open the file and run Plugins → Development → Figma Bridge.',
    ));
  }
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Plugin did not answer "${method}" within ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    plugin.send(JSON.stringify({ type: 'request', id, method, params }));
  });
}

// ---------- helpers ----------

// Accepts "1:2", "1-2" or a full Figma URL with ?node-id=1-2.
function parseNodeId(input) {
  const s = String(input).trim();
  const fromUrl = s.match(/node-id=([0-9]+[-:][0-9]+)/);
  return (fromUrl ? fromUrl[1] : s).replace(/-/g, ':');
}

const slug = (s) => String(s).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'untitled';

async function save(fileName, baseName, data, outPath) {
  const target = outPath ? path.resolve(outPath) : path.join(OUT_DIR, slug(fileName), baseName);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return target;
}

function countNodes(node) {
  if (!node || typeof node !== 'object') return 0;
  const kids = node.children || (node.document ? [node.document] : []);
  return 1 + kids.reduce((sum, c) => sum + countNodes(c), 0);
}

function outline(node, depth) {
  const o = { id: node.id, name: node.name, type: node.type };
  if (Array.isArray(node.children)) {
    if (depth > 0) o.children = node.children.map((c) => outline(c, depth - 1));
    else o.childCount = node.children.length;
  }
  return o;
}

const text = (value) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

async function textOrFile(value, label) {
  const s = JSON.stringify(value, null, 2) ?? 'undefined';
  if (s.length <= INLINE_LIMIT) return text(s);
  const file = await save('_scripts', `${label}-${Date.now()}.json`, s);
  return text({ note: `Result is ${s.length} chars, saved to file instead of returning inline`, file });
}

function tool(fn) {
  return async (args) => {
    try {
      return await fn(args);
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: String(err.message || err) }] };
    }
  };
}

// ---------- MCP side ----------

const server = new McpServer({ name: 'figma-bridge', version: '0.1.0' });

const nodeIdArg = z.string().describe('Node id ("1:2" or "1-2") or a Figma URL containing ?node-id=');

server.registerTool('figma_status', {
  description: 'Check the plugin connection and return the open file name/key, current page and selection.',
  inputSchema: {},
}, tool(async () => text(await call('status'))));

server.registerTool('figma_list_pages', {
  description: 'List pages of the file open in Figma.',
  inputSchema: {},
}, tool(async () => text(await call('listPages'))));

server.registerTool('figma_get_tree', {
  description: 'Lightweight outline (id, name, type, box) of a node or the current page, up to a given depth. Use to find node ids.',
  inputSchema: {
    nodeId: nodeIdArg.optional(),
    depth: z.number().int().min(0).max(10).default(3),
  },
}, tool(async ({ nodeId, depth }) => textOrFile(
  await call('tree', { nodeId: nodeId && parseNodeId(nodeId), depth }), 'tree',
)));

server.registerTool('figma_export_json', {
  description: 'Export the full JSON of a node to a file on disk and return the path plus a short summary. ' +
    'format "rest" = Figma REST API JSON (JSON_REST_V1), "compact" = trimmed tree with resolved style/variable names, ' +
    '"auto" = rest with compact fallback.',
  inputSchema: {
    nodeId: nodeIdArg,
    format: z.enum(['auto', 'rest', 'compact']).default('auto'),
    outPath: z.string().optional().describe('Where to write the file; defaults to figma-exports/<file>/<node>.json'),
  },
}, tool(async ({ nodeId, format, outPath }) => {
  const id = parseNodeId(nodeId);
  const res = await call('nodeJson', { nodeId: id, format });
  const body = JSON.stringify(res.json, null, 2);
  const file = await save(res.fileName, `${id.replace(':', '-')}.${res.format}.json`, body, outPath);
  const root = res.json.document || res.json;
  return text({
    file,
    format: res.format,
    figmaFile: { name: res.fileName, key: res.fileKey },
    bytes: Buffer.byteLength(body),
    nodeCount: countNodes(root),
    outline: outline(root, 2),
  });
}));

server.registerTool('figma_export_image', {
  description: 'Render a node to PNG/JPG/SVG/PDF and save it to disk.',
  inputSchema: {
    nodeId: nodeIdArg,
    format: z.enum(['PNG', 'JPG', 'SVG', 'PDF']).default('PNG'),
    scale: z.number().min(0.01).max(4).default(2).describe('Only for PNG/JPG'),
    outPath: z.string().optional(),
  },
}, tool(async ({ nodeId, format, scale, outPath }) => {
  const id = parseNodeId(nodeId);
  const res = await call('exportImage', { nodeId: id, format, scale });
  const ext = format.toLowerCase();
  const file = await save(res.fileName, `${id.replace(':', '-')}.${ext}`, res.bytes, outPath);
  return text({ file, bytes: res.bytes.length, node: res.name });
}));

server.registerTool('figma_export_image_fills', {
  description: 'Save every raster image used as an IMAGE fill inside a node (original bytes, named by imageHash).',
  inputSchema: {
    nodeId: nodeIdArg,
    outDir: z.string().optional(),
  },
}, tool(async ({ nodeId, outDir }) => {
  const res = await call('imageFills', { nodeId: parseNodeId(nodeId) });
  const files = [];
  for (const img of res.images) {
    const ext = sniffExt(img.bytes);
    const outPath = outDir ? path.join(outDir, `${img.hash}.${ext}`) : undefined;
    files.push(await save(res.fileName, path.join('images', `${img.hash}.${ext}`), img.bytes, outPath));
  }
  return text({ count: files.length, files });
}));

function sniffExt(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'gif';
  if (buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return 'bin';
}

server.registerTool('figma_run_script', {
  description: 'Run arbitrary JavaScript in the plugin with the `figma` Plugin API global (top-level await, use `return`). ' +
    'Can read AND modify the open file. Large results are written to a file.',
  inputSchema: {
    code: z.string().describe('Body of an async function; `figma` is in scope'),
  },
}, tool(async ({ code }) => textOrFile(await call('runScript', { code }), 'script')));

await server.connect(new StdioServerTransport());
log(`MCP ready, exports go to ${OUT_DIR}`);
