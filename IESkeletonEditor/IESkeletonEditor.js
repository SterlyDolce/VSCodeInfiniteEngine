// @ts-nocheck

const vscode = require('vscode');
const fs = require('fs');
const crypto = require('crypto');

class IESkeletonEditor {
    static editors = new Map();
    static outlinerProvider = null;

    constructor(context, propertiesProvider) {
        this.context = context;
        this.propertiesProvider = propertiesProvider;
    }

    async resolveCustomTextEditor(document, panel) {
        const uri = document.uri.toString();
        const root = vscode.Uri.joinPath(
            this.context.extensionUri,
            'IESkeletonEditor'
        );
        const resource = (...parts) => panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, ...parts)
        ).toString();

        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                root,
                vscode.Uri.joinPath(this.context.extensionUri, 'Shared'),
                vscode.Uri.joinPath(this.context.extensionUri, 'node_modules')
            ]
        };

        let html = fs.readFileSync(
            vscode.Uri.joinPath(root, 'index.html').fsPath,
            'utf8'
        );
        const replacements = {
            '{{SHARED_STYLE_URI}}': resource('Shared', 'ui.css'),
            '{{SHARED_UI_URI}}': resource('Shared', 'ui.js'),
            '{{SCRIPT_URI}}': resource('IESkeletonEditor', 'script.mjs'),
            '{{THREE_URI}}': resource(
                'node_modules', 'three', 'build', 'three.module.js'
            ),
            '{{THREE_ADDONS_URI}}': resource(
                'node_modules', 'three', 'examples', 'jsm'
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
                asset.type !== 'skeleton' ||
                !Array.isArray(asset.data?.bones) ||
                !Array.isArray(asset.data?.boneInverses)
            ) {
                throw new Error('Invalid Skeleton IEAsset');
            }
            asset.data.nodes ??= [];
            if (!Array.isArray(asset.data.nodes)) {
                throw new Error('Invalid skeleton node hierarchy');
            }
            validateData(asset.data);
            return asset;
        };

        this.select = async nodeId => {
            const node = this.asset.data.nodes.find(item => item.id === nodeId);
            if (!node) return;
            await panel.webview.postMessage({ type: 'selectNode', nodeId });
            this.propertiesProvider.setSkeletonSelection({
                uri,
                nodeId,
                node: structuredClone(node),
                boneIndex: this.asset.data.bones.indexOf(node.id),
                inverse: this.asset.data.boneInverses[
                    this.asset.data.bones.indexOf(node.id)
                ] ?? null
            });
        };

        this.updateProperty = async (nodeId, property, value) => {
            await panel.webview.postMessage({
                type: 'updateSkeletonProperty',
                nodeId,
                property,
                value
            });
        };

        const validateData = data => {
            if (
                !data ||
                !Array.isArray(data.nodes) ||
                !Array.isArray(data.bones) ||
                !Array.isArray(data.boneInverses)
            ) throw new Error('Invalid skeleton data');

            const ids = new Set();
            for (const node of data.nodes) {
                if (!node?.id || ids.has(node.id)) {
                    throw new Error('Skeleton node IDs must be unique');
                }
                ids.add(node.id);
                for (const [name, value, size] of [
                    ['position', node.position, 3],
                    ['quaternion', node.quaternion, 4],
                    ['scale', node.scale, 3]
                ]) {
                    if (!Array.isArray(value) || value.length !== size ||
                        !value.every(Number.isFinite)) {
                        throw new Error(`Invalid ${name}: ${node.name || node.id}`);
                    }
                }
            }
            for (const node of data.nodes) {
                if (node.parentId && !ids.has(node.parentId)) {
                    throw new Error(`Missing parent: ${node.parentId}`);
                }

                const visited = new Set([node.id]);
                let parentId = node.parentId;
                while (parentId) {
                    if (visited.has(parentId)) {
                        throw new Error(`Cyclic skeleton hierarchy: ${node.name || node.id}`);
                    }
                    visited.add(parentId);
                    parentId = data.nodes.find(item => item.id === parentId)?.parentId;
                }
            }
            if (data.bones.length !== data.boneInverses.length) {
                throw new Error('Bone inverse matrix count mismatch');
            }
            for (const id of data.bones) {
                const node = data.nodes.find(item => item.id === id);
                if (!node?.isBone) throw new Error(`Invalid bone: ${id}`);
            }
            for (const matrix of data.boneInverses) {
                if (!Array.isArray(matrix) || matrix.length !== 16 ||
                    !matrix.every(Number.isFinite)) {
                    throw new Error('Invalid inverse bind matrix');
                }
            }
        };

        this.asset = readAsset();
        this.documentUri = uri;
        this.panel = panel;
        IESkeletonEditor.editors.set(uri, this);
        IESkeletonEditor.outlinerProvider?.setSkeleton(this.asset, document.uri);

        let saving = Promise.resolve();
        const save = data => {
            saving = saving.catch(() => {}).then(async () => {
                validateData(data);
                const asset = readAsset();
                asset.data = data;
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
                    throw new Error('Could not update Skeleton IEAsset');
                }
                await document.save();
            });
            return saving;
        };

        const messages = panel.webview.onDidReceiveMessage(async message => {
            try {
                if (message.type === 'ready' || message.type === 'reload') {
                    this.asset = readAsset();
                    await panel.webview.postMessage({
                        type: 'load',
                        asset: this.asset
                    });
                } else if (message.type === 'save') {
                    await save(message.data);
                    this.asset.data = structuredClone(message.data);
                    await panel.webview.postMessage({ type: 'saved' });
                } else if (message.type === 'skeletonChanged') {
                    this.asset.data = structuredClone(message.data);
                    IESkeletonEditor.outlinerProvider?.setSkeleton(
                        this.asset,
                        document.uri
                    );
                    if (message.nodeId) await this.select(message.nodeId);
                }
            } catch (error) {
                await panel.webview.postMessage({
                    type: 'error',
                    message: error.message
                });
            }
        });

        panel.onDidDispose(() => {
            messages.dispose();
            IESkeletonEditor.editors.delete(uri);
            this.propertiesProvider.clearSkeletonSelection(uri);
        });
    }
}

module.exports = IESkeletonEditor;
