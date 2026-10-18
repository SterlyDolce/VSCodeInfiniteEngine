// @ts-nocheck

import { nodeRegistry } from '../IENodeRegistry.mjs';

nodeRegistry.register('animation.play', {
    name: 'Play Animation',
    category: 'Animation',

    inputs: [
        { name: 'Execute', type: 'execution' },
        { name: 'Mesh', type: 'mesh' },
        {
            name: 'Animation',
            type: 'asset',
            assetType: 'animation',
            default: null
        },
        {
            name: 'Loop',
            type: 'boolean',
            default: false
        },
        {
            name: 'Speed',
            type: 'number',
            default: 1
        }
    ],

    outputs: [
        { name: 'Then', type: 'execution' },
        { name: 'On End', type: 'execution' },
        { name: 'Failed', type: 'execution' }
    ],

    execute({ readInput, engine, fireOutput }) {
        const mesh = readInput('Mesh');
        const animation = readInput('Animation');
        const loop = readInput('Loop');
        const speed = readInput('Speed');

        if (!mesh?.isSkinnedMesh || !animation) {
            return 'Failed';
        }

        try {
            engine.playAnimation(mesh, animation, {
                loop,
                speed,

                onEnd: () => {
                    fireOutput('On End');
                }
            });

            return 'Then';
        } catch (error) {
            console.error(
                '[IE] Play Animation failed:',
                error
            );

            return 'Failed';
        }
    }
});


nodeRegistry.register('animationstate.play', {
    name: 'Play Animation State',
    category: 'Animation',

    inputs: [
        { name: 'Execute', type: 'execution' },
        { name: 'Mesh', type: 'mesh' },
        {
            name: 'Animation State',
            type: 'animationstate',
            default: null
        }
    ],

    outputs: [
        { name: 'Then', type: 'execution' },
        { name: 'Failed', type: 'execution' }
    ],

    execute({ readInput, engine }) {
        const mesh = readInput('Mesh');
        const animationState = readInput('Animation State');

        if (!mesh?.isSkinnedMesh || !animationState) {
            return 'Failed';
        }

        try {
            engine.playAnimationState(
                mesh,
                animationState
            );

            return 'Then';

        } catch (error) {
            console.error(
                '[IE] Play Animation State failed:',
                error
            );

            return 'Failed';
        }
    }
});
