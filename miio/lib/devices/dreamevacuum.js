"use strict";

const { ChargingState, AutonomousCharging } = require("abstract-things");
const {
  Vacuum,
  AdjustableFanSpeed,
  AutonomousCleaning,
  SpotCleaning,
} = require("abstract-things/climate");

const MiioApi = require("../device");
const BatteryLevel = require("./capabilities/battery-level");
const checkResult = require("../checkResult");

module.exports = class extends Vacuum.with(
  MiioApi,
  BatteryLevel,
  AdjustableFanSpeed,
  ChargingState
) {
  static get type() {
    return "miio:vacuum";
  }
  constructor(options) {
    super(options);
    this.defineProperty("state", {
      name: "status",
      mapper: (s) => {
        switch (s) {
          case 1:
            return "charging";
          case 2:
            return "not charging";
          case 5:
            return "returning";
          case 4:
            return "charging";
        }
        return "unknown-" + s;
      },
      command: {
        "siid": 2,
        "piid": 2
      }
    });

    this.defineProperty("status", {
      name: "state",
      mapper: (s) => {
        switch (s) {
          case 1:
            return "cleaning";
          case 2:
            return "waiting";
          case 3:
            return "paused";
          case 4:
            return "error";
          case 5:
            return "returning";
          case 6:
            return "charging";
        }
        return "unknown-" + s;
      },
      command: {
        "siid": 3,
        "piid": 2
      }
    });

    this.defineProperty("error", {
      name: "error",
      mapper: (e) => {
        switch (e) {
          case 0:
            return 'no error';
          case 1:
            return 'drop';
          case 2:
            return 'cliff';
          case 3:
            return 'bumper';
          case 4:
            return 'gesture';
          case 5:
            return 'bumper_repeat';
          case 6:
            return 'drop_repeat';
          case 7:
            return 'optical_flow';
          case 8:
            return 'no box';
          case 9:
            return 'no tankbox';
          case 10:
            return 'waterbox empty';
          case 11:
            return 'box full';
          case 12:
            return 'brush';
          case 13:
            return 'side brush';
          case 14:
            return 'fan';
          case 15:
            return 'left wheel motor';
          case 16:
            return 'right wheel motor';
          case 17:
            return 'turn suffocate';
          case 18:
            return 'forward suffocate';
          case 19:
            return 'charger get';
            case 20:
              return 'battery low';
            case 21:
              return 'drop';
            case 22:
              return 'cliff';
            case 23:
              return 'bumper';
            case 24:
              return 'gesture';
            case 25:
              return 'bumper_repeat';
            case 26:
              return 'drop_repeat';
            case 27:
              return 'optical_flow';
            case 28:
              return 'no box';
            case 29:
              return 'no tankbox';
          default:
            return {
              code: e,
              message: "Unknown error " + e,
            };
        }

        // TODO: Find a list of error codes and map them correctly
      },
      command: {
        "siid": 3,
        "piid": 1
      },
    });

    // Define the batteryLevel property for monitoring battery
    this.defineProperty("battery", {
      name: "batteryLevel",
      command: {
        "siid": 2,
        "piid": 1
      }
    });

    this.defineProperty("cleanTime", {
      name: "cleanTime",
      command: {
        "siid": 18,
        "piid": 13
      }
    });

    this.defineProperty("cleanArea", {
      name: "cleanArea",
      command: {
        "siid": 18,
        "piid": 15
      }
    });

    this.defineProperty("fan_speed", {
      name: "fanSpeed",
      command: {
        "siid": 18,
        "piid": 6
      }
    });

    // Consumable status - times for brushes and filters
    // From https://github.com/rytilahti/python-miio/issues/550#issuecomment-570808184
    this.defineProperty("brush_left_time", {
      name: "mainBrushWorkTime",
      mapper: (v) => v * 3600,
      command: {
        "siid": 26,
        "piid": 1
      }
    });

    this.defineProperty("brush_left_time2", {
      name: "sideBrushWorkTime",
      mapper: (v) => v * 3600,
      command: {
        "siid": 28,
        "piid": 1
      }
    });

    this.defineProperty("filter_left_time", {
      name: "filterWorkTime",
      mapper: (v) => v * 3600,
      command: {
        "siid": 27,
        "piid": 2
      }
    });

    this.defineProperty("last_clean", {
      name: "cleanTime",
      command: {
        "siid": 18,
        "piid": 13
      }
    });

    this.defineProperty("water-box-mode", {
      name: "waterBoxMode",
      command: {
        "siid": 18,
        "piid": 20
      }
    });
    
    this.defineProperty("water-box", {
      name: "waterBox",
      command: {
        "siid": 18,
        "piid": 9
      }
    });

    this._monitorInterval = 60000;
  }

  propertyUpdated(key, value, oldValue) {
    if (key === "state") {
      // Update charging state
      this.updateCharging(value === "charging");

      switch (value) {
        case "cleaning":
        case "spot-cleaning":
        case "zone-cleaning":
        case "room-cleaning":
          // The vacuum is cleaning
          this.updateCleaning(true);
          break;
        case "paused":
          // Cleaning has been paused, do nothing special
          break;
        case "error":
          // An error has occurred, rely on error mapping
          this.updateError(this.property("error"));
          break;
        case "charging-error":
          // Charging error, trigger an error
          this.updateError({
            code: "charging-error",
            message: "Error during charging",
          });
          break;
        case "charger-offline":
          // Charger is offline, trigger an error
          this.updateError({
            code: "charger-offline",
            message: "Charger is offline",
          });
          break;
        default:
          // The vacuum is not cleaning
          this.updateCleaning(false);
          break;
      }
    } else if (key === "fanSpeed") {
      this.updateFanSpeed(value);
    }

    super.propertyUpdated(key, value, oldValue);
  }

  /**
   * Get history for the specified day. The day should be fetched from
   * `getHistory`.
   */
  getHistoryForDay(day) {
    let record = day;
    if (record instanceof Date) {
      record = Math.floor(record.getTime() / 1000);
    }
    return this.call("get_clean_record", [record]).then((result) => ({
      day: day,
      history: result.map((data) => ({
        // Start and end times
        start: new Date(data[0] * 1000),
        end: new Date(data[1] * 1000),

        // How long it took in seconds
        duration: data[2],

        // Area in m2
        area: data[3] / 1000000,

        // If it was a complete run
        complete: data[5] === 1,
      })),
    }));
  }

  call_action(siid, aiid, params, options) {
    //{"did":"<mydeviceID>","siid":18,"aiid":1,"in":[{"piid":1,"value":2}]
    if (params === undefined) {
      params = [];
    }
    const payload = {
      "did": "call-" + siid + "-" + aiid,
      "siid": siid,
      "aiid": aiid,
      "in": params,
    }
    
    return this.call("action", payload, options)
  }

  set_property(siid, piid, value, options){
    //Sets property value using the existing mapping.
    //[{"did": f"set-{siid}-{piid}", "siid": siid, "piid": piid, "value": value}],
    const payload = {
      "did": "set-" + siid + "-" + piid,
      "siid": siid,
      "piid": piid,
      "value": value,
    }
    const props =[];
    props.push(payload);
    return this.call("set_properties", props, options);
  }

  getDeviceInfo() {
    return this.call("miIO.info");
  }

  /**
   * Start a cleaning session.
   */
  activateCleaning() {
    return this.call_action(3, 1, undefined, {
      refresh: ["state"],
      refreshDelay: 1000,
    }).then(checkResult);
  }

  /**
   * Stop the current cleaning session.
   */
  deactivateCleaning() {
    return this.call_action(3, 2, undefined, {
      refresh: ["state"],
      refreshDelay: 1000,
    }).then(checkResult);
  }

  /**
   * Stop the current cleaning session and return to charge.
   */
  activateCharging() {
    return this.call_action(2, 1, undefined, {
      refresh: ["state"],
      refreshDelay: 1000,
    });
  }

  /**
   * Set the power of the fan.
   * From https://github.com/rytilahti/python-miio/blob/20f915c9589fed55544a5417abe3fd3d9e12d08d/miio/viomivacuum.py#L16-L20
   * class ViomiVacuumSpeed(Enum):
   *   Silent = 0
   *   Standard = 1
   *   Strong = 2
   *   Turbo = 3
   */
  changeFanSpeed(speed) {
    return this.set_property(18, 6, speed, {
      refresh: ["fanSpeed"],
    }).then(checkResult);
  }

  /**
   * Activate the find function, will make the device give off a sound.
   */
  find() {
    return this.call_action(17, 1)
  }

  async getSerialNumber() {
    return '1234566789';
    //return this.call_action(1, 3);
    // console.log('getSerial')
    // const serial = await this.call("get_properties", [{"did":"serial-number", "siid" : 1, "piid": 3}]);
    // console.log(serial);
    // return serial[0].did;
  }

  getTimer() {
    return this.call("get_properties", {'did':'timer', 'piid':5, 'siid':18})
  }

  property(key) {
    if(key === 'state'){
      if(this._properties['status'] === 'charging'){
        return this._properties['status'];
      }
    }
    if(key==='sensorDirtyTime'){
      return 0;
    }
    return this._properties[key];
  }

  /**
   * Get WaterBoxMode (only working for the model S6)
   * @returns {Promise<*>}
   */
  async getWaterBoxMode() {
    return this.property('waterBoxMode');
  }

  setWaterBoxMode(mode) {
    return this.set_property(18, 20, mode, {
      refresh: ["waterBoxMode"],
    }).then(checkResult);
  }

    /**
   * Pause the current cleaning session.
   */
  pause() {
    return this.call_action(18, 2, [], {
      refresh: ["state"],
      refreshDelay: 1000, // https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/236
    }).then(checkResult);
  }

  /**
      *
      * @param {*} props
      */
  loadProperties(props) {
    // Rewrite property names to device internal ones    
    props = [];
    for (const [key, value] of Object.entries(this._propertyDefinitions)) {
      props.push({'did':key, 'piid':value.command.piid, 'siid':value.command.siid})
    }
    // Call get_prop to map everything
    return this.call("get_properties", props).then((result) => {
      const obj = {};
      if(result && result !== 'undefined'){
        for (let i = 0; i < result.length; i++) {
          this._pushProperty(obj, result[i].did, result[i].value);
        }
      }
      return obj;
    });
  }
};
