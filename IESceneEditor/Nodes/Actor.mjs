// @ts-nocheck

import { nodeRegistry } from '../IENodeRegistry.mjs';

const componentTypes = [
    'mesh',
    'camera',
    'springArm',
    'rigidBody',
    'collider',
    'pointLight',
    'directionalLight',
    'spotLight'
];

nodeRegistry.register('actor.addComponent', {
    name: 'Add Component',
    category: 'Actor',
    description: 'Adds a component to an actor at runtime.',
    inputs: [
        { name: 'Execute', type: 'execution' },
        { name: 'Actor', type: 'actor' },
        {
            name: 'Component Type',
            type: 'string',
            default: 'mesh',
            editor: {
                type: 'enum',
                options: componentTypes
            }
        }
    ],
    outputs: [
        { name: 'Then', type: 'execution' },
        { name: 'Component', type: 'component' }
    ],
    execute({ engine, node, readInput, setReferenceResult }) {
        const actor = readInput('Actor');
        const type = readInput('Component Type');
        const component = engine.addComponent(actor, type);
        setReferenceResult(node.id, component);
        return 'Then';
    },
    evaluate({ node, getReferenceResult }) {
        return getReferenceResult(node.id);
    }
});
