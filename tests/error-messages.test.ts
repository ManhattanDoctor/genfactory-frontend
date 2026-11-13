import { expect, it } from 'vitest';
import {
  apiErrorMessage,
  serviceError,
  userBalanceError,
  videoModerationError,
} from '../src/lib/errorMessages';

it('localizes language-independent backend error codes', () => {
  for (const code of [
    'FILE_AMOUNT_EXCEED',
    'FILE_MIME_INVALID',
    'FILE_SIZE_INVALID',
    'AI_MODEL_NOT_SUPPORT_FILE',
    'AI_TASK_ABORTED',
  ]) {
    const message = apiErrorMessage({ code, message: code }, 403);
    expect(message).not.toContain(code);
    expect(message).toMatch(/[А-Яа-я]/);
  }
  expect(apiErrorMessage({ code: 'REQUEST_INVALID', message: 'REQUEST_INVALID' }, 400)).toBe(serviceError);
  expect(apiErrorMessage({ code: 'AI_VENDOR_ERROR', message: 'AI_VENDOR_ERROR' }, 400)).toBe(serviceError);
});

it('explains confirmed moderation for HTTP, socket and persisted conversation errors', () => {
  for (const data of [
    {
      code: 'AI_VENDOR_ERROR',
      message: 'AiVendorError',
      details: 'Generated video rejected by content moderation.',
    },
    { code: 'AI_VENDOR_ERROR', message: 'Generated video rejected by content moderation.' },
    { code: 'AI_VENDOR_ERROR', message: 'HTTP 400: Generated video rejected by content moderation.' },
  ])
    expect(apiErrorMessage(data, 400)).toBe(videoModerationError);
});
it('distinguishes provider credit failures from the application balance and keeps their reason', () => {
  expect(apiErrorMessage({ code: 'INSUFFICIENT_FUNDS' }, 402)).toBe(userBalanceError);
  for (const key of ['details', 'message']) {
    const message = apiErrorMessage({ code: 'AI_VENDOR_ERROR', [key]: 'OpenRouter insufficient funds' }, 402);
    expect(message).toContain('На стороне провайдера исчерпаны средства или лимит');
    expect(message).toContain('HTTP 402');
    expect(message).toContain('Причина: OpenRouter insufficient funds');
    expect(message).not.toContain('Пополните баланс');
  }
});
it('preserves the original image refusal, HTTP status and request ID', () => {
  const message = apiErrorMessage(
    { code: 'AI_VENDOR_ERROR', details: 'Unsupported aspect ratio for this model\nRequest ID: req-123' },
    400,
  );
  expect(message).toContain('Провайдер отклонил запрос. HTTP 400.');
  expect(message).toContain('Unsupported aspect ratio for this model');
  expect(message).toContain('Request ID: req-123');
});
it('uses the provider status saved in the conversation instead of the default status', () => {
  const message = apiErrorMessage({ code: 'AI_VENDOR_ERROR', message: 'HTTP 429: Rate limit exceeded' }, 400);
  expect(message).toContain('частоту запросов');
  expect(message).toContain('HTTP 429');
  expect(message).toContain('Rate limit exceeded');
});
it.each([
  [403, 'доступе к модели'],
  [504, 'время ожидания'],
  [503, 'Ошибка на стороне провайдера'],
])('explains provider HTTP %s without inventing its cause', (status, explanation) => {
  const message = apiErrorMessage({ code: 'AI_VENDOR_ERROR', details: 'upstream refusal' }, status);
  expect(message).toContain(explanation);
  expect(message).toContain('upstream refusal');
});
it('redacts credentials and signed URLs from older server errors', () => {
  const message = apiErrorMessage(
    {
      code: 'AI_VENDOR_ERROR',
      details:
        'Unsupported size. api_key="private-key" Bearer private-bearer https://example.test?X-Amz-Signature=private-signature',
    },
    400,
  );
  expect(message).toContain('Unsupported size');
  expect(message).not.toMatch(/private-key|private-bearer|private-signature/);
});
it('does not render arbitrary objects or class names as the provider reason', () => {
  for (const data of [
    { code: 'AI_VENDOR_ERROR', details: { private: 'payload' } },
    { code: 'AI_VENDOR_ERROR', message: 'AiVendorError' },
  ]) {
    const message = apiErrorMessage(data, 400);
    expect(message).toContain('не передал подробную причину');
    expect(message).not.toMatch(/payload|AiVendorError|object Object/);
  }
});
it('keeps internal failures generic and preserves ordinary validation errors', () => {
  expect(apiErrorMessage({ message: 'Database password=private' }, 502)).toBe(serviceError);
  expect(apiErrorMessage({ message: 'InsufficientFundsError' }, 400)).toBe(serviceError);
  expect(apiErrorMessage({ code: 'AI_VENDOR_ERROR', message: serviceError }, 400)).toBe(serviceError);
  expect(apiErrorMessage({ message: 'Выберите файл MP4' }, 400)).toBe('Выберите файл MP4');
});
it('explains model availability and image failures while preserving actionable vendor details', () => {
  expect(apiErrorMessage({ code: 'AI_MODEL_DISABLED' }, 400)).toContain('Модель отключена');
  expect(apiErrorMessage({ code: 'AI_MODEL_HIDDEN' }, 400)).toContain('Модель недоступна');
  const detail = 'Unsupported image settings for google/gemini-2.5-flash-image: resolution is unsupported';
  const message = apiErrorMessage({ code: 'AI_VENDOR_ERROR', details: detail }, 400);
  expect(message).toContain('сочетание настроек');
  expect(message).toContain(detail);
  expect(apiErrorMessage({ code: 'AI_VENDOR_ERROR', details: 'the response has no image' }, 400)).toContain(
    'без изображения',
  );
});

it('explains Gemini STOP without assuming moderation, user cancellation or invalid settings', () => {
  const reason = '400 Gemini could not generate an image (STOP)';
  const message = apiErrorMessage({ code: 'AI_VENDOR_ERROR', details: reason }, 400);
  expect(message).toContain('Gemini завершила ответ, но не вернула изображение');
  expect(message).toContain('HTTP 400');
  expect(message).toContain(reason);
  expect(message).not.toMatch(/отклонил|модерац|отменён|сочетание настроек/);
});
