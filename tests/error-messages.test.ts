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

it('localizes the nested provider code without showing diagnostic data in the error message', () => {
  const message = apiErrorMessage(
    {
      code: 'AI_VENDOR_ERROR',
      message: 'HTTP 400: Gemini could not generate an image (STOP)',
      details: {
        code: 'IMAGE_RESULT_EMPTY',
        message: 'Gemini could not generate an image (STOP)',
        status: 400,
        requestId: 'req-123',
      },
    },
    400,
  );
  expect(message).toContain('Модель не вернула изображение');
  expect(message).not.toMatch(/400|STOP|req-123|модерац/);
  expect(
    apiErrorMessage({ code: 'AI_VENDOR_ERROR', details: { code: 'VIDEO_CONTENT_MODERATION' } }, 400),
  ).toBe(videoModerationError);
  expect(
    apiErrorMessage({ code: 'AI_VENDOR_ERROR', details: { code: 'PROVIDER_QUOTA_EXCEEDED' } }, 402),
  ).not.toBe(userBalanceError);
});

it('shows actionable limits and distinct moderation reasons', () => {
  const message = (details: object) => apiErrorMessage({ code: 'AI_VENDOR_ERROR', details }, 400);
  expect(message({ code: 'PROMPT_TOO_LONG', maxPromptCharacters: 32000 })).toMatch(/32\s000 символов/);
  expect(message({ code: 'INPUT_IMAGE_TOO_SMALL', minReferenceSidePixels: 14 })).toContain('14 пикселей');
  expect(message({ code: 'ADULT_CONTENT_RESTRICTED' })).toContain('сексуально откровенного контента');
  expect(message({ code: 'CONTENT_SIMILARITY' })).toContain('возможного совпадения');
  expect(apiErrorMessage({ code: 'FILE_NOT_FOUND' }, 404)).toContain('Выберите его заново');
});

it('shows validation settings and reference limits equally across error transports', () => {
  const payload = {
    code: 'AI_MODEL_PARAMETERS_INVALID',
    message: 'private raw validation text',
    details: {
      issues: [
        { field: 'options.format', allowedValues: ['png', 'jpeg', 'webp'] },
        { field: 'task.references', maximum: 2 },
        {
          field: 'options.aspectRatio',
          allowedValues: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
        },
      ],
    },
  };
  for (const status of [400, 500, 200]) {
    const message = apiErrorMessage(payload, status);
    expect(message).toContain('формат файла. Допустимые значения: png, jpeg, webp');
    expect(message).toContain('количество референсов. Допустимо не больше 2');
    expect(message).toContain('9:16, 16:9, 21:9');
    expect(message).not.toContain('private');
  }
  expect(
    apiErrorMessage({ code: 'VIDEO_REFERENCE_INVALID', details: 'VIDEO_REFERENCE_TYPE_UNSUPPORTED' }, 400),
  ).toContain('не поддерживает этот тип вложения');
});

it('shows distinct messages for service interruptions and a generic message for future codes', () => {
  for (const [code, text] of [
    ['PROVIDER_RATE_LIMITED', 'ограничил частоту'],
    ['PROVIDER_UNAVAILABLE', 'временно недоступен'],
    ['PROVIDER_TIMEOUT', 'Проверьте результат'],
  ])
    expect(apiErrorMessage({ code: 'AI_VENDOR_ERROR', details: { code } }, 400)).toContain(text);
  expect(
    apiErrorMessage(
      { code: 'AI_VENDOR_ERROR', details: { code: 'UNRECOGNIZED', message: 'private payload' } },
      400,
    ),
  ).toBe(serviceError);
});
