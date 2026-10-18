// @ts-nocheck

import { materialNodeRegistry } from
    '../IEMaterialNodeRegistry.mjs';

const registerValue = (
    type,
    name,
    valueType,
    defaultValue,
    category = 'Values'
) => {
    materialNodeRegistry.register(type, {
        name,
        category,

        inputs: [],

        outputs: [{
            name: 'Value',
            type: valueType,
            default: defaultValue,
            ...(valueType === 'asset'
                ? { assetType: 'texture' }
                : {})
        }],

        compile({ node, output }) {
            const pin = node.pins.find(
                p => p.direction === 'output' &&
                     p.name === output
            );

            if (!pin) {
                throw new Error(
                    `Missing output ${output} on ${type}`
                );
            }

            return structuredClone(pin.value);
        }
    });
};

registerValue(
    'material.number', 'Number', 'number', 0
);

registerValue(
    'material.color', 'Color', 'color', '#ffffff'
);

registerValue(
    'material.boolean', 'Boolean', 'boolean', false
);

registerValue(
    'material.vector2', 'Vector2', 'vector2', [1, 1]
);
