// Gnosis account balances and payment transactions are in minor currency units.
// Provider cost amounts use major units and must not use this formatter.
export function formatBalance(amount: string | undefined, currency: string): string {
  if (amount === undefined) return '—';
  if (!['RUB', 'USD'].includes(currency)) return amount;
  const value = Number(amount);
  return Number.isFinite(value)
    ? new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        value / 100,
      )
    : '—';
}
