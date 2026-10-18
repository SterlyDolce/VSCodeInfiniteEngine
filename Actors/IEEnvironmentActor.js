// @ts-nocheck
const IEActor = require('../IEActor')
const IESkyComponent = require('../Components/IESkyComponent')
const IEDirectionalLightComponent = require('../Components/IEDirectionalLightComponent')
const IEAmbientLightComponent = require('../Components/IEAmbientLightComponent')
const IEFogComponent = require('../Components/IEFogComponent')
const IEVolumetricCloudComponent = require('../Components/IEVolumetricCloudComponent')

class IEEnvironmentActor extends IEActor {
    constructor(name = 'Environment', parent, id) {
        super(name, 'Environment', parent, id);

        this.addComponent(new IESkyComponent());
        this.addComponent(new IEDirectionalLightComponent());
        this.addComponent(new IEAmbientLightComponent());
        this.addComponent(new IEFogComponent());
        this.addComponent(new IEVolumetricCloudComponent());
    }
}

module.exports = IEEnvironmentActor
