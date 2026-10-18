// @ts-nocheck
const IEComponent = require('./IEComponent');
const IEScript = require('../Types/IEScript');

class IEScriptComponent extends IEComponent {
    constructor(script = null) {
        super('script');
        this.script = new IEScript(script);
    }

    toJSON() {
        return {
            ...super.toJSON(),
            script: this.script.getValue()
        };
    }

    static fromJSON(data) {
        const component = new IEScriptComponent(data.script ?? null);
        component.id = data.id ?? component.id;
        component.enabled = data.enabled ?? true;
        return component;
    }
}

module.exports = IEScriptComponent;
