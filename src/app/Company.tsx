import type { ReactElement } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
/** Visual identity and hero asset from the company's current ntiai.ru site. */
export function Company(): ReactElement {
  return (
    <div className="company-page">
      <section className="company-hero" aria-labelledby="company-title">
        <div className="company-topline">
          <span>NTIAI · AI PLATFORM</span>
          <a href="https://ntiai.ru/" target="_blank" rel="noreferrer">
            ntiai.ru <ArrowUpRight size={16} />
          </a>
        </div>
        <h1 id="company-title">
          AI-КОНТЕНТ
          <br />
          <span>ДЛЯ КОМАНД</span>
        </h1>
        <img
          src="/media/company/hero-robot.webp"
          alt="Кибернетический портрет — визуальный образ NTIAI"
          width={864}
          height={1132}
        />
        <div className="company-intro">
          <p>Новые Технологии Интеллекта</p>
          <p>AI-инструменты, с которыми компании, авторы и студии создают изображения, видео и истории.</p>
          <Link className="company-cta" to="/chat">
            Начать создавать <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <section className="company-mission">
        <span>НАША МИССИЯ</span>
        <h2>Сделать самовыражение простым.</h2>
        <p>
          Превратить творчество в понятный инструмент для работы и жизни, чтобы каждый мог показать себя через
          образ, движение и историю.
        </p>
      </section>
      <section className="company-services" aria-label="Направления работы">
        {[
          ['01', 'API и MCP', 'Генеративные модели для продуктов, агентов и внутренних инструментов.'],
          ['02', 'Порталы организаций', 'Создание контента для команд и корпоративных задач.'],
          ['03', 'Студия автора', 'Изображения, ролики и понятные сценарии работы с шаблонами.'],
          ['04', 'Кино и реклама', 'Инструменты для рекламных и кинематографических проектов.'],
        ].map(([n, title, text]) => (
          <article key={n}>
            <span>{n}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <footer className="company-footer">
        <strong>NTIAI</strong>
        <span>ООО «Новые Технологии Интеллекта»</span>
        <a href="https://ntiai.ru/" target="_blank" rel="noreferrer">
          О компании и контакты <ArrowUpRight size={16} />
        </a>
      </footer>
    </div>
  );
}
