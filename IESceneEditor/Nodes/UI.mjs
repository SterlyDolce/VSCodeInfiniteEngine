// @ts-nocheck
import { nodeRegistry } from '../IENodeRegistry.mjs';

nodeRegistry.register('ui.show', {
    name: 'Show UI',
    category: 'User Interface',
    inputs: [
        { name: 'Execute', type: 'execution' },
        { name: 'UI', type: 'asset', assetType: 'ui', default: null }
    ],
    outputs: [
        { name: 'Then', type: 'execution' },
        { name: 'Failed', type: 'execution' }
    ],
    execute({ readInput, engine }) {
        return engine.showUI(readInput('UI')) ? 'Then' : 'Failed';
    }
});

nodeRegistry.register('ui.hide', {
    name: 'Hide UI',
    category: 'User Interface',
    inputs: [
        { name: 'Execute', type: 'execution' },
        { name: 'UI', type: 'asset', assetType: 'ui', default: null }
    ],
    outputs: [
        { name: 'Then', type: 'execution' }
    ],
    execute({ readInput, engine }) {
        engine.hideUI(readInput('UI'));
        return 'Then';
    }
});

nodeRegistry.register('ui.setText', {
    name: 'Set UI Text',
    category: 'User Interface',
    inputs: [
        { name: 'Execute', type: 'execution' },
        { name: 'UI', type: 'asset', assetType: 'ui', default: null },
        { name: 'Widget', type: 'string', default: '' },
        { name: 'Text', type: 'string', default: '' }
    ],
    outputs: [
        { name: 'Then', type: 'execution' },
        { name: 'Not Found', type: 'execution' }
    ],
    execute({ readInput, engine }) {
        return engine.setUIText(
            readInput('UI'),
            readInput('Widget'),
            readInput('Text')
        ) ? 'Then' : 'Not Found';
    }
});

nodeRegistry.register('ui.bindValue', {
    name: 'Bind UI Value',
    category: 'User Interface',
    inputs: [
        { name: 'Execute', type: 'execution' },
        { name: 'UI', type: 'asset', assetType: 'ui', default: null },
        { name: 'Widget', type: 'string', default: '' },
        {
            name: 'Property',
            type: 'string',
            default: 'Text',
            editor: {
                type: 'enum',
                options: [
                    'Text', 'Checked', 'Position', 'Display', 'Opacity',
                    'Color', 'Background', 'Image'
                ]
            }
        },
        { name: 'Value', type: 'any', default: null }
    ],
    outputs: [
        { name: 'Then', type: 'execution' },
        { name: 'Not Found', type: 'execution' }
    ],
    execute({ bindUIValue }) {
        return bindUIValue?.() ? 'Then' : 'Not Found';
    }
});
