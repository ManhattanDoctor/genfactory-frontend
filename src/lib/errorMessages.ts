export const userBalanceError = 'Недостаточно средств на балансе. Пополните баланс перед новым запуском.';
export const serviceError = 'Не удалось выполнить запрос. Сервис временно недоступен.';
export const videoModerationError =
  'Видео отклонено модерацией провайдера. Точная причина отказа не указана.';

/** Only the application's explicit error code confirms a user balance problem. */
export function apiErrorMessage(data: unknown, status: number): string {
  const value =
    data && typeof data === 'object'
      ? (data as { code?: unknown; message?: unknown; details?: unknown })
      : {};
  if (value.code === 'AI_MODEL_DISABLED') return 'Модель отключена администратором. Выберите другую модель.';
  if (value.code === 'AI_MODEL_HIDDEN') return 'Модель недоступна для нового выбора. Выберите другую модель.';
  if (value.code === 'INSUFFICIENT_FUNDS') return userBalanceError;
  if (value.code === 'AI_VENDOR_ERROR') {
    let reason =
      typeof value.details === 'string'
        ? value.details
        : typeof value.message === 'string'
          ? value.message
          : '';
    const savedStatus = /^HTTP (\d{3}):\s*/.exec(reason);
    if (savedStatus) {
      status = Number(savedStatus[1]);
      reason = reason.slice(savedStatus[0].length);
    }
    reason = reason
      .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
      .replace(/\bsk-[a-zA-Z0-9_-]+/g, '[redacted]')
      .replace(
        /(["']?(?:authorization|api[_-]?key|key|token|password|secret)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi,
        '$1[redacted]',
      )
      .replace(/([?&](?:key|token|signature|credential|x-amz-[^= &]+)=)[^&\s"']+/gi, '$1[redacted]')
      .replace(/data:[^;,]+;base64,[a-zA-Z0-9+/=]+/g, '[binary]')
      .trim()
      .slice(0, 6000);
    if (reason === serviceError) return serviceError;
    if (/^Generated video rejected by content moderation\.?$/i.test(reason)) return videoModerationError;
    let explanation = 'Провайдер отклонил запрос.';
    if (/^Unsupported image settings for [a-z0-9._/-]+:/i.test(reason))
      explanation =
        'Выбранное сочетание настроек недоступно для этой модели. Проверьте размер, формат кадра и референсы.';
    else if (/^(?:400\s+)?Gemini could not generate an image \(STOP\)\.?(?:\n|$)/i.test(reason))
      explanation =
        'Gemini завершила ответ, но не вернула изображение. По этому ответу причина отсутствия изображения не определена.';
    else if (/^(the response has no image|Image stream ended without a completed image)$/.test(reason))
      explanation =
        'Модель завершила запрос без изображения. Попробуйте изменить описание или выбрать другую модель.';
    else if (
      status === 402 ||
      /insufficient[_\s-]*(?:funds|credits|quota|balance)|(?:balance|quota|credits).*(?:empty|insufficient|exceeded)|billing[_-]hard[_-]limit/i.test(
        reason,
      )
    )
      explanation = 'На стороне провайдера исчерпаны средства или лимит генерации.';
    else if (status === 429) explanation = 'Провайдер ограничил частоту запросов или достиг лимита нагрузки.';
    else if (status === 401 || status === 403) explanation = 'Провайдер отказал сервису в доступе к модели.';
    else if (status === 408 || status === 504)
      explanation = 'Истекло время ожидания ответа провайдера. Результат запроса не подтверждён.';
    else if (status >= 500) explanation = 'Ошибка на стороне провайдера генерации.';
    const details =
      reason && !/^(AiVendorError|AI_VENDOR_ERROR)$/.test(reason)
        ? `\nПричина: ${reason}`
        : '\nПровайдер не передал подробную причину.';
    return `${explanation} HTTP ${status}.${details}`;
  }
  const message = typeof value.message === 'string' ? value.message : '';
  if (
    status === 402 ||
    status >= 500 ||
    /InsufficientFundsError|insufficient[_\s-]*(?:funds|credits|quota|balance)|(?:credit|billing|spend)[_\s-]*(?:hard[_\s-]*)?(?:balance|limit|quota)|payment[_\s-]*required|недостаточн\S*\s+(?:средств|баланс|кредит)|не\s*хватает\s+(?:средств|денег)|баланс.*(?:провайдер|openrouter|openai)/i.test(
      message,
    )
  )
    return serviceError;
  return message || `Запрос не выполнен (${status})`;
}
