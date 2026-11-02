import { describe, expect, it } from 'vitest';
import {
  breakdown,
  direction,
  transactionAmount,
  conversationLink,
} from '../src/features/account/transactions';
import type { IPaymentTransaction } from '../src/lib/types';
const payment: IPaymentTransaction = {
  id: 242,
  type: 'TASK_PURCHASE',
  userId: 7,
  coinId: 'RUB',
  amount: '965.16',
  debet: 'CO-00',
  credit: 'PR-00',
  createdDate: '2026-11-02T07:04:00Z',
  details: {
    model: 'OPEN_AI_CONVERSATION',
    source: { type: 'CONVERSATION', id: 49 },
    amounts: [{ amount: '0.096516', coinId: 'USD' }],
    rates: [{ from: 'USD', to: 'RUB', value: '100' }],
    consumption: {
      model: { input: 5651, output: 252 },
      tools: [{ type: 'IMAGE', status: 'FINAL', amounts: [{ amount: '0.08219', coinId: 'USD' }] }],
    },
  },
};
describe('balance amounts and attribution', () => {
  it('keeps every decimal digit in exact amounts and rounds only the summary', () => {
    expect(transactionAmount('965.16', 'RUB', true)).toBe('9,6516 ₽');
    expect(transactionAmount('965.16', 'RUB')).toBe('9,65 ₽');
    expect(transactionAmount('0.000000000001', 'RUB', true)).toBe('0,00000000000001 ₽');
    expect(transactionAmount('0.000000000001', 'RUB')).toBe('< 0,01 ₽');
    expect(transactionAmount('900719925474099100', 'RUB', true).replace(/\s/g, '')).toBe(
      '9007199254740991,00₽',
    );
    expect(transactionAmount('100.5', 'RUB')).toBe('1,01 ₽');
  });
  it('separates the actual image cost and assistant cost using the recorded exchange rate', () => {
    expect(breakdown(payment)).toEqual([
      { label: 'Ассистент', amount: '143.26' },
      { label: 'Изображение', amount: '821.9' },
    ]);
    expect(conversationLink(payment)).toBe('/image?conversation=49');
    expect(direction(payment)).toBe('expense');
    expect(direction({ ...payment, debet: 'PR-00', credit: 'CO-00' })).toBe('income');
    expect(direction({ ...payment, credit: 'GR-00' })).toBe('other');
  });
  it('does not invent a breakdown for missing rates, pending tool cost or a mismatched total', () => {
    expect(breakdown({ ...payment, details: { ...payment.details, rates: [] } })).toBeUndefined();
    expect(breakdown({ ...payment, amount: '1000' })).toBeUndefined();
    expect(
      breakdown({
        ...payment,
        details: {
          ...payment.details,
          consumption: { tools: [{ type: 'IMAGE', status: 'PENDING', amounts: [] }] },
        },
      }),
    ).toBeUndefined();
  });
  it('never guesses a conversation from a transaction id or another source type', () => {
    expect(conversationLink({ ...payment, details: {} })).toBeUndefined();
    expect(conversationLink({ ...payment, details: { source: { type: 'FILE', id: 49 } } })).toBeUndefined();
  });
});
