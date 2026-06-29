export function isYggdrasilAddress(value) {
  let address = stringValue(value).toLowerCase();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(address);
  if (bracketed) address = bracketed[1];
  address = address.split('%', 1)[0];

  if (!address.includes(':')) return false;

  const firstHextet = address.split(':', 1)[0];
  if (!/^[0-9a-f]{1,4}$/.test(firstHextet)) return false;

  const number = Number.parseInt(firstHextet, 16);
  return number >= 0x0200 && number <= 0x03ff;
}

export function isIpv6Address(value) {
  let address = stringValue(value).toLowerCase();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(address);
  if (bracketed) address = bracketed[1];
  address = address.split('%', 1)[0];

  if (!address.includes(':')) return false;
  if (!/^[0-9a-f:.]+$/.test(address)) return false;

  const doubleColonMatches = address.match(/::/g) || [];
  if (doubleColonMatches.length > 1) return false;

  const parts = address.split(':').filter(Boolean);
  if (parts.length < 2 || parts.length > 8) return false;

  return parts.every((part) => {
    if (part.includes('.')) return /^\d{1,3}(\.\d{1,3}){3}$/.test(part);
    return /^[0-9a-f]{1,4}$/.test(part);
  });
}

export function textMentionsYggdrasil(...values) {
  const text = values.map(stringValue).filter(Boolean).join(' ').toLowerCase();
  if (!text) return false;
  return text.includes('yggdrasil') || /(^|[^a-z0-9])ygg([^a-z0-9]|$)/i.test(text);
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}
