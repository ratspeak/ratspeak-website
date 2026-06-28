const MAP_TTL_SECONDS = 15 * 60;

const SOURCES = [
  {
    id: 'ratspeak-tcp-preview',
    label: 'Ratspeak TCP server ingest',
    kind: 'server-observed',
    trust: 'operator',
    description: 'Future path for public, discoverable interfaces heard by Ratspeak-operated TCP servers.'
  },
  {
    id: 'manual-preview',
    label: 'Manual client queue',
    kind: 'manual',
    trust: 'self-reported',
    description: 'Future opt-in path for people who want a regional presence without live GPS broadcast.'
  },
  {
    id: 'maps-lab',
    label: 'Maps lab seed data',
    kind: 'sample',
    trust: 'design-only',
    description: 'Exploratory records used to exercise rendering, filters, freshness, and details.'
  }
];

const NODE_TEMPLATES = [
  {
    id: 'operator-ruby-preview',
    label: 'Ruby TCP server',
    kind: 'server',
    status: 'available',
    sourceId: 'ratspeak-tcp-preview',
    sourceMode: 'sample',
    lastSeenOffsetMinutes: 4,
    firstSeenOffsetDays: 18,
    location: {
      lat: 39.5,
      lon: -98.35,
      precisionKm: 1800
    },
    services: ['rns.transport', 'tcp.server'],
    verification: 'operator',
    privacy: {
      consent: 'operator-published',
      precision: 'regional-placeholder'
    },
    reticulum: {
      interfaceType: 'TCPServerInterface',
      transportId: 'ruby-preview-transport',
      networkId: 'preview:na-server',
      hops: 0,
      stampValue: 8,
      heardCount: 42,
      reachableOn: 'Ruby server label',
      port: null,
      heightMeters: 0
    }
  },
  {
    id: 'operator-emerald-preview',
    label: 'Emerald I2P server',
    kind: 'server',
    status: 'recent',
    sourceId: 'ratspeak-tcp-preview',
    sourceMode: 'sample',
    lastSeenOffsetMinutes: 18,
    firstSeenOffsetDays: 16,
    location: {
      lat: 51.0,
      lon: 10.5,
      precisionKm: 1700
    },
    services: ['rns.transport', 'i2p.server'],
    verification: 'operator',
    privacy: {
      consent: 'operator-published',
      precision: 'regional-placeholder'
    },
    reticulum: {
      interfaceType: 'I2PInterface',
      transportId: 'emerald-preview-transport',
      networkId: 'preview:eu-i2p',
      hops: 0,
      stampValue: 8,
      heardCount: 37,
      reachableOn: 'Emerald I2P label',
      port: null,
      heightMeters: 0
    }
  },
  {
    id: 'operator-diamond-preview',
    label: 'Diamond TCP server',
    kind: 'server',
    status: 'unknown',
    sourceId: 'ratspeak-tcp-preview',
    sourceMode: 'sample',
    lastSeenOffsetMinutes: 54,
    firstSeenOffsetDays: 13,
    location: {
      lat: 1.3,
      lon: 103.8,
      precisionKm: 2200
    },
    services: ['rns.transport', 'tcp.server'],
    verification: 'operator',
    privacy: {
      consent: 'operator-published',
      precision: 'regional-placeholder'
    },
    reticulum: {
      interfaceType: 'TCPServerInterface',
      transportId: 'diamond-preview-transport',
      networkId: 'preview:apac-server',
      hops: 0,
      stampValue: 8,
      heardCount: 29,
      reachableOn: 'Diamond server label',
      port: null,
      heightMeters: 0
    }
  },
  {
    id: 'disc-front-range-lora',
    label: 'Front Range LoRa gateway',
    kind: 'client-auto',
    status: 'available',
    sourceId: 'ratspeak-tcp-preview',
    sourceMode: 'sample',
    lastSeenOffsetMinutes: 9,
    firstSeenOffsetDays: 7,
    location: {
      lat: 39.73,
      lon: -105.28,
      precisionKm: 14
    },
    services: ['rns.transport', 'lora.mesh'],
    verification: 'server-observed',
    privacy: {
      consent: 'public-discovery',
      precision: 'approximate'
    },
    reticulum: {
      interfaceType: 'RNodeInterface',
      transportId: 'sample-front-range-rnode',
      networkId: 'preview:front-range',
      hops: 2,
      stampValue: 4,
      heardCount: 19,
      reachableOn: null,
      port: null,
      heightMeters: 1880,
      radio: {
        frequency: '915 MHz',
        bandwidth: '125 kHz',
        spreadingFactor: 7,
        codingRate: '4/5'
      }
    }
  },
  {
    id: 'disc-puget-sound-mesh',
    label: 'Puget Sound mesh node',
    kind: 'client-auto',
    status: 'stale',
    sourceId: 'ratspeak-tcp-preview',
    sourceMode: 'sample',
    lastSeenOffsetMinutes: 510,
    firstSeenOffsetDays: 5,
    location: {
      lat: 47.62,
      lon: -122.33,
      precisionKm: 32
    },
    services: ['rns.transport', 'lxmf.delivery'],
    verification: 'server-observed',
    privacy: {
      consent: 'public-discovery',
      precision: 'approximate'
    },
    reticulum: {
      interfaceType: 'AutoInterface',
      transportId: 'sample-puget-auto',
      networkId: 'preview:puget-mesh',
      hops: 3,
      stampValue: 2,
      heardCount: 6,
      reachableOn: null,
      port: null,
      heightMeters: 80
    }
  },
  {
    id: 'manual-sierra-foothills',
    label: 'Sierra foothills listing',
    kind: 'client-manual',
    status: 'unverified',
    sourceId: 'manual-preview',
    sourceMode: 'sample',
    lastSeenOffsetMinutes: null,
    firstSeenOffsetDays: 2,
    location: {
      lat: 38.58,
      lon: -120.72,
      precisionKm: 46
    },
    services: ['manual.presence'],
    verification: 'manual-pending',
    privacy: {
      consent: 'manual-opt-in',
      precision: 'regional'
    },
    reticulum: null
  },
  {
    id: 'manual-wasatch-field-kit',
    label: 'Wasatch field kit',
    kind: 'client-manual',
    status: 'recent',
    sourceId: 'manual-preview',
    sourceMode: 'sample',
    lastSeenOffsetMinutes: 96,
    firstSeenOffsetDays: 4,
    location: {
      lat: 40.76,
      lon: -111.89,
      precisionKm: 85
    },
    services: ['ratspeak.client', 'lxmf.delivery'],
    verification: 'manual-pending',
    privacy: {
      consent: 'manual-opt-in',
      precision: 'regional'
    },
    reticulum: {
      interfaceType: 'Ratspeak client',
      transportId: null,
      networkId: 'preview:wasatch-client',
      hops: null,
      stampValue: null,
      heardCount: null,
      reachableOn: null,
      port: null,
      heightMeters: null
    }
  }
];

export function buildMapSnapshot(nowInput = new Date()) {
  const now = new Date(nowInput);
  const generatedAt = now.toISOString();
  const nodes = NODE_TEMPLATES.map((node) => ({
    ...node,
    lastSeen: node.lastSeenOffsetMinutes == null
      ? null
      : offsetMinutes(now, node.lastSeenOffsetMinutes),
    firstSeen: offsetDays(now, node.firstSeenOffsetDays)
  })).map(({ lastSeenOffsetMinutes, firstSeenOffsetDays, ...node }) => node);

  return {
    schemaVersion: 1,
    sourceMode: 'exploratory-sample',
    generatedAt,
    ttlSeconds: MAP_TTL_SECONDS,
    disclaimer: 'Sample data for Ratspeak Maps design work. These records are not live network telemetry.',
    sources: SOURCES,
    nodes
  };
}

export const MAP_SNAPSHOT = buildMapSnapshot(new Date());

function offsetMinutes(now, minutes) {
  return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
}

function offsetDays(now, days) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
