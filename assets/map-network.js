export function isYggdrasilAddress(value) {
  const address = stringValue(value).toLowerCase();
  if (!address.includes(':')) return false;

  const firstHextet = address.split(':', 1)[0];
  if (!/^[0-9a-f]{1,4}$/.test(firstHextet)) return false;

  const number = Number.parseInt(firstHextet, 16);
  return number >= 0x0200 && number <= 0x03ff;
}

export function textMentionsYggdrasil(...values) {
  const text = values.map(stringValue).filter(Boolean).join(' ').toLowerCase();
  if (!text) return false;
  return text.includes('yggdrasil') || /(^|[^a-z0-9])ygg([^a-z0-9]|$)/i.test(text);
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}
