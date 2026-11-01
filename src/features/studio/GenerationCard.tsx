import { useState } from 'react';
import { Check, Clock3, RefreshCw, TriangleAlert } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../../lib/api';
import type { Generation, GnosisFile } from '../../lib/types';
import { canRetrySave, retrySave, updateCost } from './generations';
import { Media, MediaPreview } from '../../components/MediaPreview';
const labels = {
  running: 'Создаём',
  saving: 'Сохраняем в библиотеку',
  completed: 'Готово',
  failed: 'Не удалось создать',
  unknown: 'Нужно проверить результат',
  save_failed: 'Не всё сохранено',
};
export function GenerationCard({ job, onRepeat }: { job: Generation; onRepeat?: () => void }) {
  const auth = useAuth();
  const [preview, setPreview] = useState<GnosisFile>();
  const [costError, setCostError] = useState('');
  const [checking, setChecking] = useState(false);
  const cost = job.cost;
  const pending = ['running', 'saving'].includes(job.status);
  const refreshCost = async () => {
    setChecking(true);
    setCostError('');
    try {
      if (cost?.pending?.length === 1) updateCost(job, await api.cost(cost.pending[0].operationId));
      else setCostError('Суммарная стоимость уточняется в истории списаний.');
    } catch {
      setCostError('Не удалось уточнить стоимость. Попробуйте позже.');
    } finally {
      setChecking(false);
    }
  };
  return (
    <article className="generation-card">
      <header>
        <span className={`job-status ${job.status}`}>
          {pending ? (
            <span className="spinner" />
          ) : job.status === 'completed' ? (
            <Check size={15} />
          ) : (
            <TriangleAlert size={15} />
          )}{' '}
          {labels[job.status]}
        </span>
        <time>
          {new Date(job.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </time>
      </header>
      <p className="generation-prompt">{job.request.task.prompt}</p>
      <div className="generation-meta">
        <span>{job.modelName}</span>
        <span>{job.kind === 'image' ? 'Изображение' : 'Видео'}</span>
      </div>
      {pending && (
        <div className="generation-wait">
          <span className="generation-orb" />
          <p>{job.status === 'saving' ? 'Сохраняем результат…' : 'Хорошим идеям нужно немного времени'}</p>
          <span className="small muted">
            {job.kind === 'video'
              ? 'Видео может создаваться несколько минут. Не закрывайте вкладку.'
              : 'Оставьте вкладку открытой до сохранения результата.'}
          </span>
        </div>
      )}
      {job.files.length > 0 && (
        <div className="result-grid">
          {job.files.map((file) => (
            <button
              key={file.id}
              className="result-image"
              onClick={() => setPreview(file)}
              aria-label={`Открыть ${file.name}`}
            >
              <Media file={file} />
            </button>
          ))}
        </div>
      )}
      {job.error && (
        <p className="job-error" role="status">
          {job.error}
        </p>
      )}
      <footer>
        {cost && (
          <span className="small muted">
            {cost.status === 'FINAL'
              ? cost.amounts.map((a) => `${a.amount} ${a.coinId}`).join(' + ') || 'Стоимость не указана'
              : cost.status === 'PENDING'
                ? 'Стоимость уточняется'
                : 'Стоимость пока недоступна'}
          </span>
        )}
        {cost?.status === 'PENDING' && (
          <button className="text-button" onClick={() => void refreshCost()} disabled={checking}>
            <Clock3 size={14} /> Уточнить
          </button>
        )}
        {onRepeat && !pending && (
          <button className="text-button" onClick={onRepeat}>
            <RefreshCw size={14} /> Использовать настройки
          </button>
        )}
        {job.status === 'save_failed' && canRetrySave(job.id) && auth.session && (
          <button className="button" onClick={() => void retrySave(job, auth.session!)}>
            Повторить сохранение
          </button>
        )}
      </footer>
      {costError && <p className="small error">{costError}</p>}
      {preview && <MediaPreview file={preview} onClose={() => setPreview(undefined)} />}
    </article>
  );
}
