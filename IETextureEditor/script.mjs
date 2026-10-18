// @ts-nocheck

(() => {
    'use strict';

const vscode = acquireVsCodeApi();
const postAssetsUpdate = (action, payload = {}) => vscode.postMessage({
    type: 'onAssetsUpdate', action, ...payload
});
    const $ = id => document.getElementById(id);

    const viewport = $('viewport');
    const canvas = $('preview');
    const ctx = canvas.getContext('2d', {
        willReadFrequently: true
    });

    const status = $('status');
    const channel = $('channel');

    let asset = null;
    let image = null;
    let originalPixels = null;

    let zoom = 1;
    let offsetX = 0;
    let offsetY = 0;

    let dragging = false;
    let lastPointer = { x: 0, y: 0 };

    let checkerVisible = true;
    let loadVersion = 0;

    const clamp = (value, min, max) =>
        Math.max(min, Math.min(max, value));

    function setStatus(message, error = false) {
        status.textContent = message;
        status.classList.toggle('error', error);
    }

    function updateZoomLabel() {
        $('zoom-label').textContent =
            `${Math.round(zoom * 100)}%`;
    }

    function updateTransform() {
        canvas.style.transform =
            `translate(${offsetX}px, ${offsetY}px) ` +
            `scale(${zoom})`;

        updateZoomLabel();
    }

    function fitImage() {
        if (!image) return;

        const bounds = viewport.getBoundingClientRect();

        const padding = 70;

        const availableWidth = Math.max(
            1,
            bounds.width - padding
        );

        const availableHeight = Math.max(
            1,
            bounds.height - padding
        );

        zoom = Math.min(
            availableWidth / image.naturalWidth,
            availableHeight / image.naturalHeight,
            1
        );

        zoom = Math.max(zoom, 0.01);

        offsetX =
            (bounds.width - image.naturalWidth * zoom) / 2;

        offsetY =
            (bounds.height - image.naturalHeight * zoom) / 2;

        updateTransform();
    }

    function actualSize() {
        if (!image) return;

        zoom = 1;

        offsetX =
            (viewport.clientWidth - image.naturalWidth) / 2;

        offsetY =
            (viewport.clientHeight - image.naturalHeight) / 2;

        updateTransform();
    }

    function changeZoom(factor, pivot = null) {
        if (!image) return;

        const bounds = viewport.getBoundingClientRect();

        const point = pivot ?? {
            x: bounds.width / 2,
            y: bounds.height / 2
        };

        const beforeX = (point.x - offsetX) / zoom;
        const beforeY = (point.y - offsetY) / zoom;

        zoom = clamp(zoom * factor, 0.05, 32);

        offsetX = point.x - beforeX * zoom;
        offsetY = point.y - beforeY * zoom;

        updateTransform();
    }

    function renderChannel() {
        if (!image || !originalPixels) return;

        const mode = channel.value;

        const output = new ImageData(
            new Uint8ClampedArray(originalPixels.data),
            originalPixels.width,
            originalPixels.height
        );

        const pixels = output.data;

        if (mode !== 'rgba') {
            for (let i = 0; i < pixels.length; i += 4) {
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                const a = pixels[i + 3];

                if (mode === 'rgb') {
                    pixels[i + 3] = 255;
                } else {
                    let value = 0;

                    switch (mode) {
                        case 'r':
                            value = r;
                            break;

                        case 'g':
                            value = g;
                            break;

                        case 'b':
                            value = b;
                            break;

                        case 'a':
                            value = a;
                            break;
                    }

                    // Single-channel grayscale visualization.
                    pixels[i] = value;
                    pixels[i + 1] = value;
                    pixels[i + 2] = value;
                    pixels[i + 3] = 255;
                }
            }
        }

        ctx.putImageData(output, 0, 0);
    }

    async function decodeImage(source) {
        return new Promise((resolve, reject) => {
            const result = new Image();

            result.onload = () => resolve(result);

            result.onerror = () => reject(
                new Error('Failed to decode texture image')
            );

            result.src = source;
        });
    }

    async function loadAsset(nextAsset) {
        const version = ++loadVersion;

        setStatus('Decoding texture...');

        const decoded = await decodeImage(
            nextAsset.data.image
        );

        // An older image load must never replace a newer one.
        if (version !== loadVersion) return;

        asset = nextAsset;
        image = decoded;

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        // Natural image size; CSS transform handles zoom/pan.
        canvas.style.width = `${image.naturalWidth}px`;
        canvas.style.height = `${image.naturalHeight}px`;

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        ctx.drawImage(image, 0, 0);

        originalPixels = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
        );

        $('texture-name').textContent =
            asset.name ?? 'Texture';

        $('resolution').textContent =
            `${image.naturalWidth} × ${image.naturalHeight}`;

        $('format').textContent =
            (asset.data.mimeType ?? 'Image')
                .replace('image/', '')
                .toUpperCase();

        renderChannel();
        fitImage();

        setStatus('Texture loaded');
    }

    // -----------------------------------------
    // Toolbar
    // -----------------------------------------

    $('fit').addEventListener('click', fitImage);

    $('actual').addEventListener('click', actualSize);

    $('zoom-in').addEventListener('click', () => {
        changeZoom(1.25);
    });

    $('zoom-out').addEventListener('click', () => {
        changeZoom(1 / 1.25);
    });

    $('checker').addEventListener('click', () => {
        checkerVisible = !checkerVisible;

        viewport.classList.toggle(
            'checkerboard',
            checkerVisible
        );

        $('checker').classList.toggle(
            'active',
            checkerVisible
        );
    });

    channel.addEventListener('change', renderChannel);

    // -----------------------------------------
    // Mouse controls
    // -----------------------------------------

    viewport.addEventListener('pointerdown', event => {
        if (event.button !== 0 && event.button !== 1) {
            return;
        }

        if (!image) return;

        dragging = true;

        lastPointer = {
            x: event.clientX,
            y: event.clientY
        };

        viewport.setPointerCapture(event.pointerId);

        viewport.classList.add('dragging');
    });

    viewport.addEventListener('pointermove', event => {
        if (!dragging) return;

        const dx = event.clientX - lastPointer.x;
        const dy = event.clientY - lastPointer.y;

        offsetX += dx;
        offsetY += dy;

        lastPointer = {
            x: event.clientX,
            y: event.clientY
        };

        updateTransform();
    });

    function stopDragging() {
        dragging = false;
        viewport.classList.remove('dragging');
    }

    viewport.addEventListener('pointerup', stopDragging);
    viewport.addEventListener('pointercancel', stopDragging);
    viewport.addEventListener('lostpointercapture', stopDragging);

    viewport.addEventListener('wheel', event => {
        event.preventDefault();

        const bounds = viewport.getBoundingClientRect();

        changeZoom(
            event.deltaY < 0 ? 1.15 : 1 / 1.15,
            {
                x: event.clientX - bounds.left,
                y: event.clientY - bounds.top
            }
        );
    }, {
        passive: false
    });

    viewport.addEventListener('contextmenu', event => {
        event.preventDefault();
    });

    // -----------------------------------------
    // Extension messages
    // -----------------------------------------

    window.addEventListener('message', async event => {
        const message = event.data;

        switch (message.type) {
            case 'load':
                try {
                    await loadAsset(message.asset);
                } catch (error) {
                    if (message.asset?.id === asset?.id) {
                        // Keep any previously decoded image.
                    }

                    setStatus(
                        'Error: ' + error.message,
                        true
                    );
                }
                break;

            case 'error':
                setStatus(
                    'Error: ' + message.error,
                    true
                );
                break;
        }
    });

    // Preserve the current pan and zoom when resizing.
    new ResizeObserver(() => {
        updateTransform();
    }).observe(viewport);

    updateZoomLabel();

    postAssetsUpdate('ready');
})();
