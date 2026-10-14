# figma_run_script: recipes and pitfalls

`code` is the body of an async function with `figma` in scope. Use `await` freely and
`return` the result. Whatever you return is serialized back to the agent, so return
plain data.

## Pitfalls

- **Return plain data.** Nodes, `figma.mixed` and other symbols can't be serialized
  ("Cannot unwrap symbol"). Map nodes to `{ id, name, type }` and clean values:
  `JSON.parse(JSON.stringify(value, (k, v) => typeof v === 'symbol' ? 'MIXED' : v))`.
- **Async APIs only.** The plugin uses `documentAccess: dynamic-page`. Use
  `figma.getNodeByIdAsync`, `node.getMainComponentAsync()`, `figma.getStyleByIdAsync`,
  `figma.variables.getVariableByIdAsync`. Before searching another page, call
  `await page.loadAsync()` (or `figma.loadAllPagesAsync()` for the whole file, which is slow).
- **`figma.currentPage` is the user's page**, not necessarily the one you care about.
  Go by node id.
- **Fonts.** Load every font of a text node before changing `characters` or text props:
  `await Promise.all(node.getRangeAllFontNames(0, node.characters.length).map(figma.loadFontAsync))`.
- **Instances.** Children of instances can't be removed or reparented. Change them through
  component properties, or `detachInstance()` if the user agrees.
- **Colors** are 0-1 floats: `{ r: 1, g: 0.5, b: 0 }`. Paints are immutable arrays,
  assign a new array: `node.fills = [{ type: 'SOLID', color }]`.
- **Timeouts.** One request has 120 s. Split work over many nodes into several calls.
- **Big results** (over ~15 KB) are saved to a file and you get the path back.

## Recipes

Selection summary:

```js
return figma.currentPage.selection.map(n => ({ id: n.id, name: n.name, type: n.type, w: n.width, h: n.height }));
```

Find nodes by name on a page:

```js
const page = await figma.getNodeByIdAsync('0:1');
await page.loadAsync();
return page.findAll(n => /^Frame \d+$/.test(n.name)).map(n => ({ id: n.id, name: n.name, parent: n.parent.name }));
```

Rename layers (report what changed):

```js
const root = await figma.getNodeByIdAsync('12:345');
const changed = [];
for (const n of root.findAll(n => n.type === 'TEXT' && n.name.startsWith('Text'))) {
  const next = n.characters.slice(0, 40).trim() || n.name;
  if (next !== n.name) { changed.push([n.id, n.name, next]); n.name = next; }
}
return { count: changed.length, changed: changed.slice(0, 50) };
```

Change text:

```js
const t = await figma.getNodeByIdAsync('12:346');
await Promise.all(t.getRangeAllFontNames(0, t.characters.length).map(figma.loadFontAsync));
t.characters = 'New label';
return { id: t.id, text: t.characters };
```

Local variables (design tokens):

```js
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const out = [];
for (const c of collections) {
  for (const id of c.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    out.push({ collection: c.name, name: v.name, type: v.resolvedType,
      values: Object.fromEntries(c.modes.map(m => [m.name, v.valuesByMode[m.modeId]])) });
  }
}
return out;
```

Local styles:

```js
const [paint, text, effect] = await Promise.all([
  figma.getLocalPaintStylesAsync(), figma.getLocalTextStylesAsync(), figma.getLocalEffectStylesAsync(),
]);
return {
  paint: paint.map(s => ({ id: s.id, name: s.name, paints: s.paints })),
  text: text.map(s => ({ id: s.id, name: s.name, font: s.fontName, size: s.fontSize })),
  effect: effect.map(s => ({ id: s.id, name: s.name })),
};
```

Create an auto-layout frame next to the selection:

```js
const anchor = figma.currentPage.selection[0];
const f = figma.createFrame();
f.name = 'Card';
f.layoutMode = 'VERTICAL';
f.itemSpacing = 12;
f.paddingTop = f.paddingBottom = f.paddingLeft = f.paddingRight = 16;
f.primaryAxisSizingMode = 'AUTO';
f.counterAxisSizingMode = 'AUTO';
f.cornerRadius = 12;
f.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
if (anchor) { f.x = anchor.x + anchor.width + 40; f.y = anchor.y; }
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
const t = figma.createText();
t.characters = 'Hello';
f.appendChild(t);
figma.currentPage.selection = [f];
return { id: f.id };
```

Instances of a component and their props:

```js
const page = figma.currentPage;
const res = [];
for (const n of page.findAllWithCriteria({ types: ['INSTANCE'] })) {
  const mc = await n.getMainComponentAsync();
  if (mc && mc.name.includes('Button')) {
    res.push({ id: n.id, component: mc.name,
      props: Object.fromEntries(Object.entries(n.componentProperties).map(([k, v]) => [k.replace(/#.*$/, ''), v.value])) });
  }
}
return res;
```
