// Shared wallet layer for the holder portal (extracted from portal.html so the
// Voting and Identity tabs use one AppKit instance). Exposes connect state,
// account change notifications, and EIP-712 signing on Base.
const PROJECT_ID = 'bd455db9c9bb0f7804164eb260a9fd47';
const RATSPEAK_ORIGIN = 'https://ratspeak.org';
const APPKIT_CDN_URL = 'https://cdn.jsdelivr.net/npm/@reown/appkit-cdn@1.8.19/dist/appkit.js';
const BASE_CHAIN = {
  id: 8453,
  name: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://mainnet.base.org'] } },
  blockExplorers: { default: { name: 'BaseScan', url: 'https://basescan.org' } }
};

let appKitStatePromise = null;
let appKitState = null;
let account = null;
const listeners = new Set();

export function currentAccount() {
  return account;
}

// cb fires immediately with the current account and again on every change.
export function onAccountChange(cb) {
  listeners.add(cb);
  cb(account);
  return () => listeners.delete(cb);
}

function setAccount(next) {
  if (next === account) return;
  account = next;
  for (const cb of listeners) {
    try { cb(account); } catch (err) { console.warn(err); }
  }
}

function appMetadataUrl() {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return window.location.origin;
  return RATSPEAK_ORIGIN;
}

export async function initWallet() {
  if (appKitStatePromise) return appKitStatePromise;
  appKitStatePromise = createAppKitState();
  return appKitStatePromise;
}

async function createAppKitState() {
  const appkitMod = await import(APPKIT_CDN_URL);

  const network = appkitMod.networks.base || BASE_CHAIN;
  const networks = [network];
  const wagmiAdapter = new appkitMod.WagmiAdapter({ projectId: PROJECT_ID, networks });
  const modal = appkitMod.createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId: PROJECT_ID,
    metadata: {
      name: 'Ratspeak Holder Portal',
      description: 'Ratspeak token holder portal on Base.',
      url: appMetadataUrl(),
      icons: [new URL('favicon-32x32.png', `${appMetadataUrl()}/`).href]
    },
    themeMode: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
    features: { analytics: false, email: false, socials: [] }
  });

  await appkitMod.WagmiCore.reconnect?.(wagmiAdapter.wagmiConfig);
  appKitState = {
    modal,
    wagmiConfig: wagmiAdapter.wagmiConfig,
    wagmi: appkitMod.WagmiCore,
    network
  };

  const current = appkitMod.WagmiCore.getAccount(wagmiAdapter.wagmiConfig);
  if (isConnectedAccount(current)) setAccount(normalizeWalletAccount(current.address || ''));

  appkitMod.WagmiCore.watchAccount(wagmiAdapter.wagmiConfig, {
    onChange(next) {
      setAccount(isConnectedAccount(next) ? normalizeWalletAccount(next.address || '') : null);
    }
  });

  return appKitState;
}

export async function connectWallet() {
  const state = await initWallet();

  const current = state.wagmi.getAccount(state.wagmiConfig);
  if (isConnectedAccount(current)) {
    setAccount(normalizeWalletAccount(current.address || ''));
    await ensureBase(state, current.chainId);
    return account;
  }

  const connected = waitForConnectedAccount(state);
  await Promise.resolve(state.modal.open({ view: 'Connect' }));
  const next = await connected;
  setAccount(normalizeWalletAccount(next.address || ''));
  await ensureBase(state, next.chainId);
  return account;
}

export async function signTypedData({ domain, types, primaryType, message }) {
  const state = await initWallet();
  if (!account) throw new Error('No wallet connected');
  const current = state.wagmi.getAccount(state.wagmiConfig);
  await ensureBase(state, current.chainId);
  if (typeof state.wagmi.signTypedData !== 'function') {
    throw new Error('Wallet signing is unavailable in this browser.');
  }
  return state.wagmi.signTypedData(state.wagmiConfig, {
    account,
    domain,
    types,
    primaryType,
    message
  });
}

async function ensureBase(state, chainId) {
  if (chainId !== undefined && chainId !== 8453) {
    await state.wagmi.switchChain?.(state.wagmiConfig, { chainId: 8453 });
  }
}

function waitForConnectedAccount(state) {
  return new Promise((resolve, reject) => {
    let cleanup = function () {};
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for wallet connection'));
    }, 120000);
    cleanup = state.wagmi.watchAccount(state.wagmiConfig, {
      onChange(next) {
        if (!isConnectedAccount(next)) return;
        window.clearTimeout(timeout);
        cleanup();
        resolve(next);
      }
    });
  });
}

function isConnectedAccount(next) {
  return Boolean(next && next.isConnected && next.address);
}

function normalizeWalletAccount(value) {
  const raw = String(value || '');
  const address = raw.includes(':') ? raw.split(':').at(-1) : raw;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('WalletConnect returned an invalid account: ' + value);
  }
  return address;
}
