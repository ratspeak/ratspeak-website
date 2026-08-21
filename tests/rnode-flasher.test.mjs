import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
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
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(downloadHtml);
  assert.ok(match, `missing function ${name}`);
  const functionStart = match.index;
  const start = downloadHtml.indexOf('function', functionStart);
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

test('valid unlocked browser identities are completed and verified before locking', () => {
  assert.match(downloadHtml, /validateUnlockedRnodeIdentityPayloadForBoard\(rom, product, model\)/);
  assert.match(downloadHtml, /browserSignatureIsRepairable\(rom\)/);
  assert.match(downloadHtml, /Completing and verifying the unlocked browser identity before lock/);
  assert.match(downloadHtml, /Unlocked identity contains a non-browser signature; use rnodeconf/);
  assert.match(downloadHtml, /use Full Erase and flash again/);

  const ROM_ADDR = {
    PRODUCT: 0x00,
    MODEL: 0x01,
    HW_REV: 0x02,
    SIGNATURE: 0x1B,
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
  const {
    browserSignatureIsRepairable,
    validateRnodeIdentityForBoard,
    validateUnlockedRnodeIdentityPayloadForBoard
  } = evaluateDownloadFunctions([
    'browserSignatureIsRepairable',
    'normalizeRnodeEepromModel',
    'validateRnodeIdentityForBoard',
    'validateUnlockedRnodeIdentityPayloadForBoard'
  ], context);
  const rom = new Uint8Array(200);
  rom[ROM_ADDR.PRODUCT] = 0x15;
  rom[ROM_ADDR.MODEL] = 0x17;
  rom[ROM_ADDR.HW_REV] = 1;
  rom[ROM_ADDR.INFO_LOCK] = 0xFF;

  assert.equal(validateRnodeIdentityForBoard(rom, 0x15, 0x17), 'RNode identity was not locked');
  assert.equal(validateUnlockedRnodeIdentityPayloadForBoard(rom, 0x15, 0x17), null);
  assert.equal(browserSignatureIsRepairable(rom), true);
  rom[ROM_ADDR.SIGNATURE + 12] = 0x42;
  assert.equal(browserSignatureIsRepairable(rom), false);
});

test('nRF52 identity writes are paced and fully verified before lock', () => {
  assert.equal(extractNumberConst('RNODE_NRF52_ROM_WRITE_DELAY_MS') >= 150, true);
  assert.equal(extractNumberConst('RNODE_NRF52_POST_IDENTITY_WRITE_DELAY_MS') >= 3000, true);
  const identitySource = extractFunction('writeRnodeIdentity');
  const preLockVerification = identitySource.indexOf('rnodeIdentityMismatchAddresses(unlockedRom, expected)');
  const lockWrite = identitySource.indexOf('writeRomOrLocked(session, ROM_ADDR.INFO_LOCK, INFO_LOCK_BYTE)');
  assert.notEqual(preLockVerification, -1);
  assert.notEqual(lockWrite, -1);
  assert.ok(preLockVerification < lockWrite, 'identity must be verified before INFO_LOCK is written');
  assert.match(identitySource, /Full identity verified before lock/);
  assert.match(identitySource, /EEPROM was left unlocked/);

  const state = {
    device: 'custom',
    rnodeAssetName: 'rnode_firmware_techo.zip',
    rnodeFlashStrategy: 'nrf52-dfu'
  };
  const { rnodePostIdentityWriteDelayMs, rnodeRomWriteDelayMs } = evaluateDownloadFunctions([
    'selectedFlashStrategy',
    'isOfficialRnodeFirmwareSelected',
    'isNrf52RnodeFirmwareSelected',
    'rnodePostIdentityWriteDelayMs',
    'rnodeRomWriteDelayMs'
  ], {
    state,
    RNODE_NRF52_ROM_WRITE_DELAY_MS: 150,
    RNODE_ROM_WRITE_DELAY_MS: 25,
    RNODE_NRF52_POST_IDENTITY_WRITE_DELAY_MS: 3500,
    RNODE_POST_EEPROM_DELAY_MS: 1000
  });

  assert.equal(rnodePostIdentityWriteDelayMs(), 3500);
  assert.equal(rnodeRomWriteDelayMs(), 150);
  state.rnodeFlashStrategy = 'esp32-esptool';
  assert.equal(rnodePostIdentityWriteDelayMs(), 1000);
  assert.equal(rnodeRomWriteDelayMs(), 25);
});

test('EEPROM writes fail on every device error and never silently continue', async () => {
  const context = {
    KISS: {
      CMD_ROM_WRITE: 0x52,
      CMD_ERROR: 0x90,
      ERROR_EEPROM_LOCKED: 0x03
    },
    RNODE_ROM_WRITE_ERROR_WINDOW_MS: 45,
    rnodeRomWriteDelayMs: () => 150,
    sleepMs: async () => {},
    hexByte: (value) => `0x${value.toString(16).padStart(2, '0').toUpperCase()}`
  };
  const { sendRomWrite } = evaluateDownloadFunctions(['sendRomWrite'], context);
  const makeSession = (frame) => ({
    send: async () => {},
    readFrame: async () => frame
  });

  assert.equal(
    await sendRomWrite(makeSession({ command: 0x90, payload: [0x03] }), 1, 2),
    false
  );
  await assert.rejects(
    () => sendRomWrite(makeSession({ command: 0x90, payload: [0x07] }), 1, 2),
    /error 0x07 during EEPROM write/
  );
  assert.equal(await sendRomWrite(makeSession(null), 1, 2), true);
});

test('incomplete identity readback never writes the irreversible lock byte', async () => {
  const ROM_ADDR = {
    PRODUCT: 0x00,
    MODEL: 0x01,
    HW_REV: 0x02,
    SERIAL: 0x03,
    MADE: 0x07,
    CHKSUM: 0x0B,
    SIGNATURE: 0x1B,
    INFO_LOCK: 0x9B
  };
  const incompleteRom = new Uint8Array(200).fill(0xFF);
  let lockWrites = 0;
  const context = {
    ROM_ADDR,
    INFO_LOCK_BYTE: 0x73,
    RNODE_EEPROM_RESERVED: 200,
    RNODE_EEPROM_READ_RETRY_DELAY_MS: 1200,
    readRnodeRomWithRetry: async () => incompleteRom,
    writeRnodeIdentityPayload: async () => {},
    writeRomOrLocked: async (_session, address) => {
      if (address === ROM_ADDR.INFO_LOCK) lockWrites += 1;
    },
    rnodePostIdentityWriteDelayMs: () => 3500,
    sleepMs: async () => {}
  };
  const { writeRnodeIdentity } = evaluateDownloadFunctions([
    'buildRnodeIdentityPayload',
    'rnodeIdentityMismatchAddresses',
    'verifyRnodeIdentityPayload',
    'verifyProvisionedEeprom',
    'writeRnodeIdentity'
  ], context);

  await assert.rejects(
    () => writeRnodeIdentity(
      {}, 0xC2, 0xC7, 1,
      new Uint8Array([0, 0, 0, 1]),
      new Uint8Array([0, 0, 0, 2]),
      new Uint8Array(16),
      new Uint8Array(128),
      () => {}
    ),
    /identity remained incomplete; EEPROM was left unlocked/
  );
  assert.equal(lockWrites, 0);
});

test('firmware hash verification rejects zero and erased hashes', async () => {
  let targetHash = new Uint8Array(32);
  let actualHash = new Uint8Array(32);
  const context = {
    RNODE_REPAIR_SETTLE_MS: 1500,
    KISS: {
      HASH_TYPE_TARGET_FIRMWARE: 0x01,
      HASH_TYPE_FIRMWARE: 0x02
    },
    withRnodeSession: async (_logMessage, _settleMs, callback) => callback({}),
    readRnodeFirmwareHash: async (_session, hashType) => (
      hashType === 0x01 ? targetHash : actualHash
    )
  };
  const { ensureRnodeFirmwareHashMatches } = evaluateDownloadFunctions([
    'hashesEqual',
    'isZeroHash',
    'isErasedHash',
    'isUninitializedRnodeHash',
    'ensureRnodeFirmwareHashMatches'
  ], context);

  await assert.rejects(
    () => ensureRnodeFirmwareHashMatches(() => {}, null, { quiet: true }),
    /RNode firmware hashes are not initialized yet/
  );

  targetHash.fill(0xFF);
  actualHash.fill(0xFF);
  await assert.rejects(
    () => ensureRnodeFirmwareHashMatches(() => {}, null, { quiet: true }),
    /RNode firmware hashes are not initialized yet/
  );

  targetHash = Uint8Array.from({ length: 32 }, (_value, index) => index + 1);
  actualHash = Uint8Array.from(targetHash);
  const status = await ensureRnodeFirmwareHashMatches(() => {}, null, { quiet: true });
  assert.deepEqual(Array.from(status.target), Array.from(targetHash));
});

test('firmware hash adoption requires a fresh post-reboot readback', async () => {
  const actualHash = Uint8Array.from({ length: 32 }, (_value, index) => index + 1);
  const erasedHash = new Uint8Array(32).fill(0xFF);
  let sessionCount = 0;
  let hashSent = false;
  let persistWrite = false;
  const context = {
    RNODE_REPAIR_SETTLE_MS: 1500,
    KISS: {
      HASH_TYPE_TARGET_FIRMWARE: 0x01,
      HASH_TYPE_FIRMWARE: 0x02
    },
    rnodePostResetSettleMs: () => 20000,
    withRnodeSession: async (_logMessage, _settleMs, callback) => {
      const session = { pass: sessionCount };
      sessionCount += 1;
      return callback(session);
    },
    readRnodeFirmwareHash: async (session, hashType) => {
      if (hashType === 0x02) return actualHash;
      if (session.pass === 0 || !persistWrite) return erasedHash;
      return actualHash;
    },
    sendRnodeFirmwareHash: async () => {
      hashSent = true;
    }
  };
  const { ensureRnodeFirmwareHashMatches } = evaluateDownloadFunctions([
    'hashesEqual',
    'isZeroHash',
    'isErasedHash',
    'isUninitializedRnodeHash',
    'ensureRnodeFirmwareHashMatches'
  ], context);

  await assert.rejects(
    () => ensureRnodeFirmwareHashMatches(() => {}, null, { quiet: true }),
    /firmware hash did not persist across the RNode reboot/
  );
  assert.equal(hashSent, true);
  assert.equal(sessionCount, 2);

  sessionCount = 0;
  hashSent = false;
  persistWrite = true;
  const status = await ensureRnodeFirmwareHashMatches(() => {}, null, { quiet: true });
  assert.equal(hashSent, true);
  assert.equal(sessionCount, 2);
  assert.deepEqual(Array.from(status.target), Array.from(actualHash));
});

test('selected nRF52 image hash cannot be replaced by an unexpected running hash', async () => {
  const selectedHash = new Uint8Array(32).fill(0xA5);
  const unexpectedHash = new Uint8Array(32).fill(0x5A);
  let hashSent = false;
  const context = {
    RNODE_REPAIR_SETTLE_MS: 1500,
    KISS: {
      HASH_TYPE_TARGET_FIRMWARE: 0x01,
      HASH_TYPE_FIRMWARE: 0x02
    },
    withRnodeSession: async (_logMessage, _settleMs, callback) => callback({}),
    readRnodeFirmwareHash: async () => unexpectedHash,
    sendRnodeFirmwareHash: async () => {
      hashSent = true;
    }
  };
  const { ensureRnodeFirmwareHashMatches } = evaluateDownloadFunctions([
    'hashesEqual',
    'isZeroHash',
    'isErasedHash',
    'isUninitializedRnodeHash',
    'ensureRnodeFirmwareHashMatches'
  ], context);

  await assert.rejects(
    () => ensureRnodeFirmwareHashMatches(() => {}, null, {
      quiet: true,
      expectedHash: selectedHash
    }),
    /running firmware hash does not match the selected image/
  );
  assert.equal(hashSent, false);
  assert.match(
    extractFunction('runProvisioning'),
    /expectedHash:\s*expectedFirmwareHash/
  );
});

test('nRF52 target hash covers the exact DFU application bytes', async () => {
  const state = {
    device: 'custom',
    rnodeAssetName: 'rnode_firmware_heltec_t114.zip',
    rnodeFlashStrategy: 'nrf52-dfu'
  };
  const { computeFirmwareHash } = evaluateDownloadFunctions([
    'selectedFlashStrategy',
    'sha256',
    'computeFirmwareHash'
  ], { state, crypto: webcrypto });

  const hash = await computeFirmwareHash(new Uint8Array([0x61, 0x62, 0x63]));
  assert.equal(
    Buffer.from(hash).toString('hex'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
  assert.match(downloadHtml, /state\.firmwareAppBytes = firmware/);
});

test('official RNode release assets are size- and SHA-256-verified before becoming ready', async () => {
  const {
    verifyOfficialRnodeReleaseAsset
  } = evaluateDownloadFunctions([
    'bytesToHex',
    'sha256',
    'normalizeSha256Hex',
    'verifyOfficialRnodeReleaseAsset'
  ], { crypto: webcrypto });
  const asset = new Uint8Array([0x61, 0x62, 0x63]);
  const published = {
    size: asset.byteLength,
    sha256: 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD'
  };

  assert.equal(
    await verifyOfficialRnodeReleaseAsset(asset.buffer, published),
    published.sha256.toLowerCase()
  );
  await assert.rejects(
    () => verifyOfficialRnodeReleaseAsset(asset.buffer, { ...published, size: 4 }),
    /size does not match publisher metadata/
  );
  await assert.rejects(
    () => verifyOfficialRnodeReleaseAsset(asset.buffer, { ...published, sha256: null }),
    /missing a valid publisher SHA-256 digest/
  );
  await assert.rejects(
    () => verifyOfficialRnodeReleaseAsset(asset.buffer, { ...published, sha256: '00'.repeat(32) }),
    /failed publisher SHA-256 verification/
  );

  const downloadStart = downloadHtml.indexOf("rnodeVariantSelect.addEventListener('change'");
  const verifyCall = downloadHtml.indexOf('await verifyOfficialRnodeReleaseAsset(buf, meta)', downloadStart);
  const assetAssignment = downloadHtml.indexOf('state.rnodeAsset = buf', downloadStart);
  const readyAssignment = downloadHtml.indexOf('state.firmwareReady = true', downloadStart);
  assert.ok(downloadStart >= 0);
  assert.ok(verifyCall > downloadStart);
  assert.ok(assetAssignment > verifyCall);
  assert.ok(readyAssignment > assetAssignment);
  assert.match(extractFunction('updateRnodeReadyStatus'), /publisher SHA-256 verified/);
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

test('verified RNode setup does not surface Missing Config copy after completion', () => {
  assert.match(downloadHtml, /Ratspeak keeps startup radio settings host-controlled/);
  assert.doesNotMatch(downloadHtml, /Missing Config/);
  assert.match(downloadHtml, /Use if identity or firmware-hash setup fails\./);
  assert.match(downloadHtml, /titleEl\.textContent = 'RNode Ready'/);
  assert.match(downloadHtml, /descEl\.textContent = ''/);
  assert.match(downloadHtml, /state\.rnodeHostControlledMode = !!rnodeProvisionResult\.normalModeSet/);

  const state = {
    device: 'custom',
    rnodeAssetName: 'rnode_firmware_techo.zip',
    rnodeAssetLabel: 'LilyGO T-Echo',
    rnodeFlashStrategy: 'nrf52-dfu'
  };
  const {
    isNrf52RnodeFirmwareSelected
  } = evaluateDownloadFunctions([
    'selectedFlashStrategy',
    'isOfficialRnodeFirmwareSelected',
    'isNrf52RnodeFirmwareSelected'
  ], { state });

  assert.equal(isNrf52RnodeFirmwareSelected(), true);
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
  assert.match(
    extractFunction('runReprovisionOnly'),
    /if \(!result \|\| !result\.firmwareHashWritten\)[\s\S]*throw new Error\('RNode firmware hash was not written and verified'\)/
  );

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
