// @ts-nocheck
const { worldNodeRegistry } = require('./WorldNodeRegistry');

class IETerrainGraphEvaluator {
    constructor(registry = worldNodeRegistry, options = {}) { this.registry = registry; this.maxResolution = options.maxResolution ?? 256; this.textures = options.textures ?? new Map(); }
    validate(graph) {
        const errors = [], nodes = graph?.nodes ?? [], links = graph?.links ?? [];
        if (!Array.isArray(nodes) || !Array.isArray(links)) return { valid: false, errors: ['Graph nodes and links must be arrays'] };
        const ids = new Set(), pins = new Map(), incoming = new Map();
        for (const node of nodes) {
            if (!node.id || ids.has(node.id)) errors.push(`Duplicate or missing node UUID: ${node.id ?? '<missing>'}`); ids.add(node.id);
            if (!this.registry.get(node.type)) errors.push(`Unknown world node: ${node.type}`);
            for (const pin of node.pins ?? []) {
                if (!pin.id || ids.has(pin.id)) errors.push(`Duplicate or missing pin UUID: ${pin.id ?? '<missing>'}`);
                ids.add(pin.id);
                pins.set(pin.id, { node, pin });
            }
        }
        for (const link of links) {
            if (!link.id || ids.has(link.id)) errors.push(`Duplicate or missing link UUID: ${link.id ?? '<missing>'}`); ids.add(link.id);
            const from = pins.get(link.from), to = pins.get(link.to);
            if (!from || !to) { errors.push(`Broken connection: ${link.id}`); continue; }
            if (from.pin.direction !== 'output' || to.pin.direction !== 'input') errors.push(`Invalid connection direction: ${link.id}`);
            if (from.pin.type !== to.pin.type) errors.push(`Incompatible connection: ${from.pin.type} → ${to.pin.type}`);
            if (incoming.has(link.to)) errors.push(`Input has multiple connections: ${to.pin.name}`); else incoming.set(link.to, link.from);
        }
        const outputs = nodes.filter(node => node.type === 'world.terrainOutput');
        if (outputs.length !== 1) errors.push('Terrain graph requires exactly one Terrain Output node');
        if (outputs.length === 1) {
            const visiting = new Set(), visited = new Set();
            const visit = node => { if (visiting.has(node.id)) { errors.push('Terrain graph contains a cyclic dependency'); return; } if (visited.has(node.id)) return; visiting.add(node.id);
                for (const pin of node.pins ?? []) { const source = pins.get(incoming.get(pin.id)); if (source) visit(source.node); }
                visiting.delete(node.id); visited.add(node.id); };
            visit(outputs[0]);
        }
        return { valid: errors.length === 0, errors };
    }
    evaluate(graph) {
        const validation = this.validate(graph); if (!validation.valid) throw new Error(validation.errors.join('\n'));
        const nodes = graph.nodes, pinIndex = new Map(), incoming = new Map(), cache = new Map();
        for (const node of nodes) for (const pin of node.pins ?? []) pinIndex.set(pin.id, { node, pin });
        for (const link of graph.links) incoming.set(link.to, link.from);
        const evaluateNode = node => { if (cache.has(node.id)) return cache.get(node.id); const definition = this.registry.get(node.type);
            const result = definition.evaluate({ maxResolution: this.maxResolution, node, resolveTexture: reference => { const texture = this.textures.get(typeof reference === 'string' ? reference : reference?.id); if (!texture) throw new Error(`Texture data is unavailable: ${reference?.name ?? (typeof reference === 'string' ? reference : reference?.id)}`); return texture; }, read: name => { const pin = node.pins.find(p => p.direction === 'input' && p.name === name); if (!pin) throw new Error(`${definition.name} is missing input ${name}`); const source = pinIndex.get(incoming.get(pin.id)); if (!source) return pin.value; return evaluateNode(source.node)[source.pin.name]; } });
            cache.set(node.id, result); return result; };
        const output = nodes.find(node => node.type === 'world.terrainOutput');
        return { terrain: evaluateNode(output).Terrain, evaluatedNodeIds: [...cache.keys()], errors: [] };
    }
}
module.exports = IETerrainGraphEvaluator;
