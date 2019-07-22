# homebridge-nature-remo-local

Homebridge plugin for Nature Remo using local APIs.

## Usage

```js
"accessories": [
  {
    "accessory": "NatureRemo",
    "name": "TV",
    "instance": "Remo-XXXX",
    "learnButton": false,
    "signals" {
      "power": [...],
      "enter": [...]
    },
    "on": [
      {
        "signal": "power",
        "delay": 100000
      }
    ],
    "off": [
      {
        "signal": "power",
        "delay": 100
      },
      {
        "signal": "enter",
        "delay": 0
      }
    ]
  }
]
```

* `instance`: The instance name of Nature Remo, can be ignored if there is only
  one device.
* `learnButton`: Whether to show the "learn signal" button, default is `false`.
* `signals`: The IR signals.
* `on`: The signals to send when switch is turned on.
* `off`: The signals to send when switch is turned off.

## License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
