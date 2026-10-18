// @ts-nocheck

import { nodeRegistry } from '../IENodeRegistry.mjs';

nodeRegistry.register('function.entry', {
    name: 'Function Entry',
    category: 'Functions',
    inputs: [],
    outputs: [
        { name: 'exec', type: 'execution' }
    ]
});

nodeRegistry.register('function.return', {
    name: 'Function Return',
    category: 'Functions',
    inputs: [
        { name: 'exec', type: 'execution' }
    ],
    outputs: []
});

nodeRegistry.register('function.call', {
    name: 'Call Function',
    category: 'Functions',
    inputs: [
        { name: 'exec', type: 'execution' }
    ],
    outputs: [
        { name: 'then', type: 'execution' }
    ]
});
