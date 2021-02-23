"use strict";

function checkResult(r) {
  // {"result":0,"id":17}      = Firmware 3.3.9_003095 (Gen1)
  // {"result":["ok"],"id":11} = Firmware 3.3.9_003194 (Gen1), 3.3.9_001168 (Gen2)
  // {"result":["OK"],"id":11} = Firmware 1.3.0_0752 on Xiaowa E202-02
  //{ did: 'call-3-1', siid: 3, aiid: 1, code: 0, out: [] } = Dreame
  if (r !== 0 && r[0] !== "ok" && r[0] !== "OK" && r[3] !== undefined && r[3] !== 0) {
    throw new Error("Could not complete call to device");
  }
}

module.exports = checkResult;
