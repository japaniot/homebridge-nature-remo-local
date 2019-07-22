const packageJson = require('../package.json')

// Lazy-initialized.
let Service, Characteristic

// Called by homebridge.
module.exports = (homebridge) => {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic

  // Register the accessory.
  homebridge.registerAccessory(packageJson.name, "NatureRemo", NatureRemo)
}

class NatureRemo {
  constructor(log, config, api) {
    this.log = log
    this.config = config
  }

  getServices() {
    return []
  }
}
