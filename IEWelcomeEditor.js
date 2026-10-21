// @ts-nocheck
const vscode = require('vscode');
const crypto = require('crypto');

class IEWelcomeEditor {
    static open(projectName = 'Infinite Engine') {
        const panel = vscode.window.createWebviewPanel(
            'infinite.welcome',
            `Welcome — ${projectName}`,
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        const nonce = crypto.randomBytes(16).toString('hex');
        panel.webview.html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width,initial-scale=1"><style nonce="${nonce}">
            :root{color-scheme:light dark}*{box-sizing:border-box}html,body{width:100%;height:100%}body{margin:0;font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)}main{width:min(720px,calc(100% - 48px));height:100%;min-height:520px;margin:0 auto;display:flex;flex-direction:column;align-items:center}.brand{flex:1;display:grid;place-items:end center;padding-bottom:72px;color:color-mix(in srgb,var(--vscode-foreground) 16%,transparent)}.brand svg{width:210px;height:215px}.actions{width:100%;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:max(72px,15vh)}.card{min-height:104px;padding:18px;border:1px solid color-mix(in srgb,var(--vscode-panel-border) 62%,transparent);border-radius:9px;text-align:left;color:inherit;background:color-mix(in srgb,var(--vscode-editorWidget-background) 58%,transparent);cursor:pointer;transition:border-color .12s ease,background .12s ease,transform .12s ease}.card:hover{border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground);transform:translateY(-1px)}.card:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:2px}.card strong,.card span{display:block}.card strong{margin-bottom:7px;font-size:13px}.card span{color:var(--vscode-descriptionForeground);font-size:12px;line-height:1.45}@media(max-width:680px){main{min-height:0}.brand{padding-bottom:38px}.brand svg{width:150px;height:154px}.actions{grid-template-columns:1fr;margin-bottom:32px}.card{min-height:82px}}
        </style></head><body><main><div class="brand" aria-label="Infinite Engine"><svg viewBox="0 0 1207 1233" fill="none" aria-hidden="true"><path d="M738.175 644.779L345.562 1097.5L139.062 657.5L738.175 644.779Z" fill="currentColor"/><path d="M465.562 589L862.562 137L1068.56 576L465.562 589Z" fill="currentColor"/></svg></div><div class="actions"><button class="card" data-action="scene"><strong>Open Main Scene</strong><span>Start building the default world.</span></button><button class="card" data-action="asset"><strong>Create an Asset</strong><span>Add terrain, actors, materials, scripts, and more.</span></button><button class="card" data-action="project"><strong>Project Settings</strong><span>Open the Infinite project definition.</span></button></div></main><script nonce="${nonce}">const vscode=acquireVsCodeApi();for(const button of document.querySelectorAll('[data-action]'))button.onclick=()=>vscode.postMessage({type:button.dataset.action});</script></body></html>`;
        panel.webview.onDidReceiveMessage(async message => {
            const workspace = vscode.workspace.workspaceFolders?.[0]?.uri;
            if (!workspace) return;
            if (message.type === 'scene') await vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(workspace, 'Scenes', 'Main.iescene'));
            else if (message.type === 'asset') await vscode.commands.executeCommand('infinite.createAsset', vscode.Uri.joinPath(workspace, 'Assets'));
            else if (message.type === 'project') await vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(workspace, 'Infinite.ieproject'));
        });
        return panel;
    }
}

module.exports = IEWelcomeEditor;
