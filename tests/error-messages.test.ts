import { expect, it } from 'vitest';
import {
  apiErrorMessage,
  serviceError,
  userBalanceError,
  videoModerationError,
} from '../src/lib/errorMessages';
it('explains the confirmed video moderation refusal without exposing arbitrary vendor details', () => {
  expect(
    apiErrorMessage(
      {
        code: 'AI_VENDOR_ERROR',
        message: 'AiVendorError',
        details: 'Generated video rejected by content moderation.',
      },
      400,
    ),
  ).toBe(videoModerationError);
  expect(apiErrorMessage({ code: 'AI_VENDOR_ERROR', details: 'OpenRouter insufficient funds' }, 400)).toBe(
    serviceError,
  );
  expect(apiErrorMessage({ code: 'AI_VENDOR_ERROR', details: { private: 'upstream data' } }, 400)).toBe(
    serviceError,
  );
});
it('only identifies application balance by its explicit code', () => {
  expect(apiErrorMessage({ code: 'INSUFFICIENT_FUNDS', message: 'InsufficientFundsError' }, 402)).toBe(
    userBalanceError,
  );
  expect(apiErrorMessage({ message: 'InsufficientFundsError' }, 400)).toBe(serviceError);
});
it('reads the saved moderation error without requiring raw provider details', () => {
  expect(
    apiErrorMessage(
      { code: 'AI_VENDOR_ERROR', message: 'Generated video rejected by content moderation.' },
      400,
    ),
  ).toBe(videoModerationError);
  expect(apiErrorMessage({ code: 'AI_VENDOR_ERROR', message: 'OpenRouter insufficient funds' }, 400)).toBe(
    serviceError,
  );
});
it('hides provider balance and internal failures', () => {
  for (const data of [
    { code: 'AI_VENDOR_ERROR', message: 'OpenRouter balance empty' },
    { message: 'OpenAI insufficient_quota' },
    { message: 'Insufficient credits at OpenRouter' },
    { message: 'billing_hard_limit_reached' },
  ])
    expect(apiErrorMessage(data, 400)).toBe(serviceError);
  expect(apiErrorMessage({ message: 'private upstream details' }, 502)).toBe(serviceError);
  expect(apiErrorMessage({ message: 'need more money' }, 402)).toBe(serviceError);
});
it('preserves actionable non-financial client errors', () => {
  expect(apiErrorMessage({ message: 'Выберите файл MP4' }, 400)).toBe('Выберите файл MP4');
});
