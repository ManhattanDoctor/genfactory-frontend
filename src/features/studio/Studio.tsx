import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUp,
  ImagePlus,
  Clapperboard,
  SlidersHorizontal,
  Sparkles,
  X,
  Upload,
  ChevronDown,
  WandSparkles,
} from 'lucide-react';
import { api, safeMediaUrl } from '../../lib/api';
import type { GnosisFile, MediaKind, ModelDescription, Schema, TaskRequest } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import {
  defaults,
  fieldNames,
  optionFields,
  referenceLimit,
  supportsReferences,
  validateRequest,
} from '../catalog/schema';
import { activeForUser, generate, useGenerations } from './generations';
import { GenerationCard } from './GenerationCard';
import { LoginDialog } from '../../components/LoginDialog';
const providers = { image: ['OPEN_AI_IMAGE_GPT', 'OPEN_ROUTER_IMAGE'], video: ['OPEN_ROUTER_VIDEO'] };
const suggestions = {
  image: [
    'Съёмка парфюма на камне в утреннем свете',
    'Портрет в стиле аналоговой фотографии',
    'Футуристический город после дождя',
  ],
  video: [
    'Медленный пролёт камеры над океаном на рассвете',
    'Крупный план капель дождя на стекле, огни города вдали',
    'Плавное приближение к предмету, мягкий студийный свет',
  ],
};
function Field({
  name,
  schema,
  value,
  onChange,
}: {
  name: string;
  schema: Schema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = fieldNames[name] || name;
  if (schema.type === 'boolean')
    return (
      <label className="toggle-field">
        <span>{label}</span>
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-track" />
      </label>
    );
  return (
    <label className="setting-field">
      <span>{label}</span>
      {schema.enum ? (
        <select
          value={value === undefined ? '' : JSON.stringify(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : JSON.parse(e.target.value))}
        >
          <option value="">По умолчанию</option>
          {schema.enum.map((item) => (
            <option key={JSON.stringify(item)} value={JSON.stringify(item)}>
              {String(item)}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={value === undefined ? '' : String(value)}
          type={['number', 'integer'].includes(schema.type || '') ? 'number' : 'text'}
          min={schema.minimum}
          max={schema.maximum}
          step={schema.type === 'integer' ? 1 : 'any'}
          maxLength={schema.maxLength}
          placeholder="По умолчанию"
          onChange={(e) =>
            onChange(
              e.target.value === ''
                ? undefined
                : ['number', 'integer'].includes(schema.type || '')
                  ? Number(e.target.value)
                  : e.target.value,
            )
          }
        />
      )}
    </label>
  );
}
export function Studio({ kind }: { kind: MediaKind }) {
  const auth = useAuth();
  const location = useLocation();
  const [login, setLogin] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selected, setSelected] = useState('');
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [references, setReferences] = useState<GnosisFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const initialPromptKey = useRef('');
  const referenceKey = useRef('');
  const previousUser = useRef<number | undefined>(undefined);
  const uploadScope = useRef('');
  const repeatRequest = useRef<TaskRequest | null>(null);
  const jobs = useGenerations(auth.user?.id);
  const busy = auth.user ? activeForUser(auth.user.id) : false;
  const catalog = useQuery({
    queryKey: ['models', auth.user?.id, kind],
    enabled: !!auth.user,
    queryFn: async ({ signal }) => {
      const results = await Promise.allSettled(providers[kind].map((p) => api.catalog(p, signal)));
      const models = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      if (!models.length && results.some((r) => r.status === 'rejected'))
        throw new Error('Не удалось загрузить каталог моделей.');
      return models.filter((m) =>
        m.capabilities?.includes(kind === 'image' ? 'IMAGE_OUTPUT' : 'VIDEO_OUTPUT'),
      );
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const models = catalog.data || [];
  const modelKey = (m: ModelDescription) => `${m.reference.provider}:${m.reference.model}`;
  const model = models.find((m) => modelKey(m) === selected) || models[0];
  const currentKey = model ? modelKey(model) : '';
  uploadScope.current = `${auth.user?.id}:${currentKey}`;
  useEffect(() => {
    setOptions(
      repeatRequest.current?.options || {
        ...defaults(model?.schema.properties?.options),
        ...(model ? { model: model.reference.model } : {}),
      },
    );
    repeatRequest.current = null;
    setReferences([]);
    setError('');
  }, [currentKey]);
  useEffect(() => {
    setSelected('');
    setReferences([]);
    setError('');
    if (previousUser.current !== undefined) setPrompt('');
    previousUser.current = auth.user?.id;
  }, [kind, auth.user?.id]);
  useEffect(() => {
    if (initialPromptKey.current !== location.key) {
      const state = location.state as { prompt?: string; reference?: GnosisFile; userId?: number } | null;
      if (state?.userId !== undefined && state.userId !== auth.user?.id) return;
      initialPromptKey.current = location.key;
      if (state?.prompt) setPrompt(state.prompt);
    }
  }, [location.key, location.state, model, auth.user?.id]);
  useEffect(() => {
    const state = location.state as { reference?: GnosisFile; request?: TaskRequest; userId?: number } | null;
    if (
      state?.reference &&
      model &&
      supportsReferences(model) &&
      state.reference.userId === auth.user?.id &&
      referenceKey.current !== location.key
    ) {
      setReferences([state.reference]);
      referenceKey.current = location.key;
    }
    if (
      state?.request &&
      state.userId === auth.user?.id &&
      auth.user &&
      models.length &&
      referenceKey.current !== location.key
    ) {
      const found = models.find(
        (m) =>
          m.reference.provider === state.request?.model && m.reference.model === state.request?.options.model,
      );
      if (found) {
        if (modelKey(found) !== currentKey) repeatRequest.current = state.request;
        else setOptions(state.request.options);
        setSelected(modelKey(found));
        referenceKey.current = location.key;
      }
    }
  }, [models, currentKey, location.key, location.state, auth.user?.id]);
  const maxRefs = Math.min(4, referenceLimit(model));
  const upload = async (files: FileList | null) => {
    if (!auth.user) {
      setLogin(true);
      return;
    }
    if (!files || !model || uploading) return;
    setError('');
    setUploading(true);
    try {
      const picked = Array.from(files);
      if (picked.some((f) => !['image/png', 'image/jpeg', 'image/webp'].includes(f.type)))
        throw new Error('Загрузите PNG, JPEG или WebP.');
      if (picked.some((f) => f.size > 20 * 1024 * 1024))
        throw new Error('Для референсов используйте файлы до 20 МБ.');
      if (references.length + picked.length > maxRefs)
        throw new Error(`Для выбранной модели можно добавить до ${maxRefs} референсов.`);
      const scope = uploadScope.current;
      const sid = auth.session!;
      for (const file of picked) {
        const saved = await api.upload(file, sid);
        if (scope === uploadScope.current) setReferences((prev) => [...prev, saved]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить файл.');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };
  const submit = async () => {
    if (!auth.user || !auth.session) {
      setLogin(true);
      return;
    }
    if (!model || busy || uploading) return;
    const visibleOptions = new Set(optionFields(model).map(([name]) => name));
    const cleanOptions = Object.fromEntries(
      Object.entries(options).filter(([name, v]) => visibleOptions.has(name) && v !== undefined && v !== ''),
    );
    const body: TaskRequest = {
      model: model.reference.provider,
      task: { prompt: prompt.trim(), session: crypto.randomUUID() },
      options: { ...cleanOptions, model: model.reference.model },
    };
    if (references.length && kind === 'image') body.task.fileIds = references.map((f) => f.id);
    if (references.length && kind === 'video')
      body.options.frameImages = references.map((f, i) => ({
        url: f.path,
        type: i === 0 ? 'first_frame' : 'last_frame',
      }));
    let errors: string[];
    try {
      errors = validateRequest(model, body);
    } catch {
      errors = ['Не удалось проверить параметры модели. Обновите каталог.'];
    }
    if (errors.length) {
      setError(errors.join('\n'));
      return;
    }
    setError('');
    try {
      await generate(auth.user.id, auth.session, kind, model, body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать генерацию.');
    }
  };
  return (
    <div className="studio page-enter">
      <header className="studio-heading">
        <div>
          <span className="eyebrow">ВАША ТВОРЧЕСКАЯ СТУДИЯ</span>
          <h1>{kind === 'image' ? 'Изображения' : 'Видео'}</h1>
        </div>
        <span className="studio-kind">
          {kind === 'image' ? <ImagePlus size={17} /> : <Clapperboard size={17} />}{' '}
          {kind === 'image' ? 'От мысли к кадру' : 'Каждый кадр — начало истории'}
        </span>
      </header>
      <div className="studio-layout">
        <section className="composer">
          <div className="composer-title">
            <Sparkles size={18} />
            <h2>Что создадим?</h2>
          </div>
          <label className="prompt-label" htmlFor="prompt">
            Ваша идея
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              kind === 'image'
                ? 'Опишите сюжет, свет, настроение и детали…'
                : 'Опишите сцену, движение камеры и атмосферу…'
            }
            maxLength={model?.schema.properties?.task?.properties?.prompt?.maxLength || 32_000}
          />
          <div className="prompt-footer">
            <span>Чем точнее описание — тем ближе результат</span>
            <span>{prompt.length}</span>
          </div>
          <div className="reference-row">
            {references.map((file, i) => (
              <div className="reference" key={file.id}>
                <img src={safeMediaUrl(file.path)} alt={file.name} />
                <span>{kind === 'video' ? (i === 0 ? 'Первый кадр' : 'Последний кадр') : 'Референс'}</span>
                <button
                  className="icon-button"
                  aria-label={`Убрать ${file.name}`}
                  onClick={() => setReferences((prev) => prev.filter((f) => f.id !== file.id))}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          {(!auth.user || supportsReferences(model)) && (
            <button
              className="upload-reference"
              disabled={uploading || busy || (!!model && references.length >= maxRefs)}
              onClick={() => (auth.user ? input.current?.click() : setLogin(true))}
            >
              <Upload size={17} />
              {uploading ? 'Загружаем…' : 'Добавить референс'}
              <span>{kind === 'video' ? 'Первый / последний кадр' : 'PNG, JPG, WebP'}</span>
            </button>
          )}
          <input
            type="file"
            hidden
            ref={input}
            accept="image/png,image/jpeg,image/webp"
            multiple={kind === 'image'}
            onChange={(e) => void upload(e.target.files)}
          />
          <div className="model-selection">
            <label htmlFor="model">Модель</label>
            <div className="model-select-wrap">
              <span className="model-symbol">
                <WandSparkles size={17} />
              </span>
              <select
                id="model"
                value={currentKey}
                onChange={(e) => setSelected(e.target.value)}
                disabled={!models.length || busy || uploading}
              >
                {!models.length && (
                  <option>
                    {auth.user
                      ? catalog.isPending
                        ? 'Загружаем модели…'
                        : 'Нет доступных моделей'
                      : 'Войдите, чтобы выбрать модель'}
                  </option>
                )}
                {models.map((m) => (
                  <option key={modelKey(m)} value={modelKey(m)}>
                    {m.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </div>
          </div>
          {catalog.error && (
            <div className="inline-error">
              <p>{catalog.error.message}</p>
              <button className="text-button" onClick={() => void catalog.refetch()}>
                Загрузить снова
              </button>
            </div>
          )}
          {model && (
            <>
              <div className="settings-grid">
                {optionFields(model)
                  .filter(([key]) =>
                    ['size', 'aspectRatio', 'resolution', 'duration', 'quality'].includes(key),
                  )
                  .map(([key, schema]) => (
                    <Field
                      key={currentKey + key}
                      name={key}
                      schema={schema}
                      value={options[key]}
                      onChange={(v) => setOptions((prev) => ({ ...prev, [key]: v }))}
                    />
                  ))}
              </div>
              <button
                className="advanced-button"
                onClick={() => setAdvanced(!advanced)}
                aria-expanded={advanced}
              >
                <SlidersHorizontal size={16} /> Дополнительные настройки <ChevronDown size={15} />
              </button>
              {advanced && (
                <div className="settings-grid advanced-fields">
                  {optionFields(model)
                    .filter(
                      ([key]) => !['size', 'aspectRatio', 'resolution', 'duration', 'quality'].includes(key),
                    )
                    .map(([key, schema]) => (
                      <Field
                        key={currentKey + key}
                        name={key}
                        schema={schema}
                        value={options[key]}
                        onChange={(v) => setOptions((prev) => ({ ...prev, [key]: v }))}
                      />
                    ))}
                </div>
              )}
            </>
          )}
          {error && (
            <p className="error form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary generate-button"
            disabled={busy || uploading || (!!auth.user && (!model || !prompt.trim()))}
            onClick={() => void submit()}
          >
            {busy ? (
              <>
                <span className="spinner" /> Создаём вашу идею
              </>
            ) : (
              <>
                {auth.user ? 'Создать ' + (kind === 'image' ? 'изображение' : 'видео') : 'Войти и создать'}
                <ArrowUp size={19} />
              </>
            )}
          </button>
          <p className="billing-note">
            Оплата с баланса gnosis. Фактическая стоимость появится после генерации.
          </p>
        </section>
        <section className="studio-output" aria-label="Результаты генерации">
          {jobs.filter((j) => j.kind === kind).length ? (
            <>
              <div className="output-heading">
                <h2>Ваши результаты</h2>
                <span className="small muted">В этой студии</span>
              </div>
              {jobs
                .filter((j) => j.kind === kind)
                .slice(0, 8)
                .map((job) => (
                  <GenerationCard
                    key={job.id}
                    job={job}
                    onRepeat={() => {
                      const available = models.find(
                        (m) =>
                          m.reference.provider === job.request.model &&
                          m.reference.model === job.request.options.model,
                      );
                      setPrompt(job.request.task.prompt);
                      if (available) {
                        if (modelKey(available) !== currentKey) repeatRequest.current = job.request;
                        setSelected(modelKey(available));
                        if (modelKey(available) === currentKey) setOptions(job.request.options);
                      }
                    }}
                  />
                ))}
            </>
          ) : (
            <div className="studio-empty">
              <span className="empty-art">
                {kind === 'image' ? (
                  <ImagePlus size={36} strokeWidth={1} />
                ) : (
                  <Clapperboard size={36} strokeWidth={1} />
                )}
              </span>
              <span className="eyebrow">ЗДЕСЬ ПОЯВИТСЯ ВАША ИДЕЯ</span>
              <h2>{kind === 'image' ? 'Начните с воображения.' : 'Всё начинается с кадра.'}</h2>
              <p>
                Опишите то, что хотите увидеть.
                <br />
                Остальное — дело вашей творческой студии.
              </p>
              <div className="prompt-suggestions">
                {suggestions[kind].map((text) => (
                  <button key={text} onClick={() => setPrompt(text)}>
                    <Sparkles size={14} />
                    {text}
                  </button>
                ))}
              </div>
              <div className="empty-thumbnails">
                {[1, 4, 7].map((i) => (
                  <img key={i} src={`/media/gallery-${i}.jpg`} alt="Визуальное вдохновение" />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
      {login && <LoginDialog onClose={() => setLogin(false)} />}
    </div>
  );
}
