// Flasher engine shared by download.html (handheld installer) and flash.html (advanced flasher). Ported from the live download.html module.
import { betaRequest, rsnodeBoard, rsnodeBoardForTarget, validateBetaCatalog, verifyBetaDownload, validateBetaManifest } from '/assets/js/rsnode-beta.js';
import { addRsnodeOwner, parseHash, provisionRsnode, readManagementStatus } from '/assets/js/rsnode-provision.js';
import { APP_PORT as RSNODE_APP_PORT, WIFI_MODES, checkSettingsForm, readRsnodeSettings, settingsChanges, settingsForm,
    settingsRadioLines, settingsSavedMessage, writeRsnodeSettings } from '/assets/js/rsnode-settings.js';
import { REPEATER_PRESETS, checkRepeaterForm, controlRepeater, readRsnodeIdentity, repeaterOwner, repeaterRadioLine, repeaterRegions,
    repeaterSavedMessage, repeaterSettingsForm, repeaterSetupEntries, repeaterSummary, writeRepeaterSetup } from '/assets/js/rsnode-repeater.js';
import { nodeContactCard, parseContactCard } from '/assets/js/rsnode-card.js';
import { renderQrCanvas } from '/assets/js/qr-code.js';
import { cameraAvailable, startQrScan } from '/assets/js/qr-scan.js';
import { HOST_OWNERS, SCREEN_HEIGHT, SCREEN_WIDTH, leaveRsnode, readRsnodeFacts, readRsnodeRadio, readRsnodeScreen,
    readRsnodeStatus, restartRsnode, rsnodeBluetoothOff, rsnodeDetails, rsnodeSummary, screenSupported, startRsnodePairing,
    waitForRsnode } from '/assets/js/rsnode-device.js';
import { chooseRsnodeInstall, streamRsnodeUpdate, verifyRsnodeBundle } from '/assets/js/rsnode-update.js';
import { handheldBoard, handheldCapabilities, handheldRelease, HANDHELD_REPOSITORY, verifyHandheldDownload, validateHandheldManifest, identifyHandheldImage, validateHandheldImage } from '/assets/js/handheld-release.js';
import { md5Bytes } from '/assets/js/md5.js';
import { closeFlashTransport } from '/assets/js/esp-serial.js';
import { inspectHandheld, handheldUpdatePlan, handheldConfirmation } from '/assets/js/handheld-update.js';
(function() {
    'use strict';

    // download.html hosts the handheld installer, flash.html the advanced one.
    var HANDHELD = !!document.getElementById('firmwarePreset');
    var ADVANCED = !!document.getElementById('firmwareCustom');

    // ── Theme colour ──
    var htmlEl = document.documentElement;
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    function syncThemeColor() {
        if (!themeMeta) return;
        var c = getComputedStyle(htmlEl).getPropertyValue('--bg-primary').trim();
        if (c) themeMeta.setAttribute('content', c);
    }
    syncThemeColor();

    // ── esptool-js lazy loader ─────────────────────────
    var esptoolModule = null;
    async function loadEsptool() {
        if (!esptoolModule) {
            esptoolModule = await import('https://unpkg.com/esptool-js@0.5.7/bundle.js');
        }
        return esptoolModule;
    }

    // esptool-js 0.5.x expects writeFlash file data as a binary string.
    // Keep raw Uint8Array values separately for firmware hashing/provisioning.
    function uint8ToBstr(u8) {
        var chunks = [];
        var CHUNK = 8192;
        for (var i = 0; i < u8.length; i += CHUNK) {
            chunks.push(String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK)));
        }
        return chunks.join('');
    }

    // ── State ──────────────────────────────────────────
    var state = {
        device: null,       // Handheld board ID or 'custom'
        customSource: 'upload',
        rsnodeAsset: null,
        rsnodeMetadata: null,
        rsnodeLoading: false,
        rsnodeLoadFailed: false,
        rsnodeInstalled: false,
        rsnodeUpdated: null,
        rsnodeBundle: null,
        rsnodeChoice: null,
        rsnodeNotice: null,
        rsnodeMode: 'install',
        port: null,         // Web Serial port (unopened — esptool manages open/close)
        connected: false,
        firmwareReady: false,
        firmwareError: null,
        firmwareZip: null,  // ArrayBuffer of ZIP from GitHub release
        firmwareMetadata: null,
        selectedVersion: null,
        selectedPackage: null,
        packageExplicit: false,
        releases: [],
        repoPath: '',
        firmwareRequestSerial: 0,
        firmwareProgress: null,
        customFile: null,
        customOffsets: null,
        rnodeAsset: null,
        rnodeAssetName: null,
        rnodeAssetLabel: null,
        rnodeAssetSha256: null,
        rnodeFlashStrategy: null,
        rnodePlatform: null,
        rnodeBand: null,
        rnodeVersion: null,
        rnodeProvision: false,
        rnodeProvisionInfo: null,
        rnodeSetupIssue: null,
        rnodeSetupIssueKind: null,
        rnodeSetupVerified: false,
        rnodeHostControlledMode: false,
        firmwareBytes: null,
        firmwareAppBytes: null,
        flashing: false,
        flashStage: 'preparing',
        flashComplete: false,
        eraseAll: false,
        transport: null,
        esploader: null
    };

    var FLASH_ICON_HTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
    function flashButtonLabel() {
        if (isRsnodeSelected()) {
            return rsnodeUpdateChosen() ? 'Update rsNode' : state.rsnodeChoice && state.rsnodeChoice.kind === 'current' ? 'Erase and reinstall' : 'Flash rsNode';
        }
        return state.device === 'custom' ? 'Install firmware' : 'Install Ratspeak';
    }
    function setFlashButtonIdleContent() {
        var btn = document.getElementById('flashBtn');
        if (btn) btn.innerHTML = FLASH_ICON_HTML + ' ' + flashButtonLabel();
    }

    var DEVICES = {
        tdeck: {
            name: 'T-Deck Plus',
            accent: 'green',
            firmwareSize: 'Loading from GitHub...'
        },
        cardputer: {
            name: 'Cardputer Adv',
            accent: 'blue',
            firmwareSize: 'Loading from GitHub...'
        },
        tpager: {
            name: 'T-Pager',
            accent: 'green',
            firmwareSize: 'Loading from GitHub...'
        },
        m9: {
            name: 'ThinkNode M9',
            accent: 'green',
            firmwareSize: 'Loading from GitHub...'
        },
        custom: {
            name: 'Your board',
            sub: 'ESP32 or nRF52 \u00b7 rsNode, RNode, or your own file',
            art: 'board',
            accent: 'amber',
            firmware: null,
            firmwareSize: null,
            apiDevice: null
        }
    };

    var PACKAGE_DESCRIPTIONS = {
        full: { label: 'Messenger and radio', desc: 'Recommended. Pick the mode each time the device starts.' },
        standalone: { label: 'Messenger only', desc: 'Send and read messages on the device itself.' },
        rnode: { label: 'Radio for your phone or computer', desc: 'The Ratspeak app sends over its LoRa radio, by USB or Bluetooth.' }
    };
    ['tdeck', 'tpager', 'cardputer', 'm9'].forEach(function(board) {
        var release = handheldCapabilities(board);
        var device = DEVICES[board];
        device.sub = 'ESP32-S3 \u00b7 Ratspeak Handheld';
        device.art = board;
        device.apiDevice = board;
        device.defaultPackage = release.defaultPackage;
        device.firmware = release.prefix + '-' + release.defaultPackage + '.zip';
        device.packages = release.packages.map(function(id) {
            return { id: id, label: PACKAGE_DESCRIPTIONS[id].label, desc: PACKAGE_DESCRIPTIONS[id].desc };
        });
    });

    // Default flash options for custom single-bin uploads
    var CUSTOM_FLASH_DEFAULTS = { flashMode: 'dio', flashSize: 'detect', flashFreq: '80m' };

    // ── Terminal adapter for esptool-js ────────────────
    function createTerminal() {
        var logEl = document.getElementById('progressLog');
        return {
            clean: function() {
                logEl.innerHTML = '';
            },
            writeLine: function(data) {
                var entry = document.createElement('span');
                entry.textContent = data;
                logEl.appendChild(entry);
                logEl.scrollTop = logEl.scrollHeight;
            },
            write: function(data) {
                var entry = document.createElement('span');
                entry.textContent = data;
                logEl.appendChild(entry);
                logEl.scrollTop = logEl.scrollHeight;
            }
        };
    }

    // ── Navbar scroll effect ───────────────────────────
    var navbar = document.getElementById('navbar');
    var wasScrolled = false;
    window.addEventListener('scroll', function() {
        var s = window.scrollY > 10;
        if (s !== wasScrolled) {
            navbar.classList.toggle('scrolled', s);
            wasScrolled = s;
        }
    }, { passive: true });

    // ── Browser check ──────────────────────────────────
    function showSerialWarning() {
        var warning = document.getElementById('browserWarning');
        if (!warning) return;
        warning.classList.add('show');
        var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        warning.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
    }

    if (!('serial' in navigator)) {
        document.getElementById('browserWarning').classList.add('show');
    }

    // ── Device Selection ───────────────────────────────
    var m9DriverNoticeDismissed = false;
    var m9DriverNotice = document.getElementById('m9DriverNotice');
    var dismissM9DriverNotice = document.getElementById('dismissM9DriverNotice');
    if (HANDHELD) dismissM9DriverNotice.addEventListener('click', function() {
        var hadFocus = document.activeElement === dismissM9DriverNotice;
        m9DriverNoticeDismissed = true;
        m9DriverNotice.hidden = true;
        if (hadFocus) document.getElementById('connectBtn').focus();
    });

    window.selectDevice = function(deviceId, opts) {
        opts = opts || {};
        if (state.flashing || betaAuthBusy) return;
        if (!('serial' in navigator)) {
            showSerialWarning();
            return;
        }
        if (!DEVICES[deviceId]) return;

        var dev = DEVICES[deviceId];
        var chosenPackage = packageById(dev, opts.package) ? opts.package : dev.defaultPackage || null;
        if (opts.pushHistory !== false && ADVANCED && deviceId === 'custom') opts.pushHistory = false;
        if (opts.pushHistory !== false) {
            try {
                var url = new URL(window.location.href);
                url.searchParams.set('device', deviceId);
                if (chosenPackage && chosenPackage !== dev.defaultPackage) url.searchParams.set('package', chosenPackage);
                else url.searchParams.delete('package');
                history.pushState({ device: deviceId }, '', url);
            } catch (e) { /* ignore — older browsers */ }
        }

        state.firmwareRequestSerial++;
        clearRsnodeFirmware();
        state.customSource = 'upload';
        state.rsnodeInstalled = false;
        state.device = deviceId;
        state.connected = false;
        state.firmwareReady = false;
        state.firmwareError = null;
        state.flashComplete = false;
        state.firmwareZip = null;
        state.firmwareMetadata = null;
        state.eraseAll = false;
        document.getElementById('eraseToggle').checked = false;
        document.getElementById('eraseOption').classList.remove('active');
        state.selectedVersion = null;
        state.releases = [];
        state.customFile = null;
        state.rnodeAsset = null;
        state.rnodeAssetName = null;
        state.rnodeAssetLabel = null;
        state.rnodeAssetSha256 = null;
        state.rnodeFlashStrategy = null;
        state.rnodePlatform = null;
        state.rnodeBand = null;
        state.rnodeVersion = null;
        state.rnodeProvision = false;
        state.rnodeSetupIssue = null;
        state.rnodeSetupIssueKind = null;
        state.rnodeHostControlledMode = false;
        state.firmwareAppBytes = null;
        state.port = null;
        state.transport = null;
        state.esploader = null;
        if (typeof setBoardManual === 'function') setBoardManual(false);

        // A package changed on the download page is the visitor's choice; the default is not.
        state.selectedPackage = chosenPackage;
        state.packageExplicit = !!chosenPackage && chosenPackage !== dev.defaultPackage;
        var sel = document.getElementById('deviceSelection');
        var fi = document.getElementById('flashInterface');
        var panel = document.getElementById('flashPanel');

        // Update panel content
        panel.setAttribute('data-accent', dev.accent);
        panel.classList.toggle('flash-panel--custom', deviceId === 'custom');
        document.getElementById('panelName').textContent = dev.name;
        document.getElementById('panelSub').textContent = dev.sub;
        document.querySelector('#panelIcon use').setAttribute('href', '/assets/site/devices.svg#device-' + dev.art);
        if (HANDHELD) {
            m9DriverNotice.hidden = deviceId !== 'm9' || m9DriverNoticeDismissed;
            document.getElementById('legacyRecoveryDownloads').hidden = deviceId === 'm9';
            document.getElementById('legacyRecoveryDownloads').dataset.device = deviceId;
        }

        // Firmware section
        var presetEl = document.getElementById('firmwarePreset');
        var customEl = document.getElementById('firmwareCustom');

        if (deviceId === 'custom') {
            if (presetEl) presetEl.style.display = 'none';
            customEl.style.display = 'block';
            state.firmwareReady = false;
            buildPackagePicker(dev);
            setCustomSource('upload');
        } else {
            presetEl.style.display = 'block';
            if (customEl) customEl.style.display = 'none';
            document.getElementById('presetName').textContent = 'Ratspeak Handheld';
            document.getElementById('presetSize').textContent = 'Not started';
            state.firmwareReady = false;
            buildPackagePicker(dev);
            fetchFirmwareFromRelease(dev);
        }

        // Reset connection UI
        resetConnectionUI();

        // Reset flash state
        document.getElementById('flashBtn').style.display = '';
        setFlashButtonIdleContent();
        document.getElementById('flashProgress').classList.remove('active');
        document.getElementById('flashResult').classList.remove('active');
        clearRecovery();
        if (provToggle) provToggle.checked = false;
        if (provExpand) provExpand.hidden = true;
        if (typeof updateProvisionVisibility === 'function') updateProvisionVisibility();
        updateFlashBtn();

        // Transition into the flasher view. On a refresh-restore (skipAnimation)
        // we snap straight in so the picker doesn't briefly flash on screen.
        document.body.classList.add('is-flasher-active');
        if (!sel) {
            fi.classList.add('active');
        } else if (opts.skipAnimation) {
            sel.classList.add('hiding');
            sel.classList.add('hidden');
            fi.classList.add('active');
            fi.style.animation = 'none';
        } else {
            sel.classList.add('hiding');
            setTimeout(function() {
                sel.classList.add('hidden');
                fi.classList.add('active');
                fi.style.animation = 'none';
                fi.offsetHeight; // reflow
                fi.style.animation = '';
            }, 400);
        }
    };

    // ── Firmware Download from GitHub Releases ────────
    var checkIcon = '<svg class="firmware-version-item__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

    function packageById(dev, id) {
        if (!dev.packages) return null;
        for (var i = 0; i < dev.packages.length; i++) {
            if (dev.packages[i].id === id) return dev.packages[i];
        }
        return null;
    }

    function selectedPackageLabel(dev) {
        var pkg = packageById(dev, state.selectedPackage);
        return pkg ? pkg.label : 'Firmware';
    }

    function firmwarePackageQuery() {
        var query = state.selectedPackage ? '&package=' + encodeURIComponent(state.selectedPackage) : '';
        return query + (handheldBoard(state.device) ? '&source=handheld' : '');
    }

    function firmwareReadyText(dev, info, bytes) {
        var label = info && info.product === 'ratspeak-handheld' ? selectedPackageLabel(dev) : info && info.packageLabel ? info.packageLabel : selectedPackageLabel(dev);
        return label + ' \u00b7 ' + formatBytes(bytes) + ' \u00b7 Downloaded and checked';
    }

    // Streams a firmware download so the stepper can show how far it is.
    async function readFirmwareBody(resp, total) {
        if (!resp.body || !resp.body.getReader || !total) return resp.arrayBuffer();
        var reader = resp.body.getReader(), chunks = [], received = 0;
        for (;;) {
            var step = await reader.read();
            if (step.done) break;
            chunks.push(step.value);
            received += step.value.length;
            showFirmwareProgress(received, total);
        }
        var bytes = new Uint8Array(received), offset = 0;
        chunks.forEach(function(chunk) { bytes.set(chunk, offset); offset += chunk.length; });
        return bytes.buffer;
    }

    function showFirmwareProgress(received, total) {
        var pct = Math.min(99, Math.floor(received / total * 100));
        state.firmwareProgress = pct;
        var size = document.getElementById('presetSize');
        if (size) size.textContent = 'Downloading ' + formatBytes(received) + ' of ' + formatBytes(total) + '\u2026';
        var flow = document.getElementById('flowFirmwareState');
        if (flow && !state.flashing && !state.firmwareReady) flow.textContent = 'Downloading ' + pct + '%';
    }

    async function validatePresetFirmware(dev, buffer, metadata) {
        var selected = handheldRelease(dev.apiDevice);
        if (!selected) throw new Error('No unified public release is available for this device.');
        if (!metadata || metadata.board !== selected.board || metadata.version !== selected.tag ||
            metadata.package !== state.selectedPackage) {
            throw new Error('Firmware does not match the selected device and release.');
        }
        await verifyHandheldDownload(buffer, metadata);
        if (metadata.fileName.endsWith('.bin')) {
            validateHandheldImage(new Uint8Array(buffer), metadata);
            return;
        }
        var zip = await window.JSZip.loadAsync(buffer, { checkCRC32: true });
        var entry = zip.file('manifest.json');
        if (!entry) throw new Error('Handheld firmware is missing its manifest.');
        await validateHandheldManifest(zip, JSON.parse(await entry.async('string')), metadata);
    }

    function firmwareRequestIsCurrent(serial, dev) {
        return serial === state.firmwareRequestSerial && state.device && DEVICES[state.device] === dev;
    }

    function buildPackagePicker(dev) {
        var picker = document.getElementById('firmwarePackagePicker');
        if (!picker) return;
        picker.innerHTML = '';

        if (!dev.packages || dev.packages.length < 2) {
            picker.style.display = 'none';
            return;
        }

        picker.style.display = '';
        dev.packages.forEach(function(pkg, index) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'firmware-package-option';
            btn.setAttribute('aria-pressed', String(pkg.id === state.selectedPackage));
            if (pkg.id === state.selectedPackage) {
                btn.classList.add('firmware-package-option--active');
            }

            var label = document.createElement('span');
            label.className = 'firmware-package-option__label';
            label.appendChild(document.createTextNode(pkg.label));
            if (pkg.id === state.selectedPackage) {
                var check = document.createElement('span');
                check.innerHTML = checkIcon.replace('firmware-version-item__check', 'firmware-package-option__check');
                label.appendChild(check.firstChild);
            }

            var desc = document.createElement('span');
            desc.className = 'firmware-package-option__desc';
            desc.textContent = pkg.desc;

            btn.appendChild(label);
            btn.appendChild(desc);
            btn.addEventListener('click', function() {
                if (state.flashing) return;
                state.packageExplicit = true;
                if (state.selectedPackage === pkg.id) return;
                state.selectedPackage = pkg.id;
                state.selectedVersion = null;
                state.releases = [];
                state.firmwareZip = null;
                state.firmwareMetadata = null;
                state.firmwareReady = false;
                state.firmwareError = null;
                updateFlashBtn();
                closeVersionDropdown();
                buildPackagePicker(dev);
                picker.children[index].focus();
                buildVersionDropdown(dev);
                fetchFirmwareFromRelease(dev);
            });
            picker.appendChild(btn);
        });
    }

    async function readFirmwareInfo(response) {
        var info = await response.json();
        if (!response.ok) throw new Error(info.error || 'Firmware is unavailable. Try again later.');
        return info;
    }

    function fetchFirmwareFromRelease(dev) {
        var requestSerial = ++state.firmwareRequestSerial;
        state.firmwareError = null;
        state.firmwareReady = false;
        state.firmwareZip = null;
        state.firmwareMetadata = null;
        updateFlashBtn();
        var packageQuery = firmwarePackageQuery();
        var nameEl = document.getElementById('presetName');
        nameEl.textContent = 'Ratspeak Handheld';
        document.getElementById('presetSize').textContent = 'Checking the release\u2026';
        state.firmwareProgress = 0;
        closeVersionDropdown();

        var repoPath = HANDHELD_REPOSITORY;
        var downloadInfo = null;

        // Fetch latest info and download binary
        var download = fetch('/api/firmware?device=' + encodeURIComponent(dev.apiDevice) + '&info=true' + packageQuery)
            .then(function(resp) {
                return readFirmwareInfo(resp);
            })
            .then(function(info) {
                if (!firmwareRequestIsCurrent(requestSerial, dev)) throw { stale: true };
                downloadInfo = info;
                state.selectedVersion = info.version;
                nameEl.textContent = 'Ratspeak Handheld ' + info.version;
                showFirmwareProgress(0, info.size);
                return fetch('/api/firmware?device=' + encodeURIComponent(dev.apiDevice) + '&version=' + encodeURIComponent(info.version) + packageQuery);
            })
            .then(function(resp) {
                if (!firmwareRequestIsCurrent(requestSerial, dev)) throw { stale: true };
                if (!resp.ok) throw new Error('Firmware download failed (HTTP ' + resp.status + ')');
                return readFirmwareBody(resp, downloadInfo.size);
            })
            .then(async function(buffer) {
                if (!firmwareRequestIsCurrent(requestSerial, dev)) return;
                await validatePresetFirmware(dev, buffer, downloadInfo);
                if (!firmwareRequestIsCurrent(requestSerial, dev)) return;
                state.firmwareZip = buffer;
                state.firmwareMetadata = downloadInfo;
                state.firmwareReady = true;
                document.getElementById('presetSize').textContent = firmwareReadyText(dev, downloadInfo, buffer.byteLength);
                updateFlashBtn();
            })
            .catch(function(err) {
                if ((err && err.stale) || !firmwareRequestIsCurrent(requestSerial, dev)) return;
                document.getElementById('presetSize').textContent = 'The download didn\u2019t finish. Check your connection, then try again.';
                state.firmwareReady = false;
                state.firmwareError = err.message;
                updateFlashBtn();
            });

        // Fetch release list in parallel for the dropdown
        fetch('/api/firmware?device=' + encodeURIComponent(dev.apiDevice) + '&releases=true' + packageQuery)
            .then(function(resp) { return resp.ok ? resp.json() : []; })
            .then(function(releases) {
                if (!firmwareRequestIsCurrent(requestSerial, dev)) return;
                state.releases = releases;
                state.repoPath = repoPath;
                buildVersionDropdown(dev);
            })
            .catch(function() {
                if (!firmwareRequestIsCurrent(requestSerial, dev)) return;
                state.releases = [];
                buildVersionDropdown(dev);
            });
        return download;
    }

    function selectVersion(dev, version) {
        if (state.flashing) return;
        var requestSerial = ++state.firmwareRequestSerial;
        state.firmwareError = null;
        state.firmwareReady = false;
        state.firmwareZip = null;
        state.firmwareMetadata = null;
        updateFlashBtn();
        var packageQuery = firmwarePackageQuery();
        var nameEl = document.getElementById('presetName');
        nameEl.textContent = 'Ratspeak Handheld ' + version;
        document.getElementById('presetSize').textContent = 'Checking the release\u2026';
        state.firmwareProgress = 0;
        state.firmwareReady = false;
        state.firmwareZip = null;
        state.firmwareMetadata = null;
        state.selectedVersion = version;
        updateFlashBtn();
        closeVersionDropdown();
        buildVersionDropdown(dev);
        var downloadInfo = null;

        fetch('/api/firmware?device=' + encodeURIComponent(dev.apiDevice) + '&version=' + encodeURIComponent(version) + '&info=true' + packageQuery)
            .then(function(resp) {
                return readFirmwareInfo(resp);
            })
            .then(function(info) {
                if (!firmwareRequestIsCurrent(requestSerial, dev)) throw { stale: true };
                downloadInfo = info;
                showFirmwareProgress(0, info.size);
                return fetch('/api/firmware?device=' + encodeURIComponent(dev.apiDevice) + '&version=' + encodeURIComponent(version) + packageQuery);
            })
            .then(function(resp) {
                if (!firmwareRequestIsCurrent(requestSerial, dev)) throw { stale: true };
                if (!resp.ok) throw new Error('Download failed');
                return readFirmwareBody(resp, downloadInfo.size);
            })
            .then(async function(buffer) {
                if (!firmwareRequestIsCurrent(requestSerial, dev)) return;
                await validatePresetFirmware(dev, buffer, downloadInfo);
                if (!firmwareRequestIsCurrent(requestSerial, dev)) return;
                state.firmwareZip = buffer;
                state.firmwareMetadata = downloadInfo;
                state.firmwareReady = true;
                document.getElementById('presetSize').textContent = firmwareReadyText(dev, downloadInfo, buffer.byteLength);
                updateFlashBtn();
            })
            .catch(function(err) {
                if ((err && err.stale) || !firmwareRequestIsCurrent(requestSerial, dev)) return;
                document.getElementById('presetSize').textContent = 'The download didn\u2019t finish. Check your connection, then try again.';
                state.firmwareReady = false;
                state.firmwareError = err.message;
                updateFlashBtn();
            });
    }

    function buildVersionDropdown(dev) {
        var dropdown = document.getElementById('versionDropdown');
        dropdown.innerHTML = '';
        if (!state.releases || state.releases.length < 2) {
            syncVersionDropdownState();
            return;
        }

        state.releases.forEach(function(rel) {
            var item = document.createElement('button');
            item.type = 'button';
            item.className = 'firmware-version-item';
            if (rel.version === state.selectedVersion) {
                item.classList.add('firmware-version-item--active');
            }
            var label = document.createElement('span');
            label.className = 'firmware-version-item__tag';
            if (rel.version === state.selectedVersion) label.innerHTML = checkIcon;
            label.appendChild(document.createTextNode(rel.version));
            var meta = selectedPackageLabel(dev) + ' \u00b7 ' + formatBytes(rel.size);
            var size = document.createElement('span');
            size.className = 'firmware-version-item__size';
            size.textContent = meta;
            item.appendChild(label);
            item.appendChild(size);
            if (rel.version !== state.selectedVersion) {
                item.addEventListener('click', function() { selectVersion(dev, rel.version); });
            } else {
                item.setAttribute('aria-current', 'true');
            }
            dropdown.appendChild(item);
        });
        syncVersionDropdownState();
    }

    function syncVersionDropdownState() {
        var dropdown = document.getElementById('versionDropdown');
        var btn = document.getElementById('versionBtn');
        var chevron = document.getElementById('versionChevron');
        var hasVersions = !!(state.releases && state.releases.length > 1);
        btn.setAttribute('aria-disabled', hasVersions ? 'false' : 'true');
        btn.setAttribute('aria-expanded', hasVersions && dropdown.style.display !== 'none' ? 'true' : 'false');
        chevron.style.display = hasVersions ? '' : 'none';
    }

    function toggleVersionDropdown() {
        var dropdown = document.getElementById('versionDropdown');
        var box = document.getElementById('firmwareReadyBox');
        var chevron = document.getElementById('versionChevron');
        if (!state.releases || state.releases.length < 2) return;

        if (dropdown.style.display === 'none') {
            dropdown.style.display = 'block';
            box.classList.add('firmware-ready--open');
            chevron.classList.add('firmware-version-chevron--open');
            syncVersionDropdownState();
        } else {
            closeVersionDropdown();
        }
    }

    function closeVersionDropdown() {
        var dropdown = document.getElementById('versionDropdown');
        var box = document.getElementById('firmwareReadyBox');
        var chevron = document.getElementById('versionChevron');
        dropdown.style.display = 'none';
        box.classList.remove('firmware-ready--open');
        chevron.classList.remove('firmware-version-chevron--open');
        syncVersionDropdownState();
    }

    if (HANDHELD) document.getElementById('versionBtn').addEventListener('click', function(e) {
        e.stopPropagation();
        toggleVersionDropdown();
    });

    if (HANDHELD) document.addEventListener('click', function(e) {
        var dropdown = document.getElementById('versionDropdown');
        if (dropdown.style.display !== 'none') {
            var preset = document.getElementById('firmwarePreset');
            if (!preset.contains(e.target)) closeVersionDropdown();
        }
    });

    window.goBack = function(opts) {
        opts = opts || {};
        if (state.flashing) return;
        var sel = document.getElementById('deviceSelection');
        var fi = document.getElementById('flashInterface');
        if (!sel) { window.location.href = 'download.html'; return; }
        clearRecovery();

        if (opts.pushHistory !== false) {
            try {
                var url = new URL(window.location.href);
                url.searchParams.delete('device');
                url.searchParams.delete('package');
                history.pushState({}, '', url);
            } catch (e) { /* ignore */ }
        }

        document.body.classList.remove('is-flasher-active');
        fi.classList.remove('active');
        sel.classList.remove('hidden');

        // Small delay to trigger re-animation
        requestAnimationFrame(function() {
            sel.classList.remove('hiding');
        });

        // Disconnect transport if active
        if (state.transport) {
            try { state.transport.disconnect(); } catch(e) {}
            state.transport = null;
        }
        state.esploader = null;

        // Close port if it was opened
        if (state.port) {
            try { state.port.close(); } catch(e) {}
            state.port = null;
        }
        state.connected = false;
        clearRsnodeFirmware();
        state.rsnodeInstalled = false;
        state.device = null;
        state.firmwareRequestSerial++;
        state.firmwareReady = false;
        state.firmwareError = null;
        state.firmwareZip = null;
        state.firmwareMetadata = null;
        state.eraseAll = false;
        state.rnodeProvision = false;
        state.rnodeSetupIssue = null;
        state.rnodeSetupIssueKind = null;
        state.rnodeHostControlledMode = false;
        state.rnodeAsset = null;
        state.rnodeAssetName = null;
        state.rnodeAssetLabel = null;
        state.rnodeAssetSha256 = null;
        state.rnodeFlashStrategy = null;
        state.rnodePlatform = null;
        state.rnodeBand = null;
        state.firmwareAppBytes = null;
        state.flashComplete = false;
        document.getElementById('eraseToggle').checked = false;
        if (provToggle) provToggle.checked = false;
        if (provExpand) provExpand.hidden = true;
        document.getElementById('eraseOption').classList.remove('active');
        updateFlashBtn();
    };

    // ── Connection ─────────────────────────────────────
    // Only requests the port — does NOT open it. esptool-js Transport manages open/close.
    window.connectDevice = async function() {
        if (state.flashing) return;
        if (!('serial' in navigator)) {
            showSerialWarning();
            return;
        }
        await releaseRsnodeDevice();

        var btn = document.getElementById('connectBtn');
        var dot = document.getElementById('statusDot');
        var txt = document.getElementById('statusText');

        // Close previous port if re-selecting
        if (state.port) {
            try { state.port.close(); } catch(e) {}
            state.port = null;
            state.connected = false;
        }

        btn.className = 'connect-btn connect-btn--connecting';
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spinSlow 1s linear infinite;"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Selecting\u2026';
        dot.className = 'connect-status__dot connect-status__dot--waiting';
        txt.className = 'connect-status__text';
        txt.textContent = 'Choose your device in the browser window\u2026';
        showConnectHelp('');
        updateFlashBtn();

        navigator.serial.requestPort({ filters: [] })
            .then(function(port) {
                state.port = port;
                state.connected = true;
                state.rsnodeChoice = state.rsnodeNotice = null;
                state.rsnodeMode = 'install';

                btn.className = 'connect-btn connect-btn--connected';
                btn.innerHTML = CONNECTED_HTML;

                // Show serial device name in the info box with status indicator
                dot.className = 'connect-status__dot connect-status__dot--on';
                txt.className = 'connect-status__text connect-status__text--on';
                txt.textContent = usbDeviceLabel(port);

                updateFlashBtn();
            })
            .catch(function(err) {
                resetConnectionUI();
                var dot2 = document.getElementById('statusDot');
                var txt2 = document.getElementById('statusText');
                if (err.name !== 'NotFoundError') {
                    dot2.className = 'connect-status__dot connect-status__dot--error';
                    txt2.textContent = 'The browser couldn\u2019t use that device.';
                } else {
                    txt2.textContent = 'No device chosen';
                }
                showConnectHelp(err.name === 'NotFoundError' ? 'missing' : 'denied');
                updateFlashBtn();
            });
    };

    function applySelectedSerialPort(port) {
        state.port = port;
        state.connected = true;
        state.rsnodeChoice = state.rsnodeNotice = null;
        state.rsnodeMode = 'install';

        var btn = document.getElementById('connectBtn');
        var dot = document.getElementById('statusDot');
        var txt = document.getElementById('statusText');
        if (btn) {
            btn.className = 'connect-btn connect-btn--connected';
            btn.innerHTML = CONNECTED_HTML;
        }
        if (dot && txt) {
            dot.className = 'connect-status__dot connect-status__dot--on';
            txt.className = 'connect-status__text connect-status__text--on';
            txt.style.color = '';
            txt.textContent = usbDeviceLabel(port);
        }
        updateFlashBtn();
    }

    var CONNECTED_HTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Device selected';
    var USB_BRIDGES = { 0x10c4: 'Silicon Labs', 0x1a86: 'WCH', 0x0403: 'FTDI' };

    // Names the board by its USB chip; the exact chip is known only after the check.
    function usbDeviceLabel(port) {
        var info = port && port.getInfo ? port.getInfo() : {};
        if (info.usbVendorId === 0x303a) return handheldBoard(state.device) ? 'ESP32-S3 board' : 'ESP32 board';
        if (info.usbVendorId === 0x239a) return 'nRF52 board';
        if (USB_BRIDGES[info.usbVendorId]) return 'Board with a ' + USB_BRIDGES[info.usbVendorId] + ' USB adapter';
        return 'USB serial device';
    }

    function showCheckedChip(chipName) {
        var txt = document.getElementById('statusText');
        if (txt && chipName) txt.textContent = String(chipName).replace(/\s*\(.*$/, '') + ' \u00b7 checked';
    }

    // Download-mode steps per device, from the docs' recovery section.
    var DOWNLOAD_MODE = {
        tdeck: 'Put it in download mode: with the power off and USB connected, hold the trackball down, switch the power on, then let go after a few seconds.',
        tpager: 'Put it in download mode: hold BOOT, tap RST, then let go of BOOT.',
        cardputer: 'Put it in download mode: switch the side power off, hold G0 while you plug in USB, then let go.',
        m9: 'Leave the M9 switched on with USB connected. If no port appears, install the USB driver linked above.',
        custom: 'Put the board in download mode: hold BOOT while you plug in USB, then let go.'
    };

    function showConnectHelp(kind) {
        var help = document.getElementById('connectHelp');
        if (!help) return;
        var tip = DOWNLOAD_MODE[state.device] || DOWNLOAD_MODE.custom;
        help.textContent = kind === 'missing'
            ? 'Device not in the list? Use a cable that carries data, and close other apps that use it. ' + tip
            : kind === 'denied' ? 'Close other apps or tabs that use the device, then select it again.' : '';
        help.hidden = !kind;
        if (kind === 'missing' && state.device === 'm9' && m9DriverNotice) m9DriverNotice.hidden = false;
    }

    async function requestFreshRnodePortFromUser() {
        await releaseRsnodeDevice();
        // A cancelled picker leaves the selected port in place.
        if (state.port) {
            try { await state.port.close(); } catch (e) { /* may already be closed */ }
        }
        var port = await navigator.serial.requestPort({ filters: [] });
        applySelectedSerialPort(port);
        return port;
    }

    window.toggleErase = function(checked) {
        if (state.flashing) return;
        state.eraseAll = checked;
        var option = document.getElementById('eraseOption');
        if (checked) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
        updateAdvancedMeta();
    };

    function resetConnectionUI() {
        var btn = document.getElementById('connectBtn');
        var dot = document.getElementById('statusDot');
        var txt = document.getElementById('statusText');

        btn.className = 'connect-btn connect-btn--idle';
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6"/><path d="M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0V8z"/><path d="M12 18v4"/></svg> Select USB device';
        dot.className = 'connect-status__dot connect-status__dot--off';
        txt.className = 'connect-status__text';
        txt.textContent = 'No device selected';
        txt.style.color = '';
        showConnectHelp('');
        state.connected = false;
    }

    // ── Custom File Handling ───────────────────────────
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');

    if (dropZone) {
        dropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', function() {
            dropZone.classList.remove('drag-over');
        });
        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                handleFile(e.dataTransfer.files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', function() {
            if (fileInput.files.length > 0) {
                handleFile(fileInput.files[0]);
            }
        });
    }

    function handleFile(file) {
        if (state.flashing || state.customSource !== 'upload' || state.device !== 'custom') return;
        state.firmwareRequestSerial++;
        var ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'bin' && ext !== 'zip') {
            alert('Please select a .bin or .zip firmware file.');
            return;
        }
        state.customFile = file;
        state.firmwareError = null;
        state.firmwareAppBytes = null;
        state.firmwareReady = true;

        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = formatBytes(file.size);
        dropZone.classList.add('has-file');
        updateFlashBtn();
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(2) + ' MB';
    }

    function escapeOptionText(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Custom source tabs ────────────────────────────
    var sourceTabs = document.querySelectorAll('.custom-source-tab');
    var paneUpload = document.getElementById('customSourceUpload');
    var paneRnode = document.getElementById('customSourceRnode');
    var paneRsnode = document.getElementById('customSourceRsnode');
    var rnodeLoaded = false;

    function isRsnodeSelected() {
        return state.device === 'custom' && state.customSource === 'rsnode';
    }

    function customRequestIsCurrent(serial, source) {
        return serial === state.firmwareRequestSerial && state.device === 'custom' && state.customSource === source;
    }

    function clearRsnodeFirmware() {
        state.rsnodeAsset = null;
        state.rsnodeMetadata = null;
        state.rsnodeLoading = false;
        state.rsnodeLoadFailed = false;
        state.rsnodeBundle = null;
        state.rsnodeChoice = state.rsnodeNotice = null;
        state.rsnodeMode = 'install';
        var packageLink = document.getElementById('rsnodePackageDownload');
        if (packageLink) { packageLink.hidden = true; packageLink.removeAttribute('href'); }
        if (isRsnodeSelected()) {
            state.firmwareReady = false;
            state.firmwareAppBytes = null;
            state.firmwareBytes = null;
        }
    }

    function setCustomSource(source) {
        if (state.flashing || betaAuthBusy || !['upload', 'rsnode', 'rnode'].includes(source)) return;
        state.firmwareRequestSerial++;
        clearRsnodeFirmware();
        state.customSource = source;
        state.firmwareError = null;
        state.firmwareReady = false;
        state.firmwareZip = null;
        state.firmwareMetadata = null;
        state.firmwareAppBytes = null;
        state.flashComplete = false;
        state.rnodeAsset = null;
        state.rnodeAssetName = null;
        state.rnodeAssetLabel = null;
        state.rnodeAssetSha256 = null;
        state.rnodeFlashStrategy = null;
        state.rnodePlatform = null;
        state.rnodeBand = null;
        state.rnodeProvision = false;
        state.rnodeSetupIssue = null;
        state.rnodeSetupIssueKind = null;
        state.rnodeHostControlledMode = false;
        if (provToggle) provToggle.checked = false;
        sourceTabs.forEach(function(t) {
            var on = t.dataset.source === source;
            t.classList.toggle('is-active', on);
            t.setAttribute('aria-selected', String(on));
            t.tabIndex = on ? 0 : -1;
        });
        paneUpload.style.display = source === 'upload' ? '' : 'none';
        paneRnode.style.display = source === 'rnode' ? '' : 'none';
        paneRsnode.hidden = source !== 'rsnode';
        populateRnodeBandSelect(null);
        if (source === 'upload') {
            state.firmwareReady = !!state.customFile;
        } else {
            state.customFile = null;
            if (source === 'rnode') {
                if (rnodeVariantSelect) rnodeVariantSelect.value = '';
                loadRnodeVariants(state.rnodeVersion);
            } else {
                refreshBetaSession(true, true);
            }
        }
        if (source !== 'rsnode' && rsnodeTermsDialog.open) rsnodeTermsDialog.close();
        document.getElementById('flashBtn').style.display = '';
        document.getElementById('flashResult').classList.remove('active');
        document.getElementById('flashProgress').classList.remove('active');
        setFlashButtonIdleContent();
        updateProvisionVisibility();
        updateFlashBtn();
    }
    sourceTabs.forEach(function(tab, index) {
        tab.addEventListener('click', function() { setCustomSource(tab.dataset.source); });
        tab.addEventListener('keydown', function(event) {
            if (state.flashing || betaAuthBusy) return;
            var next;
            if (event.key === 'ArrowRight') next = (index + 1) % sourceTabs.length;
            else if (event.key === 'ArrowLeft') next = (index + sourceTabs.length - 1) % sourceTabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = sourceTabs.length - 1;
            else return;
            event.preventDefault();
            sourceTabs[next].focus();
            setCustomSource(sourceTabs[next].dataset.source);
        });
    });

    // The server owns both password and eligibility checks. No password or grant
    // is stored in JavaScript storage; an HttpOnly cookie carries the session.
    var betaAuthBusy = false;
    var betaStage = 'locked';
    var betaTermsVersion = null;
    var betaSessionRequestSerial = 0;
    var betaBoards = [];
    var rsnodeLoginForm = document.getElementById('rsnodeLoginForm');
    var rsnodePassword = document.getElementById('rsnodePassword');
    var rsnodeUnlock = document.getElementById('rsnodeUnlock');
    var rsnodeStatus = document.getElementById('rsnodeStatus');
    var rsnodeBoardPicker = document.getElementById('rsnodeBoardPicker');
    var rsnodeBoardSelect = document.getElementById('rsnodeBoardSelect');
    var rsnodeVariantConfirmed = document.getElementById('rsnodeVariantConfirmed');
    var rsnodeTermsPending = document.getElementById('rsnodeTermsPending');
    var rsnodeTermsDialog = document.getElementById('rsnodeTermsDialog');
    var rsnodeTermsForm = document.getElementById('rsnodeTermsForm');
    var rsnodeTermsContinue = document.getElementById('rsnodeTermsContinue');
    var rsnodeTermsStatus = document.getElementById('rsnodeTermsStatus');

    function setBetaAuthBusy(busy) {
        betaAuthBusy = busy;
        rsnodeUnlock.disabled = busy;
        rsnodeTermsContinue.disabled = busy || !rsnodeTermsForm.checkValidity();
        document.getElementById('rsnodeLock').disabled = busy || state.flashing || rsnodeOwnerBusy || rsnodeSettingsBusy || rsnodeRepeaterBusy;
        document.getElementById('rsnodeLockRetry').disabled = busy;
        sourceTabs.forEach(function(tab) { tab.disabled = busy || state.flashing; });
    }

    function betaStatus(message, error) {
        rsnodeStatus.textContent = message || '';
        rsnodeStatus.classList.toggle('is-error', !!error);
    }

    function applyBetaSession(session) {
        var next = session && session.stage;
        if (!['locked', 'terms', 'ready'].includes(next)) throw new Error('The beta session could not be verified. Try again.');
        betaStage = next;
        betaTermsVersion = session.termsVersion;
        rsnodeLoginForm.hidden = next !== 'locked';
        rsnodeTermsPending.hidden = next !== 'terms';
        rsnodeBoardPicker.hidden = next !== 'ready';
        if (next !== 'ready') {
            document.getElementById('rsnodeCatalogRetry').hidden = true;
            state.firmwareRequestSerial++;
            clearRsnodeFirmware();
            betaBoards = [];
            rsnodeBoardSelect.replaceChildren(new Option('Choose your board', ''));
            rsnodeVariantConfirmed.checked = false;
            document.getElementById('rsnodeVariantCheck').hidden = true;
            if (isRsnodeSelected()) updateFlashBtn();
        }
        if (next === 'locked' && rsnodeTermsDialog.open) rsnodeTermsDialog.close();
        updateRsnodeOwnerVisibility();
        updateRsnodeRepeaterVisibility();
        updateRsnodeDeviceVisibility();
    }

    function handleBetaError(error) {
        if (error.status === 401 || error.status === 403) {
            applyBetaSession({ stage: 'locked' });
            betaStatus('Your beta access expired. Enter the password again.', true);
        } else if (error.status === 503) {
            // The server answers 503 before it reads the password when its beta settings are missing.
            betaStatus('The beta service isn\u2019t answering right now, so the password couldn\u2019t be checked. Try again later.', true);
        } else {
            betaStatus(error.message || 'The beta could not be loaded. Try again.', true);
        }
    }

    function openBetaTerms() {
        if (betaStage !== 'terms' || !isRsnodeSelected() || rsnodeTermsDialog.open) return;
        rsnodeTermsForm.reset();
        rsnodeTermsContinue.disabled = true;
        rsnodeTermsStatus.textContent = '';
        rsnodeTermsDialog.showModal();
        rsnodeTermsForm.elements.france.focus();
    }

    async function loadBetaCatalog() {
        var serial = ++state.firmwareRequestSerial;
        clearRsnodeFirmware();
        var retry = document.getElementById('rsnodeCatalogRetry');
        retry.hidden = true;
        betaStatus('Loading beta boards…');
        try {
            var catalog = await betaRequest('catalog');
            if (!customRequestIsCurrent(serial, 'rsnode') || betaStage !== 'ready') return;
            betaBoards = validateBetaCatalog(catalog);
            rsnodeBoardSelect.replaceChildren(new Option('Choose your board', ''));
            betaBoards.forEach(function(board) {
                rsnodeBoardSelect.add(new Option(board.label || rsnodeBoard(board.id).label, board.id));
            });
            rsnodeVariantConfirmed.checked = false;
            document.getElementById('rsnodeVariantCheck').hidden = true;
            betaStatus(betaBoards.length ? '' : 'No beta builds are available yet. Try again later.');
            retry.hidden = betaBoards.length !== 0;
        } catch (error) {
            if (!customRequestIsCurrent(serial, 'rsnode')) return;
            handleBetaError(error);
            retry.hidden = betaStage !== 'ready';
        }
        updateFlashBtn();
    }
    if (ADVANCED) document.getElementById('rsnodeCatalogRetry').addEventListener('click', function() {
        if (!state.flashing && !betaAuthBusy && betaStage === 'ready') loadBetaCatalog();
    });

    async function refreshBetaSession(showTerms, loadCatalog) {
        if (betaAuthBusy) return;
        var serial = ++betaSessionRequestSerial;
        try {
            var session = await betaRequest('session');
            if (serial !== betaSessionRequestSerial || !isRsnodeSelected() || state.flashing || betaAuthBusy) return;
            applyBetaSession(session);
            if (session.stage === 'terms' && showTerms) openBetaTerms();
            if (session.stage === 'ready' && loadCatalog) await loadBetaCatalog();
        } catch (error) {
            if (serial === betaSessionRequestSerial && isRsnodeSelected()) handleBetaError(error);
        }
    }

    if (ADVANCED) rsnodeLoginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        if (state.flashing || betaAuthBusy || !rsnodeLoginForm.reportValidity()) return;
        var serial = ++betaSessionRequestSerial;
        setBetaAuthBusy(true);
        document.getElementById('rsnodeLockRetry').hidden = true;
        betaStatus('Checking password…');
        try {
            var session = await betaRequest('login', { password: rsnodePassword.value });
            if (serial !== betaSessionRequestSerial || !isRsnodeSelected()) return;
            applyBetaSession(session);
            betaStatus('');
            if (session.stage === 'terms') openBetaTerms();
            if (session.stage === 'ready') await loadBetaCatalog();
        } catch (error) {
            if (serial === betaSessionRequestSerial && isRsnodeSelected()) {
                if (error.status === 401) betaStatus('That password did not match. Try again.', true);
                else handleBetaError(error);
                rsnodePassword.focus();
            }
        } finally {
            rsnodePassword.value = '';
            setBetaAuthBusy(false);
        }
    });

    if (ADVANCED) document.getElementById('rsnodeReviewTerms').addEventListener('click', openBetaTerms);
    if (ADVANCED) document.getElementById('rsnodeTermsCancel').addEventListener('click', function() { rsnodeTermsDialog.close(); });
    if (ADVANCED) rsnodeTermsDialog.addEventListener('close', function() {
        if (betaStage === 'terms' && isRsnodeSelected()) document.getElementById('rsnodeReviewTerms').focus();
    });
    if (ADVANCED) rsnodeTermsForm.addEventListener('change', function() {
        rsnodeTermsContinue.disabled = betaAuthBusy || !rsnodeTermsForm.checkValidity();
    });
    if (ADVANCED) rsnodeTermsForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        if (state.flashing || betaAuthBusy || !rsnodeTermsForm.reportValidity()) return;
        var serial = ++betaSessionRequestSerial;
        var confirmations = {};
        ['france', 'sanctions', 'export', 'privateBeta'].forEach(function(key) {
            confirmations[key] = rsnodeTermsForm.elements[key].checked;
        });
        setBetaAuthBusy(true);
        rsnodeTermsStatus.textContent = 'Checking access…';
        try {
            var session = await betaRequest('accept', { termsVersion: betaTermsVersion, confirmations: confirmations });
            if (serial !== betaSessionRequestSerial || !isRsnodeSelected()) return;
            applyBetaSession(session);
            if (session.stage !== 'ready') throw new Error('Beta terms have changed. Review them again.');
            rsnodeTermsDialog.close();
            await loadBetaCatalog();
            rsnodeBoardSelect.focus();
        } catch (error) {
            if (serial === betaSessionRequestSerial && isRsnodeSelected()) {
                if (error.status === 401 || error.status === 403) handleBetaError(error);
                else rsnodeTermsStatus.textContent = error.message || 'Could not confirm access. Try again.';
            }
        } finally {
            setBetaAuthBusy(false);
        }
    });

    async function lockBeta() {
        if (state.flashing || betaAuthBusy) return;
        var serial = ++betaSessionRequestSerial;
        setBetaAuthBusy(true);
        applyBetaSession({ stage: 'locked' });
        rsnodePassword.value = '';
        document.getElementById('rsnodeLockRetry').hidden = true;
        betaStatus('Locking beta…');
        try {
            await betaRequest('logout', {});
            if (serial === betaSessionRequestSerial && isRsnodeSelected()) betaStatus('');
        } catch (error) {
            if (serial === betaSessionRequestSerial && isRsnodeSelected()) {
                betaStatus('Firmware was cleared, but beta access could not be locked. Try again.', true);
                document.getElementById('rsnodeLockRetry').hidden = false;
            }
        } finally {
            setBetaAuthBusy(false);
            if (isRsnodeSelected()) rsnodePassword.focus();
        }
    }
    if (ADVANCED) document.getElementById('rsnodeLock').addEventListener('click', lockBeta);
    if (ADVANCED) document.getElementById('rsnodeLockRetry').addEventListener('click', lockBeta);

    function rsnodeVariantDescription(id) {
        if (id === 'heltec-v4-r8-tft') return 'V4 R8 TFT, the Expansion Kit V2 with the 2.8-inch touchscreen';
        if (id === 'heltec-v4-r8') return 'V4 R8 (ESP32-S3R8) with the small OLED display';
        return 'V4 R2 (ESP32-S3R2)';
    }

    function rsnodeReadyText() {
        var metadata = state.rsnodeMetadata;
        return metadata.version + ' · ' + formatBytes(metadata.size) + ' · ' + (state.firmwareReady ? 'Ready to flash' : 'Confirm the V4 variant to continue.');
    }

    function rsnodeVariantIsConfirmed() {
        return state.rsnodeMetadata && (state.rsnodeMetadata.id === 'heltec-v3' || rsnodeVariantConfirmed.checked);
    }

    if (ADVANCED) rsnodeBoardSelect.addEventListener('change', async function() {
        if (state.flashing) return;
        var serial = ++state.firmwareRequestSerial;
        clearRsnodeFirmware();
        rsnodeVariantConfirmed.checked = false;
        var metadata = betaBoards.find(function(board) { return board.id === rsnodeBoardSelect.value; });
        document.getElementById('rsnodeVariantCheck').hidden = !metadata || metadata.id === 'heltec-v3';
        if (metadata) document.getElementById('rsnodeVariantLabel').textContent = 'I checked that my device is ' + rsnodeVariantDescription(metadata.id) + '.';
        updateFlashBtn();
        if (!metadata) { betaStatus(''); return; }
        betaStatus('Downloading ' + metadata.label + '…');
        state.rsnodeLoading = true;
        updateFlashBtn();
        try {
            var buffer = await betaRequest('download', undefined, { binary: true, query: { board: metadata.id } });
            if (!customRequestIsCurrent(serial, 'rsnode')) return;
            await verifyBetaDownload(buffer, metadata);
            var zip = await window.JSZip.loadAsync(buffer, { checkCRC32: true });
            var entry = zip.file('manifest.json');
            if (!entry) throw new Error('The beta package is missing its manifest.');
            await validateBetaManifest(zip, JSON.parse(await entry.async('string')), metadata);
            if (!customRequestIsCurrent(serial, 'rsnode') || betaStage !== 'ready') return;
            state.rsnodeAsset = buffer;
            state.rsnodeMetadata = metadata;
            var packageLink = document.getElementById('rsnodePackageDownload');
            packageLink.href = '/api/rsnode-beta?action=download&board=' + encodeURIComponent(metadata.id);
            packageLink.download = metadata.fileName;
            packageLink.hidden = false;
            state.rsnodeLoading = false;
            state.firmwareReady = rsnodeVariantIsConfirmed();
            betaStatus(rsnodeReadyText());
        } catch (error) {
            if (!customRequestIsCurrent(serial, 'rsnode')) return;
            clearRsnodeFirmware();
            state.rsnodeLoadFailed = true;
            handleBetaError(error);
        }
        updateFlashBtn();
    });
    if (ADVANCED) rsnodeVariantConfirmed.addEventListener('change', function() {
        if (state.flashing || !isRsnodeSelected()) return;
        state.firmwareReady = !!state.rsnodeAsset && betaStage === 'ready' && rsnodeVariantIsConfirmed();
        if (state.rsnodeMetadata) betaStatus(rsnodeReadyText());
        updateFlashBtn();
    });

    // ── rsNode Update (CMD_RSNODE BEGIN/CHUNK/FINISH over USB, keeps settings) or Install (esptool, erases) ──
    var rsnodeChecking = false;
    var RSNODE_CHECK_MS = 10000;
    var RSNODE_INSTALL_NOTE = 'Install erases the node: identity, managers, Wi-Fi, Bluetooth pairings, and Repeater settings. Update requires a compatible package and firmware that supports USB updates.';
    var RSNODE_UPDATE_NOTE = 'Update keeps the node\'s identity, managers, Wi-Fi, Bluetooth pairings, and Repeater settings; Install erases them. Check the node to see whether it can update.';

    function rsnodeUpdateChosen() {
        return !!(state.rsnodeChoice && state.rsnodeChoice.update && state.rsnodeMode === 'update' && state.rsnodeBundle);
    }

    // What the check found, or a note of its own while it runs or after it fails.
    function rsnodeUpdateMessage(message, error) {
        state.rsnodeNotice = message ? { text: message, error: !!error } : null;
        renderRsnodeUpdate();
    }

    function renderRsnodeUpdate() {
        var metadata = state.rsnodeMetadata;
        var offered = !!(isRsnodeSelected() && betaStage === 'ready' && metadata && metadata.update);
        document.getElementById('rsnodeInstallNote').textContent = offered ? RSNODE_UPDATE_NOTE : RSNODE_INSTALL_NOTE;
        document.getElementById('rsnodeUpdate').hidden = !offered;
        var flashBtn = document.getElementById('flashBtn');
        if (!state.flashing && flashBtn && flashBtn.textContent.trim() !== flashButtonLabel()) setFlashButtonIdleContent();
        if (!offered) return;
        var choice = state.rsnodeChoice;
        var check = document.getElementById('rsnodeUpdateCheck');
        check.disabled = rsnodeChecking || state.flashing || rsnodeOwnerBusy || rsnodeSettingsBusy || rsnodeRepeaterBusy;
        check.textContent = rsnodeChecking ? 'Checking…' : choice ? 'Check again' : 'Check the node';
        var notice = choice ? { text: choice.message, error: false } : state.rsnodeNotice;
        var status = document.getElementById('rsnodeUpdateStatus');
        if (status.textContent !== (notice ? notice.text : '')) status.textContent = notice ? notice.text : '';
        status.classList.toggle('is-error', !!(notice && notice.error));
        var modes = document.getElementById('rsnodeUpdateModes');
        modes.hidden = !(choice && choice.update && state.rsnodeBundle);
        modes.disabled = state.flashing || rsnodeChecking;
        document.querySelectorAll('input[name="rsnodeInstallMode"]').forEach(function(input) { input.checked = input.value === state.rsnodeMode; });
    }

    // Reads STATUS over the selected port and offers Update or Install per rsnode-update.js.
    async function checkRsnodeNode() {
        var metadata = state.rsnodeMetadata;
        if (!metadata || !metadata.update || rsnodeChecking || state.flashing || rsnodeOwnerBusy || rsnodeSettingsBusy || rsnodeRepeaterBusy) return;
        if (!('serial' in navigator)) {
            showSerialWarning();
            return;
        }
        var stage = 'port', session = null, choice = null;
        rsnodeUpdateMessage('');
        try {
            await rsnodeToolPortFromUser();
            rsnodeChecking = true;
            state.rsnodeChoice = null;
            state.rsnodeMode = 'install';
            updateFlashBtn();
            rsnodeUpdateMessage('Reading the node…');
            stage = 'open';
            session = createRnodeSession(await openRnodeSerialPort(null, RNODE_REPAIR_SETTLE_MS, await rsnodeOtherPorts()));
            stage = 'protocol';
            if (!await waitForRsnode(session, { timeoutMs: RSNODE_CHECK_MS })) {
                choice = { kind: 'install', update: false,
                    message: 'No rsNode answered over USB. If it runs rsNode, press RESET on the board and check again; Install works either way.' };
            } else {
                choice = chooseRsnodeInstall(await readRsnodeStatus(session), metadata, metadata.update);
            }
            await closeRnodeSession(session);
            session = null;
            if (choice.update && (!state.rsnodeBundle || state.rsnodeBundle.metadata !== metadata.update)) {
                stage = 'download';
                rsnodeUpdateMessage('Downloading the update…');
                var bytes = new Uint8Array(await betaRequest('download', undefined, { binary: true, query: { board: metadata.id, kind: 'update' } }));
                await verifyRsnodeBundle(bytes, metadata.update);
                if (state.rsnodeMetadata !== metadata) return;
                state.rsnodeBundle = { bytes: bytes, metadata: metadata.update };
            }
            if (state.rsnodeMetadata !== metadata) return;
            state.rsnodeNotice = null;
            state.rsnodeChoice = choice;
            state.rsnodeMode = choice.update ? 'update' : 'install';
        } catch (error) {
            if (stage === 'port' && error.name === 'NotFoundError') rsnodeUpdateMessage('Select the rsNode serial port to check it.');
            else if (stage === 'download') rsnodeUpdateMessage((error.message || String(error)) + ' Install is still available.', true);
            else rsnodeUpdateMessage(rsnodePortError(error, stage, 'check again') || error.message || String(error), true);
        } finally {
            if (session) await closeRnodeSession(session);
            rsnodeChecking = false;
            updateFlashBtn();
        }
    }

    if (ADVANCED) document.getElementById('rsnodeUpdateCheck').addEventListener('click', checkRsnodeNode);
    if (ADVANCED) document.getElementById('rsnodeUpdateModes').addEventListener('change', function(event) {
        if (state.flashing || event.target.name !== 'rsnodeInstallMode') return;
        state.rsnodeMode = event.target.value;
        updateFlashBtn();
    });

    // The Update path: no esptool and no erase; the node verifies the signed image and restarts into it.
    async function runRsnodeUpdate(logMessage, setProgress, btn) {
        var metadata = state.rsnodeMetadata, bundle = metadata.update, bytes = state.rsnodeBundle.bytes;
        setProgress(2, 'Preparing update...');
        await verifyRsnodeBundle(bytes, bundle);
        logMessage('Verified update package hash and metadata: ' + bundle.version + ' for ' + metadata.label, 'log-green');
        if (!await confirmFactoryInstall({ product: 'rsnode', installMode: 'update', board: metadata.id, boardLabel: metadata.label }, {
            title: 'Update',
            intro: 'You are updating this node to rsNode ' + bundle.version + '.',
            detail: 'Identity, managers, Wi-Fi, Bluetooth pairings, and Repeater settings stay. The node restarts, checks the new firmware and keeps it, or goes back to the firmware it runs now.',
            action: 'Update'
        })) return null;
        var access = await betaRequest('session');
        if (access.stage !== 'ready') {
            applyBetaSession(access);
            throw new Error('Beta access expired. Unlock the beta again before updating.');
        }
        if (!state.connected || !state.port) throw new Error('Device disconnected. Reconnect it before updating.');
        btn.textContent = 'Checking device...';
        setProgress(5, 'Connecting to rsNode...');
        var session = createRnodeSession(await openRnodeSerialPort(logMessage, RNODE_REPAIR_SETTLE_MS, await rsnodeOtherPorts()));
        var result;
        try {
            if (!await waitForRsnode(session, { timeoutMs: RSNODE_CHECK_MS })) {
                throw new Error('The node did not answer over USB. Check the cable, or press RESET on the board, then update again.');
            }
            state.flashStage = 'writing';
            btn.textContent = 'Updating...';
            updateFlashFlow();
            var shown = -1;
            result = await streamRsnodeUpdate(session, bytes, function(event) {
                if (event.stage === 'writing') {
                    var percent = Math.floor(event.sent * 100 / event.total);
                    setProgress(8 + percent * 0.8, 'Sending update... ' + percent + '%');
                    if (Math.floor(percent / 10) !== shown) {
                        shown = Math.floor(percent / 10);
                        logMessage('Sent ' + event.sent + ' of ' + event.total + ' bytes', '');
                    }
                } else if (event.stage === 'restarting') {
                    setProgress(90, 'Restarting into the new firmware...');
                    logMessage('Update staged. The node restarts into the new firmware.', 'log-orange');
                } else if (event.stage === 'trial') {
                    setProgress(94, 'The node is checking the new firmware...');
                } else if (event.stage === 'reconnecting') {
                    setProgress(92, 'Reconnecting to the node after restart...');
                } else {
                    setProgress(97, 'Confirming...');
                }
            }, bundle, { reconnect: async function(previous) {
                // Reopen only the selected device. A different authorized node
                // must not be mistaken for the one that received this update.
                var selectedPort = previous.port;
                await closeRnodeSession(previous);
                session = createRnodeSession(await openRnodeSerialPort(logMessage, 0, [], selectedPort));
                return session;
            } });
        } finally {
            await closeRnodeSession(session);
        }
        if (result.kind !== 'updated') throw new Error(result.message);
        setProgress(100, 'Updated');
        logMessage(result.message, 'log-green');
        return result;
    }
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && isRsnodeSelected() && !state.flashing) refreshBetaSession(false, false);
    });
    setInterval(function() {
        if (!document.hidden && isRsnodeSelected() && betaStage !== 'locked' && !state.flashing) refreshBetaSession(false, false);
    }, 60000);

    // ── RNode firmware picker ─────────────────────────
    var rnodeReleaseSelect = document.getElementById('rnodeReleaseSelect');
    var rnodeVariantSelect = document.getElementById('rnodeVariantSelect');
    var rnodeBandSelect    = document.getElementById('rnodeBandSelect');
    var rnodeReleaseSub    = document.getElementById('rnodeReleaseSub');
    var rnodeStatus        = document.getElementById('rnodeStatus');
    var rnodeReleasesLoaded = false;

    function rnodeVersionQuery() {
        return state.rnodeVersion ? '&version=' + encodeURIComponent(state.rnodeVersion) : '';
    }

    function selectedFlashStrategy() {
        if (state.device === 'custom' && state.rnodeAssetName) {
            return state.rnodeFlashStrategy || 'esp32-esptool';
        }
        return 'esp32-esptool';
    }

    function isOfficialRnodeFirmwareSelected() {
        return state.device === 'custom' && !!state.rnodeAssetName;
    }

    function isNrf52RnodeFirmwareSelected() {
        return isOfficialRnodeFirmwareSelected() && selectedFlashStrategy() === 'nrf52-dfu';
    }

    function isTechoRnodeFirmwareSelected() {
        return state.rnodeAssetName === 'rnode_firmware_techo.zip';
    }

    function shouldRunRnodeSetup() {
        return state.device === 'custom' && !isRsnodeSelected() && (state.rnodeProvision || isOfficialRnodeFirmwareSelected());
    }

    function selectedRnodeLabel() {
        return state.rnodeAssetLabel || 'RNode';
    }

    function shouldUseClickDrivenRnodeProvisioning() {
        return isNrf52RnodeFirmwareSelected();
    }

    function rnodeActivationPortGuidance() {
        if (isTechoRnodeFirmwareSelected()) {
            return 'Press RESET once. When the serial port returns, click Finish Setup.';
        }
        if (isNrf52RnodeFirmwareSelected()) {
            return 'Reset or unplug/replug the board. When the serial port returns, click Finish Setup.';
        }
        return 'Select the RNode serial port that appeared after the device rebooted.';
    }

    function rnodePortSelectionGuidance() {
        if (isNrf52RnodeFirmwareSelected()) {
            return 'Select the RNode serial port.';
        }
        return 'Select the RNode serial port that appeared after the device rebooted.';
    }

    function rnodeActivationRetryGuidance() {
        if (isTechoRnodeFirmwareSelected()) {
            return 'Press RESET once, then try Finish Setup again.';
        }
        if (isNrf52RnodeFirmwareSelected()) {
            return 'Reset or unplug/replug the board, then try Finish Setup again.';
        }
        return 'Select the RNode serial port and try again.';
    }

    function rnodeActivationSettleMs() {
        return isNrf52RnodeFirmwareSelected() ? RNODE_NRF52_ACTIVATION_SETTLE_MS : RNODE_REPAIR_SETTLE_MS;
    }

    function rnodePostResetSettleMs() {
        return isNrf52RnodeFirmwareSelected() ? RNODE_NRF52_POST_RESET_SETTLE_MS : RNODE_REPAIR_SETTLE_MS;
    }

    function rnodePostIdentityWriteDelayMs() {
        return isNrf52RnodeFirmwareSelected() ? RNODE_NRF52_POST_IDENTITY_WRITE_DELAY_MS : RNODE_POST_EEPROM_DELAY_MS;
    }

    function rnodeRomWriteDelayMs() {
        return isNrf52RnodeFirmwareSelected() ? RNODE_NRF52_ROM_WRITE_DELAY_MS : RNODE_ROM_WRITE_DELAY_MS;
    }

    function resetRnodeSelection(message) {
        state.rnodeAsset = null;
        state.rnodeAssetName = null;
        state.rnodeAssetLabel = null;
        state.rnodeAssetSha256 = null;
        state.rnodeFlashStrategy = null;
        state.rnodePlatform = null;
        state.rnodeBand = null;
        state.firmwareAppBytes = null;
        state.firmwareReady = false;
        state.rnodeHostControlledMode = false;
        populateRnodeBandSelect(null);
        if (rnodeStatus) {
            rnodeStatus.classList.remove('is-ready', 'is-error');
            rnodeStatus.textContent = message || 'Pick a device variant to continue.';
        }
        updateProvisionVisibility();
        updateFlashBtn();
    }

    async function loadRnodeReleases(selectedVersion) {
        if (!rnodeReleaseSelect || rnodeReleasesLoaded) {
            if (rnodeReleaseSelect && selectedVersion) rnodeReleaseSelect.value = selectedVersion;
            return;
        }
        try {
            var resp = await fetch('/api/firmware?source=rnode&releases=true');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var releases = await resp.json();
            if (!releases.length) throw new Error('No supported RNode releases found');
            rnodeReleaseSelect.innerHTML = releases.map(function (rel) {
                return '<option value="' + rel.version + '">' + rel.version + ' · ' + rel.variants + ' variants</option>';
            }).join('');
            rnodeReleaseSelect.value = selectedVersion || releases[0].version;
            rnodeReleaseSelect.disabled = false;
            rnodeReleasesLoaded = true;
        } catch (e) {
            rnodeReleaseSelect.innerHTML = '<option>Error loading releases</option>';
            rnodeReleaseSelect.disabled = true;
        }
    }

    async function loadRnodeVariants(version) {
        if (state.flashing || state.customSource !== 'rnode') return;
        var requestSerial = ++state.firmwareRequestSerial;
        rnodeLoaded = true;
        state.rnodeVersion = version || null;
        if (rnodeVariantSelect) {
            rnodeVariantSelect.disabled = true;
            rnodeVariantSelect.innerHTML = '<option>Loading variants&hellip;</option>';
        }
        resetRnodeSelection('Loading RNode variants…');
        try {
            var resp = await fetch('/api/firmware?source=rnode&variants=true' + rnodeVersionQuery());
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var info = await resp.json();
            if (!customRequestIsCurrent(requestSerial, 'rnode')) { rnodeLoaded = false; return; }
            state.rnodeVersion = info.version;
            rnodeReleaseSub.textContent = 'Release ' + info.version + ' · ' + info.variants.length + ' supported variants';
            await loadRnodeReleases(info.version);
            if (!customRequestIsCurrent(requestSerial, 'rnode')) { rnodeLoaded = false; return; }
            if (rnodeReleaseSelect) rnodeReleaseSelect.value = info.version;
            var optHtml = '<option value="">Select a device&hellip;</option>';
            info.variants.forEach(function (v) {
                optHtml += '<option value="' + v.name + '">' + v.label + ' (' + formatBytes(v.size) + ')</option>';
            });
            rnodeVariantSelect.innerHTML = optHtml;
            rnodeVariantSelect.disabled = false;
            populateRnodeBandSelect(null);
            rnodeStatus.classList.remove('is-error');
            rnodeStatus.textContent = 'Pick a supported RNode variant to continue.';
        } catch (e) {
            if (!customRequestIsCurrent(requestSerial, 'rnode')) { rnodeLoaded = false; return; }
            rnodeReleaseSub.textContent = 'Could not load RNode releases';
            if (rnodeVariantSelect) rnodeVariantSelect.innerHTML = '<option>Error loading variants</option>';
            rnodeStatus.classList.add('is-error');
            rnodeStatus.textContent = 'Error: ' + (e.message || e);
            rnodeLoaded = false;
        }
    }

    if (rnodeReleaseSelect) {
        rnodeReleaseSelect.addEventListener('change', function () {
            loadRnodeVariants(rnodeReleaseSelect.value);
        });
    }

    if (rnodeVariantSelect) {
        rnodeVariantSelect.addEventListener('change', async function () {
            if (state.flashing || state.customSource !== 'rnode') return;
            var requestSerial = ++state.firmwareRequestSerial;
            var name = rnodeVariantSelect.value;
            if (!name) {
                resetRnodeSelection('Pick a device variant to continue.');
                return;
            }
            rnodeStatus.classList.remove('is-ready', 'is-error');
            rnodeStatus.textContent = 'Downloading ' + name + '…';
            state.firmwareReady = false;
            state.firmwareAppBytes = null;
            state.rnodeAsset = null;
            state.rnodeAssetName = null;
            state.rnodeAssetLabel = null;
            state.rnodeAssetSha256 = null;
            state.rnodeFlashStrategy = null;
            state.rnodePlatform = null;
            updateFlashBtn();
            try {
                populateRnodeBandSelect(name);
                var versionQuery = rnodeVersionQuery();
                var infoResp = await fetch('/api/firmware?source=rnode&info=true&asset=' + encodeURIComponent(name) + versionQuery);
                if (!infoResp.ok) throw new Error('Info fetch failed');
                var meta = await infoResp.json();
                if (!customRequestIsCurrent(requestSerial, 'rnode')) return;
                state.rnodeVersion = meta.version || state.rnodeVersion;
                state.rnodeFlashStrategy = meta.flashStrategy || 'esp32-esptool';
                state.rnodePlatform = meta.platform || 'esp32';
                rnodeStatus.textContent = 'Downloading ' + meta.label + ' (' + formatBytes(meta.size) + ')…';
                var binResp = await fetch('/api/firmware?source=rnode&asset=' + encodeURIComponent(name) + rnodeVersionQuery());
                if (!binResp.ok) throw new Error('Download failed');
                var buf = await binResp.arrayBuffer();
                if (!customRequestIsCurrent(requestSerial, 'rnode')) return;
                rnodeStatus.textContent = 'Verifying publisher SHA-256 for ' + meta.label + '…';
                var verifiedSha256 = await verifyOfficialRnodeReleaseAsset(buf, meta);
                if (!customRequestIsCurrent(requestSerial, 'rnode')) return;
                state.rnodeAsset = buf;
                state.rnodeAssetName = name;
                state.rnodeAssetLabel = meta.label;
                state.rnodeAssetSha256 = verifiedSha256;
                state.firmwareReady = true;
                updateRnodeReadyStatus();
                // Auto-suggest the matching product/model in the provision form
                hintProvisioningFromVariant(name);
                // Auto-enable provisioning toggle for RNode source
                var pTog = document.getElementById('provisionToggle');
                if (pTog && !pTog.checked) {
                    pTog.checked = true;
                    pTog.dispatchEvent(new Event('change'));
                }
            } catch (err) {
                if (!customRequestIsCurrent(requestSerial, 'rnode')) return;
                rnodeStatus.classList.add('is-error');
                rnodeStatus.textContent = 'Error: ' + (err.message || err);
                state.rnodeAsset = null;
                state.rnodeAssetName = null;
                state.firmwareAppBytes = null;
                state.rnodeAssetLabel = null;
                state.rnodeAssetSha256 = null;
                state.rnodeFlashStrategy = null;
                state.rnodePlatform = null;
                state.firmwareReady = false;
            }
            updateProvisionVisibility();
            updateFlashBtn();
        });
    }

    if (rnodeBandSelect) {
        rnodeBandSelect.addEventListener('change', function () {
            if (state.flashing || state.customSource !== 'rnode') return;
            state.rnodeBand = rnodeBandSelect.value || null;
            var selectedName = state.rnodeAssetName || (rnodeVariantSelect && rnodeVariantSelect.value);
            if (!state.boardManual && selectedName) {
                hintProvisioningFromVariant(selectedName);
            } else {
                updateProvisionBoardBadge();
            }
            updateRnodeReadyStatus();
            updateAdvancedMeta();
        });
    }

    // ── Provisioning UI ──────────────────────────────
    // Product/model tables transcribed from RNS/Utilities/rnodeconf.py
    var RNODE_PRODUCTS = [
        { v: 0x03, label: 'RNode' },
        { v: 0xF0, label: 'Homebrew RNode' },
        { v: 0xE0, label: 'LilyGO T-Beam' },
        { v: 0xEA, label: 'LilyGO T-Beam Supreme' },
        { v: 0xD0, label: 'LilyGO T-Deck' },
        { v: 0xB2, label: 'LilyGO LoRa32 v1.0' },
        { v: 0xB0, label: 'LilyGO LoRa32 v2.0' },
        { v: 0xB1, label: 'LilyGO LoRa32 v2.1' },
        { v: 0xC0, label: 'Heltec LoRa32 v2' },
        { v: 0xC1, label: 'Heltec LoRa32 v3' },
        { v: 0xC3, label: 'Heltec LoRa32 v4' },
        { v: 0xC2, label: 'Heltec Mesh Node T114' },
        { v: 0x15, label: 'LilyGO T-Echo' },
        { v: 0x10, label: 'RAK4631' },
        { v: 0x20, label: 'openCom XL' },
        { v: 0xEB, label: 'Seeed XIAO ESP32-S3 Wio-SX1262' }
    ];
    var RNODE_MODELS_BY_PRODUCT = {
        0x03: [
            { v: 0xA1, label: 'A1 - 410-525 MHz / SX1268 (T3S3)' },
            { v: 0xA6, label: 'A6 - 820-960 MHz / SX1262 (T3S3)' },
            { v: 0xA5, label: 'A5 - 410-525 MHz / SX1278 (T3S3)' },
            { v: 0xAA, label: 'AA - 820-960 MHz / SX1276 (T3S3)' },
            { v: 0xAC, label: 'AC - 2.4-2.5 GHz / SX1280' },
            { v: 0xA4, label: 'A4 - 410-525 MHz / SX1278 (legacy)' },
            { v: 0xA9, label: 'A9 - 820-1020 MHz / SX1276 (legacy)' },
            { v: 0xA2, label: 'A2 - 410-525 MHz / SX1278 (NG21)' },
            { v: 0xA7, label: 'A7 - 820-1020 MHz / SX1276 (NG21)' },
            { v: 0xA3, label: 'A3 - 410-525 MHz / SX1278 (NG20)' },
            { v: 0xA8, label: 'A8 - 820-1020 MHz / SX1276 (NG20)' }
        ],
        0xB2: [{ v: 0xBA, label: 'BA - 420-520 MHz' }, { v: 0xBB, label: 'BB - 850-950 MHz' }],
        0xB0: [{ v: 0xB3, label: 'B3 - 420-520 MHz' }, { v: 0xB8, label: 'B8 - 850-950 MHz' }],
        0xB1: [{ v: 0xB4, label: 'B4 - 420-520 MHz' }, { v: 0xB9, label: 'B9 - 850-950 MHz' },
               { v: 0x04, label: 'B4 TCXO - 420-520 MHz' }, { v: 0x09, label: 'B9 TCXO - 850-950 MHz' }],
        0xC0: [{ v: 0xC4, label: 'C4 - 420-520 MHz' }, { v: 0xC9, label: 'C9 - 850-950 MHz' }],
        0xC1: [{ v: 0xC5, label: 'C5 - 420-520 MHz' }, { v: 0xCA, label: 'CA - 850-950 MHz' }],
        0xC3: [{ v: 0xC8, label: 'C8 - 850-950 MHz (PA)' }],
        0xC2: [{ v: 0xC6, label: 'C6 - 420-520 MHz' }, { v: 0xC7, label: 'C7 - 850-950 MHz' }],
        0xE0: [{ v: 0xE4, label: 'E4 - 420-520 MHz' }, { v: 0xE9, label: 'E9 - 850-950 MHz' },
               { v: 0xE3, label: 'E3 - 420-520 MHz (SX1262)' }, { v: 0xE8, label: 'E8 - 850-950 MHz (SX1262)' }],
        0xEA: [{ v: 0xDB, label: 'DB - 420-520 MHz' }, { v: 0xDC, label: 'DC - 850-950 MHz' }],
        0xD0: [{ v: 0xD4, label: 'D4 - 420-520 MHz' }, { v: 0xD9, label: 'D9 - 850-950 MHz' }],
        0x10: [{ v: 0x11, label: '11 - 430-510 MHz' }, { v: 0x12, label: '12 - 779-928 MHz' },
               { v: 0x13, label: '13 - 430-510 MHz (SX1280)' }, { v: 0x14, label: '14 - 779-928 MHz (SX1280)' }],
        0x15: [{ v: 0x16, label: '16 - 430-510 MHz' }, { v: 0x17, label: '17 - 779-928 MHz' }],
        0x20: [{ v: 0x21, label: '21 - 820-960 MHz (openCom XL)' }],
        0xEB: [{ v: 0xDE, label: 'DE - 420-520 MHz' }, { v: 0xDD, label: 'DD - 850-950 MHz' }],
        0xF0: [{ v: 0xFE, label: 'FE - unspecified' }, { v: 0xFF, label: 'FF - unspecified' }]
    };
    // Variant filename → suggested product / model
    var VARIANT_HINTS = {
        'rnode_firmware_esp32_generic.zip':  { product: 0xF0, model: 0xFE },
        'rnode_firmware_featheresp32.zip':   { product: 0xF0, model: 0xFE },
        'rnode_firmware_t3s3.zip':           { product: 0x03, model: 0xA6 },
        'rnode_firmware_t3s3_sx127x.zip':    { product: 0x03, model: 0xAA },
        'rnode_firmware_t3s3_sx1280_pa.zip': { product: 0x03, model: 0xAC },
        'rnode_firmware_ng21.zip':           { product: 0x03, model: 0xA7 },
        'rnode_firmware_ng20.zip':           { product: 0x03, model: 0xA8 },
        'rnode_firmware_lora32v10.zip':      { product: 0xB2, model: 0xBB },
        'rnode_firmware_lora32v20.zip':      { product: 0xB0, model: 0xB8 },
        'rnode_firmware_lora32v20_extled.zip': { product: 0xB0, model: 0xB8 },
        'rnode_firmware_lora32v21.zip':      { product: 0xB1, model: 0xB9 },
        'rnode_firmware_lora32v21_extled.zip': { product: 0xB1, model: 0xB9 },
        'rnode_firmware_lora32v21_tcxo.zip': { product: 0xB1, model: 0x09 },
        'rnode_firmware_heltec32v2.zip':     { product: 0xC0, model: 0xC9 },
        'rnode_firmware_heltec32v3.zip':     { product: 0xC1, model: 0xCA },
        'rnode_firmware_heltec32v4pa.zip':   { product: 0xC3, model: 0xC8 },
        'rnode_firmware_heltec_t114.zip':    { product: 0xC2, model: 0xC7 },
        'rnode_firmware_tbeam.zip':          { product: 0xE0, model: 0xE9 },
        'rnode_firmware_tbeam_sx1262.zip':   { product: 0xE0, model: 0xE8 },
        'rnode_firmware_tbeam_supreme.zip':  { product: 0xEA, model: 0xDC },
        'rnode_firmware_tdeck.zip':          { product: 0xD0, model: 0xD9 },
        'rnode_firmware_techo.zip':          { product: 0x15, model: 0x17 },
        'rnode_firmware_rak4631.zip':        { product: 0x10, model: 0x12 },
        'rnode_firmware_rak4631_sx1280.zip': { product: 0x10, model: 0x14 },
        'rnode_firmware_opencom_xl.zip':     { product: 0x20, model: 0x21 },
        'rnode_firmware_xiao_esp32s3.zip':   { product: 0xEB, model: 0xDD }
    };
    var RNODE_VARIANT_BAND_MODELS = {
        'rnode_firmware_t3s3.zip':             { high: 0xA6, low: 0xA1 },
        'rnode_firmware_t3s3_sx127x.zip':      { high: 0xAA, low: 0xA5 },
        'rnode_firmware_t3s3_sx1280_pa.zip':   { unsupported: 0xAC },
        'rnode_firmware_ng21.zip':             { high: 0xA7, low: 0xA2 },
        'rnode_firmware_ng20.zip':             { high: 0xA8, low: 0xA3 },
        'rnode_firmware_lora32v10.zip':        { high: 0xBB, low: 0xBA },
        'rnode_firmware_lora32v20.zip':        { high: 0xB8, low: 0xB3 },
        'rnode_firmware_lora32v20_extled.zip': { high: 0xB8, low: 0xB3 },
        'rnode_firmware_lora32v21.zip':        { high: 0xB9, low: 0xB4 },
        'rnode_firmware_lora32v21_extled.zip': { high: 0xB9, low: 0xB4 },
        'rnode_firmware_lora32v21_tcxo.zip':   { high: 0x09, low: 0x04 },
        'rnode_firmware_heltec32v2.zip':       { high: 0xC9, low: 0xC4 },
        'rnode_firmware_heltec32v3.zip':       { high: 0xCA, low: 0xC5 },
        'rnode_firmware_heltec32v4pa.zip':     { high: 0xC8 },
        'rnode_firmware_heltec_t114.zip':      { high: 0xC7, low: 0xC6 },
        'rnode_firmware_tbeam.zip':            { high: 0xE9, low: 0xE4 },
        'rnode_firmware_tbeam_sx1262.zip':     { high: 0xE8, low: 0xE3 },
        'rnode_firmware_tbeam_supreme.zip':    { high: 0xDC, low: 0xDB },
        'rnode_firmware_tdeck.zip':            { high: 0xD9, low: 0xD4 },
        'rnode_firmware_techo.zip':            { high: 0x17, low: 0x16 },
        'rnode_firmware_rak4631.zip':          { high: 0x12, low: 0x11 },
        'rnode_firmware_rak4631_sx1280.zip':   { high: 0x14, low: 0x13 },
        'rnode_firmware_opencom_xl.zip':       { high: 0x21 },
        'rnode_firmware_xiao_esp32s3.zip':     { high: 0xDD, low: 0xDE }
    };
    var RNODE_BAND_ORDER = ['high', 'low', 'unsupported', 'unknown'];

    var provProductSel = document.getElementById('provisionProduct');
    var provModelSel   = document.getElementById('provisionModel');
    var provToggle     = document.getElementById('provisionToggle');
    var provExpand     = document.getElementById('provisionExpand');
    var provOption     = document.getElementById('provisionOption');
    var provisionHint  = provOption ? provOption.querySelector('.flash-option-pill__hint') : null;
    var provBoard      = document.getElementById('provisionBoard');
    var provBoardValue = document.getElementById('provisionBoardValue');
    var provBoardChange = document.getElementById('provisionBoardChange');
    var provBoardManual = document.getElementById('provisionBoardManual');
    var flashRepair    = document.getElementById('flashRepair');
    var reprovisionBtn = document.getElementById('reprovisionBtn');
    var setHashBtn     = document.getElementById('setHashBtn');
    var adoptHashBtn   = document.getElementById('adoptHashBtn');
    var inspectHashBtn = document.getElementById('inspectHashBtn');
    var saveTncConfigBtn = document.getElementById('saveTncConfigBtn');

    // boardManual: user explicitly asked to override auto-detection
    state.boardManual = false;

    function modelRangeLabelFor(productByte, modelByte) {
        var label = modelLabelFor(productByte, modelByte) || '';
        var match = label.match(/(\d+(?:\.\d+)?-\d+(?:\.\d+)?)\s*(MHz|GHz)?/i);
        if (!match) return null;
        return match[1] + ' ' + (match[2] || 'MHz');
    }

    function rnodeBandLabelForModel(productByte, modelByte) {
        var ident = { product: productByte, model: modelByte };
        var band = bandForRnodeIdentity(ident);
        var range = modelRangeLabelFor(productByte, modelByte);
        if (band === 'low') return (range || '420-520 MHz') + ' (433 MHz boards)';
        if (band === 'high') return (range || '850-950 MHz') + ' (868/915 MHz boards)';
        if (band === 'unsupported') return (range || '2.4 GHz') + ' boards';
        return modelLabelFor(productByte, modelByte) || 'Set exact board in Advanced options';
    }

    function rnodeBandShortLabel(option) {
        if (!option) return null;
        return option.shortLabel || option.label;
    }

    function rnodeBandShortLabelForModel(productByte, modelByte) {
        var ident = { product: productByte, model: modelByte };
        var band = bandForRnodeIdentity(ident);
        var range = modelRangeLabelFor(productByte, modelByte);
        if (band === 'low') return (range || '420-520 MHz') + ' / 433 MHz';
        if (band === 'high') return (range || '850-950 MHz') + ' / 868/915 MHz';
        if (band === 'unsupported') return range || '2.4 GHz';
        return modelLabelFor(productByte, modelByte) || null;
    }

    function rnodeBandOptionsForVariant(name) {
        var hint = VARIANT_HINTS[name];
        if (!hint) return [];
        var models = RNODE_VARIANT_BAND_MODELS[name];
        var options = [];
        if (models) {
            RNODE_BAND_ORDER.forEach(function (key) {
                if (models[key] == null) return;
                options.push({
                    key: key,
                    product: hint.product,
                    model: models[key],
                    label: rnodeBandLabelForModel(hint.product, models[key]),
                    shortLabel: rnodeBandShortLabelForModel(hint.product, models[key])
                });
            });
        } else {
            var fallbackBand = bandForRnodeIdentity(hint) || 'unknown';
            options.push({
                key: fallbackBand,
                product: hint.product,
                model: hint.model,
                label: rnodeBandLabelForModel(hint.product, hint.model),
                shortLabel: rnodeBandShortLabelForModel(hint.product, hint.model)
            });
        }
        return options;
    }

    function selectedRnodeBandOption(name) {
        var options = rnodeBandOptionsForVariant(name);
        if (!options.length) return null;
        var key = state.rnodeBand || (rnodeBandSelect && rnodeBandSelect.value);
        for (var i = 0; i < options.length; i++) {
            if (options[i].key === key) return options[i];
        }
        for (var j = 0; j < options.length; j++) {
            if (options[j].key === 'high') return options[j];
        }
        return options[0];
    }

    function resolveRnodeVariantIdentity(name) {
        var selected = selectedRnodeBandOption(name);
        if (selected) return { product: selected.product, model: selected.model };
        var hint = VARIANT_HINTS[name];
        return hint ? { product: hint.product, model: hint.model } : null;
    }

    function populateRnodeBandSelect(name) {
        if (!rnodeBandSelect) return;
        if (!name) {
            rnodeBandSelect.innerHTML = '<option value="">Choose a device variant first</option>';
            rnodeBandSelect.disabled = true;
            state.rnodeBand = null;
            return;
        }
        var options = rnodeBandOptionsForVariant(name);
        if (!options.length) {
            rnodeBandSelect.innerHTML = '<option value="">Set exact board in Advanced options</option>';
            rnodeBandSelect.disabled = true;
            state.rnodeBand = null;
            return;
        }
        var selected = selectedRnodeBandOption(name);
        state.rnodeBand = selected.key;
        rnodeBandSelect.innerHTML = options.map(function (opt) {
            return '<option value="' + escapeOptionText(opt.key) + '">' + escapeOptionText(opt.label) + '</option>';
        }).join('');
        rnodeBandSelect.value = selected.key;
        rnodeBandSelect.disabled = options.length < 2;
    }

    function updateRnodeReadyStatus() {
        if (!rnodeStatus || !state.rnodeAsset || !state.rnodeAssetLabel || !state.rnodeAssetSha256) return;
        var band = rnodeBandShortLabel(selectedRnodeBandOption(state.rnodeAssetName));
        var path = isNrf52RnodeFirmwareSelected()
            ? 'nRF52 app DFU, bootloader and EEPROM preserved'
            : 'ESP32 web flash';
        rnodeStatus.classList.add('is-ready');
        rnodeStatus.textContent = '✓ ' + state.rnodeAssetLabel +
            (band ? ' · ' + band : '') +
            ' · ' + formatBytes(state.rnodeAsset.byteLength) +
            ' · publisher SHA-256 verified · ' + path + ' · ready to flash';
    }

    function productLabelFor(byte) {
        for (var i = 0; i < RNODE_PRODUCTS.length; i++) {
            if (RNODE_PRODUCTS[i].v === byte) return RNODE_PRODUCTS[i].label;
        }
        return null;
    }
    function modelLabelFor(productByte, modelByte) {
        var models = RNODE_MODELS_BY_PRODUCT[productByte] || [];
        for (var i = 0; i < models.length; i++) {
            if (models[i].v === modelByte) return models[i].label;
        }
        return null;
    }

    function buildProductSelect() {
        if (!provProductSel || provProductSel.options.length) return;
        provProductSel.innerHTML = RNODE_PRODUCTS
            .map(function (p) { return '<option value="' + p.v + '">' + p.label + ' (0x' + p.v.toString(16).padStart(2, '0').toUpperCase() + ')</option>'; })
            .join('');
        provProductSel.addEventListener('change', function () {
            populateModelsFor(parseInt(provProductSel.value, 10));
            updateProvisionBoardBadge();
        });
        if (provModelSel) {
            provModelSel.addEventListener('change', function () {
                updateProvisionBoardBadge();
            });
        }
    }
    function populateModelsFor(productByte) {
        var models = RNODE_MODELS_BY_PRODUCT[productByte] || [];
        if (!models.length) {
            provModelSel.innerHTML = '<option value="0xFF">FF - unspecified</option>';
            return;
        }
        provModelSel.innerHTML = models
            .map(function (m) { return '<option value="' + m.v + '">' + m.label + '</option>'; })
            .join('');
    }
    function hintProvisioningFromVariant(name) {
        if (!provProductSel) return;
        buildProductSelect();
        var hint = resolveRnodeVariantIdentity(name);
        if (!hint) {
            updateProvisionBoardBadge();
            return;
        }
        if (!state.boardManual) {
            provProductSel.value = String(hint.product);
            populateModelsFor(hint.product);
            provModelSel.value = String(hint.model);
        }
        updateProvisionBoardBadge();
    }

    function updateProvisionBoardBadge() {
        if (!provBoard || !provBoardValue) return;
        var hint = state.rnodeAssetName ? resolveRnodeVariantIdentity(state.rnodeAssetName) : null;
        if (state.boardManual) {
            var prodByte = parseInt(provProductSel && provProductSel.value, 10);
            var modByte  = parseInt(provModelSel && provModelSel.value, 10);
            var prodLabel = productLabelFor(prodByte) || ('Product 0x' + (isNaN(prodByte) ? '??' : prodByte.toString(16).toUpperCase()));
            var modLabel = modelLabelFor(prodByte, modByte) || ('Model 0x' + (isNaN(modByte) ? '??' : modByte.toString(16).toUpperCase()));
            provBoard.setAttribute('data-mode', 'manual');
            provBoardValue.textContent = prodLabel + ' · ' + modLabel;
        } else if (hint) {
            var hp = productLabelFor(hint.product) || 'Unknown product';
            var hm = modelLabelFor(hint.product, hint.model) || 'Unknown model';
            provBoard.setAttribute('data-mode', 'auto');
            provBoardValue.textContent = hp + ' · ' + hm;
        } else {
            provBoard.setAttribute('data-mode', 'unknown');
            provBoardValue.textContent = 'Choose an RNode firmware variant, or set the exact board/band manually.';
        }
    }

    function setBoardManual(manual) {
        state.boardManual = !!manual;
        if (provBoardManual) provBoardManual.hidden = !manual;
        if (provBoardChange) provBoardChange.textContent = manual ? 'Use suggestion' : 'Change';
        if (manual) {
            buildProductSelect();
            // If we have an auto-detect hint, seed the dropdowns from it so the
            // user starts editing from a sensible value rather than the first
            // entry in the list.
            var hint = state.rnodeAssetName ? resolveRnodeVariantIdentity(state.rnodeAssetName) : null;
            if (hint && provProductSel) {
                provProductSel.value = String(hint.product);
                populateModelsFor(hint.product);
                provModelSel.value = String(hint.model);
            }
        }
        updateProvisionBoardBadge();
    }

    function updateProvisionVisibility() {
        if (!provOption) return;
        // The EEPROM pill and RNode tools are only meaningful on the custom
        // path; hide on rsdeck / cardputer presets where Ratspeak firmware
        // is self-contained.
        var onCustom = state.device === 'custom' && !isRsnodeSelected();
        document.getElementById('flashAdvanced').hidden = isRsnodeSelected();
        provOption.style.display = onCustom ? '' : 'none';
        if (flashRepair) flashRepair.style.display = onCustom ? '' : 'none';
        if (!onCustom) {
            state.rnodeProvision = false;
            if (provToggle) provToggle.checked = false;
            if (provExpand) provExpand.hidden = true;
        }
        syncProvisionRequirement();
        updateAdvancedMeta();
    }
    function syncProvisionRequirement() {
        if (!provToggle) return;
        var required = isOfficialRnodeFirmwareSelected();
        if (required) {
            provToggle.checked = true;
            provToggle.disabled = true;
            state.rnodeProvision = true;
            if (provExpand) provExpand.hidden = false;
            if (provisionHint) provisionHint.textContent = 'Required for RNode';
            buildProductSelect();
            updateProvisionBoardBadge();
        } else {
            if (provToggle.disabled) {
                provToggle.checked = false;
                state.rnodeProvision = false;
                if (provExpand) provExpand.hidden = true;
            }
            provToggle.disabled = false;
            if (provisionHint) provisionHint.textContent = 'Provision after flash';
        }
    }
    if (provToggle) {
        provToggle.addEventListener('change', function () {
            if (provToggle.disabled && isOfficialRnodeFirmwareSelected()) {
                provToggle.checked = true;
            }
            state.rnodeProvision = provToggle.checked;
            if (provExpand) provExpand.hidden = !provToggle.checked;
            if (provToggle.checked) {
                buildProductSelect();
                updateProvisionBoardBadge();
            }
            updateAdvancedMeta();
        });
    }
    if (provBoardChange) {
        provBoardChange.addEventListener('click', function () {
            setBoardManual(!state.boardManual);
        });
    }
    if (reprovisionBtn) {
        reprovisionBtn.addEventListener('click', function () { runReprovisionOnly(); });
    }
    if (setHashBtn) {
        setHashBtn.addEventListener('click', function () { runSetHashOnly(); });
    }
    if (adoptHashBtn) {
        adoptHashBtn.addEventListener('click', function () { runAdoptRunningHashOnly(); });
    }
    if (inspectHashBtn) {
        inspectHashBtn.addEventListener('click', function () { runInspectHashesOnly(); });
    }
    if (saveTncConfigBtn) {
        saveTncConfigBtn.addEventListener('click', function () { runSetNormalModeOnly(); });
    }

    // ── KISS framing + RNode protocol ────────────────
    // Constants transcribed from RNS/Utilities/rnodeconf.py
    var KISS = {
        FEND: 0xC0, FESC: 0xDB, TFEND: 0xDC, TFESC: 0xDD,
        CMD_DETECT:    0x08,
        CMD_RADIO_STATE: 0x06,
        CMD_ERROR:     0x90,
        CMD_ROM_READ:  0x51,
        CMD_ROM_WRITE: 0x52,
        CMD_CONF_DELETE: 0x54,
        CMD_FW_HASH:   0x58,
        CMD_HASHES:    0x60,
        CMD_RESET:     0x55,
        CMD_RESET_BYTE: 0xF8,
        DETECT_REQ:    0x73,
        DETECT_RESP:   0x46,
        ERROR_EEPROM_LOCKED: 0x03,
        HASH_TYPE_TARGET_FIRMWARE: 0x01,
        HASH_TYPE_FIRMWARE:        0x02
    };
    var RNODE_ROM_WRITE_DELAY_MS = 25;
    // Stock nRF52 RNode firmware persists each emulated-EEPROM byte by closing
    // and reopening its LittleFS file. Keep the host cadence conservative so
    // the identity tail cannot be silently dropped before the lock write.
    var RNODE_NRF52_ROM_WRITE_DELAY_MS = 150;
    var RNODE_ROM_WRITE_ERROR_WINDOW_MS = 45;
    var RNODE_POST_EEPROM_DELAY_MS = 1000;
    var RNODE_NRF52_POST_IDENTITY_WRITE_DELAY_MS = 3500;
    var RNODE_HASH_SAVE_DELAY_MS = 3000;
    var RNODE_REPAIR_SETTLE_MS = 1500;
    // Upstream rnodeconf gives nRF52 RNodes this long after reset because the
    // USB serial connection is disrupted and display boards can take time to boot.
    var RNODE_NRF52_ACTIVATION_SETTLE_MS = 20000;
    var RNODE_NRF52_POST_RESET_SETTLE_MS = 20000;
    var RNODE_POST_FLASH_BOOT_WAIT_MS = 9000;
    var RNODE_NRF52_DFU_REBOOT_WAIT_MS = 9000;
    var RNODE_POST_OPEN_SIGNAL_SETTLE_MS = 1200;
    var RNODE_EEPROM_READ_RETRY_DELAY_MS = 1200;
    var RNODE_READ_TIMEOUT_MS = 3500;
    var RNODE_DETECT_TIMEOUT_MS = 2500;
    var RNODE_EEPROM_RESERVED = 200;
    var RNODE_PORT_OPEN_RETRIES = 4;
    var RNODE_PORT_OPEN_RETRY_DELAY_MS = 900;
    var ROM_ADDR = {
        PRODUCT: 0x00, MODEL: 0x01, HW_REV: 0x02, SERIAL: 0x03, MADE: 0x07,
        CHKSUM: 0x0B, SIGNATURE: 0x1B, INFO_LOCK: 0x9B,
        CONF_SF: 0x9C, CONF_CR: 0x9D, CONF_TXP: 0x9E, CONF_BW: 0x9F,
        CONF_FREQ: 0xA3, CONF_OK: 0xA7
    };
    var INFO_LOCK_BYTE = 0x73;
    var CONF_OK_BYTE = 0x73;
    function sleepMs(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }
    function bytesToHex(bytes) {
        return Array.from(bytes || []).map(function (b) {
            return (b & 0xFF).toString(16).padStart(2, '0');
        }).join('');
    }
    function hashesEqual(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) {
            if ((a[i] & 0xFF) !== (b[i] & 0xFF)) return false;
        }
        return true;
    }
    function isZeroHash(bytes) {
        if (!bytes || !bytes.length) return true;
        for (var i = 0; i < bytes.length; i++) {
            if ((bytes[i] & 0xFF) !== 0) return false;
        }
        return true;
    }
    function isErasedHash(bytes) {
        if (!bytes || !bytes.length) return true;
        for (var i = 0; i < bytes.length; i++) {
            if ((bytes[i] & 0xFF) !== 0xFF) return false;
        }
        return true;
    }
    function isUninitializedRnodeHash(bytes) {
        return isZeroHash(bytes) || isErasedHash(bytes);
    }
    function hexByte(byte) {
        return '0x' + (byte & 0xFF).toString(16).padStart(2, '0').toUpperCase();
    }
    function readU32BE(bytes, offset) {
        return (((bytes[offset] & 0xFF) * 0x1000000) +
            ((bytes[offset + 1] & 0xFF) << 16) +
            ((bytes[offset + 2] & 0xFF) << 8) +
            (bytes[offset + 3] & 0xFF)) >>> 0;
    }
    function formatHzMhz(hz) {
        if (!hz || hz === 0xFFFFFFFF) return 'unset';
        var mhz = hz / 1000000;
        return (Math.round(mhz) === mhz ? mhz.toFixed(0) : mhz.toFixed(3)) + ' MHz';
    }
    function bandForRnodeIdentity(ident) {
        if (!ident) return null;
        var label = modelLabelFor(ident.product, ident.model) || '';
        var lower = label.toLowerCase();
        if (/(410-525|420-520|430-510)/.test(lower)) return 'low';
        if (/(779-928|820-960|820-1020|850-950)/.test(lower)) return 'high';
        if (/(2\.4-2\.5|sx1280)/.test(lower)) return 'unsupported';
        return null;
    }
    function normalizeRnodeEepromModel(modelByte) {
        var model = modelByte & 0xFF;
        // Reticulum rnodeconf.py treats these TCXO values as firmware
        // selection aliases only; the EEPROM identity remains B4/B9.
        if (model === 0x04) return 0xB4;
        if (model === 0x09) return 0xB9;
        return model;
    }
    function normalizeRnodeProvisioningIdentity(ident) {
        if (!ident) return null;
        return {
            product: ident.product & 0xFF,
            selectedModel: ident.model & 0xFF,
            model: normalizeRnodeEepromModel(ident.model)
        };
    }
    function buildUnsignedRnodeSignature() {
        // Upstream rnodeconf signs this checksum with the local signing key.
        // The browser does not have that private key, so web setup currently
        // writes a blank signature and surfaces that limitation in the UI/log.
        return new Uint8Array(128);
    }
    var RNODE_UNSIGNED_PROVISIONING_NOTICE = 'Browser RNode setup writes an unsigned identity; use rnodeconf when a signed device identity is required.';
    function portUsbInfo(port) {
        try {
            var info = port && port.getInfo ? port.getInfo() : {};
            if (!info || info.usbVendorId == null || info.usbProductId == null) return null;
            return { vendorId: info.usbVendorId, productId: info.usbProductId };
        } catch (e) {
            return null;
        }
    }
    function sameUsbInfo(a, b) {
        return !!a && !!b && a.vendorId === b.vendorId && a.productId === b.productId;
    }
    function chooseRnodeReconnectPort(ports, previousPort) {
        var candidates = Array.isArray(ports) ? ports.filter(Boolean) : [];
        if (!candidates.length) return null;
        if (previousPort && candidates.indexOf(previousPort) !== -1) return previousPort;

        var previousInfo = portUsbInfo(previousPort);
        if (previousInfo) {
            var matches = candidates.filter(function (port) {
                return sameUsbInfo(portUsbInfo(port), previousInfo);
            });
            if (matches.length) return matches[0];
        }

        if (candidates.length === 1) return candidates[0];
        return candidates[0];
    }
    function serialPortLabel(port) {
        var info = portUsbInfo(port);
        if (!info) return 'authorized serial port';
        var vid = info.vendorId.toString(16).padStart(4, '0');
        var pid = info.productId.toString(16).padStart(4, '0');
        return 'USB ' + vid + ':' + pid;
    }
    async function authorizedSerialPorts() {
        if (!navigator.serial || !navigator.serial.getPorts) return [];
        try {
            return await navigator.serial.getPorts();
        } catch (e) {
            return [];
        }
    }
    async function collectRnodePortCandidates() {
        var candidates = [];
        if (state.port) candidates.push(state.port);
        var ports = await authorizedSerialPorts();
        ports.forEach(function (port) {
            if (candidates.indexOf(port) === -1) candidates.push(port);
        });
        return candidates;
    }
    async function refreshRnodePortAfterReboot(logMessage) {
        if (!navigator.serial || !navigator.serial.getPorts) return;
        var currentPorts = await authorizedSerialPorts();
        var previousPort = state.port;
        var selected = chooseRnodeReconnectPort(currentPorts, previousPort);
        if (selected) {
            state.port = selected;
            if (selected !== previousPort && logMessage) {
                logMessage('Selected post-flash RNode serial port ' + serialPortLabel(selected) + '.', 'log-orange');
            }
        }
    }
    async function openRnodeSerialPort(logMessage, settleMs, excludedPorts, onlyPort) {
        await sleepMs(settleMs == null ? RNODE_REPAIR_SETTLE_MS : settleMs);

        var excluded = Array.isArray(excludedPorts) ? excludedPorts : [];
        var lastError = null;
        for (var attempt = 0; attempt < RNODE_PORT_OPEN_RETRIES; attempt++) {
            var candidates = (await collectRnodePortCandidates()).filter(function (port) {
                return excluded.indexOf(port) === -1 && (!onlyPort || port === onlyPort);
            });
            if (!candidates.length) {
                throw new Error('Serial port unavailable');
            }
            if (attempt > 0) {
                if (logMessage) logMessage('Retrying RNode serial connection...', 'log-orange');
                await sleepMs(RNODE_PORT_OPEN_RETRY_DELAY_MS);
            }
            for (var i = 0; i < candidates.length; i++) {
                var port = candidates[i];
                try { await port.close(); } catch (e) { /* may already be closed */ }
                try {
                    await port.open({
                        baudRate: 115200, dataBits: 8, parity: 'none', stopBits: 1,
                        flowControl: 'none', bufferSize: 4096
                    });
                    if (port.setSignals) {
                        await port.setSignals({
                            dataTerminalReady: true,
                            requestToSend: true
                        });
                        await sleepMs(RNODE_POST_OPEN_SIGNAL_SETTLE_MS);
                    }
                    if (port !== state.port && logMessage) {
                        logMessage('Reacquired RNode serial via ' + serialPortLabel(port) + '.', 'log-orange');
                    }
                    state.port = port;
                    return port;
                } catch (e) {
                    lastError = e;
                    if (i === 0 && candidates.length > 1 && logMessage) {
                        logMessage('Existing serial handle could not be reopened; trying authorized ports...', 'log-orange');
                    }
                }
            }
        }

        throw lastError || new Error('Could not open RNode serial port');
    }

    function kissEscape(bytes) {
        var out = [];
        for (var i = 0; i < bytes.length; i++) {
            var b = bytes[i];
            if (b === KISS.FEND)      { out.push(KISS.FESC, KISS.TFEND); }
            else if (b === KISS.FESC) { out.push(KISS.FESC, KISS.TFESC); }
            else                      { out.push(b); }
        }
        return out;
    }
    function kissFrame(cmd, payload) {
        var escaped = kissEscape(payload);
        return new Uint8Array([KISS.FEND, cmd].concat(escaped).concat([KISS.FEND]));
    }
    function decodeKissPayload(frame) {
        var data = [];
        var escaping = false;
        for (var i = 0; i < frame.length; i++) {
            var byte = frame[i];
            if (escaping) {
                if (byte === KISS.TFEND) data.push(KISS.FEND);
                else if (byte === KISS.TFESC) data.push(KISS.FESC);
                else return null;
                escaping = false;
            } else if (byte === KISS.FESC) {
                escaping = true;
            } else {
                data.push(byte);
            }
        }
        return escaping ? null : data;
    }

    function createKissReadPump(reader) {
        var frames = [];
        var waiters = [];
        var buffer = [];
        var inFrame = false;
        var active = true;

        function resolveMatching(frame) {
            for (var i = 0; i < waiters.length; i++) {
                var waiter = waiters[i];
                if (!waiter.predicate || waiter.predicate(frame)) {
                    waiters.splice(i, 1);
                    clearTimeout(waiter.timer);
                    waiter.resolve(frame);
                    return true;
                }
            }
            return false;
        }

        function pushFrame(raw) {
            var decoded = decodeKissPayload(raw);
            if (!decoded || decoded.length === 0) return;
            var frame = {
                command: decoded[0],
                payload: decoded.slice(1),
                raw: decoded
            };
            if (!resolveMatching(frame)) frames.push(frame);
        }

        (async function pump() {
            try {
                while (active) {
                    var result = await reader.read();
                    if (result.done) break;
                    var value = result.value || [];
                    for (var i = 0; i < value.length; i++) {
                        var byte = value[i];
                        if (byte === KISS.FEND) {
                            if (buffer.length) pushFrame(buffer);
                            buffer = [];
                            inFrame = true;
                        } else if (inFrame) {
                            buffer.push(byte);
                        }
                    }
                }
            } catch (e) {
                if (active) console.log('RNode serial read stopped', e);
            }
        })();

        return {
            readFrame: function (predicate, timeoutMs) {
                for (var i = 0; i < frames.length; i++) {
                    var frame = frames[i];
                    if (!predicate || predicate(frame)) {
                        frames.splice(i, 1);
                        return Promise.resolve(frame);
                    }
                }
                return new Promise(function (resolve) {
                    var waiter = {
                        predicate: predicate,
                        resolve: resolve,
                        timer: null
                    };
                    waiter.timer = setTimeout(function () {
                        var idx = waiters.indexOf(waiter);
                        if (idx !== -1) waiters.splice(idx, 1);
                        resolve(null);
                    }, timeoutMs == null ? RNODE_READ_TIMEOUT_MS : timeoutMs);
                    waiters.push(waiter);
                });
            },
            stop: function () {
                active = false;
                waiters.splice(0).forEach(function (waiter) {
                    clearTimeout(waiter.timer);
                    waiter.resolve(null);
                });
            }
        };
    }

    function createRnodeSession(port) {
        var reader = port.readable.getReader();
        var writer = port.writable.getWriter();
        var pump = createKissReadPump(reader);
        return {
            port: port,
            reader: reader,
            writer: writer,
            pump: pump,
            send: async function (cmd, payload) {
                await writer.write(kissFrame(cmd, payload || []));
            },
            readFrame: pump.readFrame
        };
    }

    async function closeRnodeSession(session) {
        if (!session) return;
        session.pump.stop();
        try { await session.reader.cancel(); } catch (e) { /* ignore */ }
        try { session.reader.releaseLock(); } catch (e) { /* ignore */ }
        try { session.writer.releaseLock(); } catch (e) { /* ignore */ }
        try { await session.port.close(); } catch (e) { /* ignore */ }
    }

    async function withRnodeSession(logMessage, settleMs, callback) {
        var rejectedPorts = [];
        var lastError = null;
        for (var probeAttempt = 0; probeAttempt < RNODE_PORT_OPEN_RETRIES; probeAttempt++) {
            var port = await openRnodeSerialPort(logMessage, probeAttempt === 0 ? settleMs : 0, rejectedPorts);
            var session = createRnodeSession(port);
            var detected = false;
            try {
                detected = await detectRnodeKissService(session);
                if (!detected) {
                    throw new Error('Selected serial port did not answer as RNode');
                }
                return await callback(session);
            } catch (e) {
                lastError = e;
                if (!detected && logMessage) {
                    logMessage('Opened serial port did not answer as RNode; trying another authorized port...', 'log-orange');
                }
                if (detected) throw e;
                rejectedPorts.push(port);
            } finally {
                await closeRnodeSession(session);
            }
        }
        throw lastError || new Error('Selected serial port did not answer as RNode');
    }

    async function detectRnodeKissService(session) {
        await session.send(KISS.CMD_DETECT, [KISS.DETECT_REQ]);
        var frame = await session.readFrame(function (candidate) {
            return candidate.command === KISS.CMD_DETECT;
        }, RNODE_DETECT_TIMEOUT_MS);
        return !!(frame && frame.payload && frame.payload[0] === KISS.DETECT_RESP);
    }

    // SHA-256 of bytes — uses WebCrypto
    async function sha256(bytes) {
        var buf = await crypto.subtle.digest('SHA-256', bytes);
        return new Uint8Array(buf);
    }

    function normalizeSha256Hex(value) {
        var normalized = String(value || '').trim().toLowerCase();
        return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
    }

    async function verifyOfficialRnodeReleaseAsset(buffer, metadata) {
        if (!metadata || !Number.isSafeInteger(metadata.size) || metadata.size < 0) {
            throw new Error('Official release metadata is missing a valid asset size');
        }
        if (!buffer || buffer.byteLength !== metadata.size) {
            throw new Error('Official release download size does not match publisher metadata');
        }
        var expected = normalizeSha256Hex(metadata.sha256);
        if (!expected) {
            throw new Error('Official release metadata is missing a valid publisher SHA-256 digest');
        }
        var actual = bytesToHex(await sha256(new Uint8Array(buffer)));
        if (actual !== expected) {
            throw new Error('Official release download failed publisher SHA-256 verification');
        }
        return expected;
    }

    // Compute the firmware partition hash, mirroring rnodeconf.get_partition_hash.
    // ESP32 RNode app binaries embed SHA-256(file[0:-32]) at file[-32:].
    // nRF52 DFU app binaries do not embed the digest, so rnodeconf uses
    // SHA-256(file). If an ESP32 embedded digest is absent or invalid, we
    // intentionally return null instead of writing a guessed target hash.
    async function computeFirmwareHash(bytes) {
        if (selectedFlashStrategy() === 'nrf52-dfu') {
            return await sha256(bytes);
        }
        if (bytes.length > 32) {
            var calc = await sha256(bytes.slice(0, -32));
            var trailing = bytes.slice(-32);
            var match = true;
            for (var i = 0; i < 32; i++) { if (calc[i] !== trailing[i]) { match = false; break; } }
            if (match) return trailing;
        }
        return null;
    }

    async function readRnodeRom(session) {
        await session.send(KISS.CMD_ROM_READ, [0x00]);
        var frame = await session.readFrame(function (candidate) {
            return candidate.command === KISS.CMD_ROM_READ && candidate.payload.length >= RNODE_EEPROM_RESERVED;
        }, RNODE_READ_TIMEOUT_MS);
        if (!frame) throw new Error('RNode did not return EEPROM data');
        return frame.payload.slice(0, RNODE_EEPROM_RESERVED);
    }

    async function readRnodeRomWithRetry(session, attempts, logMessage) {
        var lastError = null;
        for (var i = 0; i < attempts; i++) {
            try {
                return await readRnodeRom(session);
            } catch (e) {
                lastError = e;
                if (i < attempts - 1) {
                    if (logMessage) logMessage('Waiting for RNode EEPROM service...', 'log-orange');
                    await sleepMs(RNODE_EEPROM_READ_RETRY_DELAY_MS);
                }
            }
        }
        throw lastError || new Error('RNode did not return EEPROM data');
    }

    async function readRnodeFirmwareHash(session, hashType) {
        await session.send(KISS.CMD_HASHES, [hashType]);
        var frame = await session.readFrame(function (candidate) {
            return candidate.command === KISS.CMD_HASHES &&
                candidate.payload.length >= 33 &&
                candidate.payload[0] === hashType;
        }, RNODE_READ_TIMEOUT_MS);
        if (!frame) throw new Error('RNode did not return firmware hash type 0x' + hashType.toString(16));
        return frame.payload.slice(1, 33);
    }

    async function readRnodeConfigStatus(session) {
        var rom = await readRnodeRom(session);
        return {
            ok: rom[ROM_ADDR.CONF_OK] === CONF_OK_BYTE,
            okByte: rom[ROM_ADDR.CONF_OK],
            spreadingFactor: rom[ROM_ADDR.CONF_SF],
            codingRate: rom[ROM_ADDR.CONF_CR],
            txPower: rom[ROM_ADDR.CONF_TXP],
            bandwidth: readU32BE(rom, ROM_ADDR.CONF_BW),
            frequency: readU32BE(rom, ROM_ADDR.CONF_FREQ)
        };
    }

    async function sendRnodeFirmwareHash(session, hashBytes) {
        await session.send(KISS.CMD_FW_HASH, Array.from(hashBytes));
        await sleepMs(RNODE_HASH_SAVE_DELAY_MS);
    }

    async function resetRnodeAfterSetup(session, logMessage) {
        try {
            if (logMessage) logMessage('Resetting RNode...', '');
            await session.send(KISS.CMD_RESET, [KISS.CMD_RESET_BYTE]);
            await sleepMs(900);
        } catch (e) {
            if (logMessage) logMessage('Could not reset automatically; unplug/replug or press reset before use.', 'log-orange');
        }
    }

    async function sendRnodeNormalMode(session, logMessage, options) {
        var quiet = options && options.quiet;
        if (!quiet) logMessage('Clearing saved startup radio settings...', '');
        await session.send(KISS.CMD_RADIO_STATE, [0x00]);
        await sleepMs(350);
        await session.send(KISS.CMD_CONF_DELETE, [0x00]);
        await sleepMs(350);
        await session.send(KISS.CMD_CONF_DELETE, [0x00]);
        await sleepMs(900);
        if (!quiet) logMessage('Startup radio settings cleared.', 'log-green');
    }

    async function sendRomWrite(session, addr, byte) {
        await session.send(KISS.CMD_ROM_WRITE, [addr & 0xFF, byte & 0xFF]);
        var errorFrame = await session.readFrame(function (candidate) {
            return candidate.command === KISS.CMD_ERROR;
        }, RNODE_ROM_WRITE_ERROR_WINDOW_MS);
        if (errorFrame && errorFrame.payload[0] === KISS.ERROR_EEPROM_LOCKED) return false;
        if (errorFrame) {
            var code = errorFrame.payload && errorFrame.payload.length ? errorFrame.payload[0] : 0xFF;
            throw new Error('RNode returned error ' + hexByte(code) + ' during EEPROM write');
        }
        if (!errorFrame) await sleepMs(rnodeRomWriteDelayMs());
        return true;
    }

    async function writeRomOrLocked(session, addr, byte) {
        var ok = await sendRomWrite(session, addr, byte);
        if (!ok) {
            var err = new Error('RNode EEPROM identity area is locked');
            err.code = 'EEPROM_LOCKED';
            throw err;
        }
    }

    async function writeLoadedFirmwareHash(session, logMessage) {
        if (!state.firmwareAppBytes || !state.firmwareAppBytes.length) {
            logMessage('Firmware hash unavailable; will try running hash after reboot.', 'log-orange');
            return false;
        }
        logMessage('Writing firmware hash...', '');
        var fwHash = await computeFirmwareHash(state.firmwareAppBytes);
        if (!fwHash) {
            logMessage('Firmware hash unavailable; will try running hash after reboot.', 'log-orange');
            return null;
        }
        await sendRnodeFirmwareHash(session, fwHash);
        return fwHash;
    }

    async function logRnodeHashStatus(session, logMessage) {
        var target = await readRnodeFirmwareHash(session, KISS.HASH_TYPE_TARGET_FIRMWARE);
        var actual = await readRnodeFirmwareHash(session, KISS.HASH_TYPE_FIRMWARE);
        logMessage('Target hash: ' + bytesToHex(target), '');
        logMessage('Actual hash: ' + bytesToHex(actual), '');
        if (hashesEqual(target, actual)) {
            logMessage('Firmware hash status: target matches actual.', 'log-green');
        } else {
            logMessage('Firmware hash status: mismatch; device will report Firmware Corrupt.', 'log-red');
        }
        return { target: target, actual: actual };
    }

    async function ensureRnodeFirmwareHashMatches(logMessage, settleMs, options) {
        var quiet = options && options.quiet;
        var expectedHash = options && options.expectedHash;
        var result = await withRnodeSession(logMessage, settleMs == null ? RNODE_REPAIR_SETTLE_MS : settleMs, async function (session) {
            var status = quiet
                ? {
                    target: await readRnodeFirmwareHash(session, KISS.HASH_TYPE_TARGET_FIRMWARE),
                    actual: await readRnodeFirmwareHash(session, KISS.HASH_TYPE_FIRMWARE)
                }
                : await logRnodeHashStatus(session, logMessage);
            if (expectedHash && !hashesEqual(status.actual, expectedHash)) {
                throw new Error('running firmware hash does not match the selected image');
            }
            if (hashesEqual(status.target, status.actual)) {
                if (isUninitializedRnodeHash(status.target)) {
                    throw new Error('RNode firmware hashes are not initialized yet');
                }
                return { status: status, adopted: false };
            }
            if (isUninitializedRnodeHash(status.actual)) {
                throw new Error('RNode running firmware hash is not available yet');
            }

            if (!quiet) logMessage('Target hash differs from running firmware; adopting running hash...', 'log-orange');
            await sendRnodeFirmwareHash(session, expectedHash || status.actual);
            return { status: status, adopted: true };
        });

        if (!result.adopted) return result.status;

        if (!quiet) logMessage('Waiting for RNode to reboot before verifying the adopted hash...', 'log-orange');
        var verified = await withRnodeSession(logMessage, rnodePostResetSettleMs(), async function (session) {
            return quiet
                ? {
                    target: await readRnodeFirmwareHash(session, KISS.HASH_TYPE_TARGET_FIRMWARE),
                    actual: await readRnodeFirmwareHash(session, KISS.HASH_TYPE_FIRMWARE)
                }
                : await logRnodeHashStatus(session, logMessage);
        });
        if (!hashesEqual(verified.target, verified.actual) || isUninitializedRnodeHash(verified.target)) {
            throw new Error('firmware hash did not persist across the RNode reboot');
        }
        var requiredActual = expectedHash || result.status.actual;
        if (!hashesEqual(verified.actual, requiredActual)) {
            throw new Error('running firmware changed while the target hash was being adopted');
        }
        if (!quiet) logMessage('Running firmware hash adopted and verified after reboot.', 'log-green');
        return verified;
    }

    async function logRnodeConfigStatus(session, logMessage) {
        var status = await readRnodeConfigStatus(session);
        if (status.ok) {
            logMessage('Startup radio settings: ' + formatHzMhz(status.frequency) +
                ', BW ' + status.bandwidth + ', SF' + status.spreadingFactor +
                ', CR' + status.codingRate + ', TX ' + status.txPower + ' dBm.', 'log-green');
        } else {
            logMessage('Startup radio settings: disabled.', 'log-orange');
            logMessage('This is normal for Ratspeak-controlled RNode use.', 'log-green');
        }
        return status;
    }

    function buildRnodeIdentityPayload(product, model, hwRev, serialBytes, madeBytes, checksum, signature) {
        var expected = new Uint8Array(ROM_ADDR.INFO_LOCK);
        expected[ROM_ADDR.PRODUCT] = product;
        expected[ROM_ADDR.MODEL] = model;
        expected[ROM_ADDR.HW_REV] = hwRev;
        expected.set(serialBytes, ROM_ADDR.SERIAL);
        expected.set(madeBytes, ROM_ADDR.MADE);
        expected.set(checksum, ROM_ADDR.CHKSUM);
        expected.set(signature, ROM_ADDR.SIGNATURE);
        return expected;
    }

    function rnodeIdentityMismatchAddresses(rom, expected) {
        var mismatches = [];
        for (var i = 0; i < expected.length; i++) {
            if (!rom || rom[i] !== expected[i]) mismatches.push(i);
        }
        return mismatches;
    }

    function browserSignatureIsRepairable(rom) {
        if (!rom || rom.length < RNODE_EEPROM_RESERVED) return false;
        for (var i = ROM_ADDR.SIGNATURE; i < ROM_ADDR.INFO_LOCK; i++) {
            if (rom[i] !== 0x00 && rom[i] !== 0xFF) return false;
        }
        return true;
    }

    function verifyRnodeIdentityPayload(rom, product, model, hwRev, serialBytes, madeBytes, checksum, signature) {
        if (!rom || rom.length < RNODE_EEPROM_RESERVED) return 'EEPROM readback was too short';
        if (rom[ROM_ADDR.PRODUCT] !== product) return 'EEPROM product readback mismatch';
        if (rom[ROM_ADDR.MODEL] !== model) return 'EEPROM model readback mismatch';
        if (rom[ROM_ADDR.HW_REV] !== hwRev) return 'EEPROM hardware revision readback mismatch';
        for (var s = 0; s < 4; s++) {
            if (rom[ROM_ADDR.SERIAL + s] !== serialBytes[s]) return 'EEPROM serial readback mismatch';
        }
        for (var m = 0; m < 4; m++) {
            if (rom[ROM_ADDR.MADE + m] !== madeBytes[m]) return 'EEPROM manufacture timestamp readback mismatch';
        }
        for (var i = 0; i < 16; i++) {
            if (rom[ROM_ADDR.CHKSUM + i] !== checksum[i]) return 'EEPROM checksum readback mismatch';
        }
        for (var sig = 0; sig < 128; sig++) {
            if (rom[ROM_ADDR.SIGNATURE + sig] !== signature[sig]) return 'EEPROM signature readback mismatch';
        }
        return null;
    }

    function verifyProvisionedEeprom(rom, product, model, hwRev, serialBytes, madeBytes, checksum, signature) {
        var payloadIssue = verifyRnodeIdentityPayload(rom, product, model, hwRev, serialBytes, madeBytes, checksum, signature);
        if (payloadIssue) return payloadIssue;
        if (rom[ROM_ADDR.INFO_LOCK] !== INFO_LOCK_BYTE) return 'EEPROM identity lock byte was not written';
        return null;
    }

    function md5EqualsStoredIdentityChecksum(rom) {
        if (!rom || rom.length < RNODE_EEPROM_RESERVED) return false;
        var calc = md5Bytes(rom.slice(ROM_ADDR.PRODUCT, ROM_ADDR.MADE + 4));
        for (var i = 0; i < 16; i++) {
            if (rom[ROM_ADDR.CHKSUM + i] !== calc[i]) return false;
        }
        return true;
    }

    function validateRnodeIdentityForBoard(rom, product, model) {
        if (!rom || rom.length < RNODE_EEPROM_RESERVED) return 'EEPROM readback was too short';
        if (rom[ROM_ADDR.INFO_LOCK] !== INFO_LOCK_BYTE) return 'RNode identity was not locked';
        if (rom[ROM_ADDR.PRODUCT] !== product) return 'RNode product byte was not written';
        if (rom[ROM_ADDR.MODEL] !== model) {
            if (normalizeRnodeEepromModel(rom[ROM_ADDR.MODEL]) === model) {
                return 'RNode EEPROM contains a TCXO firmware-selection alias instead of the normalized model byte';
            }
            return 'RNode model byte was not written';
        }
        if (rom[ROM_ADDR.HW_REV] === 0x00 || rom[ROM_ADDR.HW_REV] === 0xFF) return 'RNode hardware revision is blank';
        if (!md5EqualsStoredIdentityChecksum(rom)) return 'RNode identity checksum does not match';
        return null;
    }

    function validateUnlockedRnodeIdentityPayloadForBoard(rom, product, model) {
        if (!rom || rom.length < RNODE_EEPROM_RESERVED) return 'EEPROM readback was too short';
        if (rom[ROM_ADDR.PRODUCT] !== product) return 'RNode product byte was not written';
        if (rom[ROM_ADDR.MODEL] !== model) {
            if (normalizeRnodeEepromModel(rom[ROM_ADDR.MODEL]) === model) {
                return 'RNode EEPROM contains a TCXO firmware-selection alias instead of the normalized model byte';
            }
            return 'RNode model byte was not written';
        }
        if (rom[ROM_ADDR.HW_REV] === 0x00 || rom[ROM_ADDR.HW_REV] === 0xFF) return 'RNode hardware revision is blank';
        if (!md5EqualsStoredIdentityChecksum(rom)) return 'RNode identity checksum does not match';
        return null;
    }

    function identityLooksBlank(rom) {
        if (!rom || rom.length < RNODE_EEPROM_RESERVED) return true;
        return rom[ROM_ADDR.PRODUCT] === 0xFF &&
            rom[ROM_ADDR.MODEL] === 0xFF &&
            rom[ROM_ADDR.HW_REV] === 0xFF &&
            rom[ROM_ADDR.INFO_LOCK] === 0xFF;
    }

    async function writeRnodeIdentityPayload(session, expected, addresses) {
        for (var i = 0; i < addresses.length; i++) {
            var addr = addresses[i];
            await writeRomOrLocked(session, addr, expected[addr]);
        }
    }

    async function writeRnodeIdentity(session, product, model, hwRev, serialBytes, madeBytes, checksum, signature, logMessage) {
        logMessage('Writing RNode identity...', '');
        var expected = buildRnodeIdentityPayload(product, model, hwRev, serialBytes, madeBytes, checksum, signature);
        var unlockedRom = null;
        var mismatches = [];
        for (var attempt = 0; attempt < 3; attempt++) {
            unlockedRom = await readRnodeRomWithRetry(session, 3, logMessage);
            mismatches = rnodeIdentityMismatchAddresses(unlockedRom, expected);
            if (!mismatches.length) break;
            if (attempt > 0) {
                logMessage('Retrying ' + mismatches.length + ' unpersisted EEPROM byte(s)...', 'log-orange');
            }
            await writeRnodeIdentityPayload(session, expected, mismatches);
            await sleepMs(RNODE_EEPROM_READ_RETRY_DELAY_MS);
        }
        unlockedRom = await readRnodeRomWithRetry(session, 3, logMessage);
        mismatches = rnodeIdentityMismatchAddresses(unlockedRom, expected);
        if (mismatches.length) {
            throw new Error('RNode identity remained incomplete; EEPROM was left unlocked');
        }
        var unlockedIssue = verifyRnodeIdentityPayload(unlockedRom, product, model, hwRev, serialBytes, madeBytes, checksum, signature);
        if (unlockedIssue) throw new Error(unlockedIssue + '; EEPROM was left unlocked');
        logMessage('Full identity verified before lock.', 'log-green');
        await writeRomOrLocked(session, ROM_ADDR.INFO_LOCK, INFO_LOCK_BYTE);
        await sleepMs(rnodePostIdentityWriteDelayMs());
        var lockedRom = await readRnodeRomWithRetry(session, 3, logMessage);
        var lockedIssue = verifyProvisionedEeprom(lockedRom, product, model, hwRev, serialBytes, madeBytes, checksum, signature);
        if (lockedIssue) throw new Error(lockedIssue);
    }

    // ── Provisioning sequencer ───────────────────────
    async function runProvisioning(logMessage, setProgress, options) {
        if (!state.port) throw new Error('Serial port unavailable for provisioning');

        var ident = resolveBoardIdentity();
        if (ident == null) throw new Error('No board identified — pick an RNode firmware variant or set the exact board/band manually.');
        ident = normalizeRnodeProvisioningIdentity(ident);
        var product = ident.product;
        var model   = ident.model;
        var hwRev   = 1; // Default RNode hardware revision value.
        if (ident.selectedModel !== model) {
            logMessage('TCXO firmware selected; writing normalized EEPROM model ' + hexByte(model) + ' instead of selection alias ' + hexByte(ident.selectedModel) + '.', 'log-orange');
        }
        var rnd = new Uint8Array(4);
        crypto.getRandomValues(rnd);
        var serialBytes = rnd;
        var nowSec = Math.floor(Date.now() / 1000);
        var madeBytes = new Uint8Array(4);
        var dv = new DataView(madeBytes.buffer);
        dv.setUint32(0, nowSec, false); // big-endian, matches struct.pack(">I", made)

        // EEPROM info bytes for checksum: product || model || hw_rev || serial(4) || made(4)
        var info = new Uint8Array(11);
        info[0] = product; info[1] = model; info[2] = hwRev;
        info.set(serialBytes, 3);
        info.set(madeBytes, 7);
        var checksum = md5Bytes(info);
        var signature = buildUnsignedRnodeSignature();
        var settleMs = options && options.settleMs != null ? options.settleMs : RNODE_POST_FLASH_BOOT_WAIT_MS;
        var wroteFirmwareHash = false;
        var expectedFirmwareHash = null;
        var normalModeSet = false;
        var identityVerified = false;
        var lastIdentityIssue = null;

        for (var attempt = 0; attempt < 2 && !identityVerified; attempt++) {
            await withRnodeSession(logMessage, attempt === 0 ? settleMs : RNODE_REPAIR_SETTLE_MS, async function (session) {
                var rom = await readRnodeRomWithRetry(session, 5, logMessage);

                var existingIssue = validateRnodeIdentityForBoard(rom, product, model);
                if (!existingIssue) {
                    identityVerified = true;
                } else if (existingIssue === 'RNode identity was not locked' &&
                    !validateUnlockedRnodeIdentityPayloadForBoard(rom, product, model) &&
                    browserSignatureIsRepairable(rom)) {
                    if (setProgress) setProgress(96, 'Completing RNode identity...');
                    logMessage('Completing and verifying the unlocked browser identity before lock.', 'log-orange');
                    await writeRnodeIdentity(
                        session,
                        product,
                        model,
                        rom[ROM_ADDR.HW_REV],
                        rom.slice(ROM_ADDR.SERIAL, ROM_ADDR.SERIAL + 4),
                        rom.slice(ROM_ADDR.MADE, ROM_ADDR.MADE + 4),
                        rom.slice(ROM_ADDR.CHKSUM, ROM_ADDR.CHKSUM + 16),
                        signature,
                        logMessage
                    );
                } else if (existingIssue === 'RNode identity was not locked' &&
                    !validateUnlockedRnodeIdentityPayloadForBoard(rom, product, model)) {
                    throw new Error('Unlocked identity contains a non-browser signature; use rnodeconf to verify and lock it');
                } else if (identityLooksBlank(rom)) {
                    if (setProgress) setProgress(96, 'Writing RNode identity...');
                    logMessage(RNODE_UNSIGNED_PROVISIONING_NOTICE, 'log-orange');
                    await writeRnodeIdentity(session, product, model, hwRev, serialBytes, madeBytes, checksum, signature, logMessage);
                } else {
                    throw new Error(existingIssue + '; use Full Erase and flash again');
                }

                if (setProgress) setProgress(97, 'Finalizing RNode setup...');
                await sendRnodeNormalMode(session, logMessage, { quiet: true });
                normalModeSet = true;
                await resetRnodeAfterSetup(session, null);
            });

            await withRnodeSession(null, rnodePostResetSettleMs(), async function (session) {
                var verifiedRom = await readRnodeRomWithRetry(session, 3, null);
                lastIdentityIssue = validateRnodeIdentityForBoard(verifiedRom, product, model);
                identityVerified = !lastIdentityIssue;
            });

            if (!identityVerified && attempt === 0) {
                logMessage('RNode identity did not verify after reset; retrying once...', 'log-orange');
            }
        }

        if (!identityVerified) {
            throw new Error(lastIdentityIssue || 'RNode identity was not written');
        }

        logMessage('RNode identity verified.', 'log-green');

        await withRnodeSession(logMessage, RNODE_REPAIR_SETTLE_MS, async function (session) {
            if (setProgress) setProgress(98, 'Writing firmware hash...');
            expectedFirmwareHash = await writeLoadedFirmwareHash(session, logMessage);
            wroteFirmwareHash = !!expectedFirmwareHash;
            await resetRnodeAfterSetup(session, null);
        });

        if (setProgress) setProgress(99, 'Verifying firmware hash...');
        logMessage('Verifying firmware hash...', '');
        try {
            await ensureRnodeFirmwareHashMatches(logMessage, rnodePostResetSettleMs(), {
                quiet: true,
                expectedHash: expectedFirmwareHash
            });
            wroteFirmwareHash = true;
            logMessage('Firmware hash verified.', 'log-green');
        } catch (hashErr) {
            wroteFirmwareHash = false;
            logMessage('Firmware hash still needs attention: ' + (hashErr.message || hashErr), 'log-orange');
        }

        if (!wroteFirmwareHash) {
            logMessage('RNode identity is provisioned. Firmware hash still needs attention.', 'log-orange');
            return {
                firmwareHashWritten: false,
                normalModeSet: normalModeSet
            };
        }

        logMessage('RNode setup complete.', 'log-green');
        return {
            firmwareHashWritten: true,
            normalModeSet: normalModeSet
        };
    }

    // Resolve which RNode product/model byte pair to write. Honors a user
    // override (boardManual) and otherwise falls back to the auto-detected
    // hint from the selected firmware variant. Returns null if neither is
    // available — caller should surface a clear error.
    function resolveBoardIdentity() {
        if (state.boardManual && provProductSel && provProductSel.value !== '' && provModelSel && provModelSel.value !== '') {
            return {
                product: parseInt(provProductSel.value, 10),
                model:   parseInt(provModelSel.value, 10)
            };
        }
        var hint = state.rnodeAssetName ? resolveRnodeVariantIdentity(state.rnodeAssetName) : null;
        if (hint) return { product: hint.product, model: hint.model };
        return null;
    }

    // A root keeps a tool's status and log in its own panel; without one, the shared flash progress is used.
    function openProgressLog(initialStatus, root) {
        var scope = root || document.getElementById('flashProgress');
        var log = scope.querySelector('.progress-log');
        log.innerHTML = '';
        var statusEl = scope.querySelector('.progress-status');
        var pctEl = scope.querySelector('.progress-pct');
        var barEl = scope.querySelector('.progress-bar-fill');
        if (!root) {
            var resultEl = document.getElementById('flashResult');
            if (resultEl) {
                resultEl.classList.remove('active', 'flash-result--continue', 'flash-result--complete');
            }
            resetResultAction();
            scope.classList.add('active');
        }
        statusEl.textContent = initialStatus;
        if (pctEl) pctEl.textContent = '0%';
        if (barEl) barEl.style.width = '0%';
        return {
            log: function (text, cssClass) {
                var entry = document.createElement('span');
                if (cssClass) entry.className = cssClass;
                entry.textContent = '> ' + text;
                log.appendChild(entry);
                log.scrollTop = log.scrollHeight;
            },
            setStatus: function (s) { statusEl.textContent = s; },
            setProgress: function (pct, statusText) {
                if (pctEl) pctEl.textContent = Math.round(pct) + '%';
                if (barEl) barEl.style.width = pct + '%';
                if (statusText) statusEl.textContent = statusText;
            }
        };
    }

    async function runReprovisionOnly() {
        if (!('serial' in navigator)) {
            alert('RNode setup requires Web Serial (desktop Chrome / Edge).');
            return;
        }
        if (resolveBoardIdentity() == null) {
            alert('No board identified yet — pick an RNode firmware variant or click Change to set the exact board/band manually.');
            return;
        }
        var ui = openProgressLog('Finish RNode setup...');
        ui.log(rnodePortSelectionGuidance(), 'log-orange');
        try {
            await requestFreshRnodePortFromUser();
        } catch (e) {
            ui.setStatus('Setup cancelled.');
            showRnodeSetupWarning('Setup cancelled; reset the board and finish setup when it is ready.', 'reconnect');
            return;
        }
        ui.setStatus('Verifying RNode...');
        try {
            if (!state.firmwareAppBytes) {
                ui.log('No firmware bytes loaded; firmware hash will be left unchanged.', 'log-orange');
            }
            var result = await runProvisioning(ui.log, ui.setProgress, { settleMs: rnodeActivationSettleMs() });
            if (!result || !result.firmwareHashWritten) {
                throw new Error('RNode firmware hash was not written and verified');
            }
            state.rnodeHostControlledMode = !!(result && result.normalModeSet);
            ui.setProgress(100, 'RNode setup complete');
            showRnodeSetupComplete();
        } catch (err) {
            var message = err.message || String(err);
            ui.log('Error: ' + message, 'log-red');
            if (isRnodeReconnectSetupIssue(message)) {
                state.rnodeSetupIssue = message;
                state.rnodeSetupIssueKind = 'reconnect';
                ui.log('Selected port did not answer as RNode. ' + rnodeActivationRetryGuidance(), 'log-orange');
                ui.setStatus('Reset board, then try again.');
                showRnodeSetupWarning(message, 'reconnect');
            } else {
                ui.setStatus('RNode setup failed.');
            }
        }
    }

    async function runSetHashOnly() {
        if (!('serial' in navigator)) {
            alert('This requires Web Serial (desktop Chrome / Edge).');
            return;
        }
        if (!state.firmwareAppBytes || !state.firmwareAppBytes.length) {
            alert('Load the firmware first (Step 02) so we can hash it, then re-run this.');
            return;
        }
        try { await requestFreshRnodePortFromUser(); } catch (e) { return; }
        var ui = openProgressLog('Writing firmware hash…');
        try {
            var expectedFirmwareHash = null;
            await withRnodeSession(ui.log, RNODE_REPAIR_SETTLE_MS, async function (session) {
                var wrote = await writeLoadedFirmwareHash(session, ui.log);
                if (!wrote) throw new Error('No valid firmware hash was written');
                expectedFirmwareHash = wrote;
                await resetRnodeAfterSetup(session, null);
            });
            ui.log('Verifying firmware hash...', '');
            await ensureRnodeFirmwareHashMatches(ui.log, rnodePostResetSettleMs(), {
                quiet: true,
                expectedHash: expectedFirmwareHash
            });
            ui.log('Firmware hash verified.', 'log-green');
            ui.setStatus('Firmware hash verified.');
        } catch (err) {
            ui.log('Error: ' + (err.message || err), 'log-red');
            ui.setStatus('Set hash failed.');
        }
    }

    async function runAdoptRunningHashOnly() {
        if (!('serial' in navigator)) {
            alert('This requires Web Serial (desktop Chrome / Edge).');
            return;
        }
        try { await requestFreshRnodePortFromUser(); } catch (e) { return; }
        var ui = openProgressLog('Adopting running firmware hash…');
        try {
            var adoptionSent = false;
            await withRnodeSession(ui.log, RNODE_REPAIR_SETTLE_MS, async function (session) {
                var status = await logRnodeHashStatus(session, ui.log);
                if (isUninitializedRnodeHash(status.actual)) throw new Error('RNode running firmware hash is not available yet');
                if (!hashesEqual(status.target, status.actual) || isUninitializedRnodeHash(status.target)) {
                    ui.log('Writing actual hash as target...', '');
                    await sendRnodeFirmwareHash(session, status.actual);
                    adoptionSent = true;
                }
            });
            if (adoptionSent) {
                ui.log('Waiting for the RNode reboot, then verifying persistence...', 'log-orange');
                await ensureRnodeFirmwareHashMatches(ui.log, rnodePostResetSettleMs(), { quiet: true });
                ui.log('Running firmware hash stored and matched after reboot.', 'log-green');
            } else {
                ui.log('Target hash already matches running firmware.', 'log-green');
            }
            ui.setStatus('Stored hash matches the running firmware.');
        } catch (err) {
            ui.log('Error: ' + (err.message || err), 'log-red');
            ui.setStatus('Adopt hash failed.');
        }
    }

    async function runInspectHashesOnly() {
        if (!('serial' in navigator)) {
            alert('This requires Web Serial (desktop Chrome / Edge).');
            return;
        }
        try { await requestFreshRnodePortFromUser(); } catch (e) { return; }
        var ui = openProgressLog('Reading RNode status…');
        try {
            await withRnodeSession(ui.log, RNODE_REPAIR_SETTLE_MS, async function (session) {
                await logRnodeHashStatus(session, ui.log);
                await logRnodeConfigStatus(session, ui.log);
            });
            ui.setStatus('RNode status read.');
        } catch (err) {
            ui.log('Error: ' + (err.message || err), 'log-red');
            ui.setStatus('Read status failed.');
        }
    }

    async function runSetNormalModeOnly() {
        if (!('serial' in navigator)) {
            alert('This requires Web Serial (desktop Chrome / Edge).');
            return;
        }
        var message = 'Keep this RNode idle until Ratspeak configures it?\n\n' +
            'This clears saved startup radio settings so the radio stays idle until Ratspeak or another Reticulum host configures it.';
        if (!window.confirm(message)) return;

        try { await requestFreshRnodePortFromUser(); } catch (e) { return; }
        var ui = openProgressLog('Keeping radio idle...');
        try {
            await withRnodeSession(ui.log, RNODE_REPAIR_SETTLE_MS, async function (session) {
                try {
                    await sendRnodeNormalMode(session, ui.log);
                } finally {
                    await resetRnodeAfterSetup(session, ui.log);
                }
            });
            ui.setStatus('Startup radio settings cleared.');
        } catch (err) {
            ui.log('Error: ' + (err.message || err), 'log-red');
            ui.setStatus('Could not clear startup radio settings.');
        }
    }

    // ── rsNode device management: provision-rsnode.py over Web Serial ──
    var rsnodeOwnerBusy = false;
    var rsnodeOwnerReading = false;
    var rsnodeOwnerSaved = false;
    // Rows are { hash, kind, role, node, added, removed }; node is the entry as the node reported it. Rows added
    // here stay through the next read, so another node can get the same managers.
    var rsnodeManagers = [];
    var rsnodeManagersFrom = null;
    var rsnodeManagerEditing = null;
    var RSNODE_MANAGERS_MAX = 4;
    var RSNODE_KINDS = { 1: 'lxmf', 2: 'identity', 3: 'lxmf' };
    var RSNODE_ROLES = { 1: 'owner', 2: 'admin' };
    var RSNODE_KIND_NAMES = { lxmf: 'LXMF address', identity: 'Identity hash' };
    var RSNODE_ROLE_NAMES = { owner: 'Owner', admin: 'Admin' };
    // rsnode-provision.js words errors as the CLI does; the page says owner, admin and manager, as its list does.
    var RSNODE_CLI_WORDS = [[/^device /, 'the node '], [/\bthe device\b/g, 'the node'], [/the primary owner/g, 'the owner'],
        [/a helper/g, 'an admin'], [/REMOVE_OWNER/g, 'a removal'], [/the owner table is full/g, 'the manager list is full'],
        [/no such owner/g, 'no such manager'], [/predates owners/g, 'predates managers']];

    // Private beta: the rsNode USB tools need an unlocked session, for uploaded packages too.
    function rsnodeToolsUnlocked() {
        return state.device === 'custom' && betaStage === 'ready' && (isRsnodeSelected() || state.rsnodeInstalled);
    }

    function updateRsnodeOwnerVisibility() {
        var panel = document.getElementById('rsnodeOwner');
        if (panel) panel.hidden = !rsnodeToolsUnlocked();
    }

    // Both rsNode tools use the page's selected port; the picker opens only when there is none.
    async function rsnodeToolPortFromUser() {
        if (!state.port) return requestFreshRnodePortFromUser();
        await releaseRsnodeDevice();
        return state.port;
    }

    // A reused port can come back under a new handle; only a port of the same USB device stands in for it.
    async function rsnodeOtherPorts() {
        var info = portUsbInfo(state.port);
        return (await authorizedSerialPorts()).filter(function(port) {
            return port !== state.port && !sameUsbInfo(portUsbInfo(port), info);
        });
    }

    function syncRsnodePort() {
        var idle = !rsnodeOwnerBusy && !rsnodeSettingsBusy && !rsnodeRepeaterBusy && !rsnodeChecking && !rsnodeDevice && !state.flashing;
        document.querySelectorAll('.rsnode-tools__port').forEach(function(line) {
            line.hidden = !state.port;
            line.querySelector('.rsnode-tools__port-label').textContent = state.port ? usbDeviceLabel(state.port) : '';
            line.querySelector('[data-change-port]').disabled = !idle;
        });
    }

    function rsnodeActive(rows) {
        return rows.filter(function(row) { return !row.removed; });
    }

    function rsnodeCount(count, noun) {
        return count + ' ' + noun + (count === 1 ? '' : 's');
    }

    // The list as provision-rsnode.py flags: removals, then the owner, then admins. Rows that match the node are
    // left alone; fromNode marks a plan that only fits the node the list was read from.
    function rsnodeManagersPlan(rows) {
        var plan = { removeOwner: [], owner: null, ownerIdentity: null, helper: [], helperIdentity: [],
            setOwner: false, added: 0, changed: 0, removed: 0, fromNode: false };
        rows.forEach(function(row) {
            var node = row.node, kept = !!node && !row.removed && row.hash === node.hash;
            if (kept && row.kind === node.kind && row.role === node.role) return;
            if (node) plan.fromNode = true;
            if (node && !kept) {
                plan.removeOwner.push(node.hash);
                plan.removed++;
            }
            if (row.removed) return;
            if (row.role === 'owner') {
                plan[row.kind === 'identity' ? 'ownerIdentity' : 'owner'] = row.hash;
                plan.setOwner = true;
            } else {
                plan[row.kind === 'identity' ? 'helperIdentity' : 'helper'].push(row.hash);
                if (kept) plan.changed++;
                else plan.added++;
            }
        });
        return plan;
    }

    // What a save would change, worded for the summary beside Save.
    function rsnodeOwnerChanges(plan) {
        var changes = [];
        if (plan.setOwner) changes.push('set the owner');
        if (plan.added) changes.push('add ' + rsnodeCount(plan.added, 'admin'));
        if (plan.changed) changes.push('change ' + rsnodeCount(plan.changed, 'admin'));
        if (plan.removed) changes.push('remove ' + rsnodeCount(plan.removed, 'manager'));
        return changes;
    }

    function rsnodeOwnerSummary(changes) {
        if (state.flashing) return 'Available when flashing finishes.';
        if (!changes.length) return 'Nothing to save yet. Add a manager.';
        var last = changes[changes.length - 1];
        return 'Saving will ' + (changes.length > 1 ? changes.slice(0, -1).join(', ') + ' and ' + last : last) + '.';
    }

    // rows with entry in place of editing, or added when editing is null. As on the node, a new owner replaces
    // the old one; Undo keeps the old one as an admin.
    function rsnodeManagersWith(rows, entry, editing) {
        var next = rows.map(function(row) {
            if (row === editing) return Object.assign({}, row, entry);
            if (entry.role === 'owner' && !row.removed && row.role === 'owner') return Object.assign({}, row, { removed: true });
            return row;
        });
        if (!editing) next.push(Object.assign({ node: null, added: true, removed: false }, entry));
        return next;
    }

    // After a read or save: the node's managers, then rows added here that it lacks.
    function rsnodeManagersFromNode(node, rows) {
        var next = (node ? node.owners : []).map(function(owner) {
            var entry = { hash: owner.hash, kind: RSNODE_KINDS[owner.kind], role: RSNODE_ROLES[owner.role] };
            return Object.assign({ node: entry, added: false, removed: false }, entry);
        });
        rows.forEach(function(row) {
            if (!row.added || row.removed) return;
            var entry = { hash: row.hash, kind: row.kind, role: row.role };
            var known = next.find(function(other) { return other.hash === row.hash; });
            if (known) Object.assign(known, entry, { added: true });
            else next.push(Object.assign({ node: null, added: true, removed: false }, entry));
        });
        // An owner added here replaces the node's own, as saving would.
        var owner = next.find(function(row) { return row.added && row.role === 'owner'; });
        if (owner) next.forEach(function(row) { if (row !== owner && row.role === 'owner') row.removed = true; });
        return next;
    }

    // The editor's entry, if it has one; Save puts it in the list first.
    function rsnodeManagerDraft() {
        var text = document.getElementById('rsnodeOwnerHash').value.trim();
        if (!rsnodeManagerEditing || !text) return null;
        var hash = text;
        try { hash = bytesToHex(parseHash(text)); } catch (error) { /* checked when it is added */ }
        return { hash: hash, kind: document.getElementById('rsnodeOwnerKind').value, role: document.getElementById('rsnodeOwnerRole').value };
    }

    function rsnodeManagersPreview() {
        var draft = rsnodeManagerDraft();
        return draft ? rsnodeManagersWith(rsnodeManagers, draft, rsnodeManagerEditing === 'new' ? null : rsnodeManagerEditing) : rsnodeManagers;
    }

    function rsnodeFieldError(field, message) {
        field.setAttribute('aria-invalid', 'true');
        var error = new Error(message);
        error.field = field;
        return error;
    }

    // Puts the editor's entry in the list and returns its place there.
    function applyRsnodeManagerEdit() {
        var input = document.getElementById('rsnodeOwnerHash');
        var editing = rsnodeManagerEditing === 'new' ? null : rsnodeManagerEditing;
        var hash;
        try { hash = bytesToHex(parseHash(input.value)); } catch (error) { throw rsnodeFieldError(input, error.message); }
        if (rsnodeManagers.some(function(row) { return row !== editing && row.hash === hash; })) {
            throw rsnodeFieldError(input, 'This manager is already in the list.');
        }
        if (!editing && rsnodeActive(rsnodeManagers).length >= RSNODE_MANAGERS_MAX) {
            throw rsnodeFieldError(input, 'A node holds up to 4 managers.');
        }
        var index = editing ? rsnodeManagers.indexOf(editing) : rsnodeManagers.length;
        rsnodeManagers = rsnodeManagersWith(rsnodeManagers, { hash: hash, kind: document.getElementById('rsnodeOwnerKind').value,
            role: document.getElementById('rsnodeOwnerRole').value }, editing);
        rsnodeManagerEditing = null;
        rsnodeOwnerSaved = false;
        return index;
    }

    function prepareRsnodeManagerEditor(row) {
        rsnodeManagerEditing = row || 'new';
        var hash = document.getElementById('rsnodeOwnerHash');
        hash.value = row ? row.hash : '';
        hash.removeAttribute('aria-invalid');
        document.getElementById('rsnodeOwnerKind').value = row ? row.kind : 'lxmf';
        document.getElementById('rsnodeOwnerRole').value = row ? row.role
            : rsnodeActive(rsnodeManagers).some(function(other) { return other.role === 'owner'; }) ? 'admin' : 'owner';
        document.getElementById('rsnodeManagerDone').textContent = row ? 'Done' : 'Add';
        document.getElementById('rsnodeManagerNote').hidden = true;
    }

    function rsnodeManagerState(row) {
        if (row.removed) return 'Removed';
        if (!row.node || row.hash !== row.node.hash) return 'New';
        return row.kind !== row.node.kind || row.role !== row.node.role ? 'Changed' : '';
    }

    function rsnodeManagerButton(text, action, label) {
        var button = Object.assign(document.createElement('button'), { type: 'button', className: 'rsnode-beta__lock', textContent: text });
        button.dataset.manager = action;
        button.setAttribute('aria-label', label);
        return button;
    }

    function rsnodeManagerItem(row) {
        var item = document.createElement('li');
        item.className = 'rsnode-managers__row' + (row.removed ? ' is-removed' : '') + (row === rsnodeManagerEditing ? ' is-editing' : '');
        var role = Object.assign(document.createElement('span'), { className: 'rsnode-managers__role' + (row.role === 'owner' ? ' is-owner' : ''),
            textContent: RSNODE_ROLE_NAMES[row.role] });
        var who = Object.assign(document.createElement('span'), { className: 'rsnode-managers__who' });
        who.append(Object.assign(document.createElement('code'), { textContent: row.hash }), Object.assign(document.createElement('span'), {
            className: 'rsnode-managers__meta', textContent: [RSNODE_KIND_NAMES[row.kind], rsnodeManagerState(row)].filter(Boolean).join(' · ') }));
        var actions = Object.assign(document.createElement('span'), { className: 'rsnode-managers__actions' });
        var name = RSNODE_ROLE_NAMES[row.role].toLowerCase() + ' ' + row.hash.slice(0, 8);
        if (row.removed) actions.append(rsnodeManagerButton('Undo', 'undo', 'Undo removing ' + name));
        else actions.append(rsnodeManagerButton('Edit', 'edit', 'Edit ' + name), rsnodeManagerButton('Remove', 'remove', 'Remove ' + name));
        item.append(role, who, actions);
        return item;
    }

    function renderRsnodeManagers() {
        var addable = !rsnodeManagersFrom || rsnodeManagersFrom.supported;
        if (!addable && rsnodeManagerEditing === 'new') rsnodeManagerEditing = null;
        // With nobody listed the editor stays open: adding someone is the one thing to do.
        if (!rsnodeManagers.length && addable && !rsnodeManagerEditing) prepareRsnodeManagerEditor(null);
        var list = document.getElementById('rsnodeManagers');
        list.replaceChildren.apply(list, rsnodeManagers.map(rsnodeManagerItem));
        var empty = document.getElementById('rsnodeManagersEmpty');
        empty.hidden = addable && rsnodeManagers.length > 0;
        empty.textContent = !rsnodeManagersFrom
            ? 'Add yourself as the Owner with your Ratspeak LXMF address, or read the node to see its managers.'
            : addable ? 'No managers yet. Add yourself as the Owner with your Ratspeak LXMF address.'
            : 'This firmware does not support managers.';
        var full = rsnodeActive(rsnodeManagers).length >= RSNODE_MANAGERS_MAX;
        document.getElementById('rsnodeManagerEditor').hidden = !rsnodeManagerEditing;
        document.getElementById('rsnodeManagerCancel').hidden = !rsnodeManagers.length;
        document.getElementById('rsnodeManagerAdd').disabled = full;
        document.getElementById('rsnodeManagerAdd').parentElement.hidden = !!rsnodeManagerEditing || !addable;
        document.getElementById('rsnodeManagersFull').hidden = !full;
    }

    // Focus stays at the same place in the list after a change.
    function focusRsnodeManager(index) {
        var items = document.getElementById('rsnodeManagers').children;
        var item = items[Math.min(index, items.length - 1)];
        var target = item ? item.querySelector('button') : document.getElementById(rsnodeManagerEditing ? 'rsnodeOwnerHash' : 'rsnodeManagerAdd');
        if (target) target.focus();
    }

    function refreshRsnodeManagers(index) {
        renderRsnodeManagers();
        syncRsnodeOwnerForm();
        if (index != null) focusRsnodeManager(index);
    }

    function finishRsnodeManagerEdit() {
        var note = document.getElementById('rsnodeManagerNote');
        try {
            var index = applyRsnodeManagerEdit();
        } catch (error) {
            note.textContent = error.message;
            note.hidden = false;
            document.getElementById('rsnodeOwnerHash').focus();
            return;
        }
        refreshRsnodeManagers(index);
    }

    function setRsnodeOwnerBusy(busy, read) {
        rsnodeOwnerBusy = busy;
        rsnodeOwnerReading = !!read;
        document.getElementById('rsnodeOwnerDot').classList.toggle('is-busy', busy);
        syncRsnodeOwnerForm();
        updateFlashBtn();
    }

    function syncRsnodeOwnerForm() {
        var idle = !rsnodeOwnerBusy && !rsnodeSettingsBusy && !rsnodeRepeaterBusy && !rsnodeChecking && !state.flashing;
        var rows = rsnodeManagersPreview();
        var crowded = rsnodeActive(rows).length > RSNODE_MANAGERS_MAX;
        var changes = rsnodeOwnerChanges(rsnodeManagersPlan(rows));
        document.getElementById('rsnodeOwnerFields').disabled = !idle;
        document.getElementById('rsnodeOwnerSave').disabled = !idle || !changes.length || crowded;
        document.getElementById('rsnodeOwnerSave').textContent = rsnodeOwnerBusy && !rsnodeOwnerReading ? 'Saving…' : 'Save to rsNode';
        document.getElementById('rsnodeOwnerRead').textContent = rsnodeOwnerBusy && rsnodeOwnerReading ? 'Reading…' : 'Read from node';
        if (!rsnodeOwnerBusy) document.getElementById('rsnodeOwnerSummary').textContent = crowded
            ? 'A node holds up to 4 managers. Remove one to save.'
            : rsnodeOwnerSaved && !changes.length ? '' : rsnodeOwnerSummary(changes);
        syncRsnodePort();
    }

    // The owner row's one status line; its dot shows working, done or failed, and a hint says what to do next.
    function rsnodeOwnerMessage(message, error, done, hint) {
        var status = document.getElementById('rsnodeOwnerStatus');
        status.textContent = message || '';
        if (hint) status.append(Object.assign(document.createElement('span'), { className: 'rsnode-tools__hint', textContent: hint }));
        status.classList.toggle('is-error', !!error);
        var dot = document.getElementById('rsnodeOwnerDot');
        dot.classList.toggle('is-error', !!error);
        dot.classList.toggle('is-ok', !!done);
    }

    // Both rsNode tools word a port that cannot be opened, or goes away, the same way.
    function rsnodePortError(error, stage, retry) {
        if (stage === 'open') return 'Could not open the serial port. Close other apps that use it, such as Ratspeak or a serial monitor, then ' + retry + '.';
        if (error.name === 'NetworkError') return 'The node disconnected from USB.';
        return null;
    }

    // The app holding an RNode over Bluetooth or Wi-Fi, from STATUS; a Repeater takes USB changes itself.
    function rsnodeHeldElsewhere(rsnode) {
        var node = rsnode && rsnode.node;
        return node && !node.repeater && node.hostOwner >= 2 ? HOST_OWNERS[node.hostOwner] : null;
    }

    function rsnodeHeldMessage(nodeId, owner) {
        return 'Another app is using RNode ' + nodeId + ' over ' + owner + '. Disconnect it, or hold USB on the node, then save again.';
    }

    // A failed save also gets a hint for what to do next. context: { nodeId, rsnode (STATUS or null), managers }.
    function rsnodeOwnerError(error, stage, read, context) {
        var port = rsnodePortError(error, stage, 'try again');
        if (port) return { text: port };
        if (/^no KISS response/.test(error.message)) {
            return { text: 'No answer over USB within 30 s. ' + RSNODE_TAKEOVER.replace(/\.$/, ', then try again.') };
        }
        if (error.held) return { text: error.message };
        var READ_BACK = 'Read from node to see what it has now.';
        // ERROR_INVALID_CONFIG to a manager write: STATUS, or its absence, says why.
        if (error.code === 0x07 && (error.subcommand === 0x08 || error.subcommand === 0x09) && context) {
            var name = 'RNode ' + context.nodeId, rsnode = context.rsnode, held = rsnodeHeldElsewhere(rsnode);
            if (held) return { text: rsnodeHeldMessage(context.nodeId, held) };
            if (rsnode && rsnode.node && rsnode.node.repeater) {
                return { text: name + ' is busy finishing an update or saving its identity. Try again in a minute.' };
            }
            if (error.subcommand === 0x08 && context.managers >= RSNODE_MANAGERS_MAX) {
                return { text: name + '\'s manager list is full.', hint: 'A node holds up to 4 managers. ' + READ_BACK };
            }
            if (!rsnode) {
                return { text: name + ' refused the change. This beta takes manager changes only in RNode: exit the Repeater on the device, then save again.',
                    hint: READ_BACK };
            }
            return { text: name + (error.subcommand === 0x08 ? ' refused the manager.' : ' has no such manager.'), hint: READ_BACK };
        }
        var text = RSNODE_CLI_WORDS.reduce(function(words, swap) { return words.replace(swap[0], swap[1]); }, error.message || String(error));
        text = text.charAt(0).toUpperCase() + text.slice(1);
        if (read || stage !== 'protocol') return { text: text };
        return { text: text, hint: READ_BACK };
    }

    // The list as provision-rsnode.py flags.
    async function rsnodeOwnerOptions() {
        if (rsnodeManagerDraft()) {
            applyRsnodeManagerEdit();
            renderRsnodeManagers();
        }
        var plan = rsnodeManagersPlan(rsnodeManagers);
        var options = { read: false,
            owner: plan.owner && parseHash(plan.owner), ownerIdentity: plan.ownerIdentity && parseHash(plan.ownerIdentity),
            helper: plan.helper.map(parseHash), helperIdentity: plan.helperIdentity.map(parseHash),
            removeOwner: plan.removeOwner.map(parseHash) };
        if (plan.fromNode) options.nodeId = rsnodeManagersFrom.nodeId;
        return options;
    }

    function saveBlob(blob, name) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
    }

    // Where a USB task left the node, when STATUS says.
    function rsnodePersonaNote(rsnode) {
        var node = rsnode && rsnode.node;
        if (!node) return '';
        if (node.repeater) return ' The node keeps running as a Repeater.';
        return node.hostOwner >= 2 ? '' : ' The node is back on its home menu.';
    }

    // What the node reported: its managers in the list, the rest laid out like the live view's facts.
    function showRsnodeOwnerResult(result, read) {
        var node = result.node, status = result.status;
        if (rsnodeManagerEditing !== 'new' || !rsnodeManagerDraft()) rsnodeManagerEditing = null;
        rsnodeManagers = rsnodeManagersFromNode(node, rsnodeManagers);
        rsnodeManagersFrom = { nodeId: status.nodeId, supported: node !== null };
        renderRsnodeManagers();
        document.getElementById('rsnodeResultNode').textContent = 'RNode ' + status.nodeId;
        // The node's Ratspeak address when it reports one; older firmware shows its management destination.
        var address = result.identity ? result.identity.lxmf : node && node.destination;
        document.getElementById('rsnodeResultIdentity').hidden = !address;
        if (address) document.getElementById('rsnodeResultDestination').textContent = address;
        document.getElementById('rsnodeResultAddressLabel').textContent = result.identity ? 'Address' : 'Destination';
        document.getElementById('rsnodeResultAddressHelp').textContent = result.identity
            ? 'Add the node in Ratspeak by this address, and share it with your managers.' : 'Clients pin this destination.';
        document.getElementById('rsnodeResultNote').textContent = node && !node.destination
            ? 'No node identity yet. Adding the first manager creates it.'
            : node && node.nearbyOnly ? 'Updates only from nearby managers.' : '';
        var repeater = !!(result.rsnode && result.rsnode.node && result.rsnode.node.repeater);
        document.getElementById('rsnodeResultEffect').textContent = repeater
            ? 'The running Repeater uses the new managers now.' : 'Managers act only while the node runs as a Repeater.';
        document.getElementById('rsnodeResultEffect').hidden = read;
        document.getElementById('rsnodeOwnerResult').hidden = false;
    }

    // Inputs are checked before a port is requested, as the script checks its flags.
    async function runRsnodeOwnerTask(read) {
        if (rsnodeOwnerBusy || rsnodeSettingsBusy || rsnodeRepeaterBusy || rsnodeChecking || state.flashing) return;
        if (!('serial' in navigator)) {
            showSerialWarning();
            return;
        }
        setRsnodeOwnerBusy(true, read);
        rsnodeOwnerMessage('');
        var ui = null, session = null, field = null, stage = 'input', context = null;
        try {
            var options = read ? { read: true } : await rsnodeOwnerOptions();
            stage = 'port';
            await rsnodeToolPortFromUser();
            document.getElementById('rsnodeOwnerResult').hidden = true;
            ui = openProgressLog(read ? 'Reading rsNode…' : 'Saving to rsNode…', document.getElementById('rsnodeOwnerActivity'));
            stage = 'open';
            session = createRnodeSession(await openRnodeSerialPort(ui.log, RNODE_REPAIR_SETTLE_MS, await rsnodeOtherPorts()));
            stage = 'protocol';
            ui.setStatus('Waiting for rsNode…');
            var named = false, identity = null;
            var result = await provisionRsnode(session, options, {
                // STATUS before any change: an RNode another app holds refuses it.
                identified: async function(status) {
                    context = { nodeId: status.nodeId, rsnode: await readRsnodeStatus(session),
                        managers: rsnodeActive(rsnodeManagers).length };
                    var held = rsnodeHeldElsewhere(context.rsnode);
                    if (held && !read) throw Object.assign(new Error(rsnodeHeldMessage(status.nodeId, held)), { held: true });
                },
                // The USB log keeps the script's lines; the status line follows them.
                log: function(line) {
                    ui.log(line);
                    if (/^waiting for USB KISS/.test(line)) ui.setStatus('Waiting for rsNode. ' + RSNODE_TAKEOVER);
                    else if (!named && /^node id: /.test(line)) {
                        named = true;
                        ui.setStatus((read ? 'Reading ' : 'Saving to ') + line.slice(9) + '…');
                    }
                },
                // The address managers add in Ratspeak; firmware before IDENTITY has none to give.
                finished: async function(node) {
                    if (node && node.destination) identity = await readRsnodeIdentity(session).catch(function() { return null; });
                }
            });
            result.rsnode = context && context.rsnode;
            result.identity = identity && identity.present ? identity : null;
            showRsnodeOwnerResult(result, read);
            if (!read) rsnodeOwnerSaved = true;
            rsnodeOwnerMessage((read ? 'Showing RNode ' : 'Saved to RNode ') + result.status.nodeId + '.' +
                rsnodePersonaNote(result.rsnode), false, true);
        } catch (error) {
            field = error.field || null;
            if (ui) ui.log('Error: ' + error.message, 'log-red');
            if (stage === 'port' && error.name === 'NotFoundError') rsnodeOwnerMessage('Select the rsNode serial port to continue.');
            else {
                var failure = field ? { text: error.message } : rsnodeOwnerError(error, stage, read, context);
                rsnodeOwnerMessage(failure.text, true, false, failure.hint);
            }
        } finally {
            await closeRnodeSession(session);
            setRsnodeOwnerBusy(false);
        }
        if (field) field.focus();
    }

    if (ADVANCED) document.getElementById('rsnodeOwnerForm').addEventListener('submit', function(event) {
        event.preventDefault();
        runRsnodeOwnerTask(false);
    });
    if (ADVANCED) document.getElementById('rsnodeOwnerRead').addEventListener('click', function() { runRsnodeOwnerTask(true); });
    if (ADVANCED) ['input', 'change'].forEach(function(type) {
        document.getElementById('rsnodeOwnerForm').addEventListener(type, function(event) {
            event.target.removeAttribute('aria-invalid');
            if (event.target.id === 'rsnodeOwnerHash') document.getElementById('rsnodeManagerNote').hidden = true;
            rsnodeOwnerSaved = false;
            syncRsnodeOwnerForm();
        });
    });
    if (ADVANCED) document.getElementById('rsnodeManagers').addEventListener('click', function(event) {
        var button = event.target.closest('button[data-manager]');
        if (!button) return;
        var index = Array.prototype.indexOf.call(this.children, button.closest('li'));
        var row = rsnodeManagers[index];
        if (button.dataset.manager === 'edit') {
            prepareRsnodeManagerEditor(row);
            refreshRsnodeManagers();
            document.getElementById('rsnodeOwnerHash').focus();
            return;
        }
        if (row === rsnodeManagerEditing) rsnodeManagerEditing = null;
        if (button.dataset.manager === 'undo') {
            row.removed = false;
            if (row.role === 'owner' && rsnodeActive(rsnodeManagers).some(function(other) { return other !== row && other.role === 'owner'; })) row.role = 'admin';
        } else if (row.node) row.removed = true;
        else rsnodeManagers.splice(index, 1);
        rsnodeOwnerSaved = false;
        refreshRsnodeManagers(index);
    });
    if (ADVANCED) document.getElementById('rsnodeManagerAdd').addEventListener('click', function() {
        prepareRsnodeManagerEditor(null);
        refreshRsnodeManagers();
        document.getElementById('rsnodeOwnerHash').focus();
    });
    if (ADVANCED) document.getElementById('rsnodeManagerDone').addEventListener('click', finishRsnodeManagerEdit);
    if (ADVANCED) document.getElementById('rsnodeManagerCancel').addEventListener('click', function() {
        var index = rsnodeManagers.indexOf(rsnodeManagerEditing);
        rsnodeManagerEditing = null;
        refreshRsnodeManagers(index >= 0 ? index : null);
        if (index < 0) document.getElementById('rsnodeManagerAdd').focus();
    });
    if (ADVANCED) document.getElementById('rsnodeManagerEditor').addEventListener('keydown', function(event) {
        if (event.key === 'Enter' && event.target.id === 'rsnodeOwnerHash') {
            event.preventDefault();
            finishRsnodeManagerEdit();
        } else if (event.key === 'Escape' && rsnodeManagers.length) {
            event.preventDefault();
            document.getElementById('rsnodeManagerCancel').click();
        }
    });
    document.querySelectorAll('[data-change-port]').forEach(function(button) {
        button.addEventListener('click', function() {
            if (rsnodeOwnerBusy || rsnodeSettingsBusy || rsnodeRepeaterBusy || rsnodeDevice || state.flashing) return;
            requestFreshRnodePortFromUser().catch(function() { /* a cancelled picker keeps the selected port */ });
        });
    });
    if (ADVANCED) document.getElementById('rsnodeCopyDestination').addEventListener('click', async function() {
        var button = this, destination = document.getElementById('rsnodeResultDestination');
        var note = document.getElementById('rsnodeCopyNote');
        try {
            await navigator.clipboard.writeText(destination.textContent);
            button.textContent = 'Copied';
            setTimeout(function() { button.textContent = 'Copy'; }, 2000);
        } catch (error) {
            // Without clipboard access the destination is selected for the reader to copy.
            window.getSelection().selectAllChildren(destination);
            note.hidden = false;
            setTimeout(function() { note.hidden = true; }, 6000);
        }
    });
    if (ADVANCED) renderRsnodeManagers();

    // ── rsNode settings: Wi-Fi, peers and uplink over USB (CMD_RSNODE SETTINGS_GET / SETTINGS_SET) ──
    var rsnodeSettingsBusy = false;
    var rsnodeSettingsSaving = false;
    // { nodeId, repeater, settings }: what the node last reported; the form edits a copy.
    var rsnodeSettingsNode = null;
    // The password editor is open; auto when a switch between joining and hosting opened it.
    var rsnodeSettingsPassword = false;
    var rsnodeSettingsPasswordAuto = false;
    var RSNODE_WIFI_MODE_NAMES = ['off', 'join', 'own'];
    var RSNODE_SETTINGS_RESTART_MS = 1000;
    var RSNODE_WIFI_WAIT_MS = 30000;
    var RSNODE_WIFI_POLL_MS = 2000;
    var RSNODE_SETTINGS_FIELDS = { wifiMode: 'rsnodeWifiModeOff', name: 'rsnodeWifiName', password: 'rsnodeWifiPassword',
        channel: 'rsnodeWifiChannel', address: 'rsnodeWifiAddress', netmask: 'rsnodeWifiNetmask', gateway: 'rsnodeWifiGateway',
        dns: 'rsnodeWifiDns', peersEnabled: 'rsnodePeersEnabled', peersPort: 'rsnodePeersPort', uplinkEnabled: 'rsnodeUplinkEnabled',
        uplinkHost: 'rsnodeUplinkHost', uplinkPort: 'rsnodeUplinkPort' };

    function updateRsnodeSettingsVisibility() {
        var panel = document.getElementById('rsnodeSettings');
        if (panel) panel.hidden = !rsnodeToolsUnlocked();
    }

    function rsnodeSettingsField(key) {
        if (key === 'wifiMode') return document.querySelector('input[name="rsnodeWifiMode"]:checked') || document.querySelector('input[name="rsnodeWifiMode"]');
        return document.getElementById(RSNODE_SETTINGS_FIELDS[key]);
    }

    // The form as checkSettingsForm and settingsChanges read it.
    function readRsnodeSettingsForm() {
        var value = function(id) { return document.getElementById(id).value; };
        var checked = function(id) { return document.getElementById(id).checked; };
        var mode = document.querySelector('input[name="rsnodeWifiMode"]:checked');
        return {
            wifiMode: mode ? mode.value : 'off', name: value('rsnodeWifiName'),
            password: rsnodeSettingsPassword ? value('rsnodeWifiPassword') : null, channel: Number(value('rsnodeWifiChannel')),
            fixed: checked('rsnodeWifiFixed'), address: value('rsnodeWifiAddress'), netmask: value('rsnodeWifiNetmask'),
            gateway: value('rsnodeWifiGateway'), dns: value('rsnodeWifiDns'),
            peersEnabled: checked('rsnodePeersEnabled'), peersPort: value('rsnodePeersPort'),
            uplinkEnabled: checked('rsnodeUplinkEnabled'), uplinkHost: value('rsnodeUplinkHost'), uplinkPort: value('rsnodeUplinkPort')
        };
    }

    // Fills the form with what the node reported; a typed password is dropped.
    function renderRsnodeSettings() {
        var node = rsnodeSettingsNode;
        document.getElementById('rsnodeSettingsForm').hidden = !node;
        document.getElementById('rsnodeSettingsSave').hidden = !node;
        document.getElementById('rsnodeSettingsTips').hidden = !!node;
        document.getElementById('rsnodeSettingsRead').textContent = node ? 'Read again' : 'Read settings';
        document.getElementById('rsnodeSettingsRead').classList.toggle('rsnode-beta__button--primary', !node);
        if (!node) return;
        var form = settingsForm(node.settings);
        document.getElementById('rsnodeSettingsPersona').textContent = 'RNode ' + node.nodeId + (node.repeater
            ? ' runs as a Repeater. Wi-Fi carries its uplink and the peers it accepts.'
            : ' runs as an RNode. Wi-Fi carries the app link: apps connect over TCP port ' + RSNODE_APP_PORT + '.');
        document.querySelectorAll('input[name="rsnodeWifiMode"]').forEach(function(input) { input.checked = input.value === form.wifiMode; });
        var channel = document.getElementById('rsnodeWifiChannel');
        if (!channel.options.length) for (var c = 1; c <= 13; c++) channel.add(new Option(String(c), String(c)));
        channel.value = String(form.channel);
        document.getElementById('rsnodeWifiName').value = form.name;
        document.getElementById('rsnodeWifiPassword').value = '';
        rsnodeSettingsPassword = rsnodeSettingsPasswordAuto = false;
        document.getElementById('rsnodeWifiFixed').checked = form.fixed;
        ['address', 'netmask', 'gateway', 'dns'].forEach(function(key) { document.getElementById(RSNODE_SETTINGS_FIELDS[key]).value = form[key]; });
        document.getElementById('rsnodePeersEnabled').checked = form.peersEnabled;
        document.getElementById('rsnodePeersPort').value = form.peersPort;
        document.getElementById('rsnodeUplinkEnabled').checked = form.uplinkEnabled;
        document.getElementById('rsnodeUplinkHost').value = form.uplinkHost;
        document.getElementById('rsnodeUplinkPort').value = form.uplinkPort;
        var radio = settingsRadioLines(node.settings);
        document.getElementById('rsnodeSettingsRegion').textContent = radio.region;
        document.getElementById('rsnodeSettingsRadio').textContent = radio.radio;
        document.getElementById('rsnodeSettingsIfac').textContent = radio.ifac;
        document.querySelectorAll('#rsnodeSettingsForm [aria-invalid]').forEach(function(field) { field.removeAttribute('aria-invalid'); });
        syncRsnodeSettingsForm();
    }

    // Shows the fields the chosen Wi-Fi mode uses and says what Save would do.
    function syncRsnodeSettingsForm() {
        var node = rsnodeSettingsNode;
        var idle = !rsnodeSettingsBusy && !rsnodeRepeaterBusy && !rsnodeOwnerBusy && !rsnodeChecking && !state.flashing;
        document.getElementById('rsnodeSettingsRead').disabled = !idle;
        document.getElementById('rsnodeSettingsRead').textContent = rsnodeSettingsBusy && !rsnodeSettingsSaving ? 'Reading…'
            : node ? 'Read again' : 'Read settings';
        document.getElementById('rsnodeSettingsSave').textContent = rsnodeSettingsBusy && rsnodeSettingsSaving ? 'Saving…' : 'Save and restart';
        syncRsnodePort();
        if (!node) return;
        document.getElementById('rsnodeSettingsFields').disabled = !idle;
        var form = readRsnodeSettingsForm(), mode = form.wifiMode, repeater = node.repeater;
        var stored = RSNODE_WIFI_MODE_NAMES[node.settings.wifi.mode];
        // Switching between joining and hosting needs the other network's password; switching back
        // closes an editor that opened itself and is still empty, so the stored password stays.
        if (mode !== 'off' && stored !== 'off' && mode !== stored && !rsnodeSettingsPassword) {
            showRsnodePasswordEditor(false);
            rsnodeSettingsPasswordAuto = true;
            form.password = '';
        } else if (rsnodeSettingsPasswordAuto && (mode === stored || mode === 'off') && !document.getElementById('rsnodeWifiPassword').value) {
            rsnodeSettingsPassword = rsnodeSettingsPasswordAuto = false;
            form.password = null;
        }
        document.getElementById('rsnodeWifiFields').hidden = mode === 'off';
        document.getElementById('rsnodeWifiNameLabel').textContent = mode === 'own' ? 'Network name (optional)' : 'Network name';
        document.getElementById('rsnodeWifiName').placeholder = mode === 'own' ? 'RNode ' + node.nodeId : '';
        document.getElementById('rsnodeWifiChannelField').hidden = mode !== 'own';
        document.getElementById('rsnodeWifiFixedField').hidden = mode !== 'join';
        document.getElementById('rsnodeWifiFixedFields').hidden = mode !== 'join' || !form.fixed;
        document.getElementById('rsnodeWifiNote').textContent = mode === 'off'
            ? (repeater ? 'Without Wi-Fi the Repeater forwards over LoRa only.' : 'Apps connect over USB or Bluetooth.')
            : repeater ? 'The Repeater\'s uplink and peers use this network.'
            : 'Bluetooth is off while Wi-Fi is on. Apps connect over TCP port ' + RSNODE_APP_PORT + '.' +
              (mode === 'own' ? ' The node\'s network does not provide Internet access.' : '');
        document.getElementById('rsnodeWifiPasswordStored').hidden = rsnodeSettingsPassword;
        document.getElementById('rsnodeWifiPassword').hidden = !rsnodeSettingsPassword;
        document.getElementById('rsnodeWifiPasswordHelp').hidden = !rsnodeSettingsPassword;
        document.getElementById('rsnodeWifiPasswordState').textContent = node.settings.wifi.passwordSet ? 'Set' : 'Not set';
        document.getElementById('rsnodeWifiPasswordHelp').textContent = mode === 'own'
            ? '8 to 32 characters. Devices joining the node\'s network need it.'
            : '8 to 32 characters, or empty for an open network.';
        ['rsnodePeersGroup', 'rsnodeUplinkGroup', 'rsnodeRadioGroup'].forEach(function(id) { document.getElementById(id).hidden = !repeater; });
        document.getElementById('rsnodePeersPort').disabled = !form.peersEnabled;
        document.getElementById('rsnodeUplinkHost').disabled = !form.uplinkEnabled;
        document.getElementById('rsnodeUplinkPort').disabled = !form.uplinkEnabled;
        var changes = settingsChanges(form, node.settings, repeater);
        document.getElementById('rsnodeSettingsSave').disabled = !idle || !changes.length;
        if (!rsnodeSettingsBusy) {
            document.getElementById('rsnodeSettingsSummary').textContent = state.flashing ? 'Available when flashing finishes.'
                : changes.length ? 'Saving restarts RNode ' + node.nodeId + ' with the new settings.' : 'Nothing to save yet.';
        }
    }
    function showRsnodePasswordEditor(focus) {
        rsnodeSettingsPassword = true;
        rsnodeSettingsPasswordAuto = false;
        var input = document.getElementById('rsnodeWifiPassword');
        input.hidden = false;
        document.getElementById('rsnodeWifiPasswordStored').hidden = true;
        if (focus) input.focus();
    }

    function setRsnodeSettingsBusy(busy, saving) {
        rsnodeSettingsBusy = busy;
        rsnodeSettingsSaving = !!saving;
        document.getElementById('rsnodeSettingsDot').classList.toggle('is-busy', busy);
        syncRsnodeSettingsForm();
        syncRsnodeOwnerForm();
        syncRsnodeDevice();
        updateFlashBtn();
    }

    function rsnodeSettingsMessage(message, error, done) {
        var status = document.getElementById('rsnodeSettingsStatus');
        status.textContent = message || '';
        status.classList.toggle('is-error', !!error);
        var dot = document.getElementById('rsnodeSettingsDot');
        dot.classList.toggle('is-error', !!error);
        dot.classList.toggle('is-ok', !!done);
    }

    // What a failed read or save says, in the panel's words.
    function rsnodeSettingsError(error, stage) {
        var port = rsnodePortError(error, stage, 'try again');
        if (port) return port;
        if (error.notRsnode) return 'This node answers as an RNode but not as rsNode. Settings need rsNode firmware.';
        return error.message || String(error);
    }

    // Polls STATUS until Wi-Fi is up, or gives up after timeoutMs with the last STATUS.
    async function waitForRsnodeWifi(session, mode, timeoutMs) {
        var deadline = Date.now() + timeoutMs, status = null;
        for (;;) {
            status = await readRsnodeStatus(session);
            var wifi = status && status.wifi;
            if (mode === 0 || (wifi && wifi.mode === mode && wifi.ready) || Date.now() >= deadline) return status;
            await sleepMs(RSNODE_WIFI_POLL_MS);
        }
    }

    // Reads the node, or saves the form and follows the node through its restart.
    async function runRsnodeSettingsTask(save) {
        if (rsnodeSettingsBusy || rsnodeRepeaterBusy || rsnodeOwnerBusy || rsnodeChecking || state.flashing) return;
        if (!('serial' in navigator)) {
            showSerialWarning();
            return;
        }
        var ui = null, session = null, field = null, stage = 'input', outcome = null, entries = null, before = rsnodeSettingsNode;
        setRsnodeSettingsBusy(true, save);
        rsnodeSettingsMessage('');
        try {
            if (save) {
                var form = readRsnodeSettingsForm();
                var problem = checkSettingsForm(form, before.settings, before.repeater);
                if (problem) throw rsnodeFieldError(rsnodeSettingsField(problem.field), problem.message);
                entries = settingsChanges(form, before.settings, before.repeater);
                if (!entries.length) {
                    rsnodeSettingsMessage('Nothing to save yet.');
                    return;
                }
            }
            stage = 'port';
            await rsnodeToolPortFromUser();
            ui = openProgressLog(save ? 'Saving settings…' : 'Reading settings…', document.getElementById('rsnodeSettingsActivity'));
            stage = 'open';
            session = createRnodeSession(await openRnodeSerialPort(ui.log, RNODE_REPAIR_SETTLE_MS, await rsnodeOtherPorts()));
            stage = 'protocol';
            ui.setStatus('Waiting for rsNode…');
            var answered = await waitForRsnode(session, { waiting: function() { ui.setStatus('Waiting for rsNode. ' + RSNODE_TAKEOVER); } });
            if (!answered) throw new Error('No answer over USB within 30 s. ' + RSNODE_TAKEOVER.replace(/\.$/, ', then try again.'));
            var nodeId;
            try {
                nodeId = (await readManagementStatus(session)).nodeId;
            } catch (error) {
                throw Object.assign(error, { notRsnode: true });
            }
            ui.log('node id: RNode ' + nodeId);
            if (save && nodeId !== before.nodeId) throw new Error('This is RNode ' + nodeId + ', not RNode ' + before.nodeId + '. Read its settings first.');
            var status = await readRsnodeStatus(session);
            if (!status || !status.node) {
                throw new Error('RNode ' + nodeId + ' did not report USB settings support. Check the connection and use the instructions for its firmware version. The Install action erases the node.');
            }
            if (save) {
                var held = rsnodeHeldElsewhere(status);
                if (held) throw new Error(rsnodeHeldMessage(nodeId, held));
                ui.setStatus('Saving to RNode ' + nodeId + '…');
                ui.log('settings: ' + entries.map(function(entry) { return '0x' + entry[0].toString(16).padStart(2, '0'); }).join(' '));
                outcome = await writeRsnodeSettings(session, entries, form.wifiMode);
                ui.log('result: ' + outcome.kind);
                if (outcome.kind === 'invalid') {
                    var target = outcome.field && rsnodeSettingsField(outcome.field);
                    throw target ? rsnodeFieldError(target, outcome.message) : new Error(outcome.message);
                }
                if (outcome.kind === 'refused') throw new Error(rsnodeHeldMessage(nodeId, 'Bluetooth or Wi-Fi'));
                if (outcome.kind === 'busy') throw new Error('RNode ' + nodeId + ' is busy finishing an update or saving. Try again in a minute.');
                if (outcome.kind === 'storage') throw new Error('RNode ' + nodeId + ' could not confirm that the settings were saved. Read its settings before retrying.');
                if (outcome.kind === 'unsupported') throw new Error('RNode ' + nodeId + ' cannot change these settings over USB.');
                if (outcome.kind === 'failed') throw new Error('RNode ' + nodeId + ' refused the settings (result ' + outcome.result + ').');
                if (outcome.kind === 'uncertain') throw new Error(outcome.message);
                if (outcome.kind === 'restart') {
                    rsnodeSettingsMessage('Restarting…');
                    ui.setStatus('Restarting…');
                    await sleepMs(outcome.restartMs + RSNODE_SETTINGS_RESTART_MS);
                    if (!await waitForRsnode(session, { timeoutMs: RSNODE_RESUME_MS })) {
                        throw new Error('RNode ' + nodeId + ' saved the settings but did not answer after restarting. Press RESET on the board, then read again.');
                    }
                    ui.setStatus('Waiting for Wi-Fi…');
                    status = await waitForRsnodeWifi(session, WIFI_MODES[form.wifiMode], RSNODE_WIFI_WAIT_MS);
                }
            }
            var settings = await readRsnodeSettings(session);
            if (!settings) throw new Error('RNode ' + nodeId + ' did not report its settings.');
            await leaveRsnode(session);
            var repeater = !!(status && status.node ? status.node.repeater : before && before.repeater);
            rsnodeSettingsNode = { nodeId: nodeId, repeater: repeater, settings: settings };
            renderRsnodeSettings();
            rsnodeSettingsMessage(!save ? 'Showing RNode ' + nodeId + '.' + rsnodePersonaNote(status)
                : outcome.kind === 'unchanged' ? 'Nothing changed: RNode ' + nodeId + ' already had these settings.'
                : settingsSavedMessage(nodeId, settings, status, repeater), false, true);
        } catch (error) {
            field = error.field || null;
            if (ui) ui.log('Error: ' + error.message, 'log-red');
            if (stage === 'port' && error.name === 'NotFoundError') rsnodeSettingsMessage('Select the rsNode serial port to continue.');
            else rsnodeSettingsMessage(field ? error.message : rsnodeSettingsError(error, stage), true);
        } finally {
            await closeRnodeSession(session);
            setRsnodeSettingsBusy(false);
        }
        if (field) field.focus();
    }

    if (ADVANCED) document.getElementById('rsnodeSettingsForm').addEventListener('submit', function(event) {
        event.preventDefault();
        runRsnodeSettingsTask(true);
    });
    if (ADVANCED) document.getElementById('rsnodeSettingsRead').addEventListener('click', function() { runRsnodeSettingsTask(false); });
    if (ADVANCED) document.getElementById('rsnodeWifiPasswordChange').addEventListener('click', function() {
        showRsnodePasswordEditor(true);
        syncRsnodeSettingsForm();
    });
    if (ADVANCED) ['input', 'change'].forEach(function(type) {
        document.getElementById('rsnodeSettingsForm').addEventListener(type, function(event) {
            event.target.removeAttribute('aria-invalid');
            syncRsnodeSettingsForm();
        });
    });
    if (ADVANCED) renderRsnodeSettings();

    // ── Set up as a Repeater: the Owner, optional Wi-Fi and uplink, then REPEATER_SETUP over USB (rsNode ADR 0016) ──
    var rsnodeRepeaterBusy = false;
    var rsnodeRepeaterStarting = false;
    // A scanned card's Owner, { name, lxmf, publicKey }; a typed address leaves it null.
    var rsnodeRepeaterOwnerCard = null;
    var rsnodeRepeaterStopScan = null;
    // { nodeId, identity, card, repeating }: the node last set up here, paused until Start repeating.
    var rsnodeRepeaterResult = null;
    var rsnodeRepeaterRegionsFor = null;
    var RSNODE_REPEATER_OWNER_NOTE = 'Paste your address from Ratspeak, or scan your contact card there. A scanned card also gives the node your key, so it can reply right away.';
    var RSNODE_LIMITS_HELP = { off: 'The board\'s full power, with no airtime limits.',
        default: 'The power and airtime limits rsNode sets for the region.',
        custom: 'Your own power limit, with or without the region\'s airtime limit.' };
    var RSNODE_REPEATER_FIELDS = { region: 'rsnodeRepeaterRegion', preset: 'rsnodeRepeaterPreset', limitsPower: 'rsnodeLimitsPower',
        accepted: 'rsnodeRepeaterAccept', owner: 'rsnodeRepeaterOwner', name: 'rsnodeRepeaterWifiName', wifiMode: 'rsnodeRepeaterWifiName',
        password: 'rsnodeRepeaterWifiPassword', uplinkHost: 'rsnodeRepeaterServer', uplinkPort: 'rsnodeRepeaterServerPort' };

    function updateRsnodeRepeaterVisibility() {
        var panel = document.getElementById('rsnodeRepeater');
        if (!panel) return;
        panel.hidden = !rsnodeToolsUnlocked();
        if (panel.hidden) stopRsnodeRepeaterScan();
    }

    function rsnodeRepeaterField(key) {
        if (key === 'limits') return document.querySelector('input[name="rsnodeRepeaterLimits"]:checked');
        return document.getElementById(RSNODE_REPEATER_FIELDS[key] || 'rsnodeRepeaterRegion');
    }

    // The regions the chosen board offers; a V4 has no 433 MHz radio.
    function renderRsnodeRepeaterRegions() {
        var board = rsnodeBoard(rsnodeBoardSelect.value);
        var key = board ? board.id : '';
        if (rsnodeRepeaterRegionsFor === key) return;
        rsnodeRepeaterRegionsFor = key;
        var select = document.getElementById('rsnodeRepeaterRegion');
        var chosen = select.value;
        select.replaceChildren(new Option('Choose your region', ''));
        repeaterRegions(board).forEach(function(region) { select.add(new Option(region.label, String(region.id))); });
        select.value = Array.prototype.some.call(select.options, function(option) { return option.value === chosen; }) ? chosen : '';
        var preset = document.getElementById('rsnodeRepeaterPreset');
        if (!preset.options.length) {
            REPEATER_PRESETS.forEach(function(entry, index) { preset.add(new Option(entry.label, String(index))); });
        }
    }

    function readRsnodeRepeaterForm() {
        var value = function(id) { return document.getElementById(id).value; };
        var checked = function(id) { return document.getElementById(id).checked; };
        var mode = document.querySelector('input[name="rsnodeRepeaterLimits"]:checked');
        var power = value('rsnodeLimitsPower').trim();
        return {
            region: Number(value('rsnodeRepeaterRegion')) || null, preset: Number(value('rsnodeRepeaterPreset')) || 0,
            limits: { mode: mode ? mode.value : 'off', txPower: /^-?\d+$/.test(power) ? Number(power) : NaN, dutyCycle: checked('rsnodeLimitsDuty') },
            accepted: checked('rsnodeRepeaterAccept'), owner: value('rsnodeRepeaterOwner'), card: rsnodeRepeaterOwnerCard,
            remote: checked('rsnodeRepeaterRemote'), wifiName: value('rsnodeRepeaterWifiName'), wifiPassword: value('rsnodeRepeaterWifiPassword'),
            uplinkHost: value('rsnodeRepeaterServer'), uplinkPort: value('rsnodeRepeaterServerPort')
        };
    }

    function syncRsnodeRepeaterForm() {
        if (!document.getElementById('rsnodeRepeater')) return;
        renderRsnodeRepeaterRegions();
        var idle = !rsnodeRepeaterBusy && !rsnodeSettingsBusy && !rsnodeOwnerBusy && !rsnodeChecking && !state.flashing;
        var form = readRsnodeRepeaterForm();
        document.getElementById('rsnodeRepeaterFields').disabled = !idle;
        document.getElementById('rsnodeRepeaterFinish').disabled = !idle;
        document.getElementById('rsnodeRepeaterFinish').textContent = rsnodeRepeaterBusy && !rsnodeRepeaterStarting ? 'Finishing…' : 'Finish setup';
        document.getElementById('rsnodeRepeaterGo').disabled = !idle || !rsnodeRepeaterTarget();
        document.getElementById('rsnodeRepeaterGo').textContent = rsnodeRepeaterBusy && rsnodeRepeaterStarting ? 'Starting…' : 'Start repeating';
        document.getElementById('rsnodeRepeaterRadio').textContent = repeaterRadioLine(form.region, form.preset) ||
            'Each region starts on its default frequency.';
        document.getElementById('rsnodeLimitsHelp').textContent = RSNODE_LIMITS_HELP[form.limits.mode];
        document.getElementById('rsnodeLimitsCustom').hidden = form.limits.mode !== 'custom';
        document.getElementById('rsnodeRepeaterRemoteFields').hidden = !form.remote;
        var card = rsnodeRepeaterOwnerCard;
        document.getElementById('rsnodeRepeaterOwnerEntry').hidden = !!card || !!rsnodeRepeaterStopScan;
        document.getElementById('rsnodeRepeaterScanned').hidden = !card;
        document.getElementById('rsnodeRepeaterScanner').hidden = !rsnodeRepeaterStopScan;
        if (card) {
            document.getElementById('rsnodeRepeaterScannedName').textContent = card.name || 'Your contact card';
            document.getElementById('rsnodeRepeaterScannedAddress').textContent = card.lxmf;
        }
        if (!rsnodeRepeaterBusy) {
            document.getElementById('rsnodeRepeaterSummary').textContent = state.flashing ? 'Available when flashing finishes.' : repeaterSummary(form);
        }
        syncRsnodePort();
    }

    // The node Start repeating acts on: one set up here, or a paused Repeater in the live view. Firmware that
    // does not report forwarding (1.0.0) is offered it too; START on a forwarding node changes nothing.
    function rsnodeRepeaterTarget() {
        var result = rsnodeRepeaterResult;
        if (result) return result.repeating ? null : result.nodeId;
        var facts = rsnodeDeviceFacts;
        var node = facts && facts.rsnode && facts.rsnode.node;
        if (!facts || !rsnodeIsRepeater(facts) || !facts.transport.radioProfile || (node && node.forwarding === true)) return null;
        return facts.status.nodeId;
    }

    function setRsnodeRepeaterBusy(busy, starting) {
        rsnodeRepeaterBusy = busy;
        rsnodeRepeaterStarting = !!starting;
        document.getElementById('rsnodeRepeaterDot').classList.toggle('is-busy', busy);
        syncRsnodeRepeaterForm();
        syncRsnodeSettingsForm();
        syncRsnodeOwnerForm();
        syncRsnodeDevice();
        updateFlashBtn();
    }

    function rsnodeRepeaterMessage(message, error, done) {
        var status = document.getElementById('rsnodeRepeaterStatus');
        status.textContent = message || '';
        status.classList.toggle('is-error', !!error);
        var dot = document.getElementById('rsnodeRepeaterDot');
        dot.classList.toggle('is-error', !!error);
        dot.classList.toggle('is-ok', !!done);
    }

    function rsnodeRepeaterOwnerNote(text) {
        document.getElementById('rsnodeRepeaterOwnerNote').textContent = text || RSNODE_REPEATER_OWNER_NOTE;
    }

    // A card is a person's: a device's card cannot be the Owner.
    async function useRsnodeRepeaterCard(text) {
        var card;
        try {
            card = await parseContactCard(text);
        } catch (error) {
            rsnodeRepeaterOwnerNote(error.message + ' Show your own contact card in Ratspeak.');
            return false;
        }
        if (card.kind === 'device') {
            rsnodeRepeaterOwnerNote('This is a device\'s card. Show your own contact card in Ratspeak.');
            return false;
        }
        rsnodeRepeaterOwnerCard = card;
        rsnodeRepeaterOwnerNote('The node gets your address and key from this card.');
        document.getElementById('rsnodeRepeaterOwner').removeAttribute('aria-invalid');
        return true;
    }

    function stopRsnodeRepeaterScan() {
        if (!rsnodeRepeaterStopScan) return;
        rsnodeRepeaterStopScan();
        rsnodeRepeaterStopScan = null;
        syncRsnodeRepeaterForm();
    }

    var RSNODE_CAMERA_ERRORS = { NotAllowedError: 'Camera access is blocked. Allow it for this page, or paste your address instead.',
        NotFoundError: 'No camera was found. Paste your address instead.',
        NotReadableError: 'Another app is using the camera. Close it, or paste your address instead.' };

    async function startRsnodeRepeaterScan() {
        if (rsnodeRepeaterStopScan) return;
        if (!cameraAvailable()) {
            rsnodeRepeaterOwnerNote('This browser cannot open a camera here. Paste your address instead.');
            return;
        }
        rsnodeRepeaterStopScan = function() {};
        rsnodeRepeaterOwnerNote('Point the camera at your contact card in Ratspeak.');
        syncRsnodeRepeaterForm();
        try {
            var stop = await startQrScan(document.getElementById('rsnodeRepeaterVideo'), async function(text) {
                if (!await useRsnodeRepeaterCard(text)) return false;
                rsnodeRepeaterStopScan = null;
                syncRsnodeRepeaterForm();
                document.getElementById('rsnodeRepeaterScannedClear').focus();
                return true;
            });
            // Stopped, or read a card, while the camera was opening.
            if (rsnodeRepeaterStopScan) rsnodeRepeaterStopScan = stop;
            else stop();
        } catch (error) {
            rsnodeRepeaterStopScan = null;
            rsnodeRepeaterOwnerNote(RSNODE_CAMERA_ERRORS[error.name] || 'The camera could not start. Paste your address instead.');
            syncRsnodeRepeaterForm();
        }
    }

    function renderRsnodeRepeaterCard() {
        var result = rsnodeRepeaterResult;
        document.getElementById('rsnodeRepeaterCard').hidden = !result;
        document.getElementById('rsnodeRepeaterCardText').hidden = true;
        document.getElementById('rsnodeRepeaterCardNote').hidden = true;
        if (!result) return;
        renderQrCanvas(document.getElementById('rsnodeRepeaterQr'), result.card);
        document.getElementById('rsnodeRepeaterCardName').textContent = result.identity.name || 'RNode ' + result.nodeId;
        document.getElementById('rsnodeRepeaterCardAddress').textContent = result.identity.lxmf;
    }

    // A restart the node announced: wait it out, then for the node to answer again.
    async function followRsnodeRestart(session, restartMs, failure) {
        await sleepMs(restartMs + RSNODE_SETTINGS_RESTART_MS);
        if (!await waitForRsnode(session, { timeoutMs: RSNODE_RESUME_MS })) throw new Error(failure);
    }

    // A refused USB write, in the panel's words; an invalid entry lands on its field.
    function rsnodeRepeaterRefusal(outcome, nodeId, field) {
        var name = 'RNode ' + nodeId;
        if (outcome.kind === 'invalid') {
            var target = outcome.field && field(outcome.field);
            return target ? rsnodeFieldError(target, outcome.message) : new Error(outcome.message);
        }
        if (outcome.kind === 'refused') return new Error(rsnodeHeldMessage(nodeId, 'Bluetooth or Wi-Fi'));
        if (outcome.kind === 'busy') return new Error(name + ' is busy finishing an update or saving. Try again in a minute.');
        if (outcome.kind === 'storage') return new Error(name + ' could not confirm that it saved. Try again.');
        if (outcome.kind === 'unsupported') return new Error(name + ' cannot set up a Repeater over USB. Update it first.');
        if (outcome.kind === 'uncertain') return new Error(outcome.message);
        return new Error(name + ' refused the change (result ' + outcome.result + ').');
    }

    // The Owner first, since it creates the identity the card carries; then Wi-Fi and the uplink; then start.
    async function runRsnodeRepeaterTask() {
        if (rsnodeRepeaterBusy || rsnodeSettingsBusy || rsnodeOwnerBusy || rsnodeChecking || state.flashing) return;
        if (!('serial' in navigator)) {
            showSerialWarning();
            return;
        }
        var ui = null, session = null, field = null, stage = 'input', nodeId = null;
        setRsnodeRepeaterBusy(true);
        rsnodeRepeaterMessage('');
        try {
            var form = readRsnodeRepeaterForm();
            var problem = checkRepeaterForm(form);
            if (problem) throw rsnodeFieldError(rsnodeRepeaterField(problem.field), problem.message);
            stopRsnodeRepeaterScan();
            stage = 'port';
            await rsnodeToolPortFromUser();
            rsnodeRepeaterResult = null;
            renderRsnodeRepeaterCard();
            ui = openProgressLog('Setting up the Repeater…', document.getElementById('rsnodeRepeaterActivity'));
            stage = 'open';
            session = createRnodeSession(await openRnodeSerialPort(ui.log, RNODE_REPAIR_SETTLE_MS, await rsnodeOtherPorts()));
            stage = 'protocol';
            ui.setStatus('Waiting for rsNode…');
            var answered = await waitForRsnode(session, { waiting: function() { ui.setStatus('Waiting for rsNode. ' + RSNODE_TAKEOVER); } });
            if (!answered) throw new Error('No answer over USB within 30 s. ' + RSNODE_TAKEOVER.replace(/\.$/, ', then try again.'));
            try {
                nodeId = (await readManagementStatus(session)).nodeId;
            } catch (error) {
                throw Object.assign(error, { notRsnode: true });
            }
            ui.log('node id: RNode ' + nodeId);
            var name = 'RNode ' + nodeId;
            var status = await readRsnodeStatus(session);
            if (!status || !status.node) throw new Error(name + ' cannot set up a Repeater over USB. Update it first.');
            var held = rsnodeHeldElsewhere(status);
            if (held) throw new Error(rsnodeHeldMessage(nodeId, held));
            var board = status.board && rsnodeBoardForTarget(status.board.board);
            if (board && !repeaterRegions(board).some(function(region) { return region.id === form.region; })) {
                throw rsnodeFieldError(rsnodeRepeaterField('region'), board.label + ' has no 433 MHz radio. Choose another region.');
            }
            ui.setStatus('Adding the Owner to ' + name + '…');
            var owner = repeaterOwner(form);
            ui.log('owner: ' + bytesToHex(owner.address) + (owner.publicKey ? ' with its key' : ''));
            await addRsnodeOwner(session, owner.address, owner.publicKey);
            if (form.remote) {
                var settings = await readRsnodeSettings(session);
                if (!settings) throw new Error(name + ' did not report its settings.');
                var remote = repeaterSettingsForm(form, settings);
                var remoteProblem = checkSettingsForm(remote, settings, true);
                if (remoteProblem) throw rsnodeFieldError(rsnodeRepeaterField(remoteProblem.field), remoteProblem.message);
                var entries = settingsChanges(remote, settings, true);
                if (entries.length) {
                    ui.setStatus('Saving Wi-Fi and the uplink to ' + name + '…');
                    ui.log('settings: ' + entries.map(function(entry) { return '0x' + entry[0].toString(16).padStart(2, '0'); }).join(' '));
                    var saved = await writeRsnodeSettings(session, entries, 'join');
                    ui.log('result: ' + saved.kind);
                    if (saved.kind === 'restart') {
                        ui.setStatus('Restarting…');
                        await followRsnodeRestart(session, saved.restartMs,
                            name + ' saved Wi-Fi and the uplink but did not answer after restarting. Press RESET on the board, then start again.');
                    } else if (saved.kind !== 'unchanged') {
                        throw rsnodeRepeaterRefusal(saved, nodeId, function(key) {
                            return rsnodeRepeaterField(key === 'wifiMode' ? 'name' : key);
                        });
                    }
                }
            }
            // Saved, not started: the person is holding the board.
            ui.setStatus('Saving the Repeater settings to ' + name + '…');
            var setup = repeaterSetupEntries({ region: form.region, preset: form.preset, limits: form.limits, accepted: form.accepted, start: false });
            ui.log('repeater setup: ' + setup.map(function(entry) { return '0x' + entry[0].toString(16).padStart(2, '0'); }).join(' '));
            var outcome = await writeRepeaterSetup(session, setup);
            ui.log('result: ' + outcome.kind);
            if (outcome.kind !== 'restart' && outcome.kind !== 'done') throw rsnodeRepeaterRefusal(outcome, nodeId, rsnodeRepeaterField);
            if (outcome.kind === 'restart') {
                rsnodeRepeaterMessage('Restarting…');
                ui.setStatus('Restarting…');
                await followRsnodeRestart(session, outcome.restartMs,
                    name + ' saved the Repeater settings but did not answer after restarting. Press RESET on the board, then check it in the live view.');
            }
            if (form.remote) ui.setStatus('Waiting for Wi-Fi…');
            status = form.remote ? await waitForRsnodeWifi(session, WIFI_MODES.join, RSNODE_WIFI_WAIT_MS) : await readRsnodeStatus(session);
            var identity = await readRsnodeIdentity(session);
            if (!identity || !identity.present) throw new Error(name + ' did not report its identity, so there is no contact card to show.');
            await leaveRsnode(session);
            rsnodeRepeaterResult = { nodeId: nodeId, identity: identity, card: nodeContactCard(identity), repeating: false };
            renderRsnodeRepeaterCard();
            document.getElementById('rsnodeRepeaterNotice').hidden = true;
            rsnodeRepeaterMessage(repeaterSavedMessage(nodeId, status, form), false, true);
        } catch (error) {
            field = error.field || null;
            if (ui) ui.log('Error: ' + error.message, 'log-red');
            rsnodeRepeaterMessage(rsnodeRepeaterError(error, stage, field), true);
        } finally {
            await closeRnodeSession(session);
            setRsnodeRepeaterBusy(false);
        }
        if (field) field.focus();
    }

    function rsnodeRepeaterError(error, stage, field) {
        if (stage === 'port' && error.name === 'NotFoundError') return 'Select the rsNode serial port to continue.';
        if (field) return error.message;
        var text = rsnodePortError(error, stage, 'try again') ||
            (error.notRsnode ? 'This node answers as an RNode but not as rsNode. A Repeater needs rsNode firmware.' : null) ||
            RSNODE_CLI_WORDS.reduce(function(words, swap) { return words.replace(swap[0], swap[1]); }, error.message || String(error));
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    // REPEATER_CONTROL start on the node that was set up; a node already in Repeater mode does not restart.
    async function runRsnodeRepeaterStart() {
        var target = rsnodeRepeaterTarget();
        if (!target || rsnodeRepeaterBusy || rsnodeSettingsBusy || rsnodeOwnerBusy || rsnodeChecking || state.flashing) return;
        if (!('serial' in navigator)) {
            showSerialWarning();
            return;
        }
        var ui = null, session = null, stage = 'port';
        setRsnodeRepeaterBusy(true, true);
        rsnodeRepeaterMessage('');
        try {
            await rsnodeToolPortFromUser();
            ui = openProgressLog('Starting the Repeater…', document.getElementById('rsnodeRepeaterActivity'));
            stage = 'open';
            session = createRnodeSession(await openRnodeSerialPort(ui.log, RNODE_REPAIR_SETTLE_MS, await rsnodeOtherPorts()));
            stage = 'protocol';
            ui.setStatus('Waiting for rsNode…');
            if (!await waitForRsnode(session, { waiting: function() { ui.setStatus('Waiting for rsNode. ' + RSNODE_TAKEOVER); } })) {
                throw new Error('No answer over USB within 30 s. ' + RSNODE_TAKEOVER.replace(/\.$/, ', then try again.'));
            }
            var nodeId = (await readManagementStatus(session)).nodeId;
            ui.log('node id: RNode ' + nodeId);
            if (nodeId !== target) throw new Error('This is RNode ' + nodeId + ', not RNode ' + target + '. Connect RNode ' + target + ' to start it.');
            ui.log('repeater control: start');
            var outcome = await controlRepeater(session, 'start');
            ui.log('result: ' + outcome.kind);
            if (outcome.kind !== 'restart' && outcome.kind !== 'done') throw rsnodeRepeaterRefusal(outcome, nodeId, function() { return null; });
            if (outcome.kind === 'restart') {
                ui.setStatus('Restarting…');
                await followRsnodeRestart(session, outcome.restartMs,
                    'RNode ' + nodeId + ' did not answer after restarting. Press RESET on the board, then check it in the live view.');
            }
            await leaveRsnode(session);
            if (rsnodeRepeaterResult) rsnodeRepeaterResult.repeating = true;
            rsnodeRepeaterMessage('The node is repeating.', false, true);
        } catch (error) {
            if (ui) ui.log('Error: ' + error.message, 'log-red');
            rsnodeRepeaterMessage(rsnodeRepeaterError(error, stage, null), true);
        } finally {
            await closeRnodeSession(session);
            setRsnodeRepeaterBusy(false);
        }
    }

    // The next step after an install: the node is an RNode until it is set up here.
    function showRsnodeRepeaterStep() {
        state.rsnodeInstalled = true;
        updateRsnodeRepeaterVisibility();
        document.getElementById('rsnodeRepeaterNotice').hidden = false;
        document.getElementById('rsnodeRepeater').open = true;
    }

    // The flash button is gone once rsNode is installed; the next step takes focus.
    function focusRsnodeRepeaterNotice() {
        var notice = document.getElementById('rsnodeRepeaterNotice');
        notice.scrollIntoView({ block: 'center' });
        notice.focus({ preventScroll: true });
    }

    if (ADVANCED) document.getElementById('rsnodeRepeaterForm').addEventListener('submit', function(event) {
        event.preventDefault();
        runRsnodeRepeaterTask();
    });
    if (ADVANCED) ['input', 'change'].forEach(function(type) {
        document.getElementById('rsnodeRepeaterForm').addEventListener(type, function(event) {
            event.target.removeAttribute('aria-invalid');
            syncRsnodeRepeaterForm();
        });
    });
    // A card pasted where the address goes counts as scanned.
    if (ADVANCED) document.getElementById('rsnodeRepeaterOwner').addEventListener('change', async function() {
        if (!/^\s*RSCP[12]:/.test(this.value)) return;
        if (await useRsnodeRepeaterCard(this.value)) this.value = '';
        syncRsnodeRepeaterForm();
    });
    if (ADVANCED) document.getElementById('rsnodeRepeaterGo').addEventListener('click', runRsnodeRepeaterStart);
    if (ADVANCED) document.getElementById('rsnodeRepeaterScan').addEventListener('click', startRsnodeRepeaterScan);
    // A closed panel lets the camera go.
    if (ADVANCED) document.getElementById('rsnodeRepeater').addEventListener('toggle', function() {
        if (!this.open) stopRsnodeRepeaterScan();
    });
    if (ADVANCED) document.getElementById('rsnodeRepeaterScanStop').addEventListener('click', function() {
        stopRsnodeRepeaterScan();
        rsnodeRepeaterOwnerNote('');
        document.getElementById('rsnodeRepeaterScan').focus();
    });
    if (ADVANCED) document.getElementById('rsnodeRepeaterScannedClear').addEventListener('click', function() {
        rsnodeRepeaterOwnerCard = null;
        rsnodeRepeaterOwnerNote('');
        syncRsnodeRepeaterForm();
        document.getElementById('rsnodeRepeaterOwner').focus();
    });
    if (ADVANCED) document.getElementById('rsnodeRepeaterCopy').addEventListener('click', async function() {
        if (!rsnodeRepeaterResult) return;
        var button = this, shown = document.getElementById('rsnodeRepeaterCardText');
        try {
            await navigator.clipboard.writeText(rsnodeRepeaterResult.card);
            shown.hidden = true;
            button.textContent = 'Copied';
            setTimeout(function() { button.textContent = 'Copy card'; }, 2000);
        } catch (error) {
            // Without clipboard access the card stays on the page, selected.
            shown.textContent = rsnodeRepeaterResult.card;
            shown.hidden = false;
            window.getSelection().selectAllChildren(shown);
            var note = document.getElementById('rsnodeRepeaterCardNote');
            note.textContent = 'Press Ctrl+C or ⌘C to copy the card.';
            note.hidden = false;
        }
    });
    if (ADVANCED) document.getElementById('rsnodeRepeaterSave').addEventListener('click', function() {
        if (!rsnodeRepeaterResult) return;
        var button = this, name = 'rsnode-' + rsnodeRepeaterResult.nodeId + '-contact-card.png';
        document.getElementById('rsnodeRepeaterQr').toBlob(function(blob) {
            if (!blob) return;
            saveBlob(blob, name);
            button.textContent = 'Saved';
            setTimeout(function() { button.textContent = 'Save image'; }, 2000);
        }, 'image/png');
    });
    if (ADVANCED) syncRsnodeRepeaterForm();

    // ── rsNode live view: the node's screen and status over Web Serial ──
    var rsnodeDevice = null;
    var rsnodeDeviceFacts = null;
    var rsnodeDeviceRadio = null;
    var rsnodeScreenPixels = null;
    var rsnodeScreenImage = null;
    var RSNODE_SCREEN_INTERVAL_MS = 250;
    var RSNODE_RADIO_INTERVAL_MS = 2000;
    var RSNODE_RESUME_MS = 20000;
    var RSNODE_PIXEL_ON = [226, 236, 246, 255];
    var RSNODE_PIXEL_OFF = [11, 12, 14, 255];
    var RSNODE_TAKEOVER = 'If you just installed, press RESET on the board first.';

    function updateRsnodeDeviceVisibility() {
        var panel = document.getElementById('rsnodeDevice');
        if (!panel) return;
        panel.hidden = !rsnodeToolsUnlocked();
        if (panel.hidden) stopRsnodeDevice('');
    }

    function rsnodeDeviceMessage(message, error) {
        var status = document.getElementById('rsnodeDeviceStatus');
        status.textContent = message || '';
        status.classList.toggle('is-error', !!error);
    }

    // Connect is the one primary action until a session starts; the rest appear once they have something to act on.
    function syncRsnodeDevice() {
        var device = rsnodeDevice;
        var live = !!(device && device.facts && !device.stopping);
        var connect = document.getElementById('rsnodeConnect');
        connect.textContent = device ? (device.facts ? 'Disconnect' : 'Cancel') : 'Connect';
        connect.classList.toggle('rsnode-beta__button--primary', !device);
        connect.disabled = device ? device.stopping : rsnodeOwnerBusy || rsnodeSettingsBusy || rsnodeRepeaterBusy || rsnodeChecking || state.flashing;
        var screenshot = document.getElementById('rsnodeScreenshot');
        screenshot.disabled = screenshot.hidden = !rsnodeScreenPixels;
        var copy = document.getElementById('rsnodeCopyDetails');
        copy.disabled = copy.hidden = !rsnodeDeviceFacts;
        // A Repeater refuses both: it is restarted and paired from the device.
        var repeater = live && rsnodeIsRepeater(device.facts);
        var restart = document.getElementById('rsnodeRestart');
        restart.disabled = restart.hidden = !live || repeater;
        // Pairing only where the screen mirror can show its code, and not while Wi-Fi keeps Bluetooth off.
        var pair = document.getElementById('rsnodePair');
        pair.hidden = !live || repeater || !screenSupported(device.facts.board);
        var bluetoothOff = !pair.hidden && rsnodeBluetoothOff(device.facts);
        pair.disabled = pair.hidden || bluetoothOff;
        document.getElementById('rsnodePairNote').hidden = !bluetoothOff;
        document.getElementById('rsnodeFacts').classList.toggle('is-stale', !!rsnodeDeviceFacts && !live);
        syncRsnodePort();
    }

    // STATUS says whether it runs as a Repeater; older betas only say whether it starts as one.
    function rsnodeIsRepeater(facts) {
        return facts.rsnode && facts.rsnode.node ? facts.rsnode.node.repeater : facts.transport.bootMode;
    }

    function setRsnodeScreenState(text, live, busy) {
        document.getElementById('rsnodeScreenState').textContent = text;
        var dot = document.getElementById('rsnodeLiveDot');
        dot.classList.toggle('is-live', live);
        dot.classList.toggle('is-busy', !!busy);
        document.getElementById('rsnodeScreenBezel').classList.toggle('is-stale', !live && !!rsnodeScreenPixels);
    }

    function clearRsnodeScreen(text) {
        var canvas = document.getElementById('rsnodeScreen');
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        rsnodeScreenPixels = null;
        var empty = document.getElementById('rsnodeScreenEmpty');
        empty.textContent = text;
        empty.hidden = false;
    }

    function paintRsnodeScreen(pixels) {
        var unchanged = rsnodeScreenPixels && rsnodeScreenPixels.every(function(value, index) { return value === pixels[index]; });
        rsnodeScreenPixels = pixels;
        if (unchanged) return;
        var context = document.getElementById('rsnodeScreen').getContext('2d');
        rsnodeScreenImage = rsnodeScreenImage || context.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
        for (var i = 0; i < pixels.length; i++) rsnodeScreenImage.data.set(pixels[i] ? RSNODE_PIXEL_ON : RSNODE_PIXEL_OFF, i * 4);
        context.putImageData(rsnodeScreenImage, 0, 0);
        document.getElementById('rsnodeScreenEmpty').hidden = true;
    }

    function showRsnodeDeviceFacts(facts, radio) {
        rsnodeDeviceFacts = facts;
        rsnodeDeviceRadio = radio;
        var summary = facts && rsnodeSummary(facts, radio);
        document.getElementById('rsnodeFactsEmpty').hidden = !!summary;
        document.getElementById('rsnodeFacts').hidden = !summary;
        if (summary) {
            document.querySelectorAll('#rsnodeFacts [data-fact]').forEach(function(row) {
                var value = summary[row.dataset.fact];
                row.hidden = value === null;
                row.querySelector('dd').textContent = value || '';
            });
            document.querySelector('#rsnodeFacts [data-fact="firmware"] dd').title = facts.firmwareHash;
        }
        syncRsnodeDevice();
        // A paused Repeater seen here can be started from Set up as a Repeater.
        syncRsnodeRepeaterForm();
    }

    function rsnodeDeviceError(error, stage) {
        var port = rsnodePortError(error, stage, 'connect again');
        if (port) return port;
        if (error.notRsnode) return 'This node answers as an RNode but not as rsNode. The live view needs rsNode firmware.';
        if (/^no answer/.test(error.message)) return 'The node stopped answering over USB. Check the cable, or press RESET on the board, then connect again.';
        return error.message || String(error);
    }

    function rsnodeDeviceWatched() {
        return !document.hidden && document.getElementById('rsnodeDevice').open;
    }

    // Screens as fast as the node answers, at most four a second, while the panel is in view;
    // the radio every two seconds. A node that goes quiet is followed through its restart.
    async function streamRsnodeDevice(device) {
        var session = device.session, screen, nextRadio, shown;
        function begin() {
            screen = screenSupported(device.facts.board);
            nextRadio = Date.now() + RSNODE_RADIO_INTERVAL_MS;
            shown = [];
            if (!screen) clearRsnodeScreen('No screen view for this board');
            document.getElementById('rsnodeScreenBezel').classList.toggle('is-none', !screen);
            setRsnodeScreenState(screen ? 'Live' : 'Status only', true);
        }
        begin();
        while (!device.stopping) {
            var started = Date.now();
            var watched = rsnodeDeviceWatched();
            var quiet = false, dark = false, radio = null;
            if (screen && watched) {
                var pixels = await readRsnodeScreen(session);
                if (device.stopping) return;
                if (pixels) {
                    paintRsnodeScreen(pixels);
                    dark = pixels.every(function(on) { return !on; });
                    shown.push(Date.now());
                } else {
                    quiet = true;
                }
            }
            if (!quiet && Date.now() >= nextRadio) {
                try {
                    radio = await readRsnodeRadio(session);
                } catch (error) {
                    if (!/^no answer/.test(error.message)) throw error;
                    quiet = true;
                }
                if (device.stopping) return;
                if (radio) {
                    showRsnodeDeviceFacts(device.facts, radio);
                    nextRadio = Date.now() + RSNODE_RADIO_INTERVAL_MS;
                }
            }
            if (quiet) {
                await resumeRsnodeDevice(device);
                if (device.stopping) return;
                begin();
                continue;
            }
            shown = shown.filter(function(at) { return at > Date.now() - 2000; });
            if (screen) {
                setRsnodeScreenState(!watched ? 'Paused' : dark ? 'Live · screen off' :
                    'Live · ' + Math.round(shown.length / 2) + ' fps', watched);
            }
            syncRsnodeDevice();
            await sleepMs(Math.max(0, RSNODE_SCREEN_INTERVAL_MS - (Date.now() - started)));
        }
    }

    // A restart or a switch between RNode and Repeater reboots the node without dropping USB:
    // wait for it to answer again, then read it afresh, since its mode may have changed.
    async function resumeRsnodeDevice(device) {
        setRsnodeScreenState('Restarting…', false, true);
        var answered = await waitForRsnode(device.session, {
            timeoutMs: RSNODE_RESUME_MS,
            stopped: function() { return device.stopping; }
        });
        if (device.stopping) return;
        if (!answered) throw new Error('no answer after a restart');
        device.facts = await readRsnodeFacts(device.session);
        showRsnodeDeviceFacts(device.facts, await readRsnodeRadio(device.session));
    }

    async function runRsnodeDevice() {
        if (rsnodeDevice || rsnodeOwnerBusy || rsnodeSettingsBusy || rsnodeRepeaterBusy || rsnodeChecking || state.flashing) return;
        if (!('serial' in navigator)) {
            showSerialWarning();
            return;
        }
        rsnodeDeviceMessage('');
        try {
            await rsnodeToolPortFromUser();
        } catch (error) {
            if (error.name === 'NotFoundError') rsnodeDeviceMessage('Select the rsNode serial port to continue.');
            else rsnodeDeviceMessage(error.message || String(error), true);
            return;
        }
        var device = rsnodeDevice = { session: null, facts: null, stage: 'open', stopping: false, restart: false, reason: '' };
        device.done = new Promise(function(resolve) { device.finish = resolve; });
        var failure = null;
        showRsnodeDeviceFacts(null, null);
        document.getElementById('rsnodeFactsEmpty').hidden = true;
        document.getElementById('rsnodeDetailsText').hidden = true;
        clearRsnodeScreen('Connecting');
        document.getElementById('rsnodeScreenBezel').classList.toggle('is-none', false);
        document.getElementById('rsnodeLiveDot').classList.toggle('is-error', false);
        setRsnodeScreenState('Connecting…', false, true);
        try {
            device.session = createRnodeSession(await openRnodeSerialPort(null, 0, await rsnodeOtherPorts()));
            device.stage = 'wait';
            var answered = await waitForRsnode(device.session, {
                stopped: function() { return device.stopping; },
                waiting: function() { rsnodeDeviceMessage('Waiting for rsNode. ' + RSNODE_TAKEOVER); }
            });
            if (device.stopping) return;
            if (!answered) throw new Error('No answer over USB. ' + RSNODE_TAKEOVER.replace(/\.$/, ', then connect again.'));
            rsnodeDeviceMessage('');
            device.stage = 'facts';
            device.facts = await readRsnodeFacts(device.session);
            showRsnodeDeviceFacts(device.facts, await readRsnodeRadio(device.session));
            device.stage = 'live';
            await streamRsnodeDevice(device);
        } catch (error) {
            failure = error;
        } finally {
            if (device.session) {
                try {
                    if (!device.restart) await leaveRsnode(device.session);
                    else if (!await restartRsnode(device.session)) {
                        device.reason = 'RNode ' + device.facts.status.nodeId + ' did not restart: another app is using it. ' +
                            'Restart it from the device.';
                    }
                } catch (error) { /* the port is already gone */ }
            }
            await closeRnodeSession(device.session);
            rsnodeDevice = null;
            document.getElementById('rsnodeFactsEmpty').hidden = !!rsnodeDeviceFacts;
            if (!rsnodeScreenPixels && !document.getElementById('rsnodeScreenBezel').classList.contains('is-none')) clearRsnodeScreen('Connect to see the screen');
            setRsnodeScreenState('Not connected', false);
            document.getElementById('rsnodeLiveDot').classList.toggle('is-error', !!failure && !device.stopping);
            if (failure && !device.stopping) rsnodeDeviceMessage(rsnodeDeviceError(failure, device.stage), true);
            else rsnodeDeviceMessage(device.reason);
            syncRsnodeDevice();
            device.finish();
        }
    }

    // Ends the session with LEAVE (and the reset, for a restart); resolves once the port is closed.
    function stopRsnodeDevice(reason, restart) {
        var device = rsnodeDevice;
        if (!device) return Promise.resolve();
        if (!device.stopping) {
            device.stopping = true;
            device.restart = !!restart;
            device.reason = reason;
            if (device.session) device.session.pump.stop();
            setRsnodeScreenState(restart ? 'Restarting…' : 'Disconnecting…', false, true);
            syncRsnodeDevice();
        }
        return device.done;
    }

    // Any other USB task takes the port: the live view leaves the node first.
    function releaseRsnodeDevice() {
        return stopRsnodeDevice('Disconnected so another USB task could use the port. Connect again to resume.');
    }

    // rsNode's Heltec firmware holds the pairing window two minutes (PAIRING_TIMEOUT_MS).
    async function pairRsnodeDevice() {
        var device = rsnodeDevice;
        if (!device || !device.facts || device.stopping) return;
        try {
            if (!await startRsnodePairing(device.session)) {
                rsnodeDeviceMessage(rsnodeBluetoothOff(device.facts) ? document.getElementById('rsnodePairNote').textContent
                    : 'RNode ' + device.facts.status.nodeId + ' did not start pairing: another app is using it. ' +
                    'Disconnect that app, or pair from the device.', true);
                return;
            }
        } catch (error) {
            rsnodeDeviceMessage(rsnodeDeviceError(error, device.stage), true);
            return;
        }
        rsnodeDeviceMessage('Pairing started. Within 2 minutes, choose RNode ' + device.facts.status.nodeId +
            ' in your app\'s Bluetooth list and enter the code shown on its screen. Bluetooth stays on.');
    }

    if (ADVANCED) document.getElementById('rsnodeConnect').addEventListener('click', function() {
        if (rsnodeDevice) stopRsnodeDevice('');
        else runRsnodeDevice();
    });
    if (ADVANCED) document.getElementById('rsnodeRestart').addEventListener('click', function() {
        var device = rsnodeDevice;
        if (!device || !device.facts || device.stopping) return;
        var name = 'RNode ' + device.facts.status.nodeId;
        var back = rsnodeIsRepeater(device.facts) ? 'as a Repeater' : 'in RNode';
        if (!window.confirm('Restart ' + name + '?\n\nIt starts again ' + back + ' after a few seconds.')) return;
        stopRsnodeDevice('Restarting ' + name + '. Connect again in a few seconds.', true);
    });
    if (ADVANCED) document.getElementById('rsnodePair').addEventListener('click', pairRsnodeDevice);
    if (ADVANCED) document.getElementById('rsnodeScreenshot').addEventListener('click', function() {
        if (!rsnodeScreenPixels) return;
        var scale = 4;
        var canvas = document.createElement('canvas');
        canvas.width = SCREEN_WIDTH * scale;
        canvas.height = SCREEN_HEIGHT * scale;
        var context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        context.drawImage(document.getElementById('rsnodeScreen'), 0, 0, canvas.width, canvas.height);
        var name = rsnodeDeviceFacts ? 'rsnode-' + rsnodeDeviceFacts.status.nodeId + '-screen.png' : 'rsnode-screen.png';
        var button = this;
        canvas.toBlob(function(blob) {
            if (!blob) return;
            saveBlob(blob, name);
            button.textContent = 'Saved';
            setTimeout(function() { button.textContent = 'Save screenshot'; }, 2000);
        }, 'image/png');
    });
    if (ADVANCED) document.getElementById('rsnodeCopyDetails').addEventListener('click', async function() {
        var button = this, text = rsnodeDetails(rsnodeDeviceFacts, rsnodeDeviceRadio);
        var shown = document.getElementById('rsnodeDetailsText');
        try {
            await navigator.clipboard.writeText(text);
            shown.hidden = true;
            button.textContent = 'Copied';
            setTimeout(function() { button.textContent = 'Copy details'; }, 2000);
        } catch (error) {
            // Without clipboard access the details stay on the page, selected.
            shown.textContent = text;
            shown.hidden = false;
            window.getSelection().selectAllChildren(shown);
            rsnodeDeviceMessage("Couldn't copy automatically. The details below are selected: press Ctrl+C or ⌘C.");
        }
    });
    // Whole device pixels per screen pixel keep every OLED pixel the same size.
    if (ADVANCED && window.ResizeObserver) {
        new ResizeObserver(function(entries) {
            var ratio = window.devicePixelRatio || 1;
            var scale = Math.max(1, Math.floor(entries[0].contentRect.width * ratio / SCREEN_WIDTH));
            document.getElementById('rsnodeScreen').style.width = scale * SCREEN_WIDTH / ratio + 'px';
        }).observe(document.getElementById('rsnodeScreenBezel'));
    }
    if (navigator.serial) {
        navigator.serial.addEventListener('disconnect', function(event) {
            if (rsnodeDevice && rsnodeDevice.session && event.target === rsnodeDevice.session.port) stopRsnodeDevice('The node disconnected from USB.');
        });
    }
    window.addEventListener('pagehide', function() {
        if (rsnodeDevice && rsnodeDevice.session) leaveRsnode(rsnodeDevice.session).catch(function() {});
    });

    // ── Flash Button / Step State ──────────────────────
    function setFlowItem(id, status, stateText) {
        var item = document.getElementById(id);
        if (!item) return;
        item.classList.remove('is-active', 'is-done', 'is-blocked', 'is-warning');
        item.classList.add(status);
        var textEl = document.getElementById(id + 'State');
        if (textEl) textEl.textContent = stateText;
    }

    function updateAdvancedMeta() {
        var meta = document.getElementById('advancedMeta');
        if (!meta) return;
        var parts = [];
        if (state.eraseAll) parts.push('Full erase on');
        if (shouldRunRnodeSetup()) {
            parts.push(isOfficialRnodeFirmwareSelected() ? 'RNode setup required' : 'RNode setup on');
        }
        meta.textContent = parts.length ? parts.join(' · ') : 'Default install';
    }

    function updateFlashFlow(note) {
        if (ADVANCED) {
            renderRsnodeUpdate();
            updateRsnodeOwnerVisibility();
            syncRsnodeOwnerForm();
            updateRsnodeSettingsVisibility();
            syncRsnodeSettingsForm();
            updateRsnodeRepeaterVisibility();
            syncRsnodeRepeaterForm();
            updateRsnodeDeviceVisibility();
            syncRsnodeDevice();
            sourceTabs.forEach(function(tab) { tab.disabled = state.flashing || betaAuthBusy; });
            rsnodeBoardSelect.disabled = state.flashing;
            rsnodeVariantConfirmed.disabled = state.flashing;
            document.getElementById('rsnodeLock').disabled = state.flashing || betaAuthBusy || rsnodeOwnerBusy || rsnodeSettingsBusy || rsnodeRepeaterBusy;
        }
        document.getElementById('eraseToggle').disabled = state.flashing;
        var retry = document.getElementById('firmwareRetry');
        if (retry) retry.hidden = !state.firmwareError || state.flashing;
        var ready = state.connected && state.firmwareReady;
        var firmwareWaiting = state.device === 'custom'
            ? (state.connected ? 'Choose firmware' : 'Not started')
            : state.firmwareProgress !== null ? 'Downloading ' + state.firmwareProgress + '%' : 'Not started';
        var noteEl = document.getElementById('flashBtnNote');
        var primary = document.querySelector('.flash-primary-action');
        if (primary) primary.hidden = !!state.failure;

        if (state.flashComplete) {
            setFlowItem('flowConnect', 'is-done', 'Selected');
            setFlowItem('flowFirmware', 'is-done', 'Written');
            if (state.rnodeSetupIssue) {
                var reconnectSetup = state.rnodeSetupIssueKind === 'reconnect';
                setFlowItem('flowFlash', reconnectSetup ? 'is-active' : 'is-warning', reconnectSetup ? 'Finish setup' : 'RNode setup');
                if (noteEl) {
                    noteEl.textContent = reconnectSetup
                        ? 'Firmware is installed. Reset the board, then finish RNode setup.'
                        : 'Firmware was written, but RNode setup needs attention.';
                }
            } else {
                setFlowItem('flowFlash', 'is-done', 'Complete');
                if (noteEl) {
                    noteEl.textContent = state.rnodeSetupVerified
                        ? 'Firmware flash complete. RNode setup was verified.'
                        : state.rsnodeUpdated
                        ? state.rsnodeUpdated.message
                        : state.rsnodeInstalled
                        ? (rsnodeToolsUnlocked() ? 'rsNode is installed. Press RESET on the board; the tools below read and set it up.'
                            : 'rsNode is installed. Press RESET on the board.')
                        : 'Installed. Restart the device to start using it.';
                }
            }
            updateAdvancedMeta();
            return;
        }

        if (state.flashing) {
            setFlowItem('flowConnect', 'is-done', 'Selected');
            setFlowItem('flowFirmware', 'is-done', 'Ready');
            setFlowItem('flowFlash', 'is-active', state.flashStage === 'writing' ? 'Writing' : 'Checking the device');
            if (noteEl) noteEl.textContent = state.flashStage === 'writing'
                ? 'Writing firmware now. Keep the USB cable connected until it finishes.'
                : 'Checking your device before installation.';
            updateAdvancedMeta();
            return;
        }

        var failedAt = state.failure && state.failure.step;
        setFlowItem('flowConnect', failedAt === 'connect' ? 'is-warning' : state.connected ? 'is-done' : 'is-active',
            failedAt === 'connect' ? 'Couldn\u2019t connect' : state.connected ? 'Selected' : 'Select your device');
        var downloading = state.device !== 'custom' && state.firmwareProgress !== null;
        setFlowItem('flowFirmware', state.firmwareError ? 'is-warning' : state.firmwareReady ? 'is-done' : (state.connected || downloading ? 'is-active' : 'is-blocked'), state.firmwareError ? 'Didn\u2019t download' : state.firmwareReady ? 'Ready' : firmwareWaiting);
        setFlowItem('flowFlash', failedAt === 'install' ? 'is-warning' : ready && !failedAt ? 'is-active' : 'is-blocked',
            failedAt === 'install' ? 'Stopped' : ready && !failedAt ? 'Ready' : 'Not started');

        if (noteEl) {
            if (note) {
                noteEl.textContent = note;
            } else if (state.firmwareError) {
                noteEl.textContent = state.device === 'custom'
                    ? 'Firmware could not be loaded. Select it again to retry.'
                    : 'The firmware didn\u2019t download. Try again in step 2.';
            } else if (isRsnodeSelected() && !ready) {
                noteEl.textContent = rsnodeFlowNote();
            } else if (ready && isRsnodeSelected() && rsnodeUpdateChosen()) {
                noteEl.textContent = 'Ready to update. Identity, managers, and settings stay. Keep this tab open until the node confirms the update.';
            } else if (ready) {
                noteEl.textContent = handheldBoard(state.device)
                    ? 'Ready. The installer checks the device, then updates it or asks before erasing. Keep this tab open.'
                    : 'Ready to write firmware. Keep this tab open until it finishes.';
            } else if (!state.connected && !state.firmwareReady) {
                noteEl.textContent = state.device === 'custom'
                    ? 'Select a USB device and choose firmware to continue.'
                    : 'Select a USB device while the firmware downloads.';
            } else if (!state.connected) {
                noteEl.textContent = 'Select a USB device to continue.';
            } else {
                noteEl.textContent = state.device === 'custom'
                    ? 'Upload a .bin or .zip, or choose rsNode or RNode firmware.'
                    : 'Waiting for the firmware to finish downloading.';
            }
        }
        updateAdvancedMeta();
    }

    // The rsNode source names the first step still open.
    function rsnodeFlowNote() {
        if (betaStage === 'locked') return 'Unlock the rsNode beta to continue.';
        if (betaStage === 'terms') return 'Accept the beta terms to continue.';
        if (!rsnodeBoardSelect.value) return 'Choose your board to flash. To manage a node that already runs rsNode, use the tools below.';
        if (state.rsnodeLoading) return 'Loading the firmware for your board…';
        if (state.rsnodeLoadFailed) return 'Firmware could not be loaded. Choose the board again to retry.';
        if (!rsnodeVariantIsConfirmed()) return 'Confirm the V4 variant to continue.';
        return 'Select a USB device to continue.';
    }

    function updateFlashBtn() {
        var btn = document.getElementById('flashBtn');
        if (!btn) return;
        var ready = state.connected && state.firmwareReady;

        if (ready && !state.flashing && !state.flashComplete && !rsnodeOwnerBusy && !rsnodeSettingsBusy && !rsnodeRepeaterBusy && !rsnodeChecking) {
            btn.className = 'flash-btn flash-btn--ready';
            btn.disabled = false;
        } else {
            btn.className = state.flashing ? 'flash-btn flash-btn--flashing' : 'flash-btn flash-btn--disabled';
            btn.disabled = true;
        }
        updateFlashFlow();
    }

    function rnodeSpec(flashSize, bootloaderOffset) {
        return { flashSize: flashSize, bootloaderOffset: bootloaderOffset };
    }
    // Flash sizes and bootloader offsets mirror Reticulum's rnodeconf.py
    // get_flasher_call() table for ESP32-family RNode firmware packages.
    var RNODE_ESP32_FLASH_SPECS = {
        'rnode_firmware_esp32_generic.zip':      rnodeSpec('4MB',  0x1000),
        'rnode_firmware_featheresp32.zip':       rnodeSpec('4MB',  0x1000),
        'rnode_firmware_tbeam.zip':              rnodeSpec('4MB',  0x1000),
        'rnode_firmware_tbeam_sx1262.zip':       rnodeSpec('4MB',  0x1000),
        'rnode_firmware_lora32v10.zip':          rnodeSpec('4MB',  0x1000),
        'rnode_firmware_lora32v20.zip':          rnodeSpec('4MB',  0x1000),
        'rnode_firmware_lora32v20_extled.zip':   rnodeSpec('4MB',  0x1000),
        'rnode_firmware_lora32v21.zip':          rnodeSpec('4MB',  0x1000),
        'rnode_firmware_lora32v21_extled.zip':   rnodeSpec('4MB',  0x1000),
        'rnode_firmware_lora32v21_tcxo.zip':     rnodeSpec('4MB',  0x1000),
        'rnode_firmware_heltec32v2.zip':         rnodeSpec('8MB',  0x1000),
        'rnode_firmware_ng20.zip':               rnodeSpec('4MB',  0x1000),
        'rnode_firmware_ng21.zip':               rnodeSpec('4MB',  0x1000),
        'rnode_firmware_t3s3.zip':               rnodeSpec('4MB',  0x0),
        'rnode_firmware_t3s3_sx127x.zip':        rnodeSpec('4MB',  0x0),
        'rnode_firmware_t3s3_sx1280_pa.zip':     rnodeSpec('4MB',  0x0),
        'rnode_firmware_tbeam_supreme.zip':      rnodeSpec('4MB',  0x0),
        'rnode_firmware_tdeck.zip':              rnodeSpec('4MB',  0x0),
        'rnode_firmware_heltec32v3.zip':         rnodeSpec('8MB',  0x0),
        'rnode_firmware_xiao_esp32s3.zip':       rnodeSpec('8MB',  0x0),
        'rnode_firmware_heltec32v4pa.zip':       rnodeSpec('16MB', 0x0)
    };

    function normalizeZipPath(path) {
        return String(path || '').replace(/\\/g, '/').replace(/^\.?\//, '');
    }
    function zipBasename(path) {
        var p = normalizeZipPath(path);
        return p.substring(p.lastIndexOf('/') + 1);
    }
    function zipDirname(path) {
        var p = normalizeZipPath(path);
        var slash = p.lastIndexOf('/');
        return slash === -1 ? '' : p.substring(0, slash + 1);
    }
    function findZipFile(zip, path, baseDir) {
        var normalized = normalizeZipPath(path);
        var candidates = [normalized];
        if (baseDir) candidates.push(normalizeZipPath(baseDir + normalized));
        for (var i = 0; i < candidates.length; i++) {
            var exact = zip.file(candidates[i]);
            if (exact) return exact;
        }
        var lower = candidates.map(function (p) { return p.toLowerCase(); });
        var basename = zipBasename(normalized).toLowerCase();
        var basenameMatches = [];
        var match = null;
        zip.forEach(function (entryPath, file) {
            if (file.dir || match) return;
            var entry = normalizeZipPath(entryPath).toLowerCase();
            if (lower.indexOf(entry) !== -1) {
                match = file;
            } else if (zipBasename(entry).toLowerCase() === basename) {
                basenameMatches.push(file);
            }
        });
        if (match) return match;
        if (basenameMatches.length === 1) return basenameMatches[0];
        return null;
    }
    function findManifestFile(zip) {
        var root = zip.file('manifest.json');
        if (root) return { path: 'manifest.json', file: root };
        var found = null;
        zip.forEach(function (entryPath, file) {
            if (!file.dir && !found && zipBasename(entryPath).toLowerCase() === 'manifest.json') {
                found = { path: normalizeZipPath(entryPath), file: file };
            }
        });
        return found;
    }
    function parseFlashOffset(value) {
        if (typeof value === 'number' && isFinite(value)) return value;
        var text = String(value == null ? '' : value).trim();
        if (!text) throw new Error('Manifest part is missing an offset');
        var parsed = /^0x/i.test(text) ? parseInt(text, 16) : parseInt(text, 10);
        if (!isFinite(parsed) || isNaN(parsed)) throw new Error('Invalid flash offset: ' + text);
        return parsed;
    }
    function manifestFlashOptions(manifest, build) {
        var src = build || manifest || {};
        return {
            flashMode: src.flashMode || src.flash_mode || manifest.flashMode || manifest.flash_mode || CUSTOM_FLASH_DEFAULTS.flashMode,
            flashSize: src.flashSize || src.flash_size || manifest.flashSize || manifest.flash_size || CUSTOM_FLASH_DEFAULTS.flashSize,
            flashFreq: src.flashFreq || src.flash_freq || manifest.flashFreq || manifest.flash_freq || CUSTOM_FLASH_DEFAULTS.flashFreq
        };
    }
    function manifestPlan(manifest) {
        if (manifest && manifest.manifest && manifest.manifest.application && manifest.manifest.application.bin_file) {
            throw new Error('This ZIP is an nRF52 DFU package, not an ESP32 flash manifest. Use rnodeconf or a DFU-capable flasher for this board.');
        }
        if (manifest && Array.isArray(manifest.parts)) {
            return { parts: manifest.parts, build: manifest };
        }
        if (manifest && Array.isArray(manifest.files)) {
            return { parts: manifest.files, build: manifest };
        }
        if (manifest && Array.isArray(manifest.builds)) {
            var builds = manifest.builds.filter(function (b) { return Array.isArray(b.parts) && b.parts.length; });
            if (!builds.length) throw new Error('Manifest has no flashable builds');
            var preferred = builds.find(function (b) {
                var family = String(b.chipFamily || b.chip || '').toLowerCase();
                return family.indexOf('esp32') !== -1;
            }) || builds[0];
            return { parts: preferred.parts, build: preferred };
        }
        throw new Error('Unsupported manifest format');
    }
    async function addZipPart(zip, part, manifestDir, fileArray, rawParts, logMessage) {
        var path = part.path || part.file || part.fileName || part.filename || part.name;
        var offset = part.offset != null ? part.offset : (part.address != null ? part.address : part.addr);
        if (!path) throw new Error('Manifest part is missing a file path');
        var file = findZipFile(zip, path, manifestDir);
        if (!file) throw new Error('ZIP missing file: ' + path);
        var data = await file.async('uint8array');
        var address = parseFlashOffset(offset);
        fileArray.push({ data: uint8ToBstr(data), address: address });
        rawParts.push({ addr: address, bytes: data });
        logMessage('  ' + normalizeZipPath(path) + ' @ 0x' + address.toString(16) + ' (' + formatBytes(data.length) + ')', '');
        return data.length;
    }
    function detectRnodeZipStem(zip) {
        var stem = null;
        zip.forEach(function (entryPath, file) {
            if (file.dir || stem) return;
            var base = zipBasename(entryPath);
            if (/^rnode_firmware.*\.bootloader$/i.test(base)) {
                stem = base.replace(/\.bootloader$/i, '');
            }
        });
        return stem;
    }
    function detectRnodeAssetName(zip) {
        if (state.rnodeAssetName) return state.rnodeAssetName;
        var stem = detectRnodeZipStem(zip);
        return stem ? stem + '.zip' : null;
    }
    async function tryRnodeZipPlan(zip, rawParts, logMessage) {
        var assetName = detectRnodeAssetName(zip);
        if (!assetName) return null;
        var spec = RNODE_ESP32_FLASH_SPECS[assetName];
        if (!spec) {
            throw new Error('This RNode firmware package is not supported by the ESP32 web flasher: ' + assetName);
        }
        // Some release assets, such as *_extled.zip, contain canonical
        // internal filenames without the asset suffix. Plan from the ZIP stem.
        var stem = detectRnodeZipStem(zip) || assetName.replace(/\.zip$/i, '');
        var layout = [
            { path: stem + '.boot_app0',   addr: 0xe000 },
            { path: stem + '.bootloader',  addr: spec.bootloaderOffset },
            { path: stem + '.bin',         addr: 0x10000 },
            { path: 'console_image.bin',   addr: 0x210000, optional: true },
            { path: stem + '.partitions',  addr: 0x8000 }
        ];
        var fileArray = [];
        var totalSize = 0;
        logMessage('RNode firmware layout: ' + assetName, '');
        for (var i = 0; i < layout.length; i++) {
            var entry = layout[i];
            var file = findZipFile(zip, entry.path);
            if (!file) {
                if (entry.optional) continue;
                throw new Error('RNode ZIP missing file: ' + entry.path);
            }
            var data = await file.async('uint8array');
            fileArray.push({ data: uint8ToBstr(data), address: entry.addr });
            rawParts.push({ addr: entry.addr, bytes: data });
            totalSize += data.length;
            logMessage('  ' + entry.path + ' @ 0x' + entry.addr.toString(16) + ' (' + formatBytes(data.length) + ')', '');
        }
        logMessage('Total firmware size: ' + formatBytes(totalSize), '');
        return {
            fileArray: fileArray,
            flashOptions: {
                flashMode: 'dio',
                flashSize: spec.flashSize,
                flashFreq: '80m'
            }
        };
    }

    // Nordic serial DFU transport for nRF52 RNode packages. Supports
    // application-only DFU release zips.
    function Nrf52DfuFlasher(serialPort, options) {
        this.serialPort = serialPort;
        this.options = options || {};
        this.sequenceNumber = 0;
        this.sdSize = 0;
        this.totalSize = 0;
        this.DFU_TOUCH_BAUD = 1200;
        this.FLASH_BAUD = 115200;
        this.SERIAL_PORT_OPEN_WAIT_MS = 100;
        this.TOUCH_RESET_WAIT_MS = 1800;
        this.HEX_TYPE_APPLICATION = 4;
        this.DFU_INIT_PACKET = 1;
        this.DFU_START_PACKET = 3;
        this.DFU_DATA_PACKET = 4;
        this.DFU_STOP_DATA_PACKET = 5;
        this.DATA_INTEGRITY_CHECK_PRESENT = 1;
        this.RELIABLE_PACKET = 1;
        this.HCI_PACKET_TYPE = 14;
        this.ACK_PACKET_TIMEOUT_MS = 1000;
        this.FLASH_PAGE_SIZE = 4096;
        this.FLASH_PAGE_ERASE_TIME = 0.0897;
        this.FLASH_WORD_WRITE_TIME = 0.000100;
        this.FLASH_PAGE_WRITE_TIME = (this.FLASH_PAGE_SIZE / 4) * this.FLASH_WORD_WRITE_TIME;
        this.DFU_PACKET_MAX_SIZE = 512;
    }

    Nrf52DfuFlasher.prototype.log = function (message, cssClass) {
        if (this.options.log) this.options.log(message, cssClass || '');
    };

    Nrf52DfuFlasher.prototype.setProgress = function (pct, status) {
        if (this.options.setProgress) this.options.setProgress(pct, status);
    };

    Nrf52DfuFlasher.prototype.closePort = async function () {
        try { await this.serialPort.close(); } catch (e) { /* already closed */ }
    };

    Nrf52DfuFlasher.prototype.openPort = async function (baudRate) {
        await this.closePort();
        var opts = {
            baudRate: baudRate,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            flowControl: 'none',
            bufferSize: 4096
        };
        try {
            await this.serialPort.open(opts);
            return;
        } catch (firstErr) {
            if (baudRate !== this.FLASH_BAUD) throw firstErr;
            var lastErr = firstErr;
            for (var attempt = 0; attempt < 12; attempt++) {
                var ports = [this.serialPort].concat(await authorizedSerialPorts());
                for (var i = 0; i < ports.length; i++) {
                    var port = ports[i];
                    if (ports.indexOf(port) !== i) continue;
                    try { await port.close(); } catch (e) { /* already closed */ }
                    try {
                        await port.open(opts);
                        this.serialPort = port;
                        state.port = port;
                        if (port !== ports[0]) {
                            this.log('Reacquired serial port via ' + serialPortLabel(port) + '.', 'log-orange');
                        }
                        return;
                    } catch (e2) {
                        lastErr = e2;
                    }
                }
                await sleepMs(500);
            }
            throw lastErr;
        }
    };

    Nrf52DfuFlasher.prototype.write = async function (bytes) {
        var writer = this.serialPort.writable.getWriter();
        try {
            await writer.write(new Uint8Array(bytes));
        } finally {
            writer.releaseLock();
        }
    };

    Nrf52DfuFlasher.prototype.readChunkWithTimeout = async function (reader, timeoutMs) {
        var timer = null;
        try {
            return await Promise.race([
                reader.read(),
                new Promise(function (resolve) {
                    timer = setTimeout(function () { resolve({ timedOut: true }); }, timeoutMs);
                })
            ]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    };

    Nrf52DfuFlasher.prototype.slipDecodeEscChars = function (dataIn) {
        var result = [];
        for (var i = 0; i < dataIn.length; i++) {
            var chr = dataIn[i];
            if (chr === 0xDB) {
                i++;
                var next = dataIn[i];
                if (next === 0xDC) {
                    result.push(0xC0);
                } else if (next === 0xDD) {
                    result.push(0xDB);
                } else {
                    throw new Error('Malformed nRF52 bootloader acknowledgement');
                }
            } else {
                result.push(chr);
            }
        }
        return result;
    };

    Nrf52DfuFlasher.prototype.readAckNumber = async function () {
        if (!this.serialPort.readable) throw new Error('Serial port is not readable');
        var reader = this.serialPort.readable.getReader();
        var ackBytes = [];
        var sawStart = false;
        try {
            while (ackBytes.length < 2 || ackBytes[ackBytes.length - 1] !== 0xC0) {
                var result = await this.readChunkWithTimeout(reader, this.ACK_PACKET_TIMEOUT_MS);
                if (result && result.timedOut) {
                    try { await reader.cancel(); } catch (e) { /* closing after fatal timeout */ }
                    throw new Error('Timed out waiting for nRF52 bootloader acknowledgement');
                }
                if (!result || result.done) {
                    throw new Error('nRF52 bootloader closed serial before acknowledging packet');
                }
                var chunk = result.value || [];
                for (var i = 0; i < chunk.length; i++) {
                    var byte = chunk[i];
                    if (byte === 0xC0) {
                        if (!sawStart) {
                            sawStart = true;
                            ackBytes = [byte];
                        } else {
                            ackBytes.push(byte);
                            break;
                        }
                    } else if (sawStart) {
                        ackBytes.push(byte);
                    }
                }
            }
            var decoded = this.slipDecodeEscChars(ackBytes);
            var data = decoded.slice(1, -1);
            if (!data.length) throw new Error('nRF52 bootloader sent an empty acknowledgement');
            return (data[0] >> 3) & 0x07;
        } finally {
            try { reader.releaseLock(); } catch (e) { /* stream already closed */ }
        }
    };

    Nrf52DfuFlasher.prototype.sendPacket = async function (bytes) {
        await this.write(bytes);
        return await this.readAckNumber();
    };

    Nrf52DfuFlasher.prototype.enterDfuMode = async function () {
        this.log('Preparing device for firmware update...', 'log-orange');
        await this.openPort(this.DFU_TOUCH_BAUD);
        await sleepMs(this.SERIAL_PORT_OPEN_WAIT_MS);
        await this.closePort();
        await sleepMs(this.TOUCH_RESET_WAIT_MS);
    };

    Nrf52DfuFlasher.prototype.calcCrc16 = function (binaryData, crc) {
        crc = crc == null ? 0xffff : crc;
        for (var i = 0; i < binaryData.length; i++) {
            crc = ((crc >> 8) & 0x00FF) | ((crc << 8) & 0xFF00);
            crc ^= binaryData[i];
            crc ^= (crc & 0x00FF) >> 4;
            crc ^= (crc << 8) << 4;
            crc ^= ((crc & 0x00FF) << 4) << 1;
        }
        return crc & 0xFFFF;
    };

    Nrf52DfuFlasher.prototype.int16ToBytes = function (num) {
        return [
            num & 0x00FF,
            (num & 0xFF00) >> 8
        ];
    };

    Nrf52DfuFlasher.prototype.int32ToBytes = function (num) {
        return [
            num & 0x000000ff,
            (num & 0x0000ff00) >> 8,
            (num & 0x00ff0000) >> 16,
            (num & 0xff000000) >> 24
        ];
    };

    Nrf52DfuFlasher.prototype.slipEncodeEscChars = function (dataIn) {
        var result = [];
        for (var i = 0; i < dataIn.length; i++) {
            var chr = dataIn[i];
            if (chr === 0xC0) {
                result.push(0xDB, 0xDC);
            } else if (chr === 0xDB) {
                result.push(0xDB, 0xDD);
            } else {
                result.push(chr);
            }
        }
        return result;
    };

    Nrf52DfuFlasher.prototype.createSlipHeader = function (seq, dip, rp, pktType, pktLen) {
        var ints = [0, 0, 0, 0];
        ints[0] = seq | (((seq + 1) % 8) << 3) | (dip << 6) | (rp << 7);
        ints[1] = pktType | ((pktLen & 0x000F) << 4);
        ints[2] = (pktLen & 0x0FF0) >> 4;
        ints[3] = (~(ints[0] + ints[1] + ints[2]) + 1) & 0xFF;
        return ints;
    };

    Nrf52DfuFlasher.prototype.createHciPacketFromFrame = function (frame) {
        this.sequenceNumber = (this.sequenceNumber + 1) % 8;
        var data = this.createSlipHeader(
            this.sequenceNumber,
            this.DATA_INTEGRITY_CHECK_PRESENT,
            this.RELIABLE_PACKET,
            this.HCI_PACKET_TYPE,
            frame.length
        ).concat(frame);
        var crc = this.calcCrc16(new Uint8Array(data), 0xffff);
        data.push(crc & 0xFF, (crc & 0xFF00) >> 8);
        return [0xC0].concat(this.slipEncodeEscChars(data), [0xC0]);
    };

    Nrf52DfuFlasher.prototype.getEraseWaitTime = function () {
        return Math.max(0.5, (Math.floor(this.totalSize / this.FLASH_PAGE_SIZE) + 1) * this.FLASH_PAGE_ERASE_TIME);
    };

    Nrf52DfuFlasher.prototype.getActivateWaitTimeMs = function () {
        var writeWaitTime = (Math.floor(this.totalSize / this.FLASH_PAGE_SIZE) + 1) * this.FLASH_PAGE_WRITE_TIME;
        return Math.ceil((this.getEraseWaitTime() + writeWaitTime) * 1000);
    };

    Nrf52DfuFlasher.prototype.createImageSizePacket = function (softdeviceSize, bootloaderSize, appSize) {
        return this.int32ToBytes(softdeviceSize || 0)
            .concat(this.int32ToBytes(bootloaderSize || 0))
            .concat(this.int32ToBytes(appSize || 0));
    };

    Nrf52DfuFlasher.prototype.sendStartDfu = async function (mode, softdeviceSize, bootloaderSize, appSize) {
        var frame = this.int32ToBytes(this.DFU_START_PACKET)
            .concat(this.int32ToBytes(mode))
            .concat(this.createImageSizePacket(softdeviceSize, bootloaderSize, appSize));
        await this.sendPacket(this.createHciPacketFromFrame(frame));
        this.sdSize = softdeviceSize || 0;
        this.totalSize = this.sdSize + (bootloaderSize || 0) + (appSize || 0);
        await sleepMs(this.getEraseWaitTime() * 1000);
    };

    Nrf52DfuFlasher.prototype.sendInitPacket = async function (initPacket) {
        var frame = this.int32ToBytes(this.DFU_INIT_PACKET)
            .concat(Array.from(initPacket))
            .concat(this.int16ToBytes(0x0000));
        await this.sendPacket(this.createHciPacketFromFrame(frame));
    };

    Nrf52DfuFlasher.prototype.sendFirmware = async function (firmware) {
        var packetCount = Math.ceil(firmware.length / this.DFU_PACKET_MAX_SIZE);
        var packetsSent = 0;
        for (var offset = 0; offset < firmware.length; offset += this.DFU_PACKET_MAX_SIZE) {
            var chunk = firmware.slice(offset, offset + this.DFU_PACKET_MAX_SIZE);
            var frame = this.int32ToBytes(this.DFU_DATA_PACKET).concat(Array.from(chunk));
            await this.sendPacket(this.createHciPacketFromFrame(frame));
            await sleepMs(this.FLASH_PAGE_WRITE_TIME * 1000);
            packetsSent++;
            this.setProgress(25 + (packetsSent / packetCount) * 62, 'Writing firmware packet ' + packetsSent + '/' + packetCount + '...');
        }
        await this.sendPacket(this.createHciPacketFromFrame(this.int32ToBytes(this.DFU_STOP_DATA_PACKET)));
    };

    Nrf52DfuFlasher.prototype.sendValidateFirmware = async function () {
        return true;
    };

    Nrf52DfuFlasher.prototype.sendActivateFirmware = async function () {
        this.log('Activating new firmware...', '');
    };

    Nrf52DfuFlasher.prototype.flashApplication = async function (firmware, initPacket) {
        await this.openPort(this.FLASH_BAUD);
        await sleepMs(this.SERIAL_PORT_OPEN_WAIT_MS);
        this.log('Starting firmware update...', '');
        this.setProgress(18, 'Starting firmware update...');
        await this.sendStartDfu(this.HEX_TYPE_APPLICATION, 0, 0, firmware.length);
        this.log('Sending init packet...', '');
        this.setProgress(22, 'Sending init packet...');
        await this.sendInitPacket(initPacket);
        this.log('Writing application image (' + formatBytes(firmware.length) + ')...', '');
        await this.sendFirmware(firmware);
        this.setProgress(88, 'Validating firmware transfer...');
        await this.sendValidateFirmware();
        this.setProgress(90, 'Activating firmware...');
        await this.sendActivateFirmware();
    };

    async function prepareNrf52DfuPackage(zipBuffer, logMessage) {
        var zip = await window.JSZip.loadAsync(zipBuffer);
        var manifestEntry = findManifestFile(zip);
        if (!manifestEntry) throw new Error('Firmware package is missing manifest.json');
        var manifestDir = zipDirname(manifestEntry.path);
        var manifest = JSON.parse(await manifestEntry.file.async('string'));
        var app = manifest && manifest.manifest && manifest.manifest.application;
        if (!app || !app.bin_file || !app.dat_file) {
            throw new Error('Firmware package does not contain an application image');
        }
        var binFile = findZipFile(zip, app.bin_file, manifestDir);
        var datFile = findZipFile(zip, app.dat_file, manifestDir);
        if (!binFile) throw new Error('Firmware package missing ' + app.bin_file);
        if (!datFile) throw new Error('Firmware package missing ' + app.dat_file);
        var firmware = await binFile.async('uint8array');
        var initPacket = await datFile.async('uint8array');
        state.firmwareAppBytes = firmware;
        logMessage('Firmware package: ' + app.bin_file + ' (' + formatBytes(firmware.length) + ')', '');
        logMessage('  init packet: ' + app.dat_file + ' (' + formatBytes(initPacket.length) + ')', '');
        return { firmware: firmware, initPacket: initPacket };
    }

    async function runNrf52DfuFlash(logMessage, setProgress) {
        if (!state.port) throw new Error('Serial port unavailable');
        if (!state.rnodeAsset) throw new Error('No firmware package is loaded');
        if (state.eraseAll) {
            logMessage('Full erase is not available for this update path; flashing application update only.', 'log-orange');
        }
        logMessage('nRF52 DFU updates the application image and preserves the bootloader and EEPROM state.', 'log-orange');
        setProgress(5, 'Preparing firmware package...');
        var prepared = await prepareNrf52DfuPackage(state.rnodeAsset, logMessage);
        var flasher = new Nrf52DfuFlasher(state.port, {
            log: logMessage,
            setProgress: setProgress
        });
        try {
            setProgress(10, 'Preparing device...');
            await flasher.enterDfuMode();
            setProgress(16, 'Opening serial...');
            await flasher.flashApplication(prepared.firmware, prepared.initPacket);
            var activateWaitMs = flasher.getActivateWaitTimeMs();
            setProgress(92, 'Waiting for nRF52 activation...');
            logMessage('Firmware transfer complete; waiting for nRF52 bootloader activation/copy...', 'log-green');
            await flasher.closePort();
            await sleepMs(activateWaitMs);
            setProgress(94, 'Waiting for RNode reboot...');
            logMessage('Waiting for RNode firmware to boot...', 'log-orange');
            await sleepMs(RNODE_NRF52_DFU_REBOOT_WAIT_MS);
            await refreshRnodePortAfterReboot(logMessage);
        } finally {
            await flasher.closePort();
        }
    }

    // ── Prepare flash file array from ZIP or single bin ─
    //
    // Layered fallback for custom .zip uploads (in priority order):
    //   1. manifest.json present → use it (Ratspeak / ESP-Web-Tools format)
    //   2. exactly one .bin in zip → flash at 0x0 (treat as merged image)
    //   3. bootloader.bin + partitions[.bin] + (firmware|app|application).bin
    //      → standard ESP32-S3 offsets (0x0 / 0x8000 / 0x10000)
    //   4. user-supplied manual offsets via state.customOffsets
    //   5. otherwise throw with a helpful message
    //
    // Single .bin upload follows similar detection: a partition table at 0x8000
    // or a filename containing "merged"/"combined"/"full" → 0x0, otherwise
    // app-only at 0x10000. Manual override via state.customOffsets[0] when set.
    function isMergedImage(bytes) {
        if (bytes.length < 0x8020 || bytes[0] !== 0xE9) return false;
        if (bytes[0x8000] !== 0xAA || bytes[0x8001] !== 0x50) return false;
        var offset = bytes[0x8004] + bytes[0x8005] * 0x100 + bytes[0x8006] * 0x10000 + bytes[0x8007] * 0x1000000;
        return offset >= 0x9000 && offset % 0x1000 === 0;
    }

    async function prepareFileArray(logMessage) {
        if (isRsnodeSelected()) {
            if (!state.rsnodeAsset || !state.rsnodeMetadata || betaStage !== 'ready' || !rsnodeVariantIsConfirmed()) {
                throw new Error('Choose and confirm your rsNode board before flashing.');
            }
            var betaZip = await window.JSZip.loadAsync(state.rsnodeAsset, { checkCRC32: true });
            var betaEntry = betaZip.file('manifest.json');
            if (!betaEntry) throw new Error('The beta package is missing its manifest.');
            var betaPrepared = await validateBetaManifest(betaZip, JSON.parse(await betaEntry.async('string')), state.rsnodeMetadata);
            state.firmwareAppBytes = betaPrepared.bytes;
            logMessage('Verified rsNode factory image for ' + betaPrepared.boardLabel + ' @ 0x0', '');
            return Object.assign({}, betaPrepared, {
                fileArray: [{ data: uint8ToBstr(betaPrepared.bytes), address: 0 }]
            });
        }

        var handheldImage = function (validated) {
            state.firmwareAppBytes = validated.bytes;
            logMessage('Verified factory image for ' + DEVICES[validated.board].name + ' @ 0x0', '');
            return {
                fileArray: [{ data: uint8ToBstr(validated.bytes), address: validated.address }],
                product: 'ratspeak-handheld',
                bytes: validated.bytes,
                version: validated.version,
                flashOptions: { flashMode: validated.flashMode, flashSize: validated.flashSize, flashFreq: validated.flashFreq },
                installMode: validated.installMode,
                board: validated.board,
                package: validated.package
            };
        };

        if (state.device !== 'custom' && state.firmwareMetadata && state.firmwareMetadata.product === 'ratspeak-handheld' &&
            state.firmwareMetadata.fileName.endsWith('.bin')) {
            return handheldImage(validateHandheldImage(new Uint8Array(state.firmwareZip),
                { board: state.device, package: state.selectedPackage }));
        }

        var isCustomSingleBin = state.device === 'custom' && state.customFile
            && state.customFile.name.toLowerCase().endsWith('.bin');

        if (isCustomSingleBin) {
            var buf = await state.customFile.arrayBuffer();
            var u8 = new Uint8Array(buf);
            // Release images identify themselves; flash them like the preset download.
            if (identifyHandheldImage(u8)) return handheldImage(validateHandheldImage(u8));
            var nameLower = state.customFile.name.toLowerCase();
            var addr = (state.customOffsets && state.customOffsets[0] != null)
                ? state.customOffsets[0]
                : (isMergedImage(u8) || /(merged|combined|full)/.test(nameLower) ? 0x0 : 0x10000);
            logMessage('Custom firmware: ' + state.customFile.name + ' @ 0x' + addr.toString(16) +
                       ' (' + formatBytes(buf.byteLength) + ')', '');
            state.firmwareAppBytes = u8;
            return {
                fileArray: [{ data: uint8ToBstr(u8), address: addr }],
                flashOptions: CUSTOM_FLASH_DEFAULTS
            };
        }

        // ZIP-based firmware (preset devices, custom .zip, or RNode variant)
        var zipBuffer;
        if (state.device === 'custom' && state.rnodeAsset) {
            zipBuffer = state.rnodeAsset;
        } else if (state.device === 'custom' && state.customFile) {
            zipBuffer = await state.customFile.arrayBuffer();
        } else {
            zipBuffer = state.firmwareZip;
        }
        var rawParts = []; // [{addr, bytes}]
        var pickAppBytes = function () {
            if (rawParts.length === 0) return null;
            if (rawParts.length === 1) return rawParts[0].bytes;
            var atApp = rawParts.find(function (p) { return p.addr === 0x10000; });
            if (atApp) return atApp.bytes;
            // Otherwise the largest part (typically the app)
            return rawParts.reduce(function (a, b) { return b.bytes.length > a.bytes.length ? b : a; }).bytes;
        };

        var zip = await window.JSZip.loadAsync(zipBuffer);
        var fileArray = [];
        var totalSize = 0;
        var manifest = null;

        // 1. manifest.json wins
        var manifestEntry = findManifestFile(zip);
        if (manifestEntry) {
            manifest = JSON.parse(await manifestEntry.file.async('string'));
            if (manifest.product === 'rsnode') {
                if (manifestEntry.path !== 'manifest.json') throw new Error('rsNode manifest must be at the root of the ZIP.');
                var uploadedRsnode = await validateBetaManifest(zip, manifest, { id: manifest.board, version: manifest.version });
                state.firmwareAppBytes = uploadedRsnode.bytes;
                logMessage('Verified rsNode factory image for ' + uploadedRsnode.boardLabel + ' @ 0x0', '');
                return Object.assign({}, uploadedRsnode, { fileArray: [{ data: uint8ToBstr(uploadedRsnode.bytes), address: 0 }] });
            }
            if ((state.firmwareMetadata && state.firmwareMetadata.product === 'ratspeak-handheld') ||
                manifest.product === 'ratspeak-handheld') {
                if (manifestEntry.path !== 'manifest.json') throw new Error('Handheld manifest must be at the root of the ZIP.');
                var expected = state.device === 'custom' ? {} : { board: state.device, package: state.selectedPackage };
                var validated = await validateHandheldManifest(zip, manifest, expected);
                state.firmwareAppBytes = validated.bytes;
                logMessage('Verified factory image for ' + DEVICES[validated.board].name + ' @ 0x0', '');
                return {
                    fileArray: [{ data: uint8ToBstr(validated.bytes), address: validated.address }],
                    product: 'ratspeak-handheld',
                    bytes: validated.bytes,
                    version: manifest.version,
                    flashOptions: manifestFlashOptions(manifest, manifest),
                    installMode: validated.installMode,
                    board: validated.board,
                    package: validated.package
                };
            }
            var plan = manifestPlan(manifest);
            var manifestDir = zipDirname(manifestEntry.path);
            logMessage('Firmware manifest: ' + plan.parts.length + ' parts', '');
            for (var i = 0; i < plan.parts.length; i++) {
                totalSize += await addZipPart(zip, plan.parts[i], manifestDir, fileArray, rawParts, logMessage);
            }
            logMessage('Total firmware size: ' + formatBytes(totalSize), '');
            state.firmwareAppBytes = pickAppBytes();
            return {
                fileArray: fileArray,
                flashOptions: manifestFlashOptions(manifest, plan.build)
            };
        }

        if (state.firmwareMetadata && state.firmwareMetadata.product === 'ratspeak-handheld') {
            throw new Error('Handheld firmware is missing its manifest.');
        }

        // 2. Official RNode ESP32 release zips use rnodeconf-style filenames
        // instead of a manifest. Plan these before the generic single-bin path.
        var rnodePlan = await tryRnodeZipPlan(zip, rawParts, logMessage);
        if (rnodePlan) {
            state.firmwareAppBytes = pickAppBytes();
            return rnodePlan;
        }

        // No manifest — discover .bin files in the zip
        var bins = [];
        zip.forEach(function (path, file) {
            if (file.dir) return;
            if (path.toLowerCase().endsWith('.bin')) {
                bins.push({ path: path, file: file, name: path.split('/').pop().toLowerCase() });
            }
        });

        if (bins.length === 0) {
            throw new Error('ZIP contains no .bin files and no manifest.json');
        }

        // 2. Single .bin → treat as merged at 0x0
        if (bins.length === 1) {
            logMessage('No manifest found; flashing single binary as merged image at 0x0', '');
            var data = await bins[0].file.async('uint8array');
            fileArray.push({ data: uint8ToBstr(data), address: 0x0 });
            rawParts.push({ addr: 0x0, bytes: data });
            totalSize = data.length;
            logMessage('  ' + bins[0].path + ' @ 0x0 (' + formatBytes(data.length) + ')', '');
            logMessage('Total firmware size: ' + formatBytes(totalSize), '');
            state.firmwareAppBytes = pickAppBytes();
            return { fileArray: fileArray, flashOptions: CUSTOM_FLASH_DEFAULTS };
        }

        // 3. Standard ESP32-S3 three-bin layout
        var findBin = function (re) {
            return bins.find(function (b) { return re.test(b.name); });
        };
        var bootloader = findBin(/^bootloader\.bin$/);
        var partitions = findBin(/^(partitions|partition[-_]table)\.bin$/);
        var app = findBin(/^(firmware|app|application|main|merged)\.bin$/);
        if (bootloader && partitions && app) {
            logMessage('No manifest found; matched standard bootloader/partitions/app layout', '');
            var layout = [
                { bin: bootloader, addr: 0x0 },
                { bin: partitions, addr: 0x8000 },
                { bin: app,        addr: 0x10000 }
            ];
            for (var li = 0; li < layout.length; li++) {
                var entry = layout[li];
                var dat = await entry.bin.file.async('uint8array');
                fileArray.push({ data: uint8ToBstr(dat), address: entry.addr });
                rawParts.push({ addr: entry.addr, bytes: dat });
                totalSize += dat.length;
                logMessage('  ' + entry.bin.path + ' @ 0x' + entry.addr.toString(16) + ' (' + formatBytes(dat.length) + ')', '');
            }
            logMessage('Total firmware size: ' + formatBytes(totalSize), '');
            state.firmwareAppBytes = pickAppBytes();
            return { fileArray: fileArray, flashOptions: CUSTOM_FLASH_DEFAULTS };
        }

        // 4. Manual offsets supplied via state.customOffsets (path → address map)
        if (state.customOffsets && Object.keys(state.customOffsets).length === bins.length) {
            logMessage('Using manual offsets', '');
            for (var bi = 0; bi < bins.length; bi++) {
                var b = bins[bi];
                if (state.customOffsets[b.path] == null) {
                    throw new Error('Manual offset missing for ' + b.path);
                }
                var d = await b.file.async('uint8array');
                fileArray.push({ data: uint8ToBstr(d), address: state.customOffsets[b.path] });
                rawParts.push({ addr: state.customOffsets[b.path], bytes: d });
                totalSize += d.length;
                logMessage('  ' + b.path + ' @ 0x' + state.customOffsets[b.path].toString(16) + ' (' + formatBytes(d.length) + ')', '');
            }
            state.firmwareAppBytes = pickAppBytes();
            return { fileArray: fileArray, flashOptions: CUSTOM_FLASH_DEFAULTS };
        }

        // 5. Ambiguous — surface a clear error
        var binList = bins.map(function (b) { return b.path; }).join(', ');
        throw new Error(
            'ZIP contains ' + bins.length + ' .bin files but no manifest.json or recognizable layout (' + binList + '). ' +
            'Add a manifest.json, or upload one .bin at a time, or use the offset picker.'
        );
    }

    async function confirmFactoryInstall(prepared, review) {
        if (prepared.installMode !== 'factory' && !review) return true;
        var dialog = document.getElementById('installDialog');
        if (!dialog || typeof dialog.showModal !== 'function') {
            throw new Error('This browser cannot show the installation notice. Use an up-to-date Chrome or Edge browser.');
        }
        document.getElementById('installDialogDevice').textContent = prepared.boardLabel || DEVICES[prepared.board].name;
        document.getElementById('installDialogTitle').textContent = review ? review.title : 'Erase and install';
        document.getElementById('installDialogRisk').textContent = review ? review.detail : prepared.product === 'rsnode'
            ? 'Everything on the node is erased: identity, managers, Wi-Fi, Bluetooth pairings, and Repeater settings.'
            : 'All data in internal storage will be lost, including your identity, settings, and messages.';
        document.getElementById('installDialogIntro').textContent = review ? review.intro : prepared.product === 'rsnode'
            ? 'You are installing rsNode private beta firmware.'
            : prepared.package === 'rnode'
            ? 'You\'re installing the radio-only version of Ratspeak Handheld.'
            : 'You are installing Ratspeak Handheld.';
        var cancel = document.getElementById('installDialogCancel');
        var proceed = document.getElementById('installDialogContinue');
        proceed.textContent = review ? review.action : 'Erase and install';
        var variant = document.getElementById('installDialogVariant');
        var variantConfirmed = document.getElementById('installDialogVariantConfirmed');
        var needsVariant = prepared.product === 'rsnode' && prepared.board !== 'heltec-v3' && !isRsnodeSelected();
        variant.hidden = !needsVariant;
        variantConfirmed.checked = false;
        document.getElementById('installDialogVariantLabel').textContent = 'I checked that my device is ' + rsnodeVariantDescription(prepared.board) + '.';
        proceed.disabled = needsVariant;
        return new Promise(function(resolve, reject) {
            var accepted = false;
            function cleanup() {
                dialog.removeEventListener('close', onClose);
                dialog.removeEventListener('keydown', onKeyDown);
                cancel.removeEventListener('click', onCancel);
                proceed.removeEventListener('click', onContinue);
                variantConfirmed.removeEventListener('change', onVariant);
                proceed.disabled = false;
            }
            function onClose() { cleanup(); resolve(accepted); }
            function onKeyDown(event) {
                if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
            }
            function onCancel() { dialog.close(); }
            function onVariant() { proceed.disabled = needsVariant && !variantConfirmed.checked; }
            function onContinue() { if (needsVariant && !variantConfirmed.checked) return; accepted = true; dialog.close(); }
            dialog.addEventListener('close', onClose);
            dialog.addEventListener('keydown', onKeyDown);
            cancel.addEventListener('click', onCancel);
            proceed.addEventListener('click', onContinue);
            variantConfirmed.addEventListener('change', onVariant);
            try {
                dialog.showModal();
                cancel.focus();
            } catch (error) { cleanup(); reject(error); }
        });
    }

    // ── Flash Process (Real esptool-js) ────────────────
    function shouldEraseBeforeFlash(prepared) {
        if (prepared && prepared.product === 'ratspeak-handheld') return prepared.installMode === 'factory';
        return !!(prepared && prepared.installMode === 'factory') || state.eraseAll;
    }

    async function prepareHandheldInstall(loader, prepared, logMessage, reportStatus) {
        loader.FLASH_READ_TIMEOUT = 10000;
        var installed = await inspectHandheld(loader, prepared.board, undefined, function(stage) {
            logMessage(stage, '');
            if (reportStatus) reportStatus(stage);
        });
        if (installed.status === 'recognized' && state.device !== 'custom' &&
            !state.packageExplicit && installed.package !== prepared.package) {
            state.selectedPackage = installed.package;
            buildPackagePicker(DEVICES[state.device]);
            logMessage('Keeping the installed ' + selectedPackageLabel(DEVICES[state.device]) + ' package.', '');
            await fetchFirmwareFromRelease(DEVICES[state.device]);
            if (!state.firmwareReady) throw new Error('Could not load firmware for the installed package. Nothing was written.');
            prepared = await prepareFileArray(logMessage);
        }
        var plan = await handheldUpdatePlan(prepared, installed);
        if (plan.installMode === 'update' && !state.eraseAll) {
            prepared.installMode = 'update';
            prepared.fileArray = plan.parts.filter(function(part) { return !part.unchanged; })
                .map(function(part) { return { address: part.address, data: uint8ToBstr(part.bytes) }; });
            prepared.flashOptions = { flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep' };
            logMessage(plan.upToDate ? 'Firmware is already up to date.'
                : 'Updating firmware. Keeping identity, settings, and messages.', 'log-green');
        } else {
            var review = handheldConfirmation(plan, state.eraseAll);
            if (!await confirmFactoryInstall(prepared, review)) return null;
        }
        // A failed read can leave the serial protocol out of sync. Reconnect
        // before a user-authorized erase, never retry a failed update as factory.
        prepared.reconnect = !!installed.reconnect;
        return prepared;
    }

    window.startFlash = async function() {
        if (!state.connected || !state.firmwareReady || state.flashing || rsnodeOwnerBusy || rsnodeSettingsBusy || rsnodeRepeaterBusy || rsnodeChecking) return;

        state.flashing = true;
        await releaseRsnodeDevice();
        state.flashStage = 'preparing';
        state.flashComplete = false;
        state.rsnodeInstalled = false;
        state.rsnodeUpdated = null;
        clearRecovery();
        if (ADVANCED) document.getElementById('rsnodeRepeaterNotice').hidden = true;
        state.rnodeSetupVerified = false;
        state.rnodeSetupIssue = null;
        state.rnodeSetupIssueKind = null;
        state.rnodeHostControlledMode = false;
        var btn = document.getElementById('flashBtn');
        btn.className = 'flash-btn flash-btn--flashing';
        btn.disabled = true;
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spinSlow 1s linear infinite;"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Preparing\u2026';
        updateFlashFlow();

        var progress = document.getElementById('flashProgress');
        var result = document.getElementById('flashResult');
        progress.classList.add('active');
        result.classList.remove('active');

        var log = document.getElementById('progressLog');
        log.innerHTML = '';

        var statusEl = document.getElementById('progressStatus');
        var pctEl = document.getElementById('progressPct');
        var barEl = document.getElementById('progressBar');

        function logMessage(text, cssClass) {
            var entry = document.createElement('span');
            if (cssClass) entry.className = cssClass;
            entry.textContent = '> ' + text;
            log.appendChild(entry);
            log.scrollTop = log.scrollHeight;
        }

        function setProgress(pct, statusText) {
            pctEl.textContent = Math.round(pct) + '%';
            barEl.style.width = pct + '%';
            if (statusText) statusEl.textContent = statusText;
        }
        var needsRnodeSetup = shouldRunRnodeSetup();
        var rnodeSetupIssue = null;
        var rnodeSetupIssueKind = null;
        var rnodeProvisionResult = null;
        var rnodeSetupCompleted = false;

        try {
            if (isRsnodeSelected() && rsnodeUpdateChosen()) {
                var updated = await runRsnodeUpdate(logMessage, setProgress, btn);
                state.flashing = false;
                if (!updated) {
                    logMessage('Update cancelled. Nothing was sent to the node.', '');
                    setProgress(0, 'Update cancelled');
                    setFlashButtonIdleContent();
                    updateFlashBtn();
                    btn.focus();
                    return;
                }
                state.flashComplete = true;
                state.rsnodeUpdated = updated;
                state.rsnodeChoice = state.rsnodeNotice = null;
                state.rsnodeMode = 'install';
                btn.style.display = 'none';
                updateFlashFlow();
                return;
            }
            var flashStrategy = selectedFlashStrategy();
            if (flashStrategy === 'nrf52-dfu') {
                await runNrf52DfuFlash(logMessage, setProgress);
            } else {
                // 1. Load esptool-js
                setProgress(2, 'Loading esptool...');
                logMessage('Loading esptool-js...', 'log-orange');
                var esptool = await loadEsptool();
                logMessage('esptool-js loaded', 'log-green');

                // 2. Prepare firmware parts from ZIP (or single bin for custom)
                setProgress(5, 'Preparing firmware...');
                var prepared = await prepareFileArray(logMessage);
                if (prepared.product === 'rsnode') needsRnodeSetup = false;
                if (prepared.product !== 'ratspeak-handheld' && !await confirmFactoryInstall(prepared)) {
                    logMessage('Installation cancelled. No device data was written.', '');
                    setProgress(0, 'Installation cancelled');
                    state.flashing = false;
                    setFlashButtonIdleContent();
                    updateFlashBtn();
                    btn.focus();
                    return;
                }
                if (prepared.product === 'rsnode' && isRsnodeSelected()) {
                    var session = await betaRequest('session');
                    if (session.stage !== 'ready') {
                        applyBetaSession(session);
                        throw new Error('Beta access expired. Unlock the beta again before flashing.');
                    }
                }
                if (!state.connected || !state.port) throw new Error('Device disconnected. Reconnect it before flashing.');
                btn.textContent = 'Checking the device\u2026';

                // 3. Create Transport from the raw serial port
                setProgress(8, 'Connecting to bootloader...');
                logMessage('Creating serial transport...', '');
                var transport = new esptool.Transport(state.port);
                state.transport = transport;

                // 4. Create ESPLoader
                var terminal = createTerminal();
                var esploader = new esptool.ESPLoader({
                    transport: transport,
                    baudrate: 115200,
                    terminal: terminal,
                    romBaudrate: 115200,
                    enableTracing: false
                });
                state.esploader = esploader;

                // 5. Connect to bootloader (enters download mode, detects chip, uploads stub)
                setProgress(10, 'Entering bootloader...');
                logMessage('Connecting to ESP32 bootloader...', 'log-orange');
                var chipName = await esploader.main();
                logMessage('Chip detected: ' + chipName, 'log-green');
                showCheckedChip(chipName);

                // 6. Validate chip for known devices
                if (prepared.board || handheldBoard(state.device)) {
                    var chipLower = chipName.toLowerCase();
                    if (!chipLower.includes('esp32-s3') && !chipLower.includes('esp32s3')) {
                        throw new Error('Expected ESP32-S3 for ' + (prepared.boardLabel || DEVICES[prepared.board || state.device].name) + ', but detected ' + chipName + '. Please check your device.');
                    }
                    logMessage('Chip verified: ESP32-S3', 'log-green');
                }

                if (prepared.product === 'rsnode') {
                    var flashKiB = await esploader.getFlashSize();
                    var expectedKiB = prepared.flashOptions.flashSize === '8MB' ? 8192 : 16384;
                    if (flashKiB !== expectedKiB) {
                        throw new Error('Expected ' + prepared.flashOptions.flashSize + ' flash for ' + prepared.boardLabel +
                            ', but detected ' + (flashKiB ? (flashKiB / 1024) + 'MB' : 'an unknown size') + '. Check your board selection.');
                    }
                    logMessage('Flash capacity verified: ' + prepared.flashOptions.flashSize, 'log-green');
                }

                if (prepared.product === 'ratspeak-handheld') {
                    needsRnodeSetup = false;
                    setProgress(12, 'Checking installed firmware...');
                    prepared = await prepareHandheldInstall(esploader, prepared, logMessage, function(stage) { setProgress(12, stage); });
                    if (!prepared) {
                        try { await esploader.after('hard_reset'); } catch (e) { /* Manual restart remains available. */ }
                        await closeFlashTransport(transport);
                        state.transport = null;
                        state.esploader = null;
                        state.flashing = false;
                        setProgress(0, 'Cancelled. Nothing was written. Restart the device if needed.');
                        setFlashButtonIdleContent();
                        updateFlashBtn();
                        btn.focus();
                        return;
                    }
                    if (prepared.reconnect) {
                        await closeFlashTransport(transport);
                        transport = new esptool.Transport(state.port);
                        state.transport = transport;
                        esploader = new esptool.ESPLoader({ transport: transport, baudrate: 115200, romBaudrate: 115200, terminal: terminal });
                        state.esploader = esploader;
                        chipName = await esploader.main();
                        if (!/esp32-?s3/i.test(chipName) || await esploader.getFlashSize() !== (prepared.board === 'cardputer' ? 8192 : 16384)) {
                            throw new Error('Device changed or could not be reconnected. Nothing was written.');
                        }
                    }
                }

                // 7. Write flash — separate parts at individual addresses
                state.flashStage = 'writing';
                btn.textContent = 'Installing\u2026';
                updateFlashFlow();
                setProgress(15, 'Writing firmware...');
                var eraseBeforeFlash = shouldEraseBeforeFlash(prepared);
                if (prepared.installMode === 'factory') {
                    logMessage('Fresh install — resetting internal storage...', 'log-orange');
                } else if (eraseBeforeFlash) {
                    logMessage('Full erase enabled — wiping internal flash...', 'log-orange');
                }
                logMessage('Flashing ' + prepared.fileArray.length + ' part(s)...', '');
                var totalFlashBytes = prepared.fileArray.reduce(function(sum, part) { return sum + part.data.length; }, 0);

                if (prepared.fileArray.length) await esploader.writeFlash({
                    fileArray: prepared.fileArray,
                    flashSize: prepared.flashOptions.flashSize,
                    flashMode: prepared.flashOptions.flashMode,
                    flashFreq: prepared.flashOptions.flashFreq,
                    eraseAll: eraseBeforeFlash,
                    calculateMD5Hash: prepared.product === 'ratspeak-handheld'
                        ? function(data) { return bytesToHex(md5Bytes(Uint8Array.from(data, function(character) { return character.charCodeAt(0); }))); }
                        : undefined,
                    compress: true,
                    reportProgress: function(fileIndex, written, total) {
                        var completed = prepared.fileArray.slice(0, fileIndex).reduce(function(sum, part) { return sum + part.data.length; }, 0);
                        var pct = 15 + (completed + (written / total) * prepared.fileArray[fileIndex].data.length) / totalFlashBytes * 75;
                        setProgress(pct, 'Writing part ' + (fileIndex + 1) + '/' + prepared.fileArray.length + '...');
                    }
                });

                // 8. Reboot only when RNode provisioning needs the flashed firmware
                // running immediately. Otherwise leave reset/manual reconnect to the user.
                if (needsRnodeSetup) {
                    setProgress(92, 'Booting RNode firmware...');
                    logMessage('Restarting into RNode firmware for setup...', 'log-orange');
                    await esploader.after('hard_reset');
                } else {
                    setProgress(95, 'Flash written');
                }

                // 9. Disconnect transport
                try { await closeFlashTransport(transport); } catch(e) {}
                state.transport = null;
                state.esploader = null;
                if (needsRnodeSetup) await refreshRnodePortAfterReboot(logMessage);
            }

            // 10. (Optional) RNode EEPROM + firmware-hash provisioning
            if (needsRnodeSetup && shouldUseClickDrivenRnodeProvisioning()) {
                rnodeSetupIssue = 'Reset the board once, then finish RNode setup';
                rnodeSetupIssueKind = 'reconnect';
                logMessage('Firmware installed. ' + selectedRnodeLabel() + ' reboots into a newly enumerated serial port after DFU.', 'log-green');
                logMessage(rnodeActivationPortGuidance(), 'log-orange');
            } else if (needsRnodeSetup) {
                setProgress(94, 'Provisioning RNode EEPROM...');
                logMessage('Beginning RNode provisioning sequence...', 'log-orange');
                try {
                    rnodeProvisionResult = await runProvisioning(logMessage, setProgress);
                    if (!rnodeProvisionResult || !rnodeProvisionResult.firmwareHashWritten) {
                        throw new Error('RNode firmware hash was not written');
                    }
                    state.rnodeHostControlledMode = !!rnodeProvisionResult.normalModeSet;
                    setProgress(98, 'RNode setup verified');
                } catch (provErr) {
                    var setupError = provErr.message || String(provErr);
                    if (isRnodeReconnectSetupIssue(setupError)) {
                        rnodeSetupIssue = setupError;
                        rnodeSetupIssueKind = 'reconnect';
                        logMessage('Firmware installed. Reset the board, then click Finish Setup.', 'log-green');
                    } else {
                        rnodeSetupIssue = 'Provisioning failed: ' + setupError;
                        rnodeSetupIssueKind = 'provision';
                        logMessage(rnodeSetupIssue, 'log-red');
                        logMessage('Firmware was flashed; use RNode tools in Advanced options to retry setup if the device does not boot cleanly.', 'log-orange');
                    }
                }
            }

            if (rnodeSetupIssue) {
                state.rnodeSetupIssue = rnodeSetupIssue;
                state.rnodeSetupIssueKind = rnodeSetupIssueKind;
                if (rnodeSetupIssueKind === 'reconnect') {
                    setProgress(100, 'Firmware installed');
                } else {
                    setProgress(100, 'RNode setup needs attention');
                    logMessage('Firmware flash complete, but RNode setup needs attention.', 'log-orange');
                }
                showRnodeSetupWarning(rnodeSetupIssue, rnodeSetupIssueKind);
            } else if (needsRnodeSetup) {
                setProgress(100, 'RNode setup verified');
                logMessage('Firmware flash complete. RNode setup was verified; let the device finish rebooting before use.', 'log-green');
                rnodeSetupCompleted = true;
            } else {
                setProgress(100, 'Complete');
                logMessage(prepared && prepared.product === 'rsnode'
                    ? 'rsNode installed. Press RESET on the board.'
                    : (state.device === 'custom' ? 'Firmware flash complete.' : 'Ratspeak flash complete.') + ' Restart the device before using it.', 'log-green');
            }

            // 11. Hide flash button, show completion
            state.flashing = false;
            state.flashComplete = true;
            state.rnodeSetupVerified = rnodeSetupCompleted;
            btn.style.display = 'none';
            if (prepared && prepared.product === 'rsnode') showRsnodeRepeaterStep();
            if (state.rsnodeInstalled && rsnodeToolsUnlocked()) focusRsnodeRepeaterNotice();
            updateFlashFlow();
            if (rnodeSetupCompleted) showRnodeSetupComplete();

        } catch (err) {
            // Clean up transport/esploader on error
            if (state.transport) {
                try { await closeFlashTransport(state.transport); } catch(e) {}
                state.transport = null;
            }
            if (selectedFlashStrategy() === 'nrf52-dfu' && state.port) {
                try { await state.port.close(); } catch(e) {}
            }
            state.esploader = null;

            var errorMsg = err.message || String(err);

            // Provide specific messages for common failures
            if (errorMsg.includes('Failed to execute \'open\'') || errorMsg.includes('NetworkError')) {
                logMessage('Error: Could not open serial port. Is another program using it?', 'log-red');
            } else if (errorMsg.includes('Timeout') || errorMsg.includes('timeout')) {
                logMessage(state.device === 'm9'
                    ? 'Error: Bootloader connection timed out. Keep the M9 powered on, reconnect its USB data cable, select the USB serial port, and try again.'
                    : 'Error: Bootloader connection timed out. Try holding BOOT button while clicking Flash, then release.', 'log-red');
            } else if (errorMsg.includes('ESP32-S3') || errorMsg.includes('Expected')) {
                logMessage('Error: ' + errorMsg, 'log-red');
            } else if (errorMsg.includes('disconnect') || errorMsg.includes('device has been lost')) {
                logMessage('Error: Device disconnected during flash. Please reconnect and try again.', 'log-red');
            } else {
                logMessage('Error: ' + errorMsg, 'log-red');
            }

            showResult(false, errorMsg);
            document.getElementById('flashProgress').classList.remove('active');
            // Restore flash button for retry
            state.flashing = false;
            state.flashComplete = false;
            btn.style.display = '';
            setFlashButtonIdleContent();
            updateFlashBtn();
        }
    };

    function isRnodeReconnectSetupIssue(issue) {
        return /did not answer as RNode|did not return EEPROM data|serial port unavailable|could not open RNode serial|failed to execute 'open'|failed to open serial port|networkerror|device has been lost/i.test(issue || '');
    }

    function resetResultAction() {
        var actionsEl = document.getElementById('resultActions');
        var actionBtn = document.getElementById('resultActionBtn');
        if (actionsEl) actionsEl.hidden = true;
        if (actionBtn) {
            actionBtn.disabled = false;
            actionBtn.onclick = null;
        }
    }

    function configureResultAction(label, handler) {
        var actionsEl = document.getElementById('resultActions');
        var actionBtn = document.getElementById('resultActionBtn');
        var actionText = document.getElementById('resultActionText');
        if (!actionsEl || !actionBtn || !actionText) return;
        actionText.textContent = label;
        actionBtn.disabled = false;
        actionBtn.onclick = async function () {
            actionBtn.disabled = true;
            try {
                await handler();
            } finally {
                if (document.getElementById('flashResult').classList.contains('flash-result--continue')) {
                    actionBtn.disabled = false;
                }
            }
        };
        actionsEl.hidden = false;
    }

    function showRnodeSetupComplete() {
        state.flashing = false;
        state.flashComplete = true;
        state.rnodeSetupVerified = true;
        state.rnodeSetupIssue = null;
        state.rnodeSetupIssueKind = null;

        var resultEl = document.getElementById('flashResult');
        var iconEl = document.getElementById('resultIcon');
        var svgEl = document.getElementById('resultSvg');
        var titleEl = document.getElementById('resultTitle');
        var descEl = document.getElementById('resultDesc');

        resetResultAction();
        resultEl.classList.remove('flash-result--continue');
        resultEl.classList.add('active', 'flash-result--complete');
        iconEl.className = 'flash-result__icon flash-result__icon--success';
        svgEl.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
        titleEl.textContent = 'RNode Ready';
        descEl.textContent = '';
        updateFlashFlow();
    }

    function showResult(success, errorMessage) {
        state.flashing = false;

        var resultEl = document.getElementById('flashResult');
        var iconEl = document.getElementById('resultIcon');
        var svgEl = document.getElementById('resultSvg');
        var titleEl = document.getElementById('resultTitle');
        var descEl = document.getElementById('resultDesc');
        resetResultAction();
        resultEl.classList.remove('flash-result--continue', 'flash-result--complete');

        if (success) {
            // Success is handled inline (no result card needed)
            return;
        }

        var failure = describeFailure(errorMessage || '');
        state.failure = failure;
        iconEl.className = 'flash-result__icon flash-result__icon--error';
        svgEl.innerHTML = '<path d="M12 8v5"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/>';
        titleEl.textContent = failure.title;
        descEl.textContent = failure.cause;
        var fixes = document.getElementById('resultFixes');
        fixes.replaceChildren.apply(fixes, failure.fixes.map(function(text) {
            var item = document.createElement('li');
            item.textContent = text;
            return item;
        }));
        fixes.hidden = !failure.fixes.length;
        document.getElementById('resultPort').hidden = failure.step !== 'connect';
        document.getElementById('resultRecovery').hidden = false;
        var log = document.getElementById('progressLog');
        document.getElementById('resultLog').textContent = 'Error: ' + (errorMessage || 'unknown') + (log && log.textContent ? '\n\n' + Array.from(log.children, function(line) { return line.textContent; }).join('\n') : '');
        document.getElementById('resultCopied').textContent = '';
        var tech = document.getElementById('resultTech');
        tech.open = false;
        tech.hidden = false;
        resultEl.classList.add('active', 'flash-result--error');
        titleEl.focus({ preventScroll: true });
        resultEl.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }

    // One failure, one plain cause, ordered fixes. The raw error stays in Technical details.
    function describeFailure(message) {
        var name = state.device && DEVICES[state.device] && state.device !== 'custom' ? DEVICES[state.device].name : 'board';
        var the = state.device === 'custom' ? 'the board' : 'the ' + name;
        var bootTip = DOWNLOAD_MODE[state.device] || DOWNLOAD_MODE.custom;
        var cable = 'Use a USB cable that carries data, plugged straight into the computer.';
        if (/failed to execute 'open'|failed to open serial port|networkerror|access denied|port is already open/i.test(message)) {
            return { step: 'connect', title: 'The USB port is busy',
                cause: 'Your browser found ' + the + ' but couldn\u2019t open its connection. Another app is probably using it.',
                fixes: ['Close other apps that use the port: the Ratspeak app, a serial monitor, or another tab with this page.',
                    'Unplug ' + the + ', plug it back in, then choose the port again.', cable] };
        }
        if (/timeout|timed out|failed to connect|wrong boot mode|no serial data|invalid head|couldn't sync|could not sync/i.test(message)) {
            return { step: 'connect', title: (state.device === 'custom' ? 'The board' : 'The ' + name) + ' didn\u2019t answer',
                cause: 'The port opened, but the device didn\u2019t respond to the installer.',
                fixes: [bootTip, 'Choose the port again; it can change in download mode.', cable] };
        }
        if (/expected esp32|detected|flash capacity|different handheld|board selection|device selection/i.test(message)) {
            return { step: 'connect', title: 'This doesn\u2019t look like ' + (state.device === 'custom' ? 'the board you chose' : 'a ' + name),
                cause: 'The connected device doesn\u2019t match what you picked.',
                fixes: ['Check that you chose the right port.', state.device === 'custom' ? 'Check the board you chose.' : 'Go back to all devices and pick the one you\u2019re installing.'] };
        }
        if (/disconnect|device has been lost|been lost|changed or could not be reconnected/i.test(message)) {
            return { step: 'install', title: 'The connection dropped',
                cause: 'The device stopped answering partway through.',
                fixes: ['Keep the cable connected and the device switched on until the install finishes.', 'Unplug it, plug it back in, then choose the port again.', cable] };
        }
        if (/sha-256|download|firmware does not match|release metadata|manifest/i.test(message)) {
            return { step: 'install', title: 'The firmware didn\u2019t check out',
                cause: 'The downloaded firmware failed its integrity check.',
                fixes: ['Check your internet connection.', 'Try again; the installer downloads a fresh copy.'] };
        }
        if (/beta access expired/i.test(message)) {
            return { step: 'install', title: 'Your beta access expired', cause: 'Unlock the rsNode beta again, then install.', fixes: [] };
        }
        return { step: 'install', title: 'The install stopped',
            cause: 'Something went wrong while talking to the device.',
            fixes: ['Unplug the device, plug it back in, then choose the port again.', bootTip, cable] };
    }

    function clearRecovery() {
        state.failure = null;
        var result = document.getElementById('flashResult');
        if (result) result.classList.remove('flash-result--error');
        ['resultFixes', 'resultRecovery', 'resultTech'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.hidden = true;
        });
        var primary = document.querySelector('.flash-primary-action');
        if (primary) primary.hidden = false;
    }

    document.getElementById('resultRetry').addEventListener('click', function() {
        if (state.flashing) return;
        document.getElementById('flashResult').classList.remove('active');
        clearRecovery();
        updateFlashBtn();
        if (state.firmwareError && state.device !== 'custom') {
            fetchFirmwareFromRelease(DEVICES[state.device]);
            return;
        }
        window.startFlash();
    });
    document.getElementById('resultPort').addEventListener('click', function() {
        if (state.flashing) return;
        document.getElementById('flashResult').classList.remove('active');
        clearRecovery();
        window.connectDevice();
    });
    document.getElementById('resultCopy').addEventListener('click', async function() {
        var note = document.getElementById('resultCopied');
        try {
            await navigator.clipboard.writeText(document.getElementById('resultLog').textContent);
            note.textContent = 'Copied';
        } catch (error) {
            var range = document.createRange();
            range.selectNodeContents(document.getElementById('resultLog'));
            var selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            note.textContent = 'Selected. Press Ctrl+C or \u2318C to copy.';
        }
    });
    var firmwareRetry = document.getElementById('firmwareRetry');
    if (firmwareRetry) firmwareRetry.addEventListener('click', function() {
        if (!state.flashing && state.device && state.device !== 'custom') fetchFirmwareFromRelease(DEVICES[state.device]);
    });

    function showRnodeSetupWarning(issue, kind) {
        var resultEl = document.getElementById('flashResult');
        var iconEl = document.getElementById('resultIcon');
        var svgEl = document.getElementById('resultSvg');
        var titleEl = document.getElementById('resultTitle');
        var descEl = document.getElementById('resultDesc');
        var needsReconnect = kind === 'reconnect' || isRnodeReconnectSetupIssue(issue);

        resetResultAction();
        resultEl.classList.remove('flash-result--continue', 'flash-result--complete');
        iconEl.className = needsReconnect
            ? 'flash-result__icon'
            : 'flash-result__icon flash-result__icon--warning';
        svgEl.innerHTML = needsReconnect
            ? '<path d="M8 3v4"/><path d="M16 3v4"/><path d="M6 7h12v4a6 6 0 0 1-12 0V7Z"/><path d="M12 17v4"/><path d="M9 21h6"/>'
            : '<path d="M12 8v5"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/>';
        titleEl.textContent = needsReconnect ? 'Firmware installed' : 'Firmware installed, RNode setup needs attention';
        descEl.textContent = needsReconnect
            ? rnodeActivationPortGuidance()
            : 'Firmware was written, but RNode setup did not finish. Use RNode tools below to retry setup if the device does not boot cleanly. Last error: ' + issue;
        if (needsReconnect) {
            resultEl.classList.add('flash-result--continue');
            configureResultAction('Finish Setup', runReprovisionOnly);
        }
        resultEl.classList.add('active');
    }

    window.resetFlash = function() {
        clearRecovery();
        document.getElementById('flashProgress').classList.remove('active');
        document.getElementById('flashResult').classList.remove('active', 'flash-result--continue', 'flash-result--complete');
        resetResultAction();
        document.getElementById('progressBar').style.width = '0%';
        document.getElementById('progressLog').innerHTML = '';

        state.flashing = false;
        state.flashComplete = false;
        state.rnodeSetupIssue = null;
        state.rnodeSetupIssueKind = null;
        state.rnodeHostControlledMode = false;
        state.transport = null;
        state.esploader = null;
        // Keep state.port valid for re-flash
        var btn = document.getElementById('flashBtn');
        btn.style.display = '';
        setFlashButtonIdleContent();
        updateFlashBtn();
    };

    // ── Intersection Observer for fade-in ──────────────
    var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in').forEach(function(el) {
        observer.observe(el);
    });

    // ── Deep-link / refresh restore via ?device=… ─────
    function applyDeviceFromUrl(opts) {
        opts = opts || {};
        var deviceId = null, packageId = null;
        try {
            var here = new URL(window.location.href);
            deviceId = here.searchParams.get('device');
            packageId = here.searchParams.get('package');
        } catch (e) { return; }
        // flash.html is the advanced flasher and nothing else; download.html never hosts it.
        if (ADVANCED) deviceId = 'custom';
        else if (deviceId === 'custom') deviceId = null;

        if (deviceId && DEVICES[deviceId]) {
            if (state.device !== deviceId) {
                window.selectDevice(deviceId, { pushHistory: false, skipAnimation: opts.skipAnimation, package: packageId });
            }
        } else {
            if (deviceId) {
                try {
                    var u = new URL(window.location.href);
                    u.searchParams.delete('device');
                    history.replaceState({}, '', u);
                } catch (e) { /* ignore */ }
            }
            if (state.device) window.goBack({ pushHistory: false });
        }
    }

    window.addEventListener('popstate', function() { applyDeviceFromUrl(); });
    applyDeviceFromUrl({ skipAnimation: true });

})();
