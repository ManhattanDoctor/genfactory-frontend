import { expect, it } from 'vitest';
import { formatBalance } from '../src/lib/money';
it('converts gnosis balances from minor units rather than displaying 100x the balance', () => {
  expect(formatBalance('1250.50', 'RUB')).toBe('12,51');
  expect(formatBalance('915.1785', 'RUB')).toBe('9,15');
  expect(formatBalance('100', 'USD')).toBe('1,00');
  expect(formatBalance('0', 'RUB')).toBe('0,00');
});
it('does not invent a scale for unsupported currencies or missing balances', () => {
  expect(formatBalance('123.45', 'OTHER')).toBe('123.45');
  expect(formatBalance(undefined, 'RUB')).toBe('—');
  expect(formatBalance('invalid', 'RUB')).toBe('—');
});
