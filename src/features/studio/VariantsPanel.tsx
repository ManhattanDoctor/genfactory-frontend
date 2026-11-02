import { useAuth } from '../auth/AuthProvider';
import { getSession } from '../../lib/api';
import { restoreDraftFiles } from '../workspace/drafts';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Conversation, ConversationMessage, GnosisFile } from '../../lib/types';
import { Media } from '../../components/MediaPreview';
import { displayMessageText } from './conversations';
import { readRecipes, subscribeRecipes, variantGroups, fallbackRecipe } from './variants';
export function VariantsPanel({
  conversation,
  messages,
  onPreview,
}: {
  conversation: Conversation;
  messages: ConversationMessage[];
  onPreview: (file: GnosisFile) => void;
}) {
  const navigate = useNavigate();
  const auth = useAuth();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [repeating, setRepeating] = useState(false);
  const [, refresh] = useState(0);
  useEffect(() => subscribeRecipes(() => refresh((n) => n + 1)), []);
  const recipes = readRecipes(conversation.userId, conversation.id);
  const groups = variantGroups(messages, conversation.userId);
  if (!groups.length) return null;
  return (
    <details className="workspace-details variants-panel">
      <summary>История вариантов</summary>
      <div className="details-content">
        <p className="small muted">
          Запросы и ответы на текущей странице беседы. Вложения показаны в порядке отправки. Параметры новых
          запусков сохраняются в этом браузере.
        </p>
        <ol className="variant-list">
          {groups.map((group) => {
            const recipe =
              recipes[group.request.id] || group.responses.map((m) => recipes[m.id]).find(Boolean);
            const repeat = async () => {
              if (!auth.session || auth.user?.id !== conversation.userId || repeating) return;
              const sid = auth.session;
              const route = window.location.href;
              setRepeating(true);
              const value = recipe || fallbackRecipe(group.request, group.kind);
              const restored = await restoreDraftFiles(value.references, conversation.userId, sid);
              if (!mounted.current || getSession() !== sid || window.location.href !== route) return;
              setRepeating(false);
              navigate(`/${value.kind}`, {
                state: {
                  userId: conversation.userId,
                  prompt: value.prompt,
                  references: restored.files,
                  repeat: true,
                  notice:
                    (restored.missing ? 'Недоступные вложения пропущены. ' : '') +
                    (recipe
                      ? 'Параметры запуска открыты в новой работе. Проверьте их перед отправкой.'
                      : 'Исходные параметры запуска неизвестны. Перенесены запрос и вложения; модель и настройки нужно проверить.'),
                  ...(recipe
                    ? {
                        preset: {
                          id: `repeat-${group.request.id}`,
                          name: 'Повтор запуска',
                          category: 'Повтор',
                          kind: recipe.kind,
                          prompt: recipe.prompt,
                          model: recipe.model,
                          options: recipe.options,
                        },
                      }
                    : {}),
                },
              });
            };
            return (
              <li key={group.request.id} className="variant-card">
                <div className="variant-heading">
                  <strong>
                    {group.kind === 'image' ? 'Изображение' : 'Видео'} · запрос #{group.request.id}
                  </strong>
                  <time className="small muted">
                    {new Date(group.request.createdDate).toLocaleString('ru-RU')}
                  </time>
                </div>
                <p className="variant-prompt">{displayMessageText(group.request.text || '')}</p>
                <p className="small muted">
                  {recipe
                    ? `Выбранная модель: ${recipe.model.model}`
                    : 'Исходные модель и настройки неизвестны.'}
                </p>
                {!!group.inputs.length && (
                  <div>
                    <h3>Вложения запроса</h3>
                    <div className="variant-files">
                      {group.inputs.map((f) => (
                        <button
                          className="variant-file"
                          key={f.id}
                          onClick={() => onPreview(f)}
                          aria-label={`Вложение: ${f.name}`}
                        >
                          <Media file={f} />
                          <span>{f.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <h3>Файлы в ответах</h3>
                  {group.outputs.length ? (
                    <div className="variant-files">
                      {group.outputs.map((f) => (
                        <button
                          className="variant-file"
                          key={f.id}
                          onClick={() => onPreview(f)}
                          aria-label={`Результат варианта: ${f.name}`}
                        >
                          <Media file={f} />
                          <span>{f.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="small muted">В ответах на этой странице нет медиафайлов.</p>
                  )}
                </div>
                <button
                  className="button"
                  disabled={repeating || conversation.status === 'LOADING'}
                  onClick={repeat}
                >
                  Повторить с изменениями
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </details>
  );
}
