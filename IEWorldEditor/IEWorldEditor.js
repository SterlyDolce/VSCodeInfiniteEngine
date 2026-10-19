// @ts-nocheck
const vscode = require('vscode');
const crypto = require('crypto');
const { worldNodeRegistry } = require('./WorldNodeRegistry');
const IETerrainGraphEvaluator = require('./IETerrainGraphEvaluator');
const IEAssetManager = require('../IEAssetManager');
const { resolveTerrainTextures } = require('./IETextureDataDecoder');

class IEWorldEditor {
    async resolveCustomTextEditor(document, panel) {
        const uriKey = document.uri.toString();
        IEWorldEditor.panels.set(uriKey, panel);
        const folder = vscode.Uri.joinPath(this.context.extensionUri, 'IEWorldEditor');
        const modules = vscode.Uri.joinPath(this.context.extensionUri, 'node_modules');
        panel.webview.options = { enableScripts: true, localResourceRoots: [folder, modules, vscode.Uri.joinPath(this.context.extensionUri, 'IESceneEditor')] };
        const uri = file => panel.webview.asWebviewUri(vscode.Uri.joinPath(folder, file));
        const three = panel.webview.asWebviewUri(vscode.Uri.joinPath(modules, 'three', 'build', 'three.module.js'));
        const addons = panel.webview.asWebviewUri(vscode.Uri.joinPath(modules, 'three', 'examples', 'jsm'));
        const nonce = crypto.randomBytes(16).toString('hex');
        panel.webview.html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}' ${panel.webview.cspSource};"><link rel="stylesheet" href="${uri('style.css')}"><script type="importmap" nonce="${nonce}">{"imports":{"three":"${three}","three/addons/":"${addons}/"}}</script></head><body><div id="workspace"><section id="graph-wrap"><canvas id="graph"></canvas><div id="graph-toolbar"><strong id="title">World Graph</strong><span></span><button id="graph-fit">Fit</button><button id="zoom-out">−</button><button id="zoom-in">+</button></div><div id="node-menu" class="popup" hidden><input id="menu-search" placeholder="Search world nodes…"><div id="menu-items"></div></div><div id="zoom-label">100%</div></section><section id="preview"><div id="preview-toolbar"><strong>Terrain Preview</strong><span></span><button id="wire">Wireframe</button><button id="fit">Fit Terrain</button><button id="generate">Regenerate</button></div></section><footer id="status">Loading…</footer></div><script type="module" nonce="${nonce}" src="${uri('script.mjs')}"></script></body></html>`;
        let lastSubmitted = null, timer = null, generationToken = 0, disposed = false;
        const generateLatest = async (asset, revision) => {
            const token = ++generationToken;
            try {
                const graph = asset.data ?? asset.graph;
                const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
                let textures = new Map();
                if (workspace) {
                    const manager = new IEAssetManager(workspace.uri.fsPath);
                    await manager.scan();
                    textures = await resolveTerrainTextures(graph, manager);
                }
                if (disposed || token !== generationToken) return;
                const evaluator = new IETerrainGraphEvaluator(worldNodeRegistry, { maxResolution: 256, textures });
                const result = evaluator.evaluate(graph);
                if (!disposed && token === generationToken) {
                    await panel.webview.postMessage({ type: 'generated', terrain: result.terrain, revision });
                }
            } catch (error) {
                if (!disposed && token === generationToken) {
                    await panel.webview.postMessage({ type: 'generationError', error: error.message, revision });
                }
            }
        };
        const send = () => { try { const asset = JSON.parse(document.getText()); panel.webview.postMessage({ type: 'load', asset, definitions: worldNodeRegistry.getDefinitions(), uri: uriKey }); void generateLatest(asset, 0); } catch (error) { panel.webview.postMessage({ type: 'error', error: error.message }); } };
        const watcher = vscode.workspace.onDidChangeTextDocument(event => { if (event.document.uri.toString() !== document.uri.toString()) return; if (event.document.getText() === lastSubmitted) { lastSubmitted = null; return; } send(); });
        panel.webview.onDidReceiveMessage(async message => {
            if (message.type === 'ready') return send();
            if (message.type === 'graphSelection') {
                await this.propertiesProvider?.syncActiveEditor();
                this.propertiesProvider?.setGraphSelection({
                    uri: uriKey,
                    selection: message.selection
                });
                return;
            }
            if (message.type === 'save') {
                const asset = JSON.parse(document.getText()); asset.data = message.graph;
                lastSubmitted = JSON.stringify(asset, null, 4) + '\n';
                const edit = new vscode.WorkspaceEdit(); edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), lastSubmitted); await vscode.workspace.applyEdit(edit);
                clearTimeout(timer); timer = setTimeout(() => void generateLatest(asset, message.revision), 180);
            } else if (message.type === 'generate') { const asset = JSON.parse(document.getText()); void generateLatest(asset, message.revision); }
        });
        const textureWatcher = vscode.workspace.onDidSaveTextDocument(saved => {
            if (saved.uri.toString() === document.uri.toString() || !saved.fileName.endsWith('.ieasset')) return;
            // Asset manager resolves the saved texture reference on regeneration.
            try {
                const asset = JSON.parse(document.getText());
                if ((asset.data?.nodes ?? []).some(node => node.type === 'world.textureAsset')) {
                    void generateLatest(asset, generationToken + 1);
                }
            } catch { /* Invalid graph is reported by the normal editor flow. */ }
        });
        panel.onDidDispose(() => {
            disposed = true;
            generationToken++;
            textureWatcher.dispose();
            watcher.dispose();
            clearTimeout(timer);
            if (IEWorldEditor.panels.get(uriKey) === panel) {
                IEWorldEditor.panels.delete(uriKey);
            }
            this.propertiesProvider?.clearGraphSelection(uriKey);
        });
    }
    constructor(context, propertiesProvider) { this.context = context; this.propertiesProvider = propertiesProvider; }
    async generate(asset, panel, revision = 0, documentUri = null) { try { const graph = asset.data ?? asset.graph; const workspace = documentUri ? vscode.workspace.getWorkspaceFolder(documentUri) : null; let textures = new Map(); if (!workspace) throw new Error('Cannot locate workspace for terrain texture assets'); if (workspace) { const manager = new IEAssetManager(workspace.uri.fsPath); await manager.scan(); textures = await resolveTerrainTextures(graph, manager); } const evaluator = new IETerrainGraphEvaluator(worldNodeRegistry, { maxResolution: 256, textures }); const result = evaluator.evaluate(graph); panel.webview.postMessage({ type: 'generated', terrain: result.terrain, revision }); } catch (error) { panel.webview.postMessage({ type: 'generationError', error: error.message, revision }); } }
}
IEWorldEditor.panels = new Map();
module.exports = IEWorldEditor;
