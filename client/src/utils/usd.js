// Format a BTC amount as USD using current price
export function btcToUsd(btc, btcPrice) {
  if (!btcPrice || btc == null) return null;
  return parseFloat(btc) * btcPrice;
}

export function fmtUsd(usd, opts = {}) {
  if (usd == null || isNaN(usd)) return '—';
  const abs = Math.abs(usd);
  const sign = usd < 0 ? '-' : opts.showPlus && usd > 0 ? '+' : '';
  if (abs >= 1000) return `${sign}$${Math.round(abs).toLocaleString()}`;
  if (abs >= 1)    return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toFixed(2)}`;
}

// Convert BTC balance to formatted USD string
export function balanceUsd(btc, btcPrice) {
  const usd = btcToUsd(btc, btcPrice);
  return usd != null ? fmtUsd(usd) : null;
}

export function formatCasinoBalance(user, currency) {
  if (currency === 'btc') {
    return `${Number(user?.balanceBtc || 0).toFixed(8)} BTC`;
  }
  return Number(user?.balancePlay || 0).toLocaleString();
}
