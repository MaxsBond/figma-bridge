# Figma Bridge MCP

A local MCP server that lets AI coding agents (Claude, Codex, GitHub Copilot) read and edit
the file you have open in Figma Desktop. It talks to Figma through a small development
plugin instead of the REST API or Figma's hosted MCP, so:

- it works on a **View / Starter seat** (the hosted MCP gives a handful of calls a month there),
- there are **no rate limits** and no response truncation,
- the agent can **write** to the file, not only read it (via `figma_run_script`).

```
AI agent ──stdio──> figma-bridge (server.js) ──ws://127.0.0.1:3055──> plugin/ui.html ──postMessage──> plugin/code.js (Plugin API)
```

The agent starts the server (`npx -y @maxsbond/figma-bridge`) as a stdio MCP server. The server opens a WebSocket on
`127.0.0.1:3055` and waits. The "Figma Bridge" plugin, running in Figma Desktop,
connects to it and executes each request with the Plugin API in the open file.

## Requirements

- [Node.js](https://nodejs.org) 18 or newer (the LTS installer is fine)
- Figma Desktop (the browser version can't reach localhost from a dev plugin)
- Edit access to the file. Figma doesn't run plugins in view-only files; if you only have
  view access, duplicate the file to your drafts.

## Install

There are two parts: the MCP server, which your AI agent starts on its own, and the
Figma plugin, which you import into Figma once. The server is published on npm as
[`@maxsbond/figma-bridge`](https://www.npmjs.com/package/@maxsbond/figma-bridge), so
there is nothing to clone or build.

### 1. Add the server to your agent

**VS Code (GitHub Copilot):** click
[**Install in VS Code**](https://insiders.vscode.dev/redirect/mcp/install?name=figma-bridge&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40maxsbond%2Ffigma-bridge%22%5D%7D)
and confirm in VS Code. Other agents are in the sections below.

### 2. Set up the Figma plugin

You import the plugin once. After that you only need to run it (step 4).

**1. Get the plugin files.** Run this in a terminal:

```bash
npx -y @maxsbond/figma-bridge setup
```

It copies the plugin to `Documents/Figma Bridge Plugin` and opens that folder. Run it
again after updating to get the new plugin version.

**2. Import the plugin.** In Figma Desktop open any design file, click the Figma logo in
the top-left corner and go to **Plugins → Development → Import plugin from manifest…**
(right-clicking the canvas gets you the same **Plugins** menu).

<!-- screenshot: Plugins → Development → Import plugin from manifest… -->

**3. Pick `manifest.json`** in the `Figma Bridge Plugin` folder and click **Open**.
"Figma Bridge" now shows up under Plugins → Development.

<!-- screenshot: Selecting manifest.json in the file dialog -->

**4. Run the plugin** whenever you want the agent to work in Figma: open the file and pick
**Plugins → Development → Figma Bridge**.

<!-- screenshot: Plugins → Development → Figma Bridge -->

**5. Check the connection.** The small plugin window says **connected to MCP server** once
an agent with this MCP is running (see the next sections). If the agent isn't running yet,
it says "disconnected — retrying…" and connects by itself when the agent starts. Keep the
window open while you work, since closing it stops the bridge.

<!-- screenshot: Figma Bridge plugin window: connected to MCP server -->

### From source

If you'd rather run a checkout: clone the repo, run `npm install`, import
`plugin/manifest.json` from it, and in the configs below use `node` with
`/absolute/path/to/figma-bridge/server.js` instead of `npx -y @maxsbond/figma-bridge`.

## Use with Claude

### Claude Code

```bash
claude mcp add --scope user figma-bridge -- npx -y @maxsbond/figma-bridge
```

Check it with `claude mcp list`, or `/mcp` inside a session. Exports go to
`./figma-exports/` in the directory you started `claude` from.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "npx",
      "args": ["-y", "@maxsbond/figma-bridge"],
      "env": {
        "FIGMA_BRIDGE_OUT_DIR": "/absolute/path/to/figma-exports"
      }
    }
  }
}
```

Restart Claude Desktop. Set `FIGMA_BRIDGE_OUT_DIR` here because a desktop app doesn't
start the server in a folder you'd want exports in.

## Use with Codex

Works for the Codex CLI, the Codex IDE extension and the ChatGPT desktop app. They all
read `~/.codex/config.toml`.

```bash
codex mcp add figma-bridge -- npx -y @maxsbond/figma-bridge
```

or add it by hand:

```toml
[mcp_servers.figma-bridge]
command = "npx"
args = ["-y", "@maxsbond/figma-bridge"]
# Codex's default per-tool timeout is 60 s; big exports and scripts can take longer.
tool_timeout_sec = 180

# optional
# [mcp_servers.figma-bridge.env]
# FIGMA_BRIDGE_OUT_DIR = "/absolute/path/to/figma-exports"
```

Check it with `codex mcp list`, or `/mcp` inside the Codex TUI.

## Use with GitHub Copilot

### VS Code (Copilot Chat, agent mode)

The **Install in VS Code** link above adds the server to your user settings. To add it
to one project instead, create `.vscode/mcp.json`:

```json
{
  "servers": {
    "figma-bridge": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@maxsbond/figma-bridge"],
      "env": {
        "FIGMA_BRIDGE_OUT_DIR": "${workspaceFolder}/figma-exports"
      }
    }
  }
}
```

Click **Start** above the server entry (or run **MCP: List Servers → figma-bridge →
Start**), switch Copilot Chat to **Agent** mode and make sure the `figma_*` tools are
ticked in the tools picker. MCP tools aren't available in Ask/Edit mode. On Copilot
Business/Enterprise your organization admin has to allow MCP servers.

### Copilot CLI

Add it with `/mcp add` inside `copilot`, or edit `~/.copilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "figma-bridge": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "@maxsbond/figma-bridge"],
      "tools": ["*"]
    }
  }
}
```

## Tools

| Tool | What it does |
|---|---|
| `figma_status` | Connection check: file name/key, current page, selection |
| `figma_list_pages` | Pages of the open file |
| `figma_get_tree` | id / name / type / box outline to a given depth, for finding node ids |
| `figma_export_json` | Node JSON to disk: `rest` (same shape as the REST API, `JSON_REST_V1`), `compact` (trimmed, with style/variable/component names resolved) or `auto` |
| `figma_export_image` | PNG / JPG / SVG / PDF render to disk |
| `figma_export_image_fills` | Original raster images used in image fills |
| `figma_run_script` | Arbitrary Plugin API JavaScript (read **and** write), `figma` in scope, top-level `await`, use `return` |

Node ids can be given as `1:2`, `1-2` or a full Figma URL with `?node-id=`.
Results over ~15 KB are saved to a file and the tool returns the path instead.

Things to try once it's connected:

- "What's selected in Figma? Export it as PNG and JSON."
- "Build this React component from Figma node 12:345."
- "Rename every layer called `Frame 12…` on this page to something meaningful."
- "Make a dark variant of the selected component set."

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `FIGMA_BRIDGE_OUT_DIR` | `<cwd>/figma-exports` | Where exports are written (`<dir>/<file name>/…`) |
| `FIGMA_BRIDGE_PORT` | `3055` | WebSocket port. If you change it, change it in `plugin/manifest.json` (`devAllowedDomains`) and `plugin/ui.html` (`PORT`) too |
| `FIGMA_BRIDGE_TIMEOUT_MS` | `120000` | How long to wait for the plugin to answer one request |

## Troubleshooting

**"Figma plugin is not connected"**: run Plugins → Development → Figma Bridge in the
file you want to work on. The plugin only sees that one file.

**"Port 3055 is already taken"**: only one server can hold the port, and the plugin talks
to whoever does. This happens when two agents run at once (say Claude Code and Codex both
have the MCP enabled) or an old server process is still alive. Find it with

```bash
lsof -iTCP:3055 -sTCP:LISTEN
```

and close that agent or kill the process. The next `figma_*` call retries the bind, and
the plugin reconnects within ~10 s. To run two agents at the same time, give one of them a
different `FIGMA_BRIDGE_PORT` and a second copy of the plugin pointing at that port.

**Scripts fail with "Cannot unwrap symbol"**: the result contains `figma.mixed`
(for example the `fontSize` of a text node with mixed sizes). Convert it before returning,
e.g. `JSON.parse(JSON.stringify(value, (k, v) => typeof v === 'symbol' ? 'MIXED' : v))`.

**Node not found / page not loaded in scripts**: the plugin uses
`documentAccess: dynamic-page`, so use the async APIs (`figma.getNodeByIdAsync`,
`node.getMainComponentAsync()`, `page.loadAsync()` / `figma.loadAllPagesAsync()`).
`figma.currentPage` is whatever page is open in Figma right now, so address nodes by id
rather than relying on it.

## Security

The WebSocket listens on `127.0.0.1` only and accepts connections only with
`Origin: null` (the plugin's sandboxed iframe), so regular web pages can't talk to it.
Keep in mind that `figma_run_script` runs whatever code the agent sends with full edit
rights on the open file. Figma's undo works for it, but review what your agent is doing
in files that matter.

## License

[MIT](LICENSE)
