// @ts-nocheck

const vscode = require('vscode');
const fs = require('fs');
const crypto = require('crypto');
const IEAssetManager = require('../IEAssetManager');

class IEAnimationEditor {
    constructor(context, propertiesProvider) {
        this.context = context;
        this.propertiesProvider = propertiesProvider;
    }

    async resolveCustomTextEditor(document, panel) {
        const root = vscode.Uri.joinPath(
            this.context.extensionUri,
            'IEAnimationEditor'
        );

        const resource = (...parts) =>
            panel.webview.asWebviewUri(
                vscode.Uri.joinPath(
                    this.context.extensionUri,
                    ...parts
                )
            ).toString();

        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                root,
                vscode.Uri.joinPath(
                    this.context.extensionUri,
                    'node_modules'
                )
            ]
        };

        let html = fs.readFileSync(
            vscode.Uri.joinPath(root, 'index.html').fsPath,
            'utf8'
        );

        const replacements = {
            '{{STYLE_URI}}': resource(
                'IEAnimationEditor', 'style.css'
            ),
            '{{SCRIPT_URI}}': resource(
                'IEAnimationEditor', 'script.mjs'
            ),
            '{{THREE_URI}}': resource(
                'node_modules', 'three',
                'build', 'three.module.js'
            ),
            '{{THREE_ADDONS_URI}}': resource(
                'node_modules', 'three',
                'examples', 'jsm'
            ) + '/',
            '{{CSP_SOURCE}}': panel.webview.cspSource,
            '{{NONCE}}': crypto.randomBytes(16).toString('hex')
        };

        for (const [key, value] of Object.entries(replacements)) {
            html = html.replaceAll(key, value);
        }

        panel.webview.html = html;

        const readAsset = () => {
            const asset = JSON.parse(document.getText());

            if (
                asset.type !== 'animation' ||
                !Array.isArray(asset.data?.tracks)
            ) {
                throw new Error('Invalid Animation IEAsset');
            }

            return asset;
        };

        const postAsset = async () => {
            try {
                await panel.webview.postMessage({
                    type: 'loadAnimation',
                    asset: readAsset()
                });
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Animation load failed: ${error.message}`
                );
            }
        };

        const resolvePreviewActor = async () => {
            const workspace = vscode.workspace.getWorkspaceFolder(
                document.uri
            );

            if (!workspace) {
                throw new Error('No workspace found');
            }

            const manager = new IEAssetManager(
                workspace.uri.fsPath
            );

            await manager.scan();

            const entries = manager.getAssets('actor');

            const choices = await Promise.all(
                entries.map(async entry => {
                    const asset = await manager.resolve({
                        type: 'actor',
                        id: entry.id
                    });

                    return asset ? {
                        label: asset.name || asset.data?.name || 'Actor',
                        description: entry.id,
                        asset
                    } : null;
                })
            );

            const picked = await vscode.window.showQuickPick(
                choices.filter(Boolean),
                {
                    placeHolder: 'Choose an Actor for animation preview',
                    matchOnDescription: true
                }
            );

            if (!picked) return;

            const actor = structuredClone(picked.asset.data);

            for (const component of actor.components ?? []) {
                if (component.type !== 'mesh') continue;

                const geometry = await manager.resolve(
                    component.geometry
                );

                component.resolvedGeometry =
                    geometry?.type === 'geometry'
                        ? geometry.data
                        : null;

                if (component.skinned && component.skeleton) {
                    const skeleton = await manager.resolve(
                        component.skeleton
                    );

                    if (!skeleton || skeleton.type !== 'skeleton') {
                        throw new Error(
                            `Skeleton not found: ${component.name}`
                        );
                    }

                    component.resolvedSkeleton = skeleton.data;
                }
            }

            await panel.webview.postMessage({
                type: 'loadPreviewActor',
                actor
            });
        };

        let saving = Promise.resolve();

        const saveTracks = tracks => {
            saving = saving.catch(() => {}).then(async () => {
                const asset = readAsset();

                if (!Array.isArray(tracks)) {
                    throw new Error('Invalid animation tracks');
                }

                if (tracks.length !== asset.data.tracks.length) {
                    throw new Error('Track count changed unexpectedly');
                }

                for (let i = 0; i < tracks.length; i++) {
                    const original = asset.data.tracks[i];
                    const updated = tracks[i];

                    if (
                        updated.name !== original.name ||
                        updated.type !== original.type ||
                        !Array.isArray(updated.times) ||
                        !Array.isArray(updated.values) ||
                        updated.times.length !== original.times.length ||
                        updated.values.length !== original.values.length ||
                        !updated.values.every(Number.isFinite)
                    ) {
                        throw new Error('Invalid keyframe edit');
                    }
                }

                asset.data.tracks = tracks;

                const edit = new vscode.WorkspaceEdit();

                edit.replace(
                    document.uri,
                    new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(document.getText().length)
                    ),
                    JSON.stringify(asset, null, 4) + '\n'
                );

                if (!await vscode.workspace.applyEdit(edit)) {
                    throw new Error('Could not update Animation IEAsset');
                }

                await document.save();
            });

            return saving;
        };

        const subscription = panel.webview.onDidReceiveMessage(
            async message => {
                try {
                    const action = message.type === 'onGraphUpdate'
                        ? message.action
                        : message.type;
                    switch (action) {
                        case 'ready':
                            await postAsset();
                            break;

                        case 'choosePreviewActor':
                            await resolvePreviewActor();
                            break;

                        case 'saveTracks':
                            await saveTracks(message.tracks);
                            await panel.webview.postMessage({
                                type: 'saved'
                            });
                            break;
                    }
                } catch (error) {
                    console.error(error);

                    await panel.webview.postMessage({
                        type: 'error',
                        message: error.message
                    });
                }
            }
        );

        // Reload for external changes, but avoid discarding
        // the user's editing state after our own save.
        let lastText = document.getText();

        const watcher = vscode.workspace.onDidChangeTextDocument(
            event => {
                if (
                    event.document.uri.toString() !==
                    document.uri.toString()
                ) return;

                const text = document.getText();

                if (text === lastText) return;

                lastText = text;
                // Don't automatically overwrite local edits.
                // Explicit reload is available in the UI.
            }
        );

        panel.onDidDispose(() => {
            subscription.dispose();
            watcher.dispose();
        });
    }
}

module.exports = IEAnimationEditor;
