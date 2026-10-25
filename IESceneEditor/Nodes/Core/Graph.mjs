// @ts-nocheck
import { nodeRegistry } from '../../IENodeRegistry.mjs';

nodeRegistry.register('graph.reroute', {
    name: 'Reroute',
    category: 'Flow',
    inputs: [{ name: 'In', type: 'any', default: null }],
    outputs: [{ name: 'Out', type: 'any' }],
    evaluate({ readInput }) {
        return readInput('In');
    },
    onConnect({ node, input, output }) {
        if (input?.name !== 'In' || !output?.type) return;
        for (const pin of node.pins ?? []) pin.type = output.type;
    },
    onDisconnect({ node, input }) {
        if (input?.name !== 'In') return;
        for (const pin of node.pins ?? []) pin.type = 'any';
    }
});
