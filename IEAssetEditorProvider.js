// @ts-nocheck

const vscode = require('vscode');
const path = require('path');
const { getTemplates, createTemplate } = require('./IEActorAssetEditor/IEAssetTemplates');

class IEAssetEditorProvider {
    static editors = new Map();

    constructor(context, propertiesProvider) {
        this.context = context;
        this.propertiesProvider = propertiesProvider;
    }

    static register(type, EditorClass) {
        this.editors.set(type, EditorClass);
    }

    static getEditor(type) {
        return this.editors.get(type);
    }


    async resolveCustomTextEditor(document, panel) {
        let asset;
        const originalText = document.getText();
        const isEmpty = originalText.trim() === '';

        try {
            asset = isEmpty ? null : JSON.parse(originalText);
        } catch {
            asset = null;
        }

        const isValid =
            asset &&
            typeof asset === 'object' &&
            !Array.isArray(asset) &&
            typeof asset.id === 'string' &&
            typeof asset.type === 'string' &&
            asset.data &&
            typeof asset.data === 'object' &&
            !Array.isArray(asset.data) &&
            (
                asset.type === 'script'
                    ? Array.isArray(asset.data.nodes) &&
                    Array.isArray(asset.data.links) &&
                    Array.isArray(asset.data.variables) &&
                    Array.isArray(asset.data.functions)
                    : asset.type === 'actor'
                        ? Array.isArray(asset.data.components)
                        : true
            ) &&
            IEAssetEditorProvider.getEditor(asset.type);


        if (!isValid) {
            const templates = getTemplates().filter(
                template => IEAssetEditorProvider.getEditor(
                    template.type
                )
            );

            if (!templates.length) {
                this.renderError(
                    panel,
                    'No Infinite Asset templates are registered.'
                );
                return;
            }

            const IEAssetCreator = require(
                './IEAssetCreator/IEAssetCreator'
            );

            const selection = await IEAssetCreator.open(
                this.context
            );

            if (!selection) {
                this.renderError(
                    panel,
                    'Asset creation cancelled. Reopen this file to try again.'
                );
                return;
            }

            // Verify that this type has a registered editor.
            const template = templates.find(
                item => item.type === selection.type
            );

            if (!template) {
                this.renderError(
                    panel,
                    `No editor registered for asset type: ${selection.type}`
                );
                return;
            }

            // Never overwrite invalid existing data without permission.
            if (!isEmpty) {
                const confirmation =
                    await vscode.window.showWarningMessage(
                        'This file contains invalid or unsupported asset data. Replace its contents with a new template?',
                        { modal: true },
                        'Replace'
                    );

                if (confirmation !== 'Replace') {
                    this.renderError(
                        panel,
                        'The original asset was left unchanged.'
                    );
                    return;
                }
            }

            // Keep the filename as the asset name so they match.
            const name = path.basename(
                document.uri.fsPath,
                path.extname(document.uri.fsPath)
            );

            const newAsset = createTemplate(
                selection.type,
                name
            );

            // Protect against changes while the grid was open.
            if (document.getText() !== originalText) {
                this.renderError(
                    panel,
                    'The asset changed while selecting a template.'
                );
                return;
            }

            const edit = new vscode.WorkspaceEdit();

            edit.replace(
                document.uri,
                new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(originalText.length)
                ),
                JSON.stringify(newAsset, null, 4) + '\n'
            );

            const applied = await vscode.workspace.applyEdit(edit);

            if (!applied) {
                this.renderError(
                    panel,
                    'Failed to create the Infinite Asset.'
                );
                return;
            }

            asset = newAsset;
        }


        const EditorClass =
            IEAssetEditorProvider.getEditor(asset.type);

        if (!EditorClass) {
            this.renderError(
                panel,
                `No editor registered for asset type: ${asset.type}`
            );
            return;
        }

        const editor = new EditorClass(
            this.context,
            this.propertiesProvider
        );

        await editor.resolveCustomTextEditor(document, panel);
    }


    renderError(panel, message) {
        const escape = value => String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');

        panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline';">
    <title>Infinite Asset Editor</title>
</head>
<body style="
    padding: 20px;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
">
    <h3>${escape(message)}</h3>
</body>
</html>`;
    }
}

module.exports = IEAssetEditorProvider;
