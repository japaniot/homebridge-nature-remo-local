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
    this._updateAddressPromise = null
    this._state = false
    this._inProgress = false

    this._updateAddress()

    this._infoService = new Service.AccessoryInformation()
    this._infoService
        .setCharacteristic(Characteristic.Manufacturer, 'Nature Japan')
        .setCharacteristic(Characteristic.Model, 'Nature Remo')
        .setCharacteristic(Characteristic.SerialNumber, '90-11-27')

    this._switchService = new Service.Switch(config.name, 'remo-send')
    this._switchService.getCharacteristic(Characteristic.On)
        .on('set', this._setState.bind(this))
        .on('get', (callback) => callback(null, this._state))

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

  async _setState(on, callback) {
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
    const body = JSON.stringify({
      format: signal[0],
      freq: signal[1],
      data: signal.slice(2)
    })
    await fetch(`http://${this._address}/messages`, {
      body,
      method: 'post',
      headers: {
        'X-Requested-With': 'curl',
        'Content-Type': 'application/json',
        'Content-Length': body.length
      },
      timeout: 10 * 1000
    })
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
      return
    }

    callback()
    // Flip switch back.
    setTimeout(() => {
      this._learnService.updateCharacteristic(hap.Characteristic.On, false)
    }, 1000)
  }

  async _updateAddress() {
    // Wait if address is updating.
    if (this._updateAddressPromise)
      return this._updateAddressPromise

    // Return immediately if we already have address.
    if (this._address)
      return true

    this.log('Search for Nature Remo devices')
    this._updateAddressPromise = this._findAddress().then((address) => {
      this._address = address
      if (this._address)
        this.log(`Found ${this._address}`)
      else
        this.log('No Nature Remo device found')

      this._updateAddressPromise = null
      return !!this._address
    })
    return this._updateAddressPromise
  }

  async _findAddress() {
    const devices = await getRemoDevices()

    // No device found.
    if (devices.length === 0) {
      return null
    }
    // Instance specified.
    if (this.config.instance) {
      for (const device of devices) {
        if (device.fqdn.includes(this.config.instance))
          return device.address
      }
      return null
    }
    // Use the first one found.
    return devices[0].address
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getRemoDevices() {
  try {
    return await mDnsSd.discover({name: '_remo._tcp.local'})
  } catch {
    // Ignore error.
  }
  return []
}
