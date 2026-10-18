// @ts-nocheck

import { materialNodeRegistry } from
    '../IEMaterialNodeRegistry.mjs';

materialNodeRegistry.register('material.texture', {
    name: 'Texture',
    category: 'Assets',

    inputs: [],

    outputs: [{
        name: 'Texture',
        type: 'asset',
        assetType: 'texture',
        default: null
    }],

    compile({ node, output }) {
        const pin = node.pins.find(
            p => p.direction === 'output' &&
                 p.name === output
        );

        if (!pin) {
            throw new Error(`Missing Texture output: ${output}`);
        }

        return structuredClone(pin.value);
    }
});
