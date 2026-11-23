import { modelReviews } from '../../app/modelReviewData';
import type { IModelDescription } from '../../lib/types';
import { modelSummary } from './presentation';
import { referenceMinimum, supportsReferences } from './schema';

export function imageModelGuide(model: IModelDescription) {
  const { provider, model: id } = model.reference;
  const reviewId = provider === 'OPEN_AI_IMAGE_GPT' && !id.includes('/') ? 'openai/' + id : id;
  const review = modelReviews.find((item) => item.model === reviewId);
  const use = review?.use || modelSummary(model);
  const first = use.split(/(?<=[.!?])\s/)[0];
  const summary = first.length <= 80 ? first : first.slice(0, 80).replace(/\s+\S*$/, '') + '…';
  const tags: string[] = [];
  if (/предмет|товар|упаковк/i.test(use)) tags.push('Предметка');
  if (/надпис|вывеск|коротк\S* сло|текст на/i.test(use)) tags.push('Текст на кадре');
  if (/\b(fast|turbo|highspeed)\b/i.test(model.reference.model)) tags.push('Быстро');
  if (supportsReferences(model)) tags.push('С референсом');
  const start =
    referenceMinimum(model) > 0
      ? 'Загрузите исходное изображение и опишите, что нужно изменить.'
      : supportsReferences(model)
        ? 'Опишите объект и фон. При необходимости приложите референс.'
        : 'Опишите объект, фон и желаемую композицию.';
  return {
    summary: review?.summary || summary,
    tags: review?.niche ? [review.niche] : tags.slice(0, 2),
    use,
    avoid: review?.avoid || 'Ограничения для этой модели в дайджесте пока не описаны.',
    start,
  };
}
