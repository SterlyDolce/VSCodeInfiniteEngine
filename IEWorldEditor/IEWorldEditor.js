// @ts-nocheck
const vscode = require("vscode");
const crypto = require("crypto");
const { worldNodeRegistry } = require("./WorldNodeRegistry");
const IETerrainGraphEvaluator = require("./IETerrainGraphEvaluator");
const IEAssetManager = require("../IEAssetManager");
const {
  resolveTerrainTextures,
  resolveTerrainMaterials,
} = require("./IETextureDataDecoder");

class IEWorldEditor {
  async resolveCustomTextEditor(document, panel) {
    const uriKey = document.uri.toString();
    IEWorldEditor.panels.set(uriKey, panel);
    const folder = vscode.Uri.joinPath(
      this.context.extensionUri,
      "IEWorldEditor",
    );
    const modules = vscode.Uri.joinPath(
      this.context.extensionUri,
      "node_modules",
    );
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        folder,
        modules,
        vscode.Uri.joinPath(this.context.extensionUri, "IESceneEditor"),
        vscode.Uri.joinPath(this.context.extensionUri, "images"),
        vscode.Uri.joinPath(this.context.extensionUri, "Shared"),
      ],
    };
    const uri = (file) =>
      panel.webview.asWebviewUri(vscode.Uri.joinPath(folder, file));
    const three = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(modules, "three", "build", "three.module.js"),
    );
    const addons = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(modules, "three", "examples", "jsm"),
    );
    const checker = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "images", "checkers.png"),
    );
    const nonce = crypto.randomBytes(16).toString("hex");
    const shared = (file) => panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "Shared", file),
    );
    panel.webview.html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}' ${panel.webview.cspSource}; img-src ${panel.webview.cspSource} data:; connect-src ${panel.webview.cspSource};"><link rel="stylesheet" href="${shared("ui.css")}"><script type="importmap" nonce="${nonce}">{"imports":{"three":"${three}","three/addons/":"${addons}/"}}</script><script nonce="${nonce}">window.INFINITE_ASSETS={checkerTexture:${JSON.stringify(checker.toString())}};</script></head><body data-ie-editor="graph-preview"><div id="workspace"><section id="graph-wrap"><canvas id="graph"></canvas><div id="toolbar" class="graph-toolbar" role="toolbar" aria-label="World graph controls"><strong id="title">World Graph</strong><div id="actions"><button id="graph-fit" title="Fit Graph" aria-label="Fit Graph"><ion-icon name="scan-outline"></ion-icon></button><button id="zoom-out" aria-label="Zoom out"><ion-icon name="remove"></ion-icon></button><button id="zoom-in" aria-label="Zoom in"><ion-icon name="add"></ion-icon></button></div></div><div id="node-menu" class="popup" hidden><input id="menu-search" placeholder="Search world nodes…"><div id="menu-items"></div></div><div id="zoom-label">100%</div></section><div id="splitter" role="separator" aria-label="Resize graph and terrain preview" aria-orientation="vertical" aria-valuemin="20" aria-valuemax="80" tabindex="0"></div><section id="preview"><div id="preview-toolbar" class="ie-secondary-toolbar" role="toolbar" aria-label="Terrain preview controls"><strong>Terrain Preview</strong><div id="actions"><button id="wire" title="Wireframe" aria-label="Wireframe"><ion-icon name="grid-outline"></ion-icon></button><button id="fit" title="Fit Terrain" aria-label="Fit Terrain"><ion-icon name="scan-outline"></ion-icon></button><button id="generate" title="Regenerate" aria-label="Regenerate"><ion-icon name="refresh-outline"></ion-icon></button></div></div></section><footer id="status">Loading…</footer></div><script type="module" nonce="${nonce}" src="${shared("ui.js")}"></script><script type="module" nonce="${nonce}" src="${uri("script.mjs")}"></script></body></html>`;
    panel.webview.html = panel.webview.html.replace(
      '<button id="wire" title="Wireframe" aria-label="Wireframe"><ion-icon name="grid-outline"></ion-icon></button>',
      '<div id="terrain-modes"><button class="terrain-mode active" data-mode="preview">Preview</button><button class="terrain-mode" data-mode="paint">Paint</button><button class="terrain-mode" data-mode="sculpt">Sculpt</button></div><label id="paint-target-wrap" hidden><span>Paint Target</span><select id="paint-target"></select></label><div id="paint-tools" hidden><button id="create-paint">Create Paint Mask</button><button id="paint-toggle">Paint</button><label>Size <input id="paint-size" type="range" min="2" max="128" value="48"></label><label>Falloff <input id="paint-falloff" type="range" min="0" max="100" value="75"></label><label>Value <input id="paint-value" type="range" min="0" max="255" value="255"></label></div><div id="brush-list" hidden><strong>Brushes</strong><button class="brush-preset active" data-size="48" data-falloff="75"><i class="brush-icon soft"></i><span>Soft</span></button><button class="brush-preset" data-size="36" data-falloff="0"><i class="brush-icon hard"></i><span>Hard</span></button><button class="brush-preset" data-size="12" data-falloff="35"><i class="brush-icon detail"></i><span>Detail</span></button></div><div id="sculpt-tools" hidden><label>Size <input id="sculpt-size" type="range" min="1" max="40" value="10"></label><label>Strength <input id="sculpt-strength" type="range" min="1" max="100" value="25"></label><label>Falloff <input id="sculpt-falloff" type="range" min="0" max="100" value="70"></label></div><div id="sculpt-brushes" hidden><strong>Sculpt</strong><button class="sculpt-brush active" data-sculpt="raise">Raise</button><button class="sculpt-brush" data-sculpt="lower">Lower</button><button class="sculpt-brush" data-sculpt="smooth">Smooth</button></div><button id="wire" title="Wireframe" aria-label="Wireframe"><ion-icon name="grid-outline"></ion-icon></button>',
    );
    let lastSubmitted = null,
      timer = null,
      generationToken = 0,
      disposed = false;
    const generateLatest = async (asset, revision) => {
      const token = ++generationToken;
      try {
        const graph = asset.data ?? asset.graph;
        const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        let textures = new Map(),
          materials = new Map();
        if (workspace) {
          const manager = new IEAssetManager(workspace.uri.fsPath);
          await manager.scan();
          textures = await resolveTerrainTextures(graph, manager);
          materials = await resolveTerrainMaterials(graph, manager);
        }
        if (disposed || token !== generationToken) return;
        const evaluator = new IETerrainGraphEvaluator(worldNodeRegistry, {
          maxResolution: 512,
          textures,
          materials,
        });
        const result = evaluator.evaluate(graph);
        if (!disposed && token === generationToken) {
          await panel.webview.postMessage({
            type: "generated",
            terrain: result.terrain,
            revision,
          });
        }
      } catch (error) {
        if (!disposed && token === generationToken) {
          await panel.webview.postMessage({
            type: "generationError",
            error: error.message,
            revision,
          });
        }
      }
    };
    const send = async () => {
      try {
        const asset = JSON.parse(document.getText());
        const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        let textureAssets = [];
        if (workspace) {
          const manager = new IEAssetManager(workspace.uri.fsPath);
          await manager.scan();
          textureAssets = manager.getAssets("texture");
        }
        await panel.webview.postMessage({
          type: "load",
          asset,
          definitions: worldNodeRegistry.getDefinitions(),
          textureAssets,
          uri: uriKey,
        });
        void generateLatest(asset, 0);
      } catch (error) {
        await panel.webview.postMessage({
          type: "error",
          error: error.message,
        });
      }
    };
    const watcher = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) return;
      if (event.document.getText() === lastSubmitted) {
        lastSubmitted = null;
        return;
      }
      send();
    });
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "ready") return send();
      if (message.type === "graphSelection") {
        await this.propertiesProvider?.syncActiveEditor();
        this.propertiesProvider?.setGraphSelection({
          uri: uriKey,
          selection: message.selection,
        });
        return;
      }
      if (message.type === "save") {
        const asset = JSON.parse(document.getText());
        asset.data = message.graph;
        lastSubmitted = JSON.stringify(asset, null, 4) + "\n";
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
          ),
          lastSubmitted,
        );
        await vscode.workspace.applyEdit(edit);
        clearTimeout(timer);
        timer = setTimeout(
          () => void generateLatest(asset, message.revision),
          180,
        );
      } else if (message.type === "generate") {
        const asset = JSON.parse(document.getText());
        void generateLatest(asset, message.revision);
      } else if (message.type === "createPaintTexture") {
        const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspace) throw new Error("Cannot locate the terrain workspace");
        const asset = JSON.parse(document.getText());
        const node = (asset.data?.nodes ?? []).find(
          (item) =>
            item.id === message.nodeId && item.type === "world.textureAsset",
        );
        const pin = node?.pins?.find(
          (item) => item.direction === "output" && item.name === "Texture",
        );
        if (!pin || pin.value)
          throw new Error("Select an empty Texture Asset node");
        const id = crypto.randomUUID();
        const name = `Terrain Paint ${id.slice(0, 8)}`;
        const folder = vscode.Uri.joinPath(
          workspace.uri,
          "Assets",
          "Terrain Paint Masks",
        );
        const textureUri = vscode.Uri.joinPath(folder, `${name}.ieasset`);
        const textureAsset = {
          id,
          name,
          type: "texture",
          data: {
            mimeType: "image/png",
            image: message.image,
            colorSpace: "linear",
            flipY: false,
            wrapS: 1000,
            wrapT: 1000,
            magFilter: 1006,
            minFilter: 1006,
            offset: [0, 0],
            repeat: [1, 1],
            center: [0, 0],
            rotation: 0,
          },
        };
        await vscode.workspace.fs.createDirectory(folder);
        await vscode.workspace.fs.writeFile(
          textureUri,
          Buffer.from(JSON.stringify(textureAsset, null, 4) + "\n"),
        );
        pin.value = id;
        lastSubmitted = JSON.stringify(asset, null, 4) + "\n";
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
          ),
          lastSubmitted,
        );
        await vscode.workspace.applyEdit(edit);
        await panel.webview.postMessage({
          type: "paintTextureCreated",
          nodeId: node.id,
          textureId: id,
          textureName: name,
          image: message.image,
        });
        void generateLatest(asset, ++generationToken);
      } else if (message.type === "loadPaintTexture") {
        const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspace) return;
        const manager = new IEAssetManager(workspace.uri.fsPath);
        await manager.scan();
        const texture = await manager.resolve({
          type: "texture",
          id: message.textureId,
        });
        if (texture?.data?.image)
          await panel.webview.postMessage({
            type: "paintTextureLoaded",
            textureId: texture.id,
            image: texture.data.image,
          });
      } else if (message.type === "savePaintTexture") {
        const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspace) return;
        const manager = new IEAssetManager(workspace.uri.fsPath);
        await manager.scan();
        const entry = manager.index.get(message.textureId);
        if (!entry) throw new Error("Paint texture asset not found");
        const texture = await manager.getAsset(message.textureId);
        texture.data.image = message.image;
        await vscode.workspace.fs.writeFile(
          vscode.Uri.file(entry.path),
          Buffer.from(JSON.stringify(texture, null, 4) + "\n"),
        );
        const asset = JSON.parse(document.getText());
        void generateLatest(asset, ++generationToken);
      }
    });
    const textureWatcher = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (
        saved.uri.toString() === document.uri.toString() ||
        !saved.fileName.endsWith(".ieasset")
      )
        return;
      // Asset manager resolves the saved texture reference on regeneration.
      try {
        const asset = JSON.parse(document.getText());
        if (
          (asset.data?.nodes ?? []).some(
            (node) => node.type === "world.textureAsset",
          )
        ) {
          void generateLatest(asset, generationToken + 1);
        }
      } catch {
        /* Invalid graph is reported by the normal editor flow. */
      }
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
  constructor(context, propertiesProvider) {
    this.context = context;
    this.propertiesProvider = propertiesProvider;
  }
  async generate(asset, panel, revision = 0, documentUri = null) {
    try {
      const graph = asset.data ?? asset.graph;
      const workspace = documentUri
        ? vscode.workspace.getWorkspaceFolder(documentUri)
        : null;
      let textures = new Map(),
        materials = new Map();
      if (!workspace)
        throw new Error("Cannot locate workspace for terrain assets");
      if (workspace) {
        const manager = new IEAssetManager(workspace.uri.fsPath);
        await manager.scan();
        textures = await resolveTerrainTextures(graph, manager);
        materials = await resolveTerrainMaterials(graph, manager);
      }
      const evaluator = new IETerrainGraphEvaluator(worldNodeRegistry, {
        maxResolution: 512,
        textures,
        materials,
      });
      const result = evaluator.evaluate(graph);
      panel.webview.postMessage({
        type: "generated",
        terrain: result.terrain,
        revision,
      });
    } catch (error) {
      panel.webview.postMessage({
        type: "generationError",
        error: error.message,
        revision,
      });
    }
  }
}
IEWorldEditor.panels = new Map();
module.exports = IEWorldEditor;
