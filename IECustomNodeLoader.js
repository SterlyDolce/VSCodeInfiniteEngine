// @ts-nocheck
const vscode = require('vscode');
const { pathToFileURL } = require('url');

const CUSTOM_NODE_GLOB = 'Scripts/Nodes/**/*.ienode.mjs';
let threeModulePromise;

async function findCustomNodeFiles(workspace) {
    if (!workspace) return [];

    return vscode.workspace.findFiles(
        new vscode.RelativePattern(workspace, CUSTOM_NODE_GLOB),
        '**/{node_modules,.git}/**'
    );
}

async function registerCustomNodes(registry, workspace) {
    if (!workspace || !vscode.workspace.isTrusted) return [];

    const files = await findCustomNodeFiles(workspace);
    const loaded = [];
    threeModulePromise ??= import('three');
    const THREE = await threeModulePromise;

    for (const uri of files) {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            const moduleUrl = `${pathToFileURL(uri.fsPath).href}?v=${stat.mtime}`;
            const module = await import(moduleUrl);
            const register = module.registerNodes ?? module.default;

            if (typeof register !== 'function') {
                throw new TypeError(
                    'Custom node module must export default or registerNodes()'
                );
            }

            await register(registry, { THREE });
            loaded.push(uri);
        } catch (error) {
            console.error(`[IE] Failed to load custom nodes from ${uri.fsPath}:`, error);
            vscode.window.showWarningMessage(
                `Infinite Engine custom nodes failed: ${vscode.workspace.asRelativePath(uri)}: ${error.message}`
            );
        }
    }

    return loaded;
}

module.exports = {
    CUSTOM_NODE_GLOB,
    findCustomNodeFiles,
    registerCustomNodes
};
