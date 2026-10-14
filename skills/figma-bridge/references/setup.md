# Setting up figma-bridge

Two parts: the MCP server, which the agent starts by itself, and the Figma plugin, which
the user imports into Figma Desktop once. Requires Node.js 18+ and Figma Desktop.

When the `figma_*` tools are missing, add the server (step 1) for the agent you are
running in, then tell the user to restart or reload the agent. When the tools exist but
`figma_status` says the plugin is not connected, only step 2 is needed.

## 1. Add the MCP server

Ready-made templates are in [../config/](../config/). The server command is always
`npx -y @maxsbond/figma-bridge`.

| Agent | Where | Template |
|---|---|---|
| Claude Code | `claude mcp add --scope user figma-bridge -- npx -y @maxsbond/figma-bridge` | `claude-code.sh` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows) | `claude-desktop.json` |
| Cursor | `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project) | `cursor-mcp.json` |
| VS Code (Copilot agent mode) | `.vscode/mcp.json`, or the "Install in VS Code" link in the repo README | `vscode-mcp.json` |
| Copilot CLI | `~/.copilot/mcp-config.json`, or `/mcp add` inside `copilot` | `copilot-cli-mcp-config.json` |
| Codex (CLI, IDE, ChatGPT desktop) | `~/.codex/config.toml`, or `codex mcp add figma-bridge -- npx -y @maxsbond/figma-bridge` | `codex-config.toml` |

Any other MCP client: a stdio server with command `npx` and args `["-y", "@maxsbond/figma-bridge"]`.

If the config file already exists, merge the `figma-bridge` entry into it instead of
overwriting the file. In apps that don't start the server in a project folder (Claude
Desktop), set `FIGMA_BRIDGE_OUT_DIR` to an absolute path so exports land somewhere useful.

## 2. Import and run the Figma plugin

The user has to do this in Figma; the agent can run the first command for them.

1. `npx -y @maxsbond/figma-bridge setup` copies the plugin to `~/Documents/Figma Bridge Plugin`
   and opens the folder. Run it again after updating to get the new plugin version.
2. In Figma Desktop open any design file, then Figma menu → **Plugins → Development →
   Import plugin from manifest…** and pick `manifest.json` from that folder. Once only.
3. Each time they want the agent to work in a file: open it and run
   **Plugins → Development → Figma Bridge**. The plugin window says
   "connected to MCP server" when the agent's server is running. Keep the window open.

The plugin only sees the file it runs in. Figma doesn't run plugins in view-only files;
the user can duplicate the file to their drafts.

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `FIGMA_BRIDGE_OUT_DIR` | `<cwd>/figma-exports` | Where exports are written (`<dir>/<file name>/…`) |
| `FIGMA_BRIDGE_PORT` | `3055` | WebSocket port. Changing it also needs `plugin/manifest.json` (`devAllowedDomains`) and `plugin/ui.html` (`PORT`) changed |
| `FIGMA_BRIDGE_TIMEOUT_MS` | `120000` | How long to wait for the plugin to answer one request |

## Troubleshooting

**"Figma plugin is not connected"**: the plugin isn't running in the open file, or its
window was closed. Run Plugins → Development → Figma Bridge again. If the window says
"disconnected — retrying…", the server isn't up yet; it connects within ~10 s once it is.

**"Port 3055 is already taken"**: another process holds the port, usually a second agent
with figma-bridge enabled or a stale server. Find it with `lsof -iTCP:3055 -sTCP:LISTEN`
and ask the user before killing anything. The next `figma_*` call retries the bind.

**"Plugin did not answer … within 120s"**: the request was too heavy (huge export, long
script). Split it, or raise `FIGMA_BRIDGE_TIMEOUT_MS`.

**"Cannot unwrap symbol"**, node not found, page not loaded: see [scripting.md](scripting.md).

## Security

The server listens on `127.0.0.1` only and accepts only the plugin's sandboxed iframe
(`Origin: null`), so web pages can't reach it. `figma_run_script` runs whatever code the
agent sends with full edit rights on the open file.
