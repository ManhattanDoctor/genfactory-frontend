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
  if (
    value.code === 'AI_VENDOR_ERROR' &&
    [value.details, value.message].some(
      (text) =>
        typeof text === 'string' && /^Generated video rejected by content moderation\.?$/i.test(text.trim()),
    )
  )
    return videoModerationError;
  const message = typeof value.message === 'string' ? value.message : '';
  if (
    value.code === 'AI_VENDOR_ERROR' ||
    status === 402 ||
    status >= 500 ||
    /InsufficientFundsError|insufficient[_\s-]*(?:funds|credits|quota|balance)|(?:credit|billing|spend)[_\s-]*(?:hard[_\s-]*)?(?:balance|limit|quota)|payment[_\s-]*required|недостаточн\S*\s+(?:средств|баланс|кредит)|не\s*хватает\s+(?:средств|денег)|баланс.*(?:провайдер|openrouter|openai)/i.test(
      message,
    )
  )
    return serviceError;
  return message || `Запрос не выполнен (${status})`;
}
