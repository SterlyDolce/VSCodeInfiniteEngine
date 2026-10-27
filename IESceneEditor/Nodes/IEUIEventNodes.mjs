// @ts-nocheck

const PREFIX = 'ui.event:';
const EVENT_TYPES = new Set(['clicked', 'pressed', 'released', 'hovered', 'changed']);

function createDefinition(asset, widget, event) {
    const eventType = String(event.type ?? '').toLowerCase();
    if (!EVENT_TYPES.has(eventType) || !event.id || !event.name?.trim()) return null;
    const outputName = eventType[0].toUpperCase() + eventType.slice(1);
    const outputs = [{ name: outputName, type: 'execution' }];
    if (eventType === 'changed') {
        if (widget.type === 'checkbox') {
            outputs.push({ name: 'Checked', type: 'boolean' });
        } else if (widget.type === 'input') {
            outputs.push({ name: 'Value', type: 'string' });
        } else {
            outputs.push({ name: 'Value', type: 'any' });
        }
    }
    return {
        type: `${PREFIX}${asset.id}:${event.id}`,
        definition: {
            name: event.name.trim(),
            category: 'User Interface Events',
            event: true,
            uiEvent: {
                uiId: asset.id,
                widgetId: widget.id,
                eventType,
                outputName
            },
            inputs: [],
            outputs,
            evaluate({ output, state }) {
                const interaction = state.widgetEvent ?? {};
                if (output === 'Value') return interaction.value ?? null;
                if (output === 'Checked') return Boolean(interaction.checked);
                throw new Error(`Unknown UI event output: ${output}`);
            }
        }
    };
}

export function registerUIEventAssets(assets, registry) {
    const registered = [];
    for (const asset of assets ?? []) {
        if (asset?.type !== 'ui' || !asset.id) continue;
        for (const widget of asset.data?.elements ?? []) {
            for (const event of widget.events ?? []) {
                const entry = createDefinition(asset, widget, event);
                if (!entry) continue;
                if (registry.has(entry.type)) registry.nodes.set(entry.type, { ...entry.definition, type: entry.type });
                else registry.register(entry.type, entry.definition);
                registered.push(entry.type);
            }
        }
    }
    return registered;
}

export async function registerUIEventNodes(assetManager, registry) {
    const assets = await Promise.all(
        assetManager.getAssets('ui').map(entry => assetManager.getAsset(entry.id))
    );
    return registerUIEventAssets(assets.filter(Boolean), registry);
}

export function isUIEventNode(type) {
    return typeof type === 'string' && type.startsWith(PREFIX);
}
