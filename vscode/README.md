# Figma Bridge

Lets GitHub Copilot in VS Code read and edit the file you have open in Figma Desktop:
export frames as PNG or JSON, look up layers, build components from a design, rename or
restyle layers in bulk.

It works through a small Figma plugin, so it doesn't need a paid Figma seat or an API
token and has no rate limits. You don't need Node.js or any config files: the extension
brings everything with it.

## Setup (once)

1. **Install the extension.** A notification then offers **Set Up Figma Plugin**. Click it
   (or run **Figma Bridge: Set Up Figma Plugin** from the Command Palette). It puts the
   plugin into `Documents/Figma Bridge Plugin` and opens that folder.
2. **Import the plugin into Figma Desktop.** Open any design file, click the Figma logo in
   the top-left corner and go to **Plugins → Development → Import plugin from manifest…**.
   Pick `manifest.json` from the `Figma Bridge Plugin` folder.

## Every time you work

1. In Figma Desktop open the file and run **Plugins → Development → Figma Bridge**. Keep
   its small window open. It says **connected to MCP server** once Copilot has started the
   server.
2. In VS Code open Copilot Chat and switch it to **Agent** mode. The `figma_*` tools
   appear in the tools picker (the first time, VS Code may ask you to trust the server).
3. Ask things like:
   - "What's selected in Figma? Export it as PNG and JSON."
   - "Build this React component from the selected frame."
   - "Rename every layer called `Frame 12…` on this page to something meaningful."

Exports are saved to `figma-exports` in the open project folder, or to
`Documents/Figma Exports` when no folder is open. **Figma Bridge: Open Exports Folder**
opens it.

## Good to know

- You need Figma **Desktop** (the browser version can't connect) and edit access to the
  file. For a view-only file, duplicate it to your drafts first.
- The plugin only sees the file it's running in.
- Copilot can change the file. Figma's undo works for everything it does.
- On Copilot Business or Enterprise your organization admin has to allow MCP servers.
- If the plugin says "disconnected", send any message in Copilot agent mode (that starts
  the server), or run **MCP: List Servers → Figma Bridge → Start**.

More details and troubleshooting: [github.com/MaxsBond/figma-bridge](https://github.com/MaxsBond/figma-bridge).
