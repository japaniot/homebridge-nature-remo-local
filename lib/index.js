const mDnsSd = require('node-dns-sd')

const packageJson = require('../package.json')

// Lazy-initialized.
let hap, Service, Characteristic

// Called by homebridge.
module.exports = (homebridge) => {
  hap = homebridge.hap
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic

  // Register the accessory.
  homebridge.registerAccessory(packageJson.name, 'NatureRemo', NatureRemo)
}

class NatureRemo {
  constructor(log, config, api) {
    this.log = log
    this.config = config

    this._infoService = new Service.AccessoryInformation()
    this._infoService
        .setCharacteristic(Characteristic.Manufacturer, 'Nature Japan')
        .setCharacteristic(Characteristic.Model, 'Nature Remo')
        .setCharacteristic(Characteristic.SerialNumber, '90-11-27')

    this._state = false
    this._inProgress = false

    this._address = null
    this._switchService = new Service.Switch(config.name)
    this._setup()
  }

  getServices() {
    return [this._infoService, this._switchService]
  }

  async _setup() {
    if (!this._address) {
      await this._updateAddress()
      if (!this._address) {
        this.log('Unable to discover Nature Remo')
        return
      }
    }

    this._switchService.getCharacteristic(Characteristic.On)
        .on('set', this._setState.bind(this))
        .on('get', this._getState.bind(this))
  }

  _setState(on, callback) {
    if (!this._address) {
      callback(new Error('Unable to find Nature Remove'))
      return
    }

    if (on === this._state) {
      callback()
      return
    }

    // If we are still sending signals, do not change state.
    if (this._inProgress) {
      callback()
      setTimeout(() => {
        // There is no way to prevent changing state, so we have to flip after
        // a while.
        if (this._inProgress)
          this._switchService.updateCharacteristic(hap.Characteristic.On, this._state)
      }, 100)
      return
    }

    // Start sending signals.
    this._sendSignals(on)

    // Return immediately as the signals may spend quite a while to finish.
    this._state = on
    callback()
  }

  _getState(callback) {
    if (!this._address) {
      callback(new Error('Unable to find Nature Remove'))
      return
    }

    callback(null, this._state)
  }

  async _sendSignals(on) {
    this._inProgress = true

    const commands = this.config[on ? 'on' : 'off'].map((it) => {
      return {delay: it.delay ? it.delay : 0, signal: this.config.signals[it.signal]}
    })

    for (const command of commands) {
      console.log(command)
      await sleep(command.delay)
    }

    this._inProgress = false
  }

  async _updateAddress() {
    const devices = await getRemoDevices()
    // No device found.
    if (devices.length === 0) {
      this._address = null
      return
    }
    // Instance specified.
    if (this.config.instance) {
      for (const device of devices) {
        if (device.fqdn.includes(this.config.instance)) {
          this._address = device.address
          return
        }
      }
      this.log('Unable to found device with instance name', this.config.instance)
      return
    }
    // Use the first one found.
    this._address = devices[0].address
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getRemoDevices() {
  try {
    return await mDnsSd.discover({name: '_airplay._tcp.local'})
  } catch {
    // Ignore error.
  }
  return []
}
