# Distribution

Where figma-bridge is listed and the copy used there. Everything is free; the project
stays MIT and open source.

## Agensi (agensi.io)

Upload: `npm run pack:skill` → `dist/figma-bridge-skill.zip`. Price: free.
Sign up with Google → account settings → creator mode → https://www.agensi.io/sell

**Name:** Figma Bridge

**Short description:**
Let your AI agent read and edit the file you have open in Figma Desktop. No API limits, works with Claude Code, Cursor, Copilot and Codex.

**Description:**

Figma Bridge connects your coding agent to the file you have open in Figma Desktop. Point
it at a frame and it can build the component in your codebase, export icons and images,
pull your colors, type styles and variables, or make changes in the file itself: rename
layers, restyle components, generate variants, lay out new screens.

What you get:
- Design to code from the real file: exact spacing, auto layout, text styles and
  variable names, plus a PNG of the frame to compare against.
- Edits, not just reads. The agent runs Figma Plugin API scripts in the open file, and
  Figma's undo works as usual.
- No rate limits or truncated responses. Everything goes through a local plugin instead
  of the REST API or the hosted Figma MCP, so it works the same on any Figma plan.
- Works with Claude Code, Claude Desktop, Cursor, VS Code Copilot, Copilot CLI, Codex and
  any other MCP client.

The skill tells the agent when and how to use the figma-bridge tools, and walks it
through setup. Setup takes about two minutes: add one MCP server line to your agent
(templates for each agent are in the zip) and import the Figma plugin once with
`npx -y @maxsbond/figma-bridge setup`.

Requires Node.js 18+ and Figma Desktop. Runs entirely on your machine: the server only
listens on 127.0.0.1.

Free and open source (MIT): https://github.com/MaxsBond/figma-bridge
npm: https://www.npmjs.com/package/@maxsbond/figma-bridge

**Tags:** figma, design, design-to-code, mcp, ui, frontend

## MCP catalogs

- [ ] Official MCP Registry (registry.modelcontextprotocol.io), via `mcp-publisher`.
  Needs `"mcpName": "io.github.maxsbond/figma-bridge"` in package.json and a new npm release.
- [ ] Smithery (smithery.ai)
- [ ] Glama (glama.ai/mcp/servers), picks up GitHub repos; claim it there
- [ ] mcp.so
- [ ] PR to github.com/punkpeye/awesome-mcp-servers (Design section)

## Posts

Record a short GIF first: agent builds a component from a selected frame, or restyles a
frame live in Figma. Then:

- [ ] Reddit: r/ClaudeAI, r/cursor, r/FigmaDesign
- [ ] Show HN
- [ ] Figma Community forum, "Show and tell"
