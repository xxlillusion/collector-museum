// Shared price display for inventory sale metadata (0005). Prices are
// entered and shown in USD for now — a per-vendor currency is future work.
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** "$1,200" / "$4.50" */
export function formatPrice(price: number): string {
  return usd.format(price);
}
