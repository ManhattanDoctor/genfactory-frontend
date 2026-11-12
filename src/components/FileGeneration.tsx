import type { ReactElement } from 'react';
import { ChevronDown, Copy, FileImage, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthProvider';
import { modelTitle } from '../features/catalog/presentation';
import { api, safeMediaUrl } from '../lib/api';
import type { IGnosisFile } from '../lib/types';
import './file-generation.css';

function useGenerationModelName(file: IGnosisFile): string {
  const { user } = useAuth();
  const model = file.origin?.generation?.model;
  const catalog = useQuery({
    queryKey: ['generation-models', user?.id, model?.provider],
    queryFn: ({ signal }) => api.catalog(model!.provider, signal),
    enabled: !!user && !!model,
    staleTime: 300000,
    retry: 1,
  });
  if (!model) return '';
  const match = catalog.data?.find(
    (item) => item.reference.provider === model.provider && item.reference.model === model.model,
  );
  return modelTitle(match || { reference: model, name: model.model });
}

export function GenerationSummary({ file }: { file: IGnosisFile }): ReactElement | null {
  const modelName = useGenerationModelName(file);
  const generation = file.origin?.generation;
  if (!generation) return null;
  const options = generation.options;
  const values = [
    modelName,
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

function SourceFile({ id, mask }: { id: number; mask: boolean }): ReactElement {
  const { user } = useAuth();
  const source = useQuery({
    queryKey: ['generation-source', user?.id, id],
    queryFn: () => api.file(id),
    enabled: !!user,
    retry: false,
  });
  const url = source.data?.userId === user?.id && safeMediaUrl(source.data?.path);
  return (
    <li>
      {source.isPending ? (
        'Загрузка исходника…'
      ) : url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <FileImage size={16} aria-hidden="true" />
          <span>
            {mask && <small>Маска · </small>}
            {source.data!.name}
          </span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      ) : (
        `Исходник №${id} недоступен`
      )}
    </li>
  );
}

export function GenerationDetails({ file }: { file: IGnosisFile }): ReactElement | null {
  const modelName = useGenerationModelName(file);
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
      <summary>
        <span>Параметры генерации</span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="file-generation-content">
        <div className="file-generation-model">
          <span className="file-generation-label">Модель</span>
          <strong>{modelName}</strong>
          <span className="file-generation-identifier">
            {generation.model.provider} / {generation.model.model}
          </span>
        </div>
        <dl className="file-generation-options">
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
        <div className="file-generation-prompt-head">
          <h3>Промпт</h3>
          <button
            type="button"
            className="file-generation-copy"
            aria-label="Копировать промпт"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(generation.prompt);
                setNotice('Промпт скопирован');
              } catch {
                setNotice('Не удалось скопировать. Выделите текст промпта вручную.');
              }
            }}
          >
            <Copy size={14} aria-hidden="true" />
            Копировать
          </button>
        </div>
        <p className="file-generation-prompt">{generation.prompt}</p>
        {notice && (
          <p className="file-generation-notice" role="status">
            {notice}
          </p>
        )}
        {!!sources.length && (
          <>
            <h3>Исходные файлы</h3>
            <ol>
              {expanded &&
                sources.map((id) => <SourceFile key={id} id={id} mask={id === generation.maskFileId} />)}
            </ol>
          </>
        )}
      </div>
    </details>
  );
}
