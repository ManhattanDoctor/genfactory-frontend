import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ArrowUp,
  Plus,
  Check,
  X,
  Pencil,
  Download,
  RotateCcw,
  Expand,
  Heart,
  ChevronDown,
} from 'lucide-react';
import { api, safeMediaUrl } from '../../lib/api';
import type { IConversation, IGnosisFile, IModelDescription } from '../../lib/types';
import { modelKey, modelTitle, modelSummary } from '../catalog/presentation';
import { choices, ratioSizes, sizeRatio, suggestedRatios } from '../content-studio/controls';
import templates from '../content-studio/templates.json';
import type { ITemplate } from '../content-studio/materials';
import {
  templateVariables,
  templateReference,
  templateVariableLabel,
} from '../content-studio/templateRecipe';
import { ModelMark } from '../content-studio/ModelMark';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences, toggleItem } from '../workspace/preferences';
import { Media } from '../../components/MediaPreview';
import { HomeImageViewer } from '../../app/HomeImageViewer';
import { displayMessageText } from './conversations';
import { useConversationRoom } from '../realtime/RealtimeProvider';
import { useConversationProgress } from './useConversationProgress';
import { toolLabel } from './progress';
import './image-workspace.css';

const imageTemplates = templates.filter((item) => item.kind === 'image');
export function ImageWorkspace({
  models,
  model,
  options,
  prompt,
  templateId,
  templateText,
  onTemplateText,
  onTemplate,
  references,
  conversation,
  busy,
  unavailable,
  retryCatalog,
  error,
  onPrompt,
  onModel,
  onOptions,
  onReferences,
  onLibrary,
  onSubmit,
  onRepeat,
  promptInput,
  children,
}: {
  models: IModelDescription[];
  model?: IModelDescription;
  options: Record<string, unknown>;
  prompt: string;
  templateId: string;
  templateText: string;
  onTemplateText: (value: string) => void;
  onTemplate: (value: string) => void;
  references: IGnosisFile[];
  conversation?: IConversation;
  busy: boolean;
  unavailable?: boolean;
  retryCatalog?: () => void;
  error: string;
  onPrompt: (value: string) => void;
  onModel: (model: IModelDescription) => void;
  onOptions: (value: Record<string, unknown>) => void;
  onReferences: (value: IGnosisFile[]) => void;
  onLibrary: () => void;
  onSubmit: () => void;
  onRepeat: (file: IGnosisFile) => void;
  promptInput: RefObject<HTMLTextAreaElement | null>;
  children?: ReactNode;
}) {
  useConversationRoom(conversation?.id);
  const { user } = useAuth();
  const prefs = usePreferences();
  const root = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLFormElement>(null);
  const [columns, setColumns] = useState(4);
  const [bottom, setBottom] = useState(234);
  const selected = imageTemplates.find((item) => item.id === templateId);
  const [editing, setEditing] = useState(false);
  const templateInput = useRef<HTMLTextAreaElement>(null);
  const [templateError, setTemplateError] = useState('');
  useEffect(() => {
    setEditing(false);
    setTemplateError('');
  }, [templateId]);
  useEffect(() => {
    const area = templateInput.current;
    if (editing && area) {
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
      area.scrollTop = area.scrollHeight;
    }
  }, [editing]);
  useEffect(() => {
    setTemplateError('');
  }, [templateText, references.length]);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<{ file: IGnosisFile; rect: DOMRect }>();
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [conversation?.id, busy]);
  const messages = useQuery({
    queryKey: ['messages', conversation?.userId, conversation?.id, page],
    queryFn: ({ signal }) => api.messages(conversation!.id, page, signal),
    enabled: !!conversation,
    refetchInterval: busy ? 2000 : false,
  });
  const history = useInfiniteQuery({
    queryKey: ['files', user?.id, 'image-wall'],
    enabled: !!user,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.imageFiles(pageParam, signal),
    getNextPageParam: (last) => (last.pageIndex + 1 < last.pages ? last.pageIndex + 1 : undefined),
  });
  const historicalFiles =
    history.data?.pages
      .flatMap((page) => page.items)
      .filter(
        (file) => file.userId === user?.id && file.type === 'IMAGE' && file.origin?.kind === 'GENERATION',
      ) || [];
  const files = [
    ...new Map(
      [
        ...historicalFiles,
        ...(messages.data?.items || [])
          .filter((message) => message.role === 'ASSISTANT')
          .flatMap((message) => message.files || [])
          .filter((file) => file.type === 'IMAGE' && file.userId === user?.id),
      ].map((file) => [file.id, file]),
    ).values(),
  ].sort((a, b) => Date.parse(b.createdDate) - Date.parse(a.createdDate) || b.id - a.id);
  const nextPage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const marker = nextPage.current;
    if (!marker || !history.hasNextPage || history.isFetchingNextPage || history.error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void history.fetchNextPage();
      },
      { root: root.current?.querySelector('.img-wall'), rootMargin: '400px' },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [history.hasNextPage, history.isFetchingNextPage, history.error, files.length]);

  const text = (messages.data?.items || []).find(
    (m) => m.role === 'ASSISTANT' && m.text && !m.files?.some((f) => f.type === 'IMAGE'),
  )?.text;
  useEffect(() => {
    const measure = () => {
      const width = root.current?.clientWidth || innerWidth;
      setColumns(width < 560 ? 1 : width < 900 ? 2 : width < 1280 ? 4 : 5);
      setBottom((dock.current?.offsetHeight || 146) + 88);
    };
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    if (dock.current) observer.observe(dock.current);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const input = promptInput.current;
    if (input) {
      input.style.height = '72px';
      input.style.height = `${Math.min(122.4, Math.max(72, input.scrollHeight))}px`;
    }
  }, [prompt, promptInput]);
  const fields = model?.schema.properties?.options?.properties || {};
  const sizes = ratioSizes(model);
  const ratios = fields.aspectRatio ? choices(fields.aspectRatio, suggestedRatios) : [...sizes.keys()];
  if (typeof options.size === 'string' && !fields.aspectRatio && !sizes.has(sizeRatio(options.size))) {
    sizes.set(sizeRatio(options.size), options.size);
    ratios.push(sizeRatio(options.size));
  }
  const ratio = String(options.aspectRatio || (options.size ? sizeRatio(String(options.size)) : ''));
  const qualityKey = fields.resolution
    ? 'resolution'
    : fields.quality
      ? 'quality'
      : fields.imageSize
        ? 'imageSize'
        : '';
  const quality = qualityKey
    ? choices(fields[qualityKey], [String(fields[qualityKey].default || '')].filter(Boolean))
    : [];
  const chooseRatio = (value: string) =>
    onOptions({ ...options, ...(fields.aspectRatio ? { aspectRatio: value } : { size: sizes.get(value) }) });
  const applyTemplate = (item: ITemplate) => {
    if (busy || selected?.id === item.id) return;
    onTemplate(item.id);
    onTemplateText(item.prompt);
    if (ratios.includes(item.ratio)) chooseRatio(item.ratio);
  };
  const submitTemplate = () => {
    if (selected) {
      const missing = templateVariables(templateText);
      if (missing.length) {
        setTemplateError(`Заполните в тексте шаблона: ${missing.map(templateVariableLabel).join(', ')}.`);
        setEditing(true);
        return;
      }
      if (!templateText.trim()) {
        setTemplateError('Введите текст шаблона или уберите его.');
        setEditing(true);
        return;
      }
      if (templateReference({ ...selected, prompt: templateText }) === 'required' && !references.length) {
        setTemplateError('Добавьте изображение-референс через библиотеку.');
        return;
      }
    }
    onSubmit();
  };
  const download = async (file: IGnosisFile) => {
    try {
      const blob = await api.downloadFile(file.id),
        url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice('Не удалось скачать файл. Попробуйте ещё раз.');
    }
  };
  const cards: ReactNode[] = [
    ...(busy
      ? [
          <div
            key="pending"
            className="image-result-pending"
            role="status"
            style={{ aspectRatio: (ratio || '1:1').replace(':', ' / ') }}
          >
            <span className="img-spin" aria-hidden="true" />
            {conversation ? <ImageProgress conversation={conversation} /> : 'Создаём изображение…'}
          </div>,
        ]
      : []),
    ...files.map((file) => (
      <article className="img-tile image-result" key={`file:${file.id}`}>
        <button
          type="button"
          className="image-result-open"
          aria-label={`Открыть ${file.name}`}
          onClick={(e) => setPreview({ file, rect: e.currentTarget.getBoundingClientRect() })}
        >
          <Media file={file} />
        </button>
        <div className="img-actions">
          <button
            type="button"
            aria-label={`Открыть ${file.name}`}
            onClick={(e) =>
              setPreview({ file, rect: e.currentTarget.closest('article')!.getBoundingClientRect() })
            }
          >
            <Expand size={18} />
          </button>
          <button type="button" aria-label={`Скачать ${file.name}`} onClick={() => void download(file)}>
            <Download size={18} />
          </button>
          <button type="button" aria-label={`Переделать ${file.name}`} onClick={() => onRepeat(file)}>
            <RotateCcw size={18} />
          </button>
        </div>
      </article>
    )),
    ...(history.hasNextPage
      ? [
          <div key="next-page" ref={nextPage} className="image-history-loader" role="status">
            {history.error ? (
              <button type="button" onClick={() => void history.fetchNextPage()}>
                Загрузить ещё
              </button>
            ) : (
              'Загружаем изображения…'
            )}
          </div>,
        ]
      : []),
    ...imageTemplates.map((item, index) => (
      <button
        type="button"
        key={item.id}
        className={`img-tile ds-template-card ${selected?.id === item.id ? 'is-on' : ''}`}
        aria-label={item.title}
        aria-pressed={selected?.id === item.id}
        disabled={busy}
        onClick={() => applyTemplate(item)}
      >
        <span className="img-card" style={{ aspectRatio: item.ratio.replace(':', ' / ') }}>
          <img
            className="img-face"
            src={item.src}
            alt=""
            loading={index < columns * 2 ? 'eager' : 'lazy'}
            draggable={false}
          />
          <span className="img-cap">
            <span>{item.genre}</span>
            <strong>{item.title}</strong>
          </span>
          <span className="img-use" aria-hidden="true">
            {selected?.id === item.id ? <Check size={18} /> : <Plus size={18} />}
            <span>{selected?.id === item.id ? 'Выбран' : 'Добавить'}</span>
          </span>
        </span>
      </button>
    )),
  ];
  return (
    <section className="image-workspace" ref={root} aria-label="Изображения">
      <div className="img-wall" aria-label="Шаблоны и изображения">
        {(text || messages.error || (messages.data?.pages || 0) > 1) && (
          <div className="image-conversation-note">
            {text && <p>{displayMessageText(text)}</p>}
            {messages.error && (
              <p role="alert">
                Не удалось загрузить результаты.{' '}
                <button onClick={() => void messages.refetch()}>Повторить</button>
              </p>
            )}
            {(messages.data?.pages || 0) > 1 && (
              <nav aria-label="Страницы результатов">
                <button disabled={!page} onClick={() => setPage(page - 1)}>
                  Назад
                </button>
                <span>{page + 1}</span>
                <button disabled={page + 1 >= messages.data!.pages} onClick={() => setPage(page + 1)}>
                  Далее
                </button>
              </nav>
            )}
          </div>
        )}
        <div className="img-masonry" style={{ paddingBottom: bottom }}>
          {Array.from({ length: columns }, (_, col) => (
            <div className="img-col" key={col}>
              {cards.filter((_, index) => index % columns === col)}
            </div>
          ))}
        </div>
      </div>
      <form
        className="img-dock"
        ref={dock}
        onSubmit={(e) => {
          e.preventDefault();
          submitTemplate();
        }}
      >
        <div className="cw-field">
          {(selected || references.length > 0) && (
            <div className="img-files">
              {references.map((file) => (
                <div className="img-file" key={file.id}>
                  <div className="img-thumb">
                    <Media file={file} />
                    <button
                      type="button"
                      className="img-thumb-x"
                      aria-label={`Убрать ${file.name}`}
                      disabled={busy}
                      onClick={() => onReferences(references.filter((f) => f.id !== file.id))}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {selected && (
                <div className="img-file is-template">
                  <div className="img-thumb">
                    <img src={selected.src} alt={selected.title} />
                    <button
                      type="button"
                      className="img-thumb-x"
                      aria-label="Убрать шаблон"
                      onClick={() => {
                        onTemplate('');
                        onTemplateText('');
                        promptInput.current?.focus();
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="img-file-edit"
                    aria-label="Редактировать шаблон"
                    onClick={() => {
                      setEditing(true);
                      templateInput.current?.focus();
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  {editing && (
                    <div className="img-template-editor">
                      <textarea
                        ref={templateInput}
                        aria-label="Текст шаблона"
                        value={templateText}
                        disabled={busy}
                        onChange={(event) => onTemplateText(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <textarea
            ref={promptInput}
            id="img-draft"
            aria-label="Идея"
            rows={3}
            value={prompt}
            onChange={(e) => onPrompt(e.target.value)}
            placeholder="Опишите результат. Если редактируете изображение, укажите, что изменить и что сохранить"
          />
        </div>
        <div className="img-tools">
          <button
            className="cw-plus"
            type="button"
            aria-label="Добавить изображение"
            disabled={busy || (!!user && !model)}
            onClick={onLibrary}
          >
            <Plus size={20} />
          </button>
          <ImageMenu
            label={model ? modelTitle(model) : 'Выбрать модель'}
            name="Модель"
            disabled={busy}
            models={models}
            selection={model && modelKey(model)}
            favorites={prefs.value.favoriteModels}
            onFavorite={(key) =>
              prefs.update((value) => ({ ...value, favoriteModels: toggleItem(value.favoriteModels, key) }))
            }
            onSelect={(key) => {
              const chosen = models.find((m) => modelKey(m) === key);
              if (chosen) onModel(chosen);
            }}
          />
          {!!ratios.length && (
            <ImageMenu
              label={ratio || 'Стороны'}
              name="Стороны"
              values={ratios}
              selection={ratio}
              disabled={busy}
              onSelect={chooseRatio}
            />
          )}
          {!!quality.length && (
            <ImageMenu
              label={String(options[qualityKey] || quality[0])}
              name="Качество"
              values={quality.map(String)}
              selection={String(options[qualityKey])}
              disabled={busy}
              onSelect={(value) => onOptions({ ...options, [qualityKey]: value })}
            />
          )}
          <button
            className="cw-send"
            type="submit"
            aria-label="Собрать изображение"
            disabled={busy || unavailable || (!prompt.trim() && !selected)}
          >
            {busy ? <span className="spinner" /> : <ArrowUp size={20} />}
          </button>
        </div>
        {(templateError || error || notice || prefs.error || history.error) && (
          <p className="img-guard" role="alert">
            {templateError ||
              error ||
              notice ||
              prefs.error ||
              (history.error ? 'Не удалось загрузить историю изображений.' : '')}
            {retryCatalog && (
              <button type="button" onClick={retryCatalog}>
                Загрузить снова
              </button>
            )}
          </p>
        )}
      </form>
      {preview && safeMediaUrl(preview.file.path) && (
        <HomeImageViewer
          image={{ src: safeMediaUrl(preview.file.path)!, alt: preview.file.name }}
          from={preview.rect}
          onClose={() => setPreview(undefined)}
        />
      )}
      {children}
    </section>
  );
}

function ImageMenu({
  label,
  name,
  values = [],
  models,
  selection,
  disabled,
  onSelect,
  favorites = [],
  onFavorite,
}: {
  label: string;
  name: string;
  values?: string[];
  models?: IModelDescription[];
  selection?: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
  favorites?: string[];
  onFavorite?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const choose = (value: string) => {
    onSelect(value);
    setOpen(false);
    root.current?.querySelector('button')?.focus();
  };
  const visible = models
    ? [...models].sort(
        (a, b) => Number(favorites.includes(modelKey(b))) - Number(favorites.includes(modelKey(a))),
      )
    : undefined;
  return (
    <div
      className={`image-menu ${models ? 'image-model-menu' : ''}`}
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setOpen(false);
          root.current?.querySelector('button')?.focus();
        }
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault();
          setOpen(true);
          requestAnimationFrame(() => {
            const items = [...(root.current?.querySelectorAll<HTMLElement>('[role=option]') || [])];
            const index = items.indexOf(document.activeElement as HTMLElement);
            items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
          });
        }
      }}
    >
      <button
        type="button"
        className="cw-chip"
        aria-label={name}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {label}
        {models && <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="cw-model-menu" role="listbox" aria-label={name}>
          {models && <p className="image-menu-note">Выберите модель</p>}
          {visible?.map((model) => (
            <div
              className="image-model-row"
              role="option"
              tabIndex={0}
              aria-label={modelTitle(model)}
              aria-selected={selection === modelKey(model)}
              key={modelKey(model)}
              onClick={() => {
                choose(modelKey(model));
              }}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
                  event.preventDefault();
                  choose(modelKey(model));
                }
              }}
            >
              <ModelMark id={model.reference.model} />
              <span className="image-model-copy">
                <strong>{modelTitle(model)}</strong>
                <small>{modelSummary(model)}</small>
              </span>
              <button
                className="image-favorite"
                type="button"
                aria-label={`В избранное: ${modelTitle(model)}`}
                aria-pressed={favorites.includes(modelKey(model))}
                onClick={(event) => {
                  event.stopPropagation();
                  onFavorite?.(modelKey(model));
                }}
              >
                <Heart size={16} fill={favorites.includes(modelKey(model)) ? 'currentColor' : 'none'} />
              </button>
              <i className="image-choice-mark" aria-hidden="true" />
            </div>
          ))}
          {models && !visible?.length && <p className="image-menu-note">Модели недоступны</p>}
          {!models &&
            values.map((value) => (
              <button
                className="image-option"
                type="button"
                role="option"
                aria-selected={value === selection}
                key={value}
                onClick={() => {
                  onSelect(value);
                  setOpen(false);
                }}
              >
                {value}
                <i className="image-choice-mark" aria-hidden="true" />
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function ImageProgress({ conversation }: { conversation: IConversation }) {
  const progress = useConversationProgress(conversation);
  return (
    <span>
      {progress.tools.length
        ? progress.tools.map((tool, index) => <span key={index}>{toolLabel(tool)}</span>)
        : 'Создаём изображение…'}
    </span>
  );
}
