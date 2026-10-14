// Figma Bridge for VS Code: registers the figma-bridge MCP server with Copilot
// and runs it on VS Code's own Node runtime, so nothing has to be installed or
// configured by hand. The Figma plugin still has to be imported into Figma once;
// the "Set Up Figma Plugin" command gets it ready for that.

const vscode = require('vscode');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

// ./server is the bundled @maxsbond/figma-bridge package (see build.mjs).
const SERVER_PKG = path.join(__dirname, 'server');
const SERVER_JS = path.join(SERVER_PKG, 'server.js');
const SERVER_VERSION = require('./server/package.json').version;
const WELCOMED_KEY = 'figmaBridge.welcomed';

function documentsDir() {
  return path.join(os.homedir(), 'Documents');
}

// Exports go next to the project when a folder is open, otherwise to Documents.
function exportsDir() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder
    ? path.join(folder.uri.fsPath, 'figma-exports')
    : path.join(documentsDir(), 'Figma Exports');
}

async function setupPlugin() {
  const dest = path.join(documentsDir(), 'Figma Bridge Plugin');
  await fs.cp(path.join(SERVER_PKG, 'plugin'), dest, { recursive: true, force: true });
  const manifest = path.join(dest, 'manifest.json');
  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(manifest));

  const copy = 'Copy Path';
  const choice = await vscode.window.showInformationMessage(
    'The Figma plugin is in Documents → Figma Bridge Plugin. In Figma Desktop open any design file, ' +
      'then Plugins → Development → Import plugin from manifest… and pick manifest.json from that folder. ' +
      'After that, run Plugins → Development → Figma Bridge whenever you want Copilot to work in Figma.',
    { modal: true },
    copy,
  );
  if (choice === copy) {
    await vscode.env.clipboard.writeText(manifest);
    vscode.window.showInformationMessage('Path to manifest.json copied.');
  }
}

async function openExports() {
  const dir = exportsDir();
  await fs.mkdir(dir, { recursive: true });
  await vscode.env.openExternal(vscode.Uri.file(dir));
}

function activate(context) {
  const changed = new vscode.EventEmitter();
  context.subscriptions.push(
    changed,
    vscode.workspace.onDidChangeWorkspaceFolders(() => changed.fire()),
    vscode.lm.registerMcpServerDefinitionProvider('figma-bridge', {
      onDidChangeMcpServerDefinitions: changed.event,
      provideMcpServerDefinitions: () => [
        new vscode.McpStdioServerDefinition(
          'Figma Bridge',
          process.execPath,
          [SERVER_JS],
          { ELECTRON_RUN_AS_NODE: '1' },
          SERVER_VERSION,
        ),
      ],
      resolveMcpServerDefinition: (server) => {
        server.env = { ...server.env, FIGMA_BRIDGE_OUT_DIR: exportsDir() };
        return server;
      },
    }),
    vscode.commands.registerCommand('figmaBridge.setupPlugin', setupPlugin),
    vscode.commands.registerCommand('figmaBridge.openExports', openExports),
  );

  if (!context.globalState.get(WELCOMED_KEY)) {
    context.globalState.update(WELCOMED_KEY, true);
    const setup = 'Set Up Figma Plugin';
    vscode.window
      .showInformationMessage('Figma Bridge is installed. One more step: add its plugin to Figma Desktop.', setup)
      .then((choice) => choice === setup && setupPlugin());
  }
}

module.exports = { activate };
