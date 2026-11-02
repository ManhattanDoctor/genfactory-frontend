import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, ImagePlus, Clapperboard, Sparkles, Plus } from 'lucide-react';
import { examples } from './examples';
export function Home() {
  const [filter, setFilter] = useState('Все');
  const navigate = useNavigate();
  return (
    <div className="home page-enter">
      <div className="page-heading">
        <div>
          <span className="eyebrow">GENFACTORY / CREATIVE WORKSPACE</span>
          <h1>
            Большие идеи.
            <br />
            <span>Без границ.</span>
          </h1>
          <p>Превращайте то, что представляете, в то, что можно увидеть.</p>
        </div>
        <span className="season-label">
          <span className="live-dot" /> Пространство для вашего воображения
        </span>
      </div>
      <section className="hero-grid" aria-label="Начать создание">
        <Link className="hero-card hero-main" to="/image">
          <img src="/media/images.jpg" alt="Визуальный мир Genfactory" fetchPriority="high" />
          <div className="hero-shade" />
          <div className="hero-top">
            <span className="pill">
              <Sparkles size={13} /> ОТ ИДЕИ К ИЗОБРАЖЕНИЮ
            </span>
            <span className="round-arrow">
              <ArrowUpRight />
            </span>
          </div>
          <div className="hero-copy">
            <h2>
              Создавайте
              <br />
              невозможное.
            </h2>
            <p>Ваше видение. Ваш стиль. Ваш кадр.</p>
            <span className="hero-cta">
              Создать изображение <ArrowRight size={17} />
            </span>
          </div>
        </Link>
        <Link className="hero-card hero-video" to="/video">
          <img src="/media/video.jpg" alt="Кинематографический кадр" />
          <div className="hero-shade" />
          <div className="hero-top">
            <span className="pill">
              <Clapperboard size={13} /> ВИДЕОСТУДИЯ
            </span>
            <span className="round-arrow">
              <ArrowUpRight />
            </span>
          </div>
          <div className="hero-copy">
            <h2>
              Дайте идее
              <br />
              движение.
            </h2>
            <p>Истории, которые хочется смотреть.</p>
            <span className="hero-cta">
              Создать видео <ArrowRight size={17} />
            </span>
          </div>
        </Link>
      </section>
      <div className="workspace-entry">
        <div>
          <h2>Сначала идея. Затем результат.</h2>
          <p>Обсудите замысел, подготовьте промпт или соберите сценарий.</p>
        </div>
        <div className="workspace-actions">
          <Link className="button" to="/chat">
            AI-студия
          </Link>
          <Link className="button" to="/prompt">
            Generate Prompt
          </Link>
          <Link className="button" to="/script">
            Сценарист
          </Link>
          <Link className="button" to="/templates">
            Шаблоны
          </Link>
        </div>
      </div>
      <section className="quick-tools" aria-label="Инструменты">
        <Link to="/image">
          <span className="tool-icon lime">
            <ImagePlus size={21} />
          </span>
          <div>
            <b>Изображение</b>
            <span>Начните с нескольких слов</span>
          </div>
          <ArrowUpRight size={18} />
        </Link>
        <Link to="/video">
          <span className="tool-icon violet">
            <Clapperboard size={21} />
          </span>
          <div>
            <b>Видео</b>
            <span>Добавьте движение и атмосферу</span>
          </div>
          <ArrowUpRight size={18} />
        </Link>
        <Link to="/image?mode=reference">
          <span className="tool-icon blue">
            <Plus size={21} />
          </span>
          <div>
            <b>Работа с референсом</b>
            <span>Новый взгляд на исходный кадр</span>
          </div>
          <ArrowUpRight size={18} />
        </Link>
      </section>
      <section className="inspiration">
        <div className="section-heading">
          <div>
            <span className="eyebrow">НАЧНИТЕ С ИДЕИ</span>
            <h2>Вдохновение рядом</h2>
          </div>
          <span className="muted small">Визуальная подборка Genfactory · промпты для старта</span>
        </div>
        <div className="chips" role="group" aria-label="Категории вдохновения">
          {['Все', 'Кино', 'Портрет', 'Предметная съёмка', 'Арт', 'Архитектура'].map((item) => (
            <button
              key={item}
              className={`chip ${item === filter ? 'active' : ''}`}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="inspiration-grid">
          {examples
            .filter((e) => filter === 'Все' || filter === e.category)
            .map((item, i) => (
              <button
                className={`inspiration-card inspiration-${i % 4}`}
                key={item.image}
                onClick={() => navigate('/image', { state: { prompt: item.prompt } })}
              >
                <img src={item.image} alt={item.title} loading="lazy" />
                <span className="inspiration-overlay">
                  <span className="small">{item.category}</span>
                  <b>{item.title}</b>
                  <span className="example-action">
                    Попробовать идею <ArrowUpRight size={16} />
                  </span>
                </span>
              </button>
            ))}
        </div>
      </section>
      <footer className="footer">
        <b>
          GENFACTORY<span className="brand-dot">®</span>
        </b>
        <span>Место, где идеи обретают форму.</span>
        <span>Изображения · Видео · Ваше воображение</span>
      </footer>
    </div>
  );
}
