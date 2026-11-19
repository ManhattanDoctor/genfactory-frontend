import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { destinations } from './destinations';
import { ModelReviews } from './ModelReviews';

export function Home(): ReactElement {
  return (
    <div className="home studio-home page-enter">
      <section className="home-intro" aria-labelledby="home-title">
        <h1 id="home-title">Genfactory</h1>
        <p>Более 80 моделей AI-генерации контента</p>
      </section>
      <div className="home-signs">
        <section className="home-modes" aria-label="Начать создание">
          {destinations.map(({ to, CardIcon, label, subtitle, description, audience, action }) => (
            <Link className="home-mode" key={to} to={to} aria-label={action}>
              <span className="home-mode-icon">
                <CardIcon size={40} aria-hidden="true" />
              </span>
              <div>
                <h2>{label}</h2>
                <p className="home-mode-subtitle">{subtitle}</p>
              </div>
              <p className="home-mode-description">{description}</p>
              <p className="home-mode-audience">{audience}</p>
              <span className="button primary">{action}</span>
            </Link>
          ))}
        </section>
        <p className="home-modes-next">
          Дальше по кабинету: <Link to="/templates">шаблоны</Link>, <Link to="/artifacts">История</Link> и{' '}
          <Link to="/library">Библиотека</Link> - чтобы не начинать каждый раз с пустого листа.
        </p>
      </div>
      <ModelReviews />
    </div>
  );
}
