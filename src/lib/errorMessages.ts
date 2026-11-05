export const userBalanceError =
  'Недостаточно средств на балансе Gnosis. Пополните баланс перед новым запуском.';
export const serviceError = 'Не удалось выполнить запрос. Сервис временно недоступен.';

/** Only the application's explicit error code confirms a user balance problem. */
export function apiErrorMessage(data: unknown, status: number): string {
  const value = data && typeof data === 'object' ? (data as { code?: unknown; message?: unknown }) : {};
  if (value.code === 'INSUFFICIENT_FUNDS') return userBalanceError;
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
