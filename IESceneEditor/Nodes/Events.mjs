// @ts-nocheck

import { nodeRegistry } from '../IENodeRegistry.mjs';

const normalizeKey = value => {
    const key = String(value ?? '').trim();
    if (key.toLowerCase() === 'space') return 'Space';
    if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
    return key;
};

const normalizeMouseButton = value => {
    const button = String(value ?? 'Left').trim().toLowerCase();

    return {
        0: 'Left',
        left: 'Left',
        1: 'Middle',
        middle: 'Middle',
        2: 'Right',
        right: 'Right',
        3: 'Button 1',
        'button 1': 'Button 1',
        button1: 'Button 1',
        4: 'Button 2',
        'button 2': 'Button 2',
        button2: 'Button 2'
    }[button] ?? 'Left';
};

const keyboardKeyOptions = [
    'Space', 'Enter', 'Escape', 'Tab', 'Backspace',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
    'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
    'CapsLock', 'Delete', 'Insert', 'Home', 'End',
    'PageUp', 'PageDown',
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(key => `Key${key}`),
    ...'0123456789'.split('').map(key => `Digit${key}`),
    ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`)
];

const keyboardKey = (name, defaultValue) => ({
    name,
    type: 'string',
    default: defaultValue,
    editor: {
        type: 'enum',
        options: keyboardKeyOptions
    }
});

nodeRegistry.register('event.update', {
    name: 'On Update',
    category: 'Events',
    event: true,
    inputs: [],
    outputs: [
        { name: 'exec', type: 'execution' },
        { name: 'deltaTime', type: 'number' }
    ],
    evaluate({ output, deltaTime }) {
        if (output === 'deltaTime') return deltaTime;
        throw new Error(`Unknown output: ${output}`);
    }
});


nodeRegistry.register('event.onbegin', {
    name: 'On Begin',
    category: 'Events',
    event: true,
    inputs: [],
    outputs: [
        { name: 'exec', type: 'execution' }
    ]
});


nodeRegistry.register('event.preconstruct', {
    name: 'Pre Construct',
    category: 'Events',
    event: true,
    inputs: [],
    outputs: [
        { name: 'exec', type: 'execution' }
    ]
});


nodeRegistry.register('event.keyboard', {
    name: 'Keyboard',
    category: 'Events',
    event: true,
    inputs: [
        keyboardKey('key', 'Space')
    ],
    outputs: [
        { name: 'onKeyDown', type: 'execution' },
        { name: 'onKeyUp', type: 'execution' },
        { name: 'isKeyPressed', type: 'boolean' }
    ],
    evaluate({ readInput, keyboard }) {
        return keyboard.has(normalizeKey(readInput('key')));
    }
});



nodeRegistry.register('input.keyboard2d', {
    name: 'Keyboard 2D',
    category: 'Input',

    inputs: [
        keyboardKey('up', 'KeyW'),
        keyboardKey('down', 'KeyS'),
        keyboardKey('left', 'KeyA'),
        keyboardKey('right', 'KeyD')
    ],

    outputs: [
        { name: 'axis', type: 'vector2' },
        { name: 'x', type: 'number' },
        { name: 'y', type: 'number' },
        { name: 'isMoving', type: 'boolean' }
    ],

    evaluate({ output, readInput, keyboard }) {
        const pressed = name =>
            keyboard.has(String(readInput(name)));

        let x =
            Number(pressed('right')) -
            Number(pressed('left'));

        let y =
            Number(pressed('up')) -
            Number(pressed('down'));

        // Normalize diagonals to avoid faster movement.
        const length = Math.hypot(x, y);

        if (length > 1) {
            x /= length;
            y /= length;
        }

        switch (output) {
            case 'axis':
                return [x, y];

            case 'x':
                return x;

            case 'y':
                return y;

            case 'isMoving':
                return length > 0;

            default:
                throw new Error(`Unknown output: ${output}`);
        }
    }
});



nodeRegistry.register('input.keyboard1d', {
    name: 'Keyboard 1D',
    category: 'Input',

    inputs: [
        keyboardKey('negative', 'KeyA'),
        keyboardKey('positive', 'KeyD')
    ],

    outputs: [
        { name: 'axis', type: 'number' },
        { name: 'isMoving', type: 'boolean' }
    ],

    evaluate({ output, readInput, keyboard }) {
        const negative = keyboard.has(
            String(readInput('negative'))
        );

        const positive = keyboard.has(
            String(readInput('positive'))
        );

        const axis = Number(positive) - Number(negative);

        switch (output) {
            case 'axis':
                return axis;

            case 'isMoving':
                return axis !== 0;

            default:
                throw new Error(`Unknown output: ${output}`);
        }
    }
});

nodeRegistry.register('input.mouse2d', {
    name: 'Mouse 2D',
    category: 'Input',
    inputs: [],
    outputs: [
        { name: 'position', type: 'vector2' },
        { name: 'delta', type: 'vector2' },
        { name: 'x', type: 'number' },
        { name: 'y', type: 'number' },
        { name: 'deltaX', type: 'number' },
        { name: 'deltaY', type: 'number' },
        { name: 'wheel', type: 'number' }
    ],
    evaluate({ output, mouse }) {
        const position = mouse?.position ?? [0, 0];
        const delta = mouse?.delta ?? [0, 0];

        switch (output) {
            case 'position': return [...position];
            case 'delta': return [...delta];
            case 'x': return position[0] ?? 0;
            case 'y': return position[1] ?? 0;
            case 'deltaX': return delta[0] ?? 0;
            case 'deltaY': return delta[1] ?? 0;
            case 'wheel': return mouse?.wheel ?? 0;
            default: throw new Error(`Unknown output: ${output}`);
        }
    }
});

nodeRegistry.register('event.mouseButton', {
    name: 'Mouse Button',
    category: 'Events',
    event: true,
    inputs: [
        {
            name: 'button',
            type: 'string',
            default: 'Left',
            editor: {
                type: 'enum',
                options: ['Left', 'Right', 'Middle', 'Button 1', 'Button 2']
            }
        }
    ],
    outputs: [
        { name: 'onClicked', type: 'execution' },
        { name: 'onReleased', type: 'execution' },
        { name: 'isPressed', type: 'boolean' }
    ],
    evaluate({ readInput, mouse }) {
        const button = normalizeMouseButton(readInput('button'));
        return mouse?.buttons?.has(button) ?? false;
    }
});

nodeRegistry.register('input.lockMouse', {
    name: 'Lock Mouse',
    category: 'Input',
    inputs: [
        { name: 'exec', type: 'execution' }
    ],
    outputs: [
        { name: 'exec', type: 'execution' }
    ],
    execute({ engine }) {
        engine?.lockMouse?.();
        return 'exec';
    }
});

nodeRegistry.register('input.showMouse', {
    name: 'Show Mouse',
    category: 'Input',
    inputs: [
        { name: 'exec', type: 'execution' },
        { name: 'show', type: 'boolean', default: true }
    ],
    outputs: [
        { name: 'exec', type: 'execution' }
    ],
    execute({ readInput, engine }) {
        if (readInput('show')) engine?.showMouse?.();
        else engine?.hideMouse?.();
        return 'exec';
    }
});

nodeRegistry.register('input.setMode', {
    name: 'Set Input Mode',
    category: 'Input',
    inputs: [
        { name: 'exec', type: 'execution' },
        {
            name: 'mode',
            type: 'string',
            default: 'Game Only',
            editor: {
                type: 'enum',
                options: ['UI Only', 'Game and UI', 'Game Only']
            }
        }
    ],
    outputs: [
        { name: 'exec', type: 'execution' }
    ],
    execute({ readInput, engine }) {
        engine?.setInputMode?.(readInput('mode'));
        return 'exec';
    }
});
