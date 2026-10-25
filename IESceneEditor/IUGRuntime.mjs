// @ts-nocheck

export class IUGRuntime {
    constructor(canvas) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.assets = new Map();
        this.visible = new Map();
        this.images = new Map();
        this.pixelRatio = 1;
    }

    load(runtimeAssets = []) {
        this.clear();
        for (const asset of runtimeAssets) {
            if (asset.type === 'ui') this.assets.set(asset.id, asset);
        }
    }

    assetId(reference) {
        return typeof reference === 'string' ? reference : reference?.id;
    }

    show(reference) {
        const id = this.assetId(reference);
        const asset = this.assets.get(id);
        if (!asset) return false;
        if (!this.visible.has(id)) {
            this.visible.set(id, structuredClone(asset.data));
        }
        this.canvas.style.display = 'block';
        this.render();
        return true;
    }

    hide(reference) {
        const id = this.assetId(reference);
        if (id) this.visible.delete(id);
        else this.visible.clear();
        if (!this.visible.size) this.canvas.style.display = 'none';
        this.render();
    }

    setText(reference, widgetName, value) {
        const document = this.visible.get(this.assetId(reference));
        if (!document) return false;
        const widget = document.elements?.find(item =>
            item.id === widgetName || item.name === widgetName
        );
        if (!widget) return false;
        widget.text = String(value ?? '');
        this.render();
        return true;
    }

    resize(width, height) {
        this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.max(1, Math.floor(width * this.pixelRatio));
        this.canvas.height = Math.max(1, Math.floor(height * this.pixelRatio));
        this.render();
    }

    drawText(item, text, align = 'center') {
        const ctx = this.context;
        ctx.fillStyle = item.color || '#fff';
        ctx.font = `${item.fontSize || 14}px sans-serif`;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.fillText(
            text,
            align === 'left' ? item.x + 10 : item.x + item.width / 2,
            item.y + item.height / 2,
            Math.max(0, item.width - 16)
        );
    }

    drawElement(item) {
        const ctx = this.context;
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
            ctx.font = `${item.fontSize || 14}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.text, item.x + 25, item.y + item.height / 2);
        } else if (item.type === 'image') {
            let image = item.source ? this.images.get(item.source) : null;
            if (item.source && !image) {
                image = new Image();
                image.onload = () => this.render();
                image.src = item.source;
                this.images.set(item.source, image);
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

        for (const document of this.visible.values()) {
            const sourceWidth = document.canvas?.width || width;
            const sourceHeight = document.canvas?.height || height;
            const scale = Math.min(width / sourceWidth, height / sourceHeight);
            const x = (width - sourceWidth * scale) / 2;
            const y = (height - sourceHeight * scale) / 2;
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            [...(document.elements ?? [])]
                .sort((a, b) => (a.z || 0) - (b.z || 0))
                .forEach(item => this.drawElement(item));
            ctx.restore();
        }
    }

    clear() {
        this.visible.clear();
        this.assets.clear();
        this.images.clear();
        this.canvas.style.display = 'none';
        const width = this.canvas.width / (this.pixelRatio || 1);
        const height = this.canvas.height / (this.pixelRatio || 1);
        this.context.clearRect(0, 0, width, height);
    }
}
