// @ts-nocheck

const IEType = require('./IEType');

class IENumber extends IEType {
    constructor(value = 0) {
        super('number', value);
    }

    setValue(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            throw new TypeError('Expected a number');
        }

        return super.setValue(number);
    }
}

class IEString extends IEType {
    constructor(value = '') {
        super('string', value);
    }

    setValue(value) {
        return super.setValue(String(value));
    }
}

class IEBool extends IEType {
    constructor(value = false) {
        super('boolean', value);
    }

    setValue(value) {
        if (typeof value !== 'boolean') {
            throw new TypeError('Expected a boolean');
        }

        return super.setValue(value);
    }
}


class IEColor extends IEType {
    constructor(value = '#ffffff') {
        super('color', '#ffffff');
        this.setValue(value);
    }

    setValue(value) {
        if (typeof value === 'string') {
            if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
                throw new TypeError('Expected a hex color like #ffffff');
            }

            return super.setValue(value.toLowerCase());
        }

        if (
            typeof value === 'number' &&
            Number.isInteger(value) &&
            value >= 0 &&
            value <= 0xffffff
        ) {
            return super.setValue(
                `#${value.toString(16).padStart(6, '0')}`
            );
        }

        throw new TypeError('Expected a valid color');
    }
}

module.exports = {
    IENumber,
    IEString,
    IEBool,
    IEColor
};
