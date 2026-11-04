import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthProvider';
import { modelTitle } from '../features/catalog/presentation';
import { api, safeMediaUrl } from '../lib/api';
import type { IGnosisFile } from '../lib/types';
import './file-generation.css';

export function GenerationSummary({ file }: { file: IGnosisFile }) {
  const generation = file.origin?.generation;
  if (!generation) return null;
  const options = generation.options;
  const values = [
    modelTitle({ reference: generation.model, name: generation.model.model }),
    typeof options.duration === 'number' ? `${options.duration} с` : undefined,
    options.resolution,
    options.size,
    options.quality,
  ];
  return (
    <span className="file-generation-summary" title="Параметры запроса генерации">
      {values.filter((value) => typeof value === 'string' && value).join(' · ')}
    </span>
  );
}

function SourceFile({ id, mask }: { id: number; mask: boolean }) {
  const { user } = useAuth();
  const source = useQuery({
    queryKey: ['generation-source', user?.id, id],
    queryFn: () => api.file(id),
    enabled: !!user,
    retry: false,
  });
  const url = source.data && safeMediaUrl(source.data.path);
  return (
    <li>
      {mask ? 'Маска: ' : ''}
      {source.isPending ? (
        'Загрузка исходника…'
      ) : url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {source.data!.name}
        </a>
      ) : (
        `Исходник №${id} недоступен`
      )}
    </li>
  );
}

export function GenerationDetails({ file }: { file: IGnosisFile }) {
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState('');
  const generation = file.origin?.generation;
  if (!generation) return null;
  const labels: Record<string, string> = {
    duration: 'Длительность, с',
    resolution: 'Разрешение',
    size: 'Размер',
    quality: 'Качество',
    aspectRatio: 'Соотношение сторон',
    generateAudio: 'Звук',
    seed: 'Seed',
  };
  const sources = [
    ...new Set([
      ...(file.origin?.sourceFileIds || []),
      ...(generation.maskFileId ? [generation.maskFileId] : []),
    ]),
  ];
  return (
    <details className="file-generation" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>Параметры генерации</summary>
      <p className="muted small">
        Сохранённые параметры запроса. Фактические свойства результата могут отличаться.
      </p>
      <dl>
        <dt>Модель</dt>
        <dd>{modelTitle({ reference: generation.model, name: generation.model.model })}</dd>
        <dt>Идентификатор</dt>
        <dd>
          {generation.model.provider} / {generation.model.model}
        </dd>
        {Object.entries(generation.options).map(([key, value]) => (
          <div className="file-generation-row" key={key}>
            <dt>{labels[key] || key}</dt>
            <dd>
              {typeof value === 'boolean'
                ? value
                  ? 'Да'
                  : 'Нет'
                : typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value)}
            </dd>
          </div>
        ))}
      </dl>
      <h3>Промпт</h3>
      <p className="file-generation-prompt">{generation.prompt}</p>
      <button
        type="button"
        className="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(generation.prompt);
            setNotice('Промпт скопирован');
          } catch {
            setNotice('Не удалось скопировать. Выделите текст промпта вручную.');
          }
        }}
      >
        Копировать промпт
      </button>
      {notice && <p role="status">{notice}</p>}
      {!!sources.length && (
        <>
          <h3>Исходные файлы</h3>
          <ol>
            {expanded &&
              sources.map((id) => <SourceFile key={id} id={id} mask={id === generation.maskFileId} />)}
          </ol>
        </>
      )}
    </details>
  );
}
