// @ts-nocheck

export class IUGRuntime {
    constructor(canvas) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.assets = new Map();
        this.visible = new Map();
        this.images = new Map();
        this.textures = new Map();
        this.fonts = new Map();
        this.pixelRatio = 1;
        this.layouts = [];
        this.hovered = null;
        this.pressed = null;
        this.focused = null;
        this.interactionHandler = null;
        this.inputEnabled = false;

        canvas.tabIndex = 0;
        canvas.addEventListener('pointermove', event => this.pointerMove(event));
        canvas.addEventListener('pointerdown', event => this.pointerDown(event));
        canvas.addEventListener('pointerup', event => this.pointerUp(event));
        canvas.addEventListener('keydown', event => this.keyDown(event));
    }

    setInteractionHandler(handler) {
        this.interactionHandler = handler;
    }

    emit(type, hit) {
        if (!hit) return;
        this.interactionHandler?.({
            type,
            ui: hit.uiId,
            widget: hit.item.id,
            widgetName: hit.item.name || '',
            widgetType: hit.item.type,
            value: hit.item.type === 'checkbox'
                ? Boolean(hit.item.checked)
                : (hit.item.text ?? hit.item.value ?? ''),
            checked: Boolean(hit.item.checked)
        });
    }

    sameHit(a, b) {
        return Boolean(a && b && a.uiId === b.uiId && a.item.id === b.item.id);
    }

    hitTest(event) {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const x = (event.clientX - rect.left) * (this.canvas.width / this.pixelRatio / rect.width);
        const y = (event.clientY - rect.top) * (this.canvas.height / this.pixelRatio / rect.height);

        for (let index = this.layouts.length - 1; index >= 0; index--) {
            const layout = this.layouts[index];
            const localX = (x - layout.x) / layout.scale;
            const localY = (y - layout.y) / layout.scale;
            const elements = [...(layout.document.elements ?? [])]
                .sort((a, b) => (b.z || 0) - (a.z || 0));
            for (const item of elements) {
                if (!this.isDisplayed(layout.document, item)) continue;
                if (!['button', 'input', 'checkbox'].includes(item.type)) continue;
                if (item.type === 'button' && item.enabled === false) continue;
                if (localX >= item.x && localX <= item.x + item.width &&
                    localY >= item.y && localY <= item.y + item.height) {
                    return { uiId: layout.uiId, item };
                }
            }
        }
        return null;
    }

    isDisplayed(document, item) {
        const visited = new Set();
        let current = item;
        while (current) {
            if (
                current.display === false ||
                current.display === 'none'
            ) return false;
            if (visited.has(current.id)) return false;
            visited.add(current.id);
            current = current.parent
                ? document.elements?.find(entry => entry.id === current.parent)
                : null;
        }
        return true;
    }

    pointerMove(event) {
        const hit = this.hitTest(event);
        this.canvas.style.cursor = hit?.item.type === 'input' ? 'text' : (hit ? 'pointer' : '');
        if (!this.sameHit(hit, this.hovered)) {
            this.hovered = hit;
            this.emit('hovered', hit);
            this.render();
        }
    }

    pointerDown(event) {
        const hit = this.hitTest(event);
        if (!hit) return;
        event.preventDefault();
        this.canvas.focus();
        this.pressed = hit;
        this.focused = hit.item.type === 'input' ? hit : null;
        this.emit('pressed', hit);
        this.render();
    }

    pointerUp(event) {
        const hit = this.hitTest(event);
        const pressed = this.pressed;
        this.pressed = null;
        this.render();
        if (!pressed) return;
        this.emit('released', pressed);
        if (!this.sameHit(hit, pressed)) return;
        if (hit.item.type === 'checkbox') {
            hit.item.checked = !hit.item.checked;
            this.render();
            this.emit('changed', hit);
        }
        this.emit('clicked', hit);
    }

    keyDown(event) {
        const hit = this.focused;
        if (!hit) return;
        event.stopPropagation();
        if (event.key === 'Enter') {
            this.emit('changed', hit);
            this.focused = null;
            return;
        }
        if (event.key === 'Escape') {
            this.focused = null;
            return;
        }
        if (event.key === 'Backspace') {
            hit.item.text = String(hit.item.text ?? '').slice(0, -1);
        } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            hit.item.text = String(hit.item.text ?? '') + event.key;
        } else {
            return;
        }
        event.preventDefault();
        this.render();
        this.emit('changed', hit);
    }

    load(runtimeAssets = []) {
        this.clear();
        for (const asset of runtimeAssets) {
            if (asset.type === 'ui') this.assets.set(asset.id, asset);
            if (asset.type === 'texture' && asset.data?.image) {
                this.textures.set(asset.id, asset.data.image);
            }
            if (asset.type === 'font' && asset.data?.source) {
                this.loadFont(asset);
            }
        }
    }

    loadFont(asset) {
        if (
            this.fonts.has(asset.id) ||
            typeof globalThis.FontFace !== 'function' ||
            !globalThis.document?.fonts
        ) return;
        const family = asset.data.family || asset.name || 'Imported Font';
        const face = new FontFace(family, `url(${asset.data.source})`);
        this.fonts.set(asset.id, face);
        face.load().then(loaded => {
            document.fonts.add(loaded);
            this.render();
        }).catch(() => this.fonts.delete(asset.id));
    }

    assetId(reference) {
        return typeof reference === 'string' ? reference : reference?.id;
    }

    requiresMouse(reference = null) {
        if (reference) {
            const document = this.visible.get(this.assetId(reference));
            return Boolean(document && (document.canvas?.type ?? 'menu') === 'menu');
        }
        return [...this.visible.values()].some(document =>
            (document.canvas?.type ?? 'menu') === 'menu'
        );
    }

    syncPointerEvents() {
        this.canvas.style.pointerEvents =
            this.inputEnabled && this.visible.size ? 'auto' : 'none';
    }

    setInputEnabled(enabled) {
        this.inputEnabled = Boolean(enabled);
        this.syncPointerEvents();
    }

    show(reference) {
        const id = this.assetId(reference);
        const asset = this.assets.get(id);
        if (!asset) return false;
        if (!this.visible.has(id)) {
            const document = structuredClone(asset.data);
            for (const item of document.elements ?? []) {
                if (item.type === 'image' && item.background === '#292c34') {
                    item.background = 'transparent';
                }
                if (
                    item.type === 'panel' &&
                    !['none', 'block', 'row', 'column', 'grid'].includes(item.display)
                ) item.display = 'block';
                if (item.type === 'button') {
                    item.enabled ??= true;
                    item.hoverColor ??= item.color;
                    item.hoverBackground ??= item.background;
                    item.pressedColor ??= item.color;
                    item.pressedBackground ??= item.background;
                    item.disabledColor ??= '#9a9a9a';
                    item.disabledBackground ??= '#3f4148';
                }
            }
            this.visible.set(id, document);
        }
        this.canvas.style.display = 'block';
        this.syncPointerEvents();
        this.render();
        return true;
    }

    hide(reference) {
        const id = this.assetId(reference);
        if (id) this.visible.delete(id);
        else this.visible.clear();
        if (!this.visible.size) {
            this.canvas.style.display = 'none';
            this.canvas.style.pointerEvents = 'none';
        } else {
            this.syncPointerEvents();
        }
        this.render();
    }

    setText(reference, widgetName, value) {
        return this.setValue(reference, widgetName, 'text', value);
    }

    setValue(reference, widgetName, property, value) {
        const document = this.visible.get(this.assetId(reference));
        if (!document) return false;
        const widget = document.elements?.find(item =>
            item.id === widgetName || item.name === widgetName
        );
        if (!widget) return false;

        const key = String(property ?? 'text').trim().toLowerCase();
        if (key === 'text' || key === 'value') {
            widget.text = String(value ?? '');
        } else if (key === 'checked') {
            widget.checked = Boolean(value);
        } else if (key === 'opacity') {
            const opacity = Number(value);
            if (!Number.isFinite(opacity)) return false;
            widget.opacity = Math.max(0, Math.min(1, opacity));
        } else if (key === 'color' || key === 'background') {
            widget[key] = String(value ?? '');
        } else if (key === 'image' || key === 'source') {
            widget.source = typeof value === 'string' ? value : value?.id ?? '';
        } else if (key === 'position') {
            const x = Number(Array.isArray(value) ? value[0] : value?.x);
            const y = Number(Array.isArray(value) ? value[1] : value?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
            widget.x = x;
            widget.y = y;
        } else if (key === 'display') {
            const display = String(value ?? 'block').trim().toLowerCase();
            if (!['none', 'block', 'row', 'column', 'grid'].includes(display)) return false;
            widget.display = display;
            this.arrangeChildren(document, widget);
        } else {
            return false;
        }

        this.render();
        return true;
    }

    arrangeChildren(document, parent) {
        if (
            parent?.type !== 'panel' ||
            !['row', 'column', 'grid'].includes(parent.display)
        ) return;
        const children = (document.elements ?? [])
            .filter(item => item.parent === parent.id)
            .sort((a, b) => (a.z || 0) - (b.z || 0));
        const padding = 12;
        const gap = 8;
        if (parent.display === 'row') {
            let x = parent.x + padding;
            for (const child of children) {
                child.x = x;
                child.y = parent.y + padding;
                x += child.width + gap;
            }
            return;
        }
        if (parent.display === 'column') {
            let y = parent.y + padding;
            for (const child of children) {
                child.x = parent.x + padding;
                child.y = y;
                y += child.height + gap;
            }
            return;
        }
        const columns = Math.max(1, Math.ceil(Math.sqrt(children.length)));
        const cellWidth = Math.max(
            1,
            (parent.width - padding * 2 - gap * (columns - 1)) / columns
        );
        children.forEach((child, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            child.x = parent.x + padding + column * (cellWidth + gap);
            child.y = parent.y + padding + row * (child.height + gap);
        });
    }

    resize(width, height) {
        this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.max(1, Math.floor(width * this.pixelRatio));
        this.canvas.height = Math.max(1, Math.floor(height * this.pixelRatio));
        this.render();
    }

    drawText(item, text, align = 'center') {
        const ctx = this.context;
        align = item.textAlign || align;
        const vertical = item.verticalAlign || 'middle';
        ctx.fillStyle = item.color || '#fff';
        ctx.font = `${item.fontStyle || 'normal'} ${item.fontWeight || '400'} ` +
            `${item.fontSize || 14}px ${item.fontFamily || 'sans-serif'}`;
        ctx.textAlign = align;
        ctx.textBaseline = vertical === 'top'
            ? 'top'
            : vertical === 'bottom' ? 'bottom' : 'middle';
        ctx.fillText(
            text,
            align === 'left'
                ? item.x + 10
                : align === 'right' ? item.x + item.width - 10 : item.x + item.width / 2,
            vertical === 'top'
                ? item.y + 6
                : vertical === 'bottom' ? item.y + item.height - 6 : item.y + item.height / 2,
            Math.max(0, item.width - 16)
        );
    }

    drawElement(item, state = 'normal') {
        const ctx = this.context;
        if (item.type === 'button' && state !== 'normal') {
            item = {
                ...item,
                color: item[`${state}Color`] ?? item.color,
                background: item[`${state}Background`] ?? item.background
            };
        }
        ctx.globalAlpha = item.opacity ?? 1;
        if (item.background && item.background !== 'transparent') {
            ctx.beginPath();
            ctx.roundRect(
                item.x,
                item.y,
                item.width,
                item.height,
                Math.min(item.radius || 0, item.width / 2, item.height / 2)
            );
            ctx.fillStyle = item.background;
            ctx.fill();
        }
        if (item.type === 'input') {
            ctx.strokeStyle = '#ffffff35';
            ctx.strokeRect(item.x, item.y, item.width, item.height);
            this.drawText(item, item.text, 'left');
        } else if (item.type === 'checkbox') {
            ctx.strokeStyle = item.color || '#fff';
            ctx.strokeRect(item.x + 3, item.y + item.height / 2 - 7, 14, 14);
            ctx.fillStyle = item.color || '#fff';
            ctx.font = `${item.fontStyle || 'normal'} ${item.fontWeight || '400'} ` +
                `${item.fontSize || 14}px ${item.fontFamily || 'sans-serif'}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.text, item.x + 25, item.y + item.height / 2);
            if (item.checked) {
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(item.x + 6, item.y + item.height / 2);
                ctx.lineTo(item.x + 10, item.y + item.height / 2 + 4);
                ctx.lineTo(item.x + 16, item.y + item.height / 2 - 5);
                ctx.stroke();
                ctx.lineWidth = 1;
            }
        } else if (item.type === 'image') {
            const source = this.textures.get(item.source) || item.source;
            let image = source ? this.images.get(source) : null;
            if (source && !image) {
                image = new Image();
                image.onload = () => this.render();
                image.src = source;
                this.images.set(source, image);
            }
            if (image?.complete && image.naturalWidth) {
                ctx.drawImage(image, item.x, item.y, item.width, item.height);
            } else {
                ctx.strokeStyle = '#ffffff55';
                ctx.setLineDash([5, 4]);
                ctx.strokeRect(item.x, item.y, item.width, item.height);
                ctx.setLineDash([]);
            }
        } else if (item.type !== 'panel') {
            this.drawText(item, item.text);
        }
        ctx.globalAlpha = 1;
    }

    render() {
        const ctx = this.context;
        const width = this.canvas.width / this.pixelRatio;
        const height = this.canvas.height / this.pixelRatio;
        ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        this.layouts = [];

        for (const [uiId, document] of this.visible) {
            const sourceWidth = document.canvas?.width || width;
            const sourceHeight = document.canvas?.height || height;
            const scale = Math.min(width / sourceWidth, height / sourceHeight);
            const x = (width - sourceWidth * scale) / 2;
            const y = (height - sourceHeight * scale) / 2;
            this.layouts.push({ uiId, document, x, y, scale });
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            [...(document.elements ?? [])]
                .sort((a, b) => (a.z || 0) - (b.z || 0))
                .filter(item => this.isDisplayed(document, item))
                .forEach(item => {
                    const hit = { uiId, item };
                    const state = item.type !== 'button'
                        ? 'normal'
                        : item.enabled === false
                            ? 'disabled'
                            : this.sameHit(hit, this.pressed)
                                ? 'pressed'
                                : this.sameHit(hit, this.hovered) ? 'hover' : 'normal';
                    this.drawElement(item, state);
                });
            ctx.restore();
        }
    }

    clear() {
        this.visible.clear();
        this.assets.clear();
        this.images.clear();
        this.textures.clear();
        this.fonts.clear();
        this.canvas.style.display = 'none';
        this.canvas.style.pointerEvents = 'none';
        this.layouts = [];
        this.hovered = null;
        this.pressed = null;
        this.focused = null;
        this.inputEnabled = false;
        const width = this.canvas.width / (this.pixelRatio || 1);
        const height = this.canvas.height / (this.pixelRatio || 1);
        this.context.clearRect(0, 0, width, height);
    }
}
