import { useState } from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useGenerations } from './generations';
import { GenerationCard } from './GenerationCard';
import { LoginDialog } from '../../components/LoginDialog';
export function History() {
  const auth = useAuth();
  const jobs = useGenerations(auth.user?.id);
  const [login, setLogin] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="page-content page-enter">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">ПУТЬ ОТ ИДЕИ К РЕЗУЛЬТАТУ</span>
          <h1>История генераций</h1>
          <p>Запуски из этого браузера. Сохранённые файлы доступны в библиотеке на всех устройствах.</p>
        </div>
      </div>
      {!jobs.length ? (
        <div className="empty-state">
          <HistoryIcon size={36} />
          <h2>Каждая идея оставляет след</h2>
          <p>
            {auth.user
              ? 'Здесь появятся ваши генерации и их параметры.'
              : 'Войдите, чтобы открыть свою историю.'}
          </p>
          <button
            className="button primary"
            onClick={() => (auth.user ? navigate('/image') : setLogin(true))}
          >
            {auth.user ? 'Создать изображение' : 'Войти'}
          </button>
        </div>
      ) : (
        <div className="history-list">
          {jobs.map((job) => (
            <GenerationCard
              key={job.id}
              job={job}
              onRepeat={() =>
                navigate(`/${job.kind}`, {
                  state: { prompt: job.request.task.prompt, request: job.request, userId: job.userId },
                })
              }
            />
          ))}
        </div>
      )}
      {login && <LoginDialog onClose={() => setLogin(false)} />}
    </div>
  );
}
