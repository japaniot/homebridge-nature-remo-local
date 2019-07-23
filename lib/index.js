const fetch = require('node-fetch')
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

    this._address = null
    this._state = false
    this._inProgress = false

    this._infoService = new Service.AccessoryInformation()
    this._infoService
        .setCharacteristic(Characteristic.Manufacturer, 'Nature Japan')
        .setCharacteristic(Characteristic.Model, 'Nature Remo')
        .setCharacteristic(Characteristic.SerialNumber, '90-11-27')

    this._switchService = new Service.Switch(config.name, 'remo-send')
    this._switchService.getCharacteristic(Characteristic.On)
        .on('set', this._setState.bind(this))
        .on('get', this._getState.bind(this))

    if (config.learnButton) {
      this._learnService = new Service.Switch('Learn Signal', 'remo-learn')
      this._learnService.getCharacteristic(Characteristic.On)
          .on('set', this._printLeantSignal.bind(this))
          .on('get', (callback) => callback(null, false))
    }
  }

  getServices() {
    const services = [this._infoService, this._switchService]
    if (this._learnService)
      services.push(this._learnService)
    return services
  }

  _setState(on, callback) {
    if (!await this._updateAddress()) {
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
    if (!await this._updateAddress()) {
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

    try {
      for (const command of commands) {
        await this._sendSignal(command.signal)
        await sleep(command.delay)
      }
    } catch (e) {
      this.log(`Sending signal fails: ${e.message}`)

      // Try to get new address.
      this._address = null
      this._updateAddress()
    }

    this._inProgress = false
  }

  async _sendSignal(signal) {
    console.log(signal)
  }

  async _printLeantSignal(on, callback) {
    if (!await this._updateAddress()) {
      callback(new Error('Unable to find Nature Remove'))
      return
    }

    try {
      const res = await fetch(`http://${this._address}/messages`, {
        headers: {'X-Requested-With': 'curl'},
        timeout: 10 * 1000
      })
      const json = res.json()
      const signal = [json.format, json.freq].concat(json.data)
      this.log(`Last signal: ${signal}`)
    } catch (e) {
      this.log(`Failed to fetch signal: ${e.message}`)
      callback(e)

      // Try to get new address.
      this._address = null
      this._updateAddress()
      return
    }

    callback()
    // Flip switch back.
    setTimeout(() => {
      this._learnService.updateCharacteristic(hap.Characteristic.On, false)
    }, 1000)
  }

  async _updateAddress() {
    if (this._address)
      return true

    this.log('Search for Nature Remo devices')
    const devices = await getRemoDevices()

    // No device found.
    if (devices.length === 0) {
      this._address = null
      this.log('No Nature Remo device found')
      return false
    }
    // Instance specified.
    if (this.config.instance) {
      for (const device of devices) {
        if (device.fqdn.includes(this.config.instance)) {
          this._address = device.address
          this.log(`Found ${this._address}`)
          return true
        }
      }
      this.log('Unable to found device with instance name', this.config.instance)
      return false
    }
    // Use the first one found.
    this._address = devices[0].address
    this.log(`Found ${this._address}`)
    return true
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
