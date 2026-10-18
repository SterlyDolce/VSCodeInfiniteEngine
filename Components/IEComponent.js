// @ts-nocheck
const crypto = require('crypto');
const IEType = require('../Types/IEType');



class IEComponent {
	constructor(type = 'component') {
		this.name = type;
		this.id = crypto.randomUUID();
		this.type = type;
		this.enabled = true;
		this.parent = null;
	}

	setName(name) {
		this.name = name;
		return this;
	}

	getProperties() {
		const properties = {
			name: {
				type: 'string',
				exposed: true
			}
		};

		for (const [name, value] of Object.entries(this)) {
			if (value instanceof IEType) {
				properties[name] = {
					type: value.type,
					isArray: value.isArray ?? false,
					exposed: true
				};
			}
		}

		return properties;
	}

	setProperty(name, value) {
		const schema = this.getProperties()[name];

		if (
			!schema ||
			name === 'id' ||
			name === 'type' ||
			!Object.prototype.hasOwnProperty.call(this, name)
		) {
			throw new Error(`Component property is not editable: ${name}`);
		}

		const property = this[name];

		if (property instanceof IEType) {
			if (
				value &&
				typeof value === 'object' &&
				!Array.isArray(value) &&
				Number.isInteger(value.axis)
			) {
				const current = property.getValue();

				if (
					!Array.isArray(current) ||
					current.length !== 3 ||
					value.axis < 0 ||
					value.axis > 2 ||
					!Number.isFinite(value.value)
				) {
					throw new TypeError(`Invalid vector update for component property: ${name}`);
				}

				const next = [...current];
				next[value.axis] = value.value;
				value = next;
			}

			property.setValue(value);
			return property.getValue();
		}

		if (schema.type === 'string' && typeof value === 'string') {
			this[name] = value;
			return value;
		}

		if (schema.type === 'boolean' && typeof value === 'boolean') {
			this[name] = value;
			return value;
		}

		if (schema.type === 'number' && Number.isFinite(value)) {
			this[name] = value;
			return value;
		}

		if (schema.type === 'enum' && schema.options?.includes(value)) {
			this[name] = value;
			return value;
		}

		throw new TypeError(`Invalid value for component property: ${name}`);
	}

	updateProperty(name, value) {
		return this.setProperty(name, value);
	}

	toJSON() {
		return {
			id: this.id,
			type: this.type,
			name: this.name,
			enabled: this.enabled,
			parent: this.parent
		};
	}

	static fromJSON(data) {
		const component = new this(
			data.type ?? 'component'
		);
		component.name = data.name ?? data.type ?? 'component'
		component.id = data.id ?? crypto.randomUUID();
		component.enabled = data.enabled ?? true;
		component.parent = data.parent ?? null;

		return component;
	}
}

module.exports = IEComponent;
