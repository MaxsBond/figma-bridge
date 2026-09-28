// Figma Bridge — runs inside Figma's plugin sandbox. The UI iframe (ui.html)
// relays requests from the local MCP server over WebSocket; results go back the same way.

figma.showUI(__html__, { width: 240, height: 80, title: 'Figma Bridge' });

const MIXED = figma.mixed;

function normalizeId(id) {
  return String(id).replace(/-/g, ':');
}

async function getNode(id) {
  const node = await figma.getNodeByIdAsync(normalizeId(id));
  if (!node) throw new Error('Node ' + id + ' not found in the open file');
  return node;
}

function pageOf(node) {
  let n = node;
  while (n && n.type !== 'PAGE') n = n.parent;
  return n;
}

// With documentAccess: dynamic-page, other pages are not loaded until asked for.
async function ensureLoaded(node) {
  const page = pageOf(node);
  if (page && page !== figma.currentPage) await page.loadAsync();
}

function brief(n) {
  return { id: n.id, name: n.name, type: n.type };
}

function outline(n, depth) {
  const o = brief(n);
  if ('x' in n) o.box = [round(n.x), round(n.y), round(n.width), round(n.height)];
  if ('children' in n) {
    if (depth > 0) o.children = n.children.map((c) => outline(c, depth - 1));
    else o.childCount = n.children.length;
  }
  return o;
}

function round(x) {
  return Math.round(x * 100) / 100;
}

// ---------- compact serializer (fallback when JSON_REST_V1 export is unavailable) ----------

function hex(c) {
  return '#' + [c.r, c.g, c.b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

function paint(p) {
  const o = { type: p.type };
  if (p.visible === false) o.visible = false;
  if (p.type === 'SOLID') o.color = hex(p.color);
  if (p.opacity !== undefined && p.opacity !== 1) o.opacity = round(p.opacity);
  if (p.type.indexOf('GRADIENT') === 0) {
    o.stops = p.gradientStops.map((s) => ({ pos: s.position, color: hex(s.color), a: s.color.a }));
  }
  if (p.type === 'IMAGE') { o.imageHash = p.imageHash; o.scaleMode = p.scaleMode; }
  return o;
}

function paints(v) {
  return v === MIXED ? 'MIXED' : v.map(paint);
}

function mixed(v) {
  return v === MIXED ? 'MIXED' : v;
}

function makeCompact() {
  const varNames = {};
  const styleNames = {};

  async function varName(id) {
    if (!(id in varNames)) {
      const v = await figma.variables.getVariableByIdAsync(id);
      varNames[id] = v ? v.name : id;
    }
    return varNames[id];
  }

  async function styleName(id) {
    if (!id || id === MIXED) return undefined;
    if (!(id in styleNames)) {
      const s = await figma.getStyleByIdAsync(id);
      styleNames[id] = s ? s.name : id;
    }
    return styleNames[id];
  }

  async function vars(bound) {
    const out = {};
    for (const key of Object.keys(bound)) {
      const v = bound[key];
      if (Array.isArray(v)) out[key] = (await Promise.all(v.map((a) => varName(a.id)))).join(',');
      else if (v && v.id) out[key] = await varName(v.id);
    }
    return out;
  }

  async function ser(n) {
    const o = brief(n);
    if (n.visible === false) o.visible = false;
    if ('x' in n) o.box = [round(n.x), round(n.y), round(n.width), round(n.height)];
    if ('rotation' in n && n.rotation) o.rotation = n.rotation;
    if ('opacity' in n && n.opacity !== 1) o.opacity = n.opacity;
    if ('fills' in n && (n.fills === MIXED || n.fills.length)) o.fills = paints(n.fills);
    if ('fillStyleId' in n && n.fillStyleId) o.fillStyle = await styleName(n.fillStyleId);
    if ('strokes' in n && n.strokes.length) {
      o.strokes = paints(n.strokes);
      o.strokeWeight = mixed(n.strokeWeight);
      o.strokeAlign = n.strokeAlign;
    }
    if ('cornerRadius' in n && n.cornerRadius !== 0) {
      o.cornerRadius = n.cornerRadius === MIXED
        ? [n.topLeftRadius, n.topRightRadius, n.bottomRightRadius, n.bottomLeftRadius]
        : n.cornerRadius;
    }
    if ('effects' in n && n.effects.length) {
      o.effects = n.effects.map((e) => ({
        type: e.type, radius: e.radius, offset: e.offset, spread: e.spread,
        color: e.color && hex(e.color), a: e.color && e.color.a,
      }));
    }
    if ('effectStyleId' in n && n.effectStyleId) o.effectStyle = await styleName(n.effectStyleId);
    if ('clipsContent' in n && n.clipsContent) o.clip = true;
    if ('layoutMode' in n && n.layoutMode !== 'NONE') {
      o.autoLayout = {
        mode: n.layoutMode, gap: n.itemSpacing,
        padding: [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft],
        align: [n.primaryAxisAlignItems, n.counterAxisAlignItems],
        sizing: [n.primaryAxisSizingMode, n.counterAxisSizingMode],
      };
      if (n.layoutWrap === 'WRAP') o.autoLayout.wrap = true;
    }
    if ('layoutSizingHorizontal' in n && n.parent && n.parent.type !== 'PAGE') {
      o.sizing = [n.layoutSizingHorizontal, n.layoutSizingVertical];
      if (n.layoutPositioning === 'ABSOLUTE') o.absolute = true;
    }
    if (n.boundVariables && Object.keys(n.boundVariables).length) o.vars = await vars(n.boundVariables);
    if (n.type === 'TEXT') {
      o.text = n.characters;
      o.font = n.fontName === MIXED ? 'MIXED' : n.fontName.family + ' ' + n.fontName.style;
      o.fontSize = mixed(n.fontSize);
      o.lineHeight = n.lineHeight === MIXED ? 'MIXED'
        : n.lineHeight.unit === 'AUTO' ? 'AUTO'
        : n.lineHeight.value + (n.lineHeight.unit === 'PIXELS' ? 'px' : '%');
      o.letterSpacing = n.letterSpacing === MIXED ? 'MIXED'
        : round(n.letterSpacing.value) + (n.letterSpacing.unit === 'PIXELS' ? 'px' : '%');
      o.textAlign = [n.textAlignHorizontal, n.textAlignVertical];
      o.textAutoResize = n.textAutoResize;
      if (n.textTruncation && n.textTruncation !== 'DISABLED') o.truncation = n.textTruncation;
      if (n.textStyleId) o.textStyle = await styleName(n.textStyleId);
    }
    if (n.type === 'INSTANCE') {
      const mc = await n.getMainComponentAsync();
      if (mc) {
        const setName = mc.parent && mc.parent.type === 'COMPONENT_SET' ? mc.parent.name + ' / ' : '';
        o.component = { name: setName + mc.name, key: mc.key, remote: mc.remote };
      }
      try {
        const cp = n.componentProperties;
        const keys = Object.keys(cp || {});
        if (keys.length) {
          o.props = {};
          for (const k of keys) o.props[k.replace(/#.*$/, '')] = cp[k].value;
        }
      } catch (e) {
        // componentProperties throws on some broken instances; skip them
      }
    }
    if ('children' in n && n.children.length) o.children = await Promise.all(n.children.map(ser));
    return o;
  }

  return ser;
}

// ---------- request handlers ----------

const handlers = {
  async status() {
    return {
      fileName: figma.root.name,
      fileKey: figma.fileKey || null,
      currentPage: brief(figma.currentPage),
      selection: figma.currentPage.selection.map(brief),
    };
  },

  async listPages() {
    return figma.root.children.map((p) => ({ id: p.id, name: p.name }));
  },

  async tree({ nodeId, depth }) {
    const node = nodeId ? await getNode(nodeId) : figma.currentPage;
    await ensureLoaded(node);
    return outline(node, depth === undefined ? 3 : depth);
  },

  async nodeJson({ nodeId, format }) {
    const node = await getNode(nodeId);
    await ensureLoaded(node);
    if (format !== 'compact') {
      try {
        const json = await node.exportAsync({ format: 'JSON_REST_V1' });
        return { format: 'rest', fileName: figma.root.name, fileKey: figma.fileKey || null, json };
      } catch (e) {
        if (format === 'rest') throw e;
        // 'auto' falls through to the compact serializer
      }
    }
    const json = await makeCompact()(node);
    return { format: 'compact', fileName: figma.root.name, fileKey: figma.fileKey || null, json };
  },

  async exportImage({ nodeId, format, scale }) {
    const node = await getNode(nodeId);
    await ensureLoaded(node);
    const settings = { format };
    if ((format === 'PNG' || format === 'JPG') && scale) settings.constraint = { type: 'SCALE', value: scale };
    const bytes = await node.exportAsync(settings);
    return { fileName: figma.root.name, name: node.name, bytes };
  },

  async imageFills({ nodeId }) {
    const node = await getNode(nodeId);
    await ensureLoaded(node);
    const all = 'findAll' in node ? [node].concat(node.findAll(() => true)) : [node];
    const hashes = {};
    for (const n of all) {
      if (!('fills' in n) || n.fills === MIXED) continue;
      for (const p of n.fills) if (p.type === 'IMAGE' && p.imageHash) hashes[p.imageHash] = true;
    }
    const images = [];
    for (const hash of Object.keys(hashes)) {
      const image = figma.getImageByHash(hash);
      if (image) images.push({ hash, bytes: await image.getBytesAsync() });
    }
    return { fileName: figma.root.name, images };
  },

  async runScript({ code }) {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('figma', code);
    return await fn(figma);
  },
};

figma.ui.onmessage = async (msg) => {
  if (!msg || msg.type !== 'request') return;
  const handler = handlers[msg.method];
  try {
    if (!handler) throw new Error('Unknown method ' + msg.method);
    const result = await handler(msg.params || {});
    figma.ui.postMessage({ type: 'response', id: msg.id, ok: true, result });
  } catch (e) {
    figma.ui.postMessage({ type: 'response', id: msg.id, ok: false, error: String((e && e.message) || e) });
  }
};
