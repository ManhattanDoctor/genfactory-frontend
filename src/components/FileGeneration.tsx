import { api } from '../lib/api';
import type { ReactElement } from 'react';
import { Copy, FileImage, ArrowUpRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthProvider';
import { modelTitle } from '../features/catalog/presentation';
import { catalogQuery } from '../features/catalog/catalogQuery';
import type { IGnosisFile } from '../lib/types';
import './file-generation.css';

function useGenerationModelName(file: Pick<IGnosisFile, 'origin'>): string {
  const { user } = useAuth();
  const model = file.origin?.generation?.model;
  const catalog = useQuery({
    ...catalogQuery(user?.id, model?.provider),
  });
  if (!model) return '';
  const match = catalog.data?.find(
    (item) => item.reference.provider === model.provider && item.reference.model === model.model,
  );
  return modelTitle(match || { reference: model, name: model.model });
}

export function GenerationSummary({ file }: { file: Pick<IGnosisFile, 'origin'> }): ReactElement | null {
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

function SourceFile({
  id,
  mask,
  onOpen,
}: {
  id: number;
  mask: boolean;
  onOpen: (file: IGnosisFile) => void;
}): ReactElement {
  const { user } = useAuth();
  const source = useQuery({
    queryKey: ['generation-source', user?.id, id],
    queryFn: () => api.file(id),
    enabled: !!user,
    retry: false,
  });
  const file = source.data?.userId === user?.id ? source.data : undefined;
  return (
    <li>
      {source.isPending ? (
        'Загрузка исходника…'
      ) : file ? (
        <button type="button" onClick={() => onOpen(file)}>
          <FileImage size={16} aria-hidden="true" />
          <span>
            {mask && <small>Маска · </small>}
            {file.name}
          </span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      ) : (
        `Исходник №${id} недоступен`
      )}
    </li>
  );
}

export function GenerationDetails({
  file,
  onClose,
  onOpen,
}: {
  file: IGnosisFile;
  onClose: () => void;
  onOpen: (file: IGnosisFile) => void;
}): ReactElement | null {
  const modelName = useGenerationModelName(file);
  const details = useRef<HTMLElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
      } else if (details.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close, true);
    };
  }, [onClose]);
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
    <section
      ref={details}
      className="file-generation file-generation-popover"
      aria-label="Параметры генерации"
    >
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
              {sources.map((id) => (
                <SourceFile key={id} id={id} mask={id === generation.maskFileId} onOpen={onOpen} />
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
