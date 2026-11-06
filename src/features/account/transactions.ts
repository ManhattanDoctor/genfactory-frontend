import type { IModelDescription, IPaymentTransaction } from '../../lib/types';
const scale = 10n ** 12n;
function decimal(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || !/^\d+(\.\d{1,12})?$/.test(value)) return;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * scale + BigInt(fraction.padEnd(12, '0'));
}
function serial(value: bigint) {
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(12, '0').replace(/0+$/, '');
  return `${whole}${fraction ? '.' + fraction : ''}`;
}
export function transactionAmount(amount: string, currency: string, precise = false) {
  const value = decimal(amount);
  if (value === undefined) return '—';
  if (!['RUB', 'USD'].includes(currency)) return `${amount} ${currency}`;
  const majorScale = scale * 100n;
  let formatted: string;
  if (precise) {
    const whole = new Intl.NumberFormat('ru-RU').format(value / majorScale);
    const fraction = (value % majorScale).toString().padStart(14, '0').replace(/0+$/, '').padEnd(2, '0');
    formatted = `${whole},${fraction}`;
  } else if (value > 0n && value < scale) {
    formatted = '< 0,01';
  } else {
    const cents = (value + scale / 2n) / scale;
    formatted = `${new Intl.NumberFormat('ru-RU').format(cents / 100n)},${(cents % 100n).toString().padStart(2, '0')}`;
  }
  return `${formatted} ${currency === 'RUB' ? '₽' : '$'}`;
}
export function direction(t: IPaymentTransaction) {
  return t.credit === 'PR-00' && t.debet !== 'PR-00'
    ? 'expense'
    : t.debet === 'PR-00' && t.credit !== 'PR-00'
      ? 'income'
      : 'other';
}
const toolNames: Record<string, string> = {
  IMAGE: 'Изображение',
  VIDEO: 'Видео',
  VIDEO_RECOGNITION: 'Анализ видео',
  DOCUMENT_READ: 'Чтение документа',
  TTS: 'Озвучка',
  STT: 'Распознавание речи',
  YANDEX: 'Поиск',
};
export function toolName(type: string) {
  return toolNames[type] || type;
}
export function transactionTitle(t: IPaymentTransaction) {
  const types: Record<string, string> = {
    REFUND: 'Возврат',
    PURCHASE: 'Пополнение',
    CORRECTION: 'Корректировка баланса',
    REGISTRATION_BONUS: 'Приветственный бонус',
    GROUP_TOP_UP_PERSONAL: 'Перевод на баланс группы',
    TOOL_PURCHASE: 'Работа инструмента',
    AGENT_PURCHASE: 'Работа агента',
  };
  if (types[t.type]) return types[t.type];
  const tools = (t.details?.consumption?.tools || []).filter(
    (tool) => !(tool.pending?.length && tool.amounts?.length === 0),
  );
  if (tools.length) return [...new Set(tools.map((t) => toolName(t.type)))].join(' + ');
  const provider = t.details?.model || '';
  if (provider.includes('CONVERSATION') || provider.includes('TEXT')) return 'Работа ассистента';
  if (provider.includes('IMAGE')) return 'Создание изображения';
  if (provider.includes('VIDEO')) return 'Создание видео';
  return t.type === 'TASK_PURCHASE' ? 'Выполнение задачи' : t.type;
}
export function conversationLink(t: IPaymentTransaction) {
  const source = t.details?.source;
  if (
    source?.type !== 'CONVERSATION' ||
    !/^\d+$/.test(String(source.id)) ||
    Number(source.id) <= 0 ||
    !Number.isSafeInteger(Number(source.id))
  )
    return;
  return `/open?conversation=${source.id}`;
}
export function breakdown(t: IPaymentTransaction): { label: string; amount: string }[] | undefined {
  const details = t.details;
  const tools = details?.consumption?.tools;
  if (
    !details?.amounts?.length ||
    !Array.isArray(tools) ||
    !details.model?.includes('CONVERSATION') ||
    !['RUB', 'USD'].includes(t.coinId)
  )
    return;
  const convert = (amounts: { amount: string; coinId: string }[]) => {
    let sum = 0n;
    for (const a of amounts) {
      const value = decimal(a.amount);
      if (value === undefined) return;
      const rate =
        a.coinId === t.coinId
          ? scale
          : decimal(details.rates?.find((r) => r.from === a.coinId && r.to === t.coinId)?.value);
      if (rate === undefined) return;
      sum += (value * rate * 100n) / scale;
    }
    return sum;
  };
  const total = convert(details.amounts);
  const charged = decimal(t.amount);
  if (total === undefined || charged === undefined || total !== charged) return;
  let toolTotal = 0n;
  const rows: { label: string; amount: string }[] = [];
  for (const tool of tools) {
    if (!Array.isArray(tool.amounts) || (tool.status && tool.status !== 'FINAL')) return;
    const value = convert(tool.amounts);
    if (value === undefined) return;
    toolTotal += value;
    rows.push({ label: toolName(tool.type), amount: serial(value) });
  }
  if (toolTotal > total) return;
  return [{ label: 'Ассистент', amount: serial(total - toolTotal) }, ...rows];
}

export function transactionModels(t: IPaymentTransaction) {
  const rows: { label: string; reference: IModelDescription['reference'] }[] = [];
  const confirmed = new Set<string>();
  for (const tool of t.details?.consumption?.tools || []) {
    for (const reference of tool.models || []) {
      if (!reference?.provider || !reference.model) continue;
      confirmed.add(tool.type);
      rows.push({ label: `Модель вызова · ${toolName(tool.type)}`, reference });
    }
  }
  const used = new Set(t.details?.consumption?.tools?.map((tool) => tool.type));
  for (const tool of t.details?.options?.tools || []) {
    if (typeof tool !== 'object' || !tool || !used.has(tool.uid) || confirmed.has(tool.uid)) continue;
    const reference = tool.settings?.model;
    if (!reference?.provider || !reference.model) continue;
    rows.push({ label: `Выбранная модель · ${toolName(tool.uid)}`, reference });
  }
  const seen = new Set<string>();
  for (const file of t.results || []) {
    if (file.userId !== t.userId) continue;
    const reference = file.origin?.generation?.model;
    if (!reference?.provider || !reference.model) continue;
    const key = JSON.stringify(reference);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ label: 'Модель результата', reference });
  }
  return rows;
}
