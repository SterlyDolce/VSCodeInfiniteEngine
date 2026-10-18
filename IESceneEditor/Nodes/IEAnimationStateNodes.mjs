// @ts-nocheck

/**
 * Infinite Engine — Dynamic Animation Script Nodes
 *
 * Each animationState .ieasset becomes a node:
 *
 *   Animation Scripts
 *      └── ArmsanimationState
 *
 * Inputs are generated from asset.data.parameters.
 * Output type is "animationstate".
 */

const PREFIX = 'animationstate.asset:';

const PARAMETER_TYPES = new Set([
    'number',
    'boolean',
    'trigger'
]);

function getDefault(parameter) {
    if (Object.hasOwn(parameter, 'default')) {
        return parameter.default;
    }

    return parameter.type === 'number' ? 0 : false;
}

function createDefinition(asset) {
    if (
        asset?.type !== 'animationState' ||
        typeof asset.id !== 'string' ||
        !Array.isArray(asset.data?.parameters)
    ) {
        throw new Error(
            `Invalid animation script: ${asset?.name ?? 'Unknown'}`
        );
    }

    const parameters = asset.data.parameters;

    const names = new Set();

    const inputs = parameters.map(parameter => {
        if (
            typeof parameter.name !== 'string' ||
            !parameter.name.trim() ||
            names.has(parameter.name) ||
            !PARAMETER_TYPES.has(parameter.type)
        ) {
            throw new Error(
                `Invalid parameter in ${asset.name}`
            );
        }

        names.add(parameter.name);

        return {
            name: parameter.name,

            // A trigger is represented by a boolean
            // input pin. Its trigger semantics are
            // preserved in the asset's parameter type.
            type: parameter.type === 'trigger'
                ? 'boolean'
                : parameter.type,

            default: getDefault(parameter)
        };
    });

    const type = PREFIX + asset.id;

    return {
        type,
        definition: {
            name: asset.name,
            category: 'Animation Scripts',

            inputs,

            outputs: [
                {
                    name: 'Animation State',
                    type: 'animationstate'
                }
            ],

            // Called when the graph requests this
            // node's Animation State output.
            evaluate({ output, readInput }) {
                if (output !== 'Animation State') {
                    throw new Error(
                        `Unknown animation output: ${output}`
                    );
                }

                const values = {};

                for (const parameter of parameters) {
                    values[parameter.name] =
                        readInput(parameter.name);
                }

                return {
                    type: 'animationstate',

                    assetId: asset.id,

                    parameters: values
                };
            }
        }
    };
}

/**
 * Register animationState assets into a registry.
 *
 * A project-specific registry is recommended so
 * assets from different projects remain isolated.
 */

export async function registeranimationStateNodes(
    assetManager,
    registry
) {
    const entries =
        assetManager.getAssets('animationState');

    const assets = await Promise.all(
        entries.map(entry =>
            assetManager.resolve({
                type: 'animationState',
                id: entry.id
            })
        )
    );

    return registeranimationStateAssets(
        assets.filter(Boolean),
        registry
    );
}


export function isanimationStateNode(type) {
    return typeof type === 'string' &&
        type.startsWith(PREFIX);
}



/**
 * Register already-resolved Animation Script assets.
 *
 * Used by the scene webview, where the extension host
 * has already resolved the .ieasset files.
 */
export function registeranimationStateAssets(
    assets,
    registry
) {
    const registered = [];

    for (const asset of assets ?? []) {
        if (asset?.type !== 'animationState') {
            continue;
        }

        const { type, definition } =
            createDefinition(asset);

        if (registry.has(type)) {
            // Refresh an existing dynamic definition.
            registry.nodes.set(type, {
                ...definition,
                type,
                inputs: definition.inputs,
                outputs: definition.outputs
            });
        } else {
            registry.register(type, definition);
        }

        registered.push(type);
    }

    return registered;
}
