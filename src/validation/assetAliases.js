// Canonical tickers the service accepts, with common name/symbol aliases.
// Extend this list as new assets are onboarded.
const KNOWN_ASSETS = new Set([
  'BTC',
  'ETH',
  'SOL',
  'USDT',
  'USDC',
  'MATIC',
  'LINK',
  'ADA',
  'DOT',
  'AVAX',
  'DOGE',
  'XRP',
]);

const ALIASES = {
  bitcoin: 'BTC',
  xbt: 'BTC',
  ethereum: 'ETH',
  ether: 'ETH',
  solana: 'SOL',
  tether: 'USDT',
  'usd-tether': 'USDT',
  usdcoin: 'USDC',
  'usd-coin': 'USDC',
  polygon: 'MATIC',
  chainlink: 'LINK',
  cardano: 'ADA',
  polkadot: 'DOT',
  avalanche: 'AVAX',
  dogecoin: 'DOGE',
  ripple: 'XRP',
};

function normalizeAsset(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  return trimmed.toUpperCase();
}

module.exports = { KNOWN_ASSETS, ALIASES, normalizeAsset };
