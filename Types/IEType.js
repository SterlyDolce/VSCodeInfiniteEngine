// @ts-nocheck
class IEType {
    constructor(type, value, isArray = false, exposed = true) {
        this.type = type;
        this.value = undefined;
        this.isArray = isArray;
        this.exposed = exposed
        if (value !== undefined) this.setValue(value);
    }

    getValue() {
        return this.value;
    }

    setValue(value) {
        if (this.isArray) {
            if (value != null && !Array.isArray(value)) {
                throw new TypeError(
                    `Expected an array for ${this.type}`
                );
            }

            this.value = value ?? [];
        } else {
            this.value = value;
        }

        return this;
    }

    toJSON() {
        return this.getValue();
    }
}

module.exports = IEType;
