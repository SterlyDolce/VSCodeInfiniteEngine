// @ts-nocheck

import { nodeRegistry } from '../IENodeRegistry.mjs';

nodeRegistry.register('scene.open', {
    name: 'Open Scene',
    category: 'Scene',
    description: 'Loads another scene. During play, it replaces the active gameplay scene.',
    inputs: [
        { name: 'Execute', type: 'execution' },
        {
            name: 'Scene',
            type: 'asset',
            assetType: 'scene',
            default: null
        }
    ],
    outputs: [
        { name: 'Then', type: 'execution' },
        { name: 'Failed', type: 'execution' }
    ],
    execute({ engine, readInput }) {
        if (!engine || typeof engine.openScene !== 'function') {
            return 'Failed';
        }

        return engine.openScene(readInput('Scene')) ? 'Then' : 'Failed';
    }
});
