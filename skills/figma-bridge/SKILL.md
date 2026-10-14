---
name: figma-bridge
description: Read and edit the file open in Figma Desktop through the figma-bridge MCP server (figma_* tools). Use when the user mentions Figma, a Figma link or node id, a frame, component, layer, design tokens or "what's selected", or asks to build UI from a design, export assets, inspect styles, or change, rename, restyle or generate anything in a Figma file. Also use to set up figma-bridge when the tools are missing or the plugin is not connected.
---

# Figma Bridge

figma-bridge connects the agent to the file the user has open in Figma Desktop. A small
development plugin runs inside Figma and executes requests with the Plugin API, so there
are no REST rate limits, no response truncation, and the agent can write to the file.

```
agent ──stdio──> figma-bridge MCP server ──ws://127.0.0.1:3055──> Figma Bridge plugin ──> open file
```

The agent only sees the one file where the plugin window is open, and only while it is open.

## Tools

| Tool | Use it for |
|---|---|
| `figma_status` | First call. Returns file name/key, current page and selection, or a "not connected" error |
| `figma_list_pages` | Page ids and names |
| `figma_get_tree` | Outline (id, name, type, box) to a depth of 0-10. Use it to find node ids |
| `figma_export_json` | Full node JSON written to disk. `rest` = REST API shape, `compact` = trimmed with style/variable/component names resolved, `auto` = rest, falling back to compact |
| `figma_export_image` | PNG/JPG (scale up to 4) or SVG/PDF written to disk |
| `figma_export_image_fills` | Original raster images used in image fills, named by hash |
| `figma_run_script` | Any Plugin API JavaScript, read and write. `figma` is in scope, top-level `await`, `return` the result |

Node ids can be passed as `1:2`, `1-2` or a full Figma URL with `?node-id=`.
Exports go to `figma-exports/<file name>/` in the server's working directory unless
`outPath` / `FIGMA_BRIDGE_OUT_DIR` says otherwise. Results over ~15 KB come back as a file path.

## Workflow

1. **Check the connection.** Call `figma_status`.
   - Tools missing entirely: the MCP server isn't configured. Follow [references/setup.md](references/setup.md).
   - "Figma plugin is not connected": ask the user to open the file in Figma Desktop and run
     Plugins → Development → Figma Bridge, then call `figma_status` again.
   - "Port 3055 is already taken": another agent holds the bridge. See troubleshooting in setup.md.
2. **Find the node.** Use the selection from `figma_status`, a node id from a URL the user
   pasted, or walk down with `figma_get_tree` (start at depth 2-3, then go deeper on the
   branch you need). Don't dump whole pages at high depth.
3. **Read what you need, cheapest first.**
   - Structure and names: `figma_get_tree`.
   - Exact styles, auto layout, text, variables for building code: `figma_export_json`
     with `compact` (smaller, names resolved), or `rest` when you need the REST shape.
     Read the saved file, don't ask for everything inline.
   - Visual reference: `figma_export_image` as PNG at scale 2 and look at it.
   - Icons and vectors for code: `figma_export_image` as SVG. Photos: `figma_export_image_fills`.
   - Anything the export tools don't cover (variables, styles, component props, search
     across the page): a read-only `figma_run_script`.
4. **Change the file with `figma_run_script`.** Rules:
   - Say what you're about to change before doing it on a file that matters. Figma's undo
     works, but large scripted edits are tedious to inspect.
   - Address nodes by id with `await figma.getNodeByIdAsync(id)`. Don't rely on
     `figma.currentPage`, it is whatever the user is looking at right now.
   - Load fonts before touching text: `await figma.loadFontAsync(textNode.fontName)`.
   - Return plain data (ids, names, counts), never node objects or `figma.mixed`.
   - Do big jobs in batches and return a summary, so one bad node doesn't hide the rest.
   - After writing, verify: re-read with `figma_get_tree` or export a PNG and look at it.

Recipes and Plugin API pitfalls: [references/scripting.md](references/scripting.md).

## Building code from a design

1. Export the frame as PNG (scale 2) for the overall look and `compact` JSON for exact values.
2. Map Figma to code. In compact JSON: `autoLayout` (`mode`, `gap`, `padding` as
   top/right/bottom/left, `align`, `wrap`) → flexbox; `sizing` FILL / HUG / FIXED →
   flex-grow / fit-content / fixed size; `vars`, `fillStyle`, `textStyle`, `effectStyle`
   → the project's tokens instead of raw hex values.
3. Reuse existing components in the codebase when an instance's `component.name` matches
   one, and map its `props` to the component's props.
4. Export icons as SVG and images via `figma_export_image_fills` instead of redrawing them.
5. Compare the result with the PNG before calling it done.

## Limits

- Figma Desktop only. The browser version can't reach localhost from a dev plugin.
- Figma doesn't run plugins in files you can only view. On a View seat the user can
  duplicate the file to their drafts and work there.
- One server holds port 3055. Two agents with figma-bridge enabled at once will clash
  unless one uses a different `FIGMA_BRIDGE_PORT` and its own copy of the plugin.
- Requests time out after 120 s (`FIGMA_BRIDGE_TIMEOUT_MS`). Split very heavy scripts.
