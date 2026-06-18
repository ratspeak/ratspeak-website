import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const downloadHtml = readFileSync(new URL('../download.html', import.meta.url), 'utf8');
const firmwareApi = readFileSync(new URL('../api/firmware.js', import.meta.url), 'utf8');

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('No matching brace found');
}

function extractObjectLiteral(source, declaration) {
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `missing ${declaration}`);
  const open = source.indexOf('{', start);
  const close = findMatchingBrace(source, open);
  return source.slice(open, close + 1);
}

function extractDownloadVar(name) {
  return extractObjectLiteral(downloadHtml, `var ${name} =`);
}

function extractApiConst(name) {
  return extractObjectLiteral(firmwareApi, `const ${name} =`);
}

function evaluateObject(literal, context = {}) {
  return vm.runInNewContext(`(${literal})`, context);
}

function extractFunction(name) {
  const start = downloadHtml.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const functionStart = downloadHtml.slice(Math.max(0, start - 6), start) === 'async '
    ? start - 6
    : start;
  const open = downloadHtml.indexOf('{', start);
  const close = findMatchingBrace(downloadHtml, open);
  return downloadHtml.slice(functionStart, close + 1);
}

function evaluateDownloadFunctions(names, extraContext = {}) {
  const source = `${names.map(extractFunction).join('\n')}\n({ ${names.join(', ')} })`;
  return vm.runInNewContext(source, { Uint8Array, ...extraContext });
}

function extractNumberConst(name) {
  const match = downloadHtml.match(new RegExp(`var\\s+${name}\\s*=\\s*(\\d+)\\s*;`));
  assert.ok(match, `missing numeric constant ${name}`);
  return Number(match[1]);
}

function makePort(vendorId, productId) {
  return {
    getInfo() {
      return { usbVendorId: vendorId, usbProductId: productId };
    }
  };
}

test('TCXO aliases select firmware but EEPROM provisioning writes normalized model bytes', () => {
  const variantHints = evaluateObject(extractDownloadVar('VARIANT_HINTS'));
  const bandModels = evaluateObject(extractDownloadVar('RNODE_VARIANT_BAND_MODELS'));
  const tcxoName = 'rnode_firmware_lora32v21_tcxo.zip';

  assert.equal(variantHints[tcxoName].product, 0xB1);
  assert.equal(variantHints[tcxoName].model, 0x09);
  assert.equal(bandModels[tcxoName].low, 0x04);
  assert.equal(bandModels[tcxoName].high, 0x09);

  const {
    normalizeRnodeEepromModel,
    normalizeRnodeProvisioningIdentity
  } = evaluateDownloadFunctions([
    'normalizeRnodeEepromModel',
    'normalizeRnodeProvisioningIdentity'
  ]);

  assert.equal(normalizeRnodeEepromModel(0x04), 0xB4);
  assert.equal(normalizeRnodeEepromModel(0x09), 0xB9);
  assert.equal(normalizeRnodeEepromModel(0xA6), 0xA6);
  const normalized = normalizeRnodeProvisioningIdentity({ product: 0xB1, model: 0x09 });
  assert.equal(normalized.product, 0xB1);
  assert.equal(normalized.selectedModel, 0x09);
  assert.equal(normalized.model, 0xB9);
});

test('legacy TCXO alias EEPROM readback is rejected with a specific error', () => {
  const ROM_ADDR = {
    PRODUCT: 0x00,
    MODEL: 0x01,
    HW_REV: 0x02,
    INFO_LOCK: 0x9B
  };
  const context = {
    ROM_ADDR,
    RNODE_EEPROM_RESERVED: 200,
    INFO_LOCK_BYTE: 0x73,
    md5EqualsStoredIdentityChecksum() {
      return true;
    }
  };
  const { validateRnodeIdentityForBoard } = evaluateDownloadFunctions([
    'normalizeRnodeEepromModel',
    'validateRnodeIdentityForBoard'
  ], context);
  const rom = new Uint8Array(200);
  rom[ROM_ADDR.PRODUCT] = 0xB1;
  rom[ROM_ADDR.MODEL] = 0x09;
  rom[ROM_ADDR.HW_REV] = 1;
  rom[ROM_ADDR.INFO_LOCK] = 0x73;

  assert.match(
    validateRnodeIdentityForBoard(rom, 0xB1, 0xB9),
    /TCXO firmware-selection alias/
  );
});

test('unsigned browser provisioning is explicit and always uses a blank signature', () => {
  assert.match(downloadHtml, /use rnodeconf when signed identity/);
  assert.match(downloadHtml, /Browser RNode setup writes an unsigned identity/);
  assert.match(downloadHtml, /RNODE_UNSIGNED_PROVISIONING_NOTICE/);

  const { buildUnsignedRnodeSignature } = evaluateDownloadFunctions([
    'buildUnsignedRnodeSignature'
  ]);
  const signature = buildUnsignedRnodeSignature();

  assert.equal(signature.length, 128);
  assert.equal(signature.every((byte) => byte === 0), true);
});

test('RNode API-supported variants have page hints and platform-specific flash paths', () => {
  const variantHints = evaluateObject(extractDownloadVar('VARIANT_HINTS'));
  const esp32Specs = evaluateObject(extractDownloadVar('RNODE_ESP32_FLASH_SPECS'), {
    rnodeSpec(flashSize, bootloaderOffset) {
      return { flashSize, bootloaderOffset };
    }
  });
  const apiVariants = evaluateObject(extractApiConst('RNODE_VARIANTS'), {
    rnodeVariant(platform, flashStrategy) {
      return { platform, flashStrategy };
    }
  });

  for (const name of Object.keys(apiVariants)) {
    assert.ok(variantHints[name], `${name} is API-supported but has no page identity hint`);
  }

  for (const [name, meta] of Object.entries(apiVariants)) {
    if (meta.platform === 'esp32') {
      assert.equal(meta.flashStrategy, 'esp32-esptool');
      assert.ok(esp32Specs[name], `${name} is ESP32 but has no page flash spec`);
    } else if (meta.platform === 'nrf52') {
      assert.equal(meta.flashStrategy, 'nrf52-dfu');
      assert.equal(esp32Specs[name], undefined, `${name} must not use ESP32 flash specs`);
    } else {
      assert.fail(`unexpected platform ${meta.platform} for ${name}`);
    }
  }

  for (const name of Object.keys(esp32Specs)) {
    assert.equal(apiVariants[name]?.platform, 'esp32', `${name} has an ESP32 flash spec but is not API-supported as ESP32`);
  }
});

test('nRF52 DFU path is separate from ESP32 flashing and has a long reboot settle', () => {
  const apiVariants = evaluateObject(extractApiConst('RNODE_VARIANTS'), {
    rnodeVariant(platform, flashStrategy) {
      return { platform, flashStrategy };
    }
  });
  const nrf52Names = Object.entries(apiVariants)
    .filter(([, meta]) => meta.platform === 'nrf52')
    .map(([name]) => name)
    .sort();

  assert.deepEqual(nrf52Names, [
    'rnode_firmware_heltec_t114.zip',
    'rnode_firmware_rak4631.zip',
    'rnode_firmware_rak4631_sx1280.zip',
    'rnode_firmware_techo.zip'
  ]);
  assert.equal(extractNumberConst('RNODE_NRF52_DFU_REBOOT_WAIT_MS') >= 9000, true);
  assert.match(downloadHtml, /nRF52 DFU updates the application image/);
  assert.match(downloadHtml, /nRF52 app DFU, bootloader and EEPROM preserved/);
  assert.match(downloadHtml, /ACK_PACKET_TIMEOUT_MS\s*=\s*1000/);
  assert.match(downloadHtml, /readAckNumber/);
  assert.match(downloadHtml, /sendPacket\(this\.createHciPacketFromFrame\(frame\)\)/);
  assert.match(downloadHtml, /getActivateWaitTimeMs/);
  assert.match(downloadHtml, /waiting for nRF52 bootloader activation\/copy/);
});

test('verified host-controlled RNode setup explains Missing Config instead of treating it as repair-only', () => {
  assert.match(downloadHtml, /Ratspeak keeps startup radio settings host-controlled/);
  assert.match(downloadHtml, /Missing Config can be normal in host-controlled mode/);
  assert.match(downloadHtml, /Missing Config on a display board is expected until Ratspeak opens it/);
  assert.match(downloadHtml, /state\.rnodeHostControlledMode = !!rnodeProvisionResult\.normalModeSet/);

  const state = {
    device: 'custom',
    rnodeAssetName: 'rnode_firmware_techo.zip',
    rnodeAssetLabel: 'LilyGO T-Echo',
    rnodeFlashStrategy: 'nrf52-dfu'
  };
  const {
    isNrf52RnodeFirmwareSelected,
    rnodeHostControlledNotice
  } = evaluateDownloadFunctions([
    'selectedFlashStrategy',
    'isOfficialRnodeFirmwareSelected',
    'isNrf52RnodeFirmwareSelected',
    'selectedRnodeLabel',
    'rnodeHostControlledNotice'
  ], { state });

  assert.equal(isNrf52RnodeFirmwareSelected(), true);
  assert.match(rnodeHostControlledNotice(), /^LilyGO T-Echo may show Missing Config while idle\./);
  assert.match(rnodeHostControlledNotice(), /startup radio settings stay host-controlled/);
});

test('nRF52 RNode provisioning is click-driven after a physical reset', () => {
  assert.match(downloadHtml, /Reset the board once, then finish RNode setup/);
  assert.match(downloadHtml, /Press RESET once\. When the serial port returns, click Finish Setup\./);
  assert.match(downloadHtml, /requestFreshRnodePortFromUser/);
  assert.match(downloadHtml, /kind === 'reconnect' \|\| isRnodeReconnectSetupIssue/);
  assert.match(downloadHtml, /Select the RNode serial port\./);
  assert.match(downloadHtml, /Selected port did not answer as RNode/);
  assert.match(downloadHtml, /Finish Setup/);
  assert.doesNotMatch(downloadHtml, /Activate RNode/);
  assert.match(downloadHtml, /settleMs: rnodeActivationSettleMs\(\)/);
  assert.match(downloadHtml, /rnodePostResetSettleMs\(\)/);
  assert.match(downloadHtml, /dataTerminalReady:\s*true/);
  assert.match(downloadHtml, /requestToSend:\s*true/);
  assert.match(downloadHtml, /detectRnodeKissService\(session\)/);
  assert.match(downloadHtml, /CMD_DETECT/);

  const state = {
    device: 'custom',
    rnodeAssetName: 'rnode_firmware_techo.zip',
    rnodeAssetLabel: 'LilyGO T-Echo',
    rnodeFlashStrategy: 'nrf52-dfu'
  };
  const {
    shouldUseClickDrivenRnodeProvisioning,
    rnodeActivationPortGuidance,
    rnodeActivationRetryGuidance,
    rnodePortSelectionGuidance,
    rnodeActivationSettleMs,
    rnodePostResetSettleMs
  } = evaluateDownloadFunctions([
    'selectedFlashStrategy',
    'isOfficialRnodeFirmwareSelected',
    'isNrf52RnodeFirmwareSelected',
    'isTechoRnodeFirmwareSelected',
    'shouldUseClickDrivenRnodeProvisioning',
    'rnodeActivationPortGuidance',
    'rnodePortSelectionGuidance',
    'rnodeActivationRetryGuidance',
    'rnodeActivationSettleMs',
    'rnodePostResetSettleMs'
  ], {
    state,
    RNODE_NRF52_ACTIVATION_SETTLE_MS: 20000,
    RNODE_NRF52_POST_RESET_SETTLE_MS: 20000,
    RNODE_REPAIR_SETTLE_MS: 1500
  });

  assert.equal(shouldUseClickDrivenRnodeProvisioning(), true);
  assert.equal(rnodeActivationPortGuidance(), 'Press RESET once. When the serial port returns, click Finish Setup.');
  assert.equal(rnodePortSelectionGuidance(), 'Select the RNode serial port.');
  assert.equal(rnodeActivationRetryGuidance(), 'Press RESET once, then try Finish Setup again.');
  assert.equal(rnodeActivationSettleMs(), 20000);
  assert.equal(rnodePostResetSettleMs(), 20000);

  state.rnodeAssetName = 'rnode_firmware_heltec_t114.zip';
  state.rnodeAssetLabel = 'Heltec Mesh Node T114';
  assert.equal(rnodeActivationPortGuidance(), 'Reset or unplug/replug the board. When the serial port returns, click Finish Setup.');
  assert.equal(rnodeActivationRetryGuidance(), 'Reset or unplug/replug the board, then try Finish Setup again.');
});

test('Web Serial open failures are reconnect handoffs, not provisioning failures', () => {
  const { isRnodeReconnectSetupIssue } = evaluateDownloadFunctions([
    'isRnodeReconnectSetupIssue'
  ]);

  assert.equal(
    isRnodeReconnectSetupIssue("Failed to execute 'open' on 'SerialPort': Failed to open serial port."),
    true
  );
  assert.equal(isRnodeReconnectSetupIssue('Selected serial port did not answer as RNode'), true);
  assert.equal(isRnodeReconnectSetupIssue('NetworkError: The device has been lost.'), true);
  assert.equal(isRnodeReconnectSetupIssue('RNode model byte was not written'), false);
});

test('RNode setup tries the user-selected serial port before stale authorized ports', async () => {
  const selected = makePort(0x239A, 0x002A);
  const staleBootloader = makePort(0x239A, 0x0029);
  const otherDevice = makePort(0x1A86, 0x7523);
  const state = { port: selected };

  const { collectRnodePortCandidates } = evaluateDownloadFunctions([
    'authorizedSerialPorts',
    'collectRnodePortCandidates'
  ], {
    state,
    navigator: {
      serial: {
        getPorts: async () => [staleBootloader, selected, otherDevice]
      }
    }
  });

  const candidates = await collectRnodePortCandidates();
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0], selected);
  assert.equal(candidates[1], staleBootloader);
  assert.equal(candidates[2], otherDevice);
});

test('post-flash reconnect prefers stable Web Serial handles and matching USB IDs', () => {
  const {
    chooseRnodeReconnectPort
  } = evaluateDownloadFunctions([
    'portUsbInfo',
    'sameUsbInfo',
    'chooseRnodeReconnectPort'
  ]);

  const previous = makePort(0x303A, 0x1001);
  const sameDevice = makePort(0x303A, 0x1001);
  const otherDevice = makePort(0x1A86, 0x7523);

  assert.equal(chooseRnodeReconnectPort([previous, otherDevice], previous), previous);
  assert.equal(chooseRnodeReconnectPort([otherDevice, sameDevice], previous), sameDevice);
  assert.equal(chooseRnodeReconnectPort([otherDevice, sameDevice, makePort(0x303A, 0x1001)], previous), sameDevice);
  assert.equal(chooseRnodeReconnectPort([otherDevice], previous), otherDevice);
  assert.equal(chooseRnodeReconnectPort([], previous), null);
});

test('RNode reconnect timings remain explicit for board-dependent boot behavior', () => {
  assert.equal(extractNumberConst('RNODE_POST_FLASH_BOOT_WAIT_MS') >= 9000, true);
  assert.equal(extractNumberConst('RNODE_PORT_OPEN_RETRIES') >= 4, true);
  assert.equal(extractNumberConst('RNODE_PORT_OPEN_RETRY_DELAY_MS') >= 900, true);
  assert.match(downloadHtml, /refreshRnodePortAfterReboot/);
});
