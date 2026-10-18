// @ts-nocheck

const IEType = require('./IEType');

class IEArray extends IEType {
    constructor(ItemType, values = []) {
        super('array', []);

        if (typeof ItemType !== 'function') {
            throw new TypeError('Expected an IEType class');
        }

        this.ItemType = ItemType;
        this.setValue(values);
    }

    setValue(values) {
        if (!Array.isArray(values)) {
            throw new TypeError('Expected an array');
        }

        const items = values.map(value =>
            value instanceof this.ItemType
                ? new this.ItemType(value.getValue())
                : new this.ItemType(value)
        );

        return super.setValue(items);
    }

    getValue() {
        return this.value.map(item => item.getValue());
    }

    getItem(index) {
        return this.value[index];
    }

    add(value) {
        const item = value instanceof this.ItemType
            ? new this.ItemType(value.getValue())
            : new this.ItemType(value);

        this.value.push(item);
        return this;
    }

    remove(index) {
        this.value.splice(index, 1);
        return this;
    }

    get length() {
        return this.value.length;
    }

    get itemType() {
        return new this.ItemType().type;
    }

    toJSON() {
        return this.getValue();
    }
}

module.exports = IEArray;
