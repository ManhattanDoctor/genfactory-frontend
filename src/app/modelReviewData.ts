// Выдержки из клиентской выдачи «Дайджесты моделей» от 18.11.2026.
export const modelReviews = [
  {
    title: 'Nano Banana 2',
    model: 'google/gemini-3.1-flash-image',
    use: 'Один рекламный кадр: товар, еда, упаковка, короткая надпись.',
    avoid: 'Чертежи, интерфейсы, чужие логотипы, мелкий текст, зеркала и крайние форматы 1:4 и 1:8.',
    images: [
      {
        src: '/media/model-digests/01-good-01.webp',
        alt: 'Nano Banana 2, тестовый кадр 01',
      },
      {
        src: '/media/model-digests/01-weak-01.webp',
        alt: 'Nano Banana 2, тестовый кадр 01',
      },
    ],
  },
  {
    title: 'Nano Banana 2.1',
    model: 'google/gemini-nano-banana-2.1',
    use: 'Короткие слова на вещи читаются: «УТРО», «ДОМ», «ЛЕНА», «КАШЕМИР», «DROP», «NORTH», «7 ДНЕЙ», «ДО ЗАКАТА».',
    avoid: 'Стороны 1:4, 1:8, 8:1 и широкая 4:1 часто становятся полосой из нескольких одинаковых фото.',
    images: [
      {
        src: '/media/model-digests/02-good-01.webp',
        alt: 'Nano Banana 2.1, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/02-weak-01.webp',
        alt: 'Nano Banana 2.1, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'GPT Image 5.4',
    model: 'openai/gpt-5.4-image-2',
    use: 'Короткие надписи на предмете часто верные: «ЛЕНА», «ОВЁС», «ГОРОД», «ДОМ», «ВОДА», «НАБОР», «NORTH», «ТИХО».',
    avoid:
      'Заказное слово ломается: на коробке «OROP» вместо «DROP», бирка кашемира пустая, бирка «СЕВЕР» не читается.',
    images: [
      {
        src: '/media/model-digests/03-good-01.webp',
        alt: 'GPT Image 5.4, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/03-weak-01.webp',
        alt: 'GPT Image 5.4, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Nano Banana Pro',
    model: 'google/gemini-3-pro-image',
    use: 'Предметные кадры цельные, без полос: витрина «ОТКРЫТО», очки в лифте, каша, коробка «ДО ЗАКАТА», конструктор, бутылка «ВОДА» в зале.',
    avoid: 'Пропадает заказное слово: нет «КАШЕМИР», нет «LINE», нет «24 ноября» и «ТИХО».',
    images: [
      {
        src: '/media/model-digests/04-good-01.webp',
        alt: 'Nano Banana Pro, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/04-weak-01.webp',
        alt: 'Nano Banana Pro, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'GPT Image 2.5 Sunburst',
    model: 'openai/gpt-image-2.5-sunburst',
    use: 'Упаковка держит слово: «НАБОР», «ДО ЗАКАТА», «NORTH», «ОВЁС», «ТИХО» и «24 ноября».',
    avoid:
      'Верный предмет закрывается афишей: NORDEN на часах, «УТРО НАЧИНАЕТСЯ ЗДЕСЬ», «Реклама, упаковка и афиши», «БОЛЬШЕ ЧЕМ ИГРА».',
    images: [
      {
        src: '/media/model-digests/05-good-07.webp',
        alt: 'GPT Image 2.5 Sunburst, тестовый кадр 07, брать',
      },
      {
        src: '/media/model-digests/05-weak-01.webp',
        alt: 'GPT Image 2.5 Sunburst, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Seedream 5 Pro',
    model: 'bytedance-seed/seedream-5-0-pro',
    use: 'Короткое слово на предмете читается: «7 ДНЕЙ» с каплей, «СЕВЕР», «ЛЕНА», «ОВЁС», «NORTH», «PLAY», «ГОРОД», «ДОМ».',
    avoid: 'Туда, где людей быть не должно, ставит толпу: лужа «ДВОР», проход с бутылкой, лифт с компанией.',
    images: [
      {
        src: '/media/model-digests/06-good-03.webp',
        alt: 'Seedream 5 Pro, тестовый кадр 03, брать',
      },
      {
        src: '/media/model-digests/06-weak-01.webp',
        alt: 'Seedream 5 Pro, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'FLUX.2 Max',
    model: 'black-forest-labs/flux.2-max',
    use: 'Короткие слова на месте: «390», «ОТКРЫТО», «PLAY», «ОВЁС», «ДОМ», «НАБОР».',
    avoid: 'Бутылка «ВОДА» стоит во дворе, не в зале.',
    images: [
      {
        src: '/media/model-digests/07-good-01.webp',
        alt: 'FLUX.2 Max, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/07-weak-01.webp',
        alt: 'FLUX.2 Max, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'FLUX 3',
    model: 'black-forest-labs/flux-3-image',
    use: 'Короткие слова держатся: «ДОМ», «390», «ОТКРЫТО», «NORTH», «ТИХО», «24 ноября», «СЕВЕР», «ДВОР».',
    avoid: 'Бутылка «ВОДА» и пирог оказываются на улице, не в зале и не на кухне.',
    images: [
      {
        src: '/media/model-digests/08-good-04.webp',
        alt: 'FLUX 3, тестовый кадр 04, брать',
      },
      {
        src: '/media/model-digests/08-weak-01.webp',
        alt: 'FLUX 3, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Qwen Image 3 Pro',
    model: 'qwen/qwen-image-3-pro',
    use: 'Крупные слова читаются: «ЧАЙ 190», «ЗАЛ 2», «ДВОР», «НОЧЬ», «КАШЕМИР», «МЫ ОТКРЫТЫ», «СВЕТ».',
    avoid: 'В луже под «СЕВЕР» читается «СЕВЕЬ», отражение не совпадает.',
    images: [
      {
        src: '/media/model-digests/09-good-01.webp',
        alt: 'Qwen Image 3 Pro, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/09-weak-02.webp',
        alt: 'Qwen Image 3 Pro, тестовый кадр 02, не брать',
      },
    ],
  },
  {
    title: 'Recraft V4.1 Pro',
    model: 'recraft/recraft-v4.1-pro',
    use: 'Плоская графика, не фото: «СВЕТ И ФОРМА», «ДВОР» с датой, «УТРО», «-30%», «ЗИМНИЙ ДВОР», «РАМЕН 390».',
    avoid: 'Иконка «ОТКРЫТО» стала иллюстрацией окон.',
    images: [
      {
        src: '/media/model-digests/10-good-02.webp',
        alt: 'Recraft V4.1 Pro, тестовый кадр 02, брать',
      },
      {
        src: '/media/model-digests/10-weak-03.webp',
        alt: 'Recraft V4.1 Pro, тестовый кадр 03, не брать',
      },
    ],
  },
  {
    title: 'MAI Image 2.6',
    model: 'microsoft/mai-image-2.6',
    use: 'Календарь с датой и гирляндой собран одним кадром.',
    avoid: 'Почти каждый сильный кадр - коллаж: фото плюс колонка чужих кадров и текст.',
    images: [
      {
        src: '/media/model-digests/11-good-08.webp',
        alt: 'MAI Image 2.6, тестовый кадр 08, брать',
      },
      {
        src: '/media/model-digests/11-weak-07.webp',
        alt: 'MAI Image 2.6, тестовый кадр 07, не брать',
      },
    ],
  },
  {
    title: 'Nano Banana Pro Preview',
    model: 'google/gemini-3-pro-image-preview',
    use: 'Короткие слова на месте: «УТРО», «ГОРОД», «ДОМ», «ДО ЗАКАТА», «10», «NORTH», «ЛЕНА», «СЕВЕР», «ОВЁС», «ДВОР».',
    avoid: 'На стену и меню лезет «Google PRO-REALISM».',
    images: [
      {
        src: '/media/model-digests/12-good-01.webp',
        alt: 'Nano Banana Pro Preview, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/12-weak-01.webp',
        alt: 'Nano Banana Pro Preview, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Qwen Image 3',
    model: 'qwen/qwen-image-3',
    use: 'Короткие слова на вещи читаются: «УТРО», «ДО 11», «СВЕТ», «ГОРОД», «ЗАЛ 2», «КАШЕМИР», «ЛЕНА», «НАБОР», «ВЫХОД», «МЫ ОТКРЫТЫ».',
    avoid: 'На фургоне вместо «ДО ЗАКАТА» написано «ДО ЗАКАЗА».',
    images: [
      {
        src: '/media/model-digests/13-good-01.webp',
        alt: 'Qwen Image 3, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/13-weak-02.webp',
        alt: 'Qwen Image 3, тестовый кадр 02, не брать',
      },
    ],
  },
  {
    title: 'GPT Image 2',
    model: 'openai/gpt-image-2',
    use: 'Короткие слова на вещи читаются: «ОТКРЫТО», «ДО ЗАКАТА», «ЗАЛ 2», «NORTH», «ЛЕНА», «КАШЕМИР», «ОВЁС», «НОЧЬ», «ГОРОД», «390».',
    avoid: 'Поверх верной сцены всплывает чужая фраза: про очки, про календарь, про место, где начинается я.',
    images: [
      {
        src: '/media/model-digests/14-good-01.webp',
        alt: 'GPT Image 2, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/14-weak-06.webp',
        alt: 'GPT Image 2, тестовый кадр 06, не брать',
      },
    ],
  },
  {
    title: 'Seedream 4.5',
    model: 'bytedance-seed/seedream-4.5',
    use: 'Короткие слова читаются: «7 ДНЕЙ», «ЛЕНА», «DROP», «УТРО», «ГОРОД», «ДОМ», «390», «ЗАЛ 2», «PLAY».',
    avoid: 'Там, где людей просили не ставить, в кадр попадают ноги, лицо или толпа.',
    images: [
      {
        src: '/media/model-digests/15-good-03.webp',
        alt: 'Seedream 4.5, тестовый кадр 03, брать',
      },
      {
        src: '/media/model-digests/15-weak-02.webp',
        alt: 'Seedream 4.5, тестовый кадр 02, не брать',
      },
    ],
  },
  {
    title: 'Flux 2 Pro',
    model: 'black-forest-labs/flux.2-pro',
    use: 'Короткие слова на вещи читаются: «ДО ЗАКАТА», «PLAY», «7 ДНЕЙ», «КАШЕМИР», «DROP», «СЕВЕР», «ОВЁС», «ГОРОД», «ДОМ», «LINE», «НАБОР», «390».',
    avoid: 'Очки просили в зеркале лифта, вышло окно и чужая бумажка.',
    images: [
      {
        src: '/media/model-digests/16-good-02.webp',
        alt: 'Flux 2 Pro, тестовый кадр 02, брать',
      },
      {
        src: '/media/model-digests/16-weak-02.webp',
        alt: 'Flux 2 Pro, тестовый кадр 02, не брать',
      },
    ],
  },
  {
    title: 'FLUX.2 Flex',
    model: 'black-forest-labs/flux.2-flex',
    use: 'Короткие слова читаются: «СЕВЕР», «НОЧЬ», «ДВОР», «УТРО», «ГОРОД», «ДОМ», «НАБОР», «390», «ОТКРЫТО», «ДО ЗАКАТА», «ЗАЛ 2», «NORTH», «7 ДНЕЙ», «ЛЕНА», «DROP».',
    avoid: 'В чистый предметный кадр лезут рука, ноги или лишняя кружка.',
    images: [
      {
        src: '/media/model-digests/17-good-01.webp',
        alt: 'FLUX.2 Flex, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/17-weak-02.webp',
        alt: 'FLUX.2 Flex, тестовый кадр 02, не брать',
      },
    ],
  },
  {
    title: 'Nano Banana 2 Preview',
    model: 'google/gemini-3.1-flash-image-preview',
    use: 'На обычной стороне слово на месте: «ЗАЛ 2», «КАШЕМИР», «DROP», «СЕВЕР», «ОВЁС», «ДОМ», конструктор сверху, кружка без мелкого текста.',
    avoid: 'Стороны 1:4, 1:8 и 8:1 часто становятся полосой из нескольких одинаковых фото.',
    images: [
      {
        src: '/media/model-digests/18-good-01.webp',
        alt: 'Nano Banana 2 Preview, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/18-weak-01.webp',
        alt: 'Nano Banana 2 Preview, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Grok Imagine 2.0',
    model: 'x-ai/grok-imagine-image-2.0',
    use: 'Пар, глина, ткань и мокрый камень выглядят как живое фото',
    avoid: 'Платёжный лист и QR не выглядят рабочими',
    images: [
      {
        src: '/media/model-digests/19-good-01.webp',
        alt: 'Grok Imagine 2.0, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/19-weak-05.webp',
        alt: 'Grok Imagine 2.0, тестовый кадр 05, не брать',
      },
    ],
  },
  {
    title: 'Recraft V4 Pro',
    model: 'recraft/recraft-v4-pro',
    use: 'Плакат, а не фото: плоский цвет, сетка, воздух',
    avoid: 'На карточке аромата 7 ДНЕЙ ушло в мелкий бейдж',
    images: [
      {
        src: '/media/model-digests/20-good-02.webp',
        alt: 'Recraft V4 Pro, тестовый кадр 02, брать',
      },
      {
        src: '/media/model-digests/20-weak-01.webp',
        alt: 'Recraft V4 Pro, тестовый кадр 01, брать',
      },
    ],
  },
  {
    title: 'GPT Image 2.5 Flare',
    model: 'openai/gpt-image-2.5-flare',
    use: 'Жёсткий свет, контраст и мокрый город',
    avoid: 'Лишний телефон с чужой фразой почти в каждом сильном кадре',
    images: [
      {
        src: '/media/model-digests/21-good-02.webp',
        alt: 'GPT Image 2.5 Flare, тестовый кадр 02, брать',
      },
      {
        src: '/media/model-digests/21-weak-01.webp',
        alt: 'GPT Image 2.5 Flare, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Qwen Image 2.1 Pro',
    model: 'qwen/qwen-image-2.1-pro',
    use: 'Крупные ровные слова: ОТКРЫТО, ДВОР, ОВЁС, КАШЕМИР, ЛЕНА, МЫ ОТКРЫТЫ, УТРО, ДО 11, СЕВЕР, ЗАЛ 2',
    avoid: 'В луже отражение СЕВЕБ, не СЕВЕР',
    images: [
      {
        src: '/media/model-digests/22-good-03.webp',
        alt: 'Qwen Image 2.1 Pro, тестовый кадр 03, брать',
      },
      {
        src: '/media/model-digests/22-weak-05.webp',
        alt: 'Qwen Image 2.1 Pro, тестовый кадр 05, не брать',
      },
    ],
  },
  {
    title: 'Nano Banana',
    model: 'google/gemini-2.5-flash-image',
    use: 'Ровный свет и чистые края на кружке, банке, свече и полке',
    avoid: 'Знак Google стоит на коробке, в углу и на неоне',
    images: [
      {
        src: '/media/model-digests/23-good-01.webp',
        alt: 'Nano Banana, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/23-weak-07.webp',
        alt: 'Nano Banana, тестовый кадр 07, брать',
      },
    ],
  },
  {
    title: 'MAI Image 2.5 Pro',
    model: 'microsoft/mai-image-2.5-pro',
    use: 'Пар, снег, один предмет и тихий свет',
    avoid: 'Логотип Microsoft стоит на еде, воде, свече и коробке',
    images: [
      {
        src: '/media/model-digests/24-good-01.webp',
        alt: 'MAI Image 2.5 Pro, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/24-weak-03.webp',
        alt: 'MAI Image 2.5 Pro, тестовый кадр 03, не брать',
      },
    ],
  },
  {
    title: 'Krea 2 Large',
    model: 'krea/krea-2-large',
    use: 'Натюрморт с одним предметом, воздухом и тихим светом',
    avoid: 'Зеркало лифта заменено прямым портретом',
    images: [
      {
        src: '/media/model-digests/25-good-01.webp',
        alt: 'Krea 2 Large, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/25-weak-01.webp',
        alt: 'Krea 2 Large, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Riverflow 2.5 Pro',
    model: 'sourceful/riverflow-v2.5-pro',
    use: 'Мягкий дневной и вечерний свет, плотная фактура',
    avoid: 'На банках, коробке и флаконе лишнее слово riverflow',
    images: [
      {
        src: '/media/model-digests/26-good-01.webp',
        alt: 'Riverflow 2.5 Pro, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/26-weak-01.webp',
        alt: 'Riverflow 2.5 Pro, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Recraft V4.1',
    model: 'recraft/recraft-v4.1',
    use: 'Плоский плакат, крупный шрифт, мало фотореализма',
    avoid: 'Карточка товара и иконка приложения тонут в плакате',
    images: [
      {
        src: '/media/model-digests/27-good-01.webp',
        alt: 'Recraft V4.1, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/27-weak-02.webp',
        alt: 'Recraft V4.1, тестовый кадр 02, не брать',
      },
    ],
  },
  {
    title: 'Recraft V4',
    model: 'recraft/recraft-v4',
    use: 'Белое поле, чёрный шрифт, одна цветная полоса',
    avoid: 'Набор из четырёх знаков спрятан в афишу ярмарки',
    images: [
      {
        src: '/media/model-digests/28-good-01.webp',
        alt: 'Recraft V4, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/28-weak-02.webp',
        alt: 'Recraft V4, тестовый кадр 02, не брать',
      },
    ],
  },
  {
    title: 'Grok Imagine Quality',
    model: 'x-ai/grok-imagine-image-quality',
    use: 'Пока сервис не отдает кадры, сильные стороны не видны.',
    avoid: 'Модели нет в списке картинок сервиса.',
    images: [],
  },
  {
    title: 'Seedream 5 Lite',
    model: 'bytedance-seed/seedream-5-0-lite',
    use: 'Один предмет, мягкий свет, читаемая кириллица',
    avoid: 'Утро в кафе и зал с водой подменены другим местом',
    images: [
      {
        src: '/media/model-digests/30-good-01.webp',
        alt: 'Seedream 5 Lite, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/30-weak-04.webp',
        alt: 'Seedream 5 Lite, тестовый кадр 04, не брать',
      },
    ],
  },
  {
    title: 'Muse Image',
    model: 'meta/muse-image',
    use: 'Пока сервис не отдает кадры, сильные стороны не видны.',
    avoid: 'Модель скрыта: сервис не берет новые генерации.',
    images: [],
  },
  {
    title: 'Hy Image 3.5',
    model: 'tencent/hy-image-v3.5-preview',
    use: 'Зеркало лифта с очками собрано цельно',
    avoid: 'Натюрморт часто заменён человеком',
    images: [
      {
        src: '/media/model-digests/32-good-05.webp',
        alt: 'Hy Image 3.5, тестовый кадр 05, брать',
      },
      {
        src: '/media/model-digests/32-weak-01.webp',
        alt: 'Hy Image 3.5, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Recraft V3',
    model: 'recraft/recraft-v3',
    use: '«DROP» читается, пара обуви плоская, кислотная полоса на месте.',
    avoid: 'Заказные русские слова становятся латиницей или обрывками.',
    images: [
      {
        src: '/media/model-digests/33-good-30.webp',
        alt: 'Recraft V3, тестовый кадр 30, брать',
      },
      {
        src: '/media/model-digests/33-weak-01.webp',
        alt: 'Recraft V3, тестовый кадр 01, брать',
      },
    ],
  },
  {
    title: 'FLUX.2 Klein',
    model: 'black-forest-labs/flux.2-klein-4b',
    use: '«ДО ЗАКАТА», «ЗАЛ 2», «КАШЕМИР», «DROP», «ГОРОД», «ДОМ», «ОВЁС», «УТРО» читаются.',
    avoid: '«ВОДА», «НАБОР», «ОТКРЫТО» и «ЛЕНА» вышли другими словами.',
    images: [
      {
        src: '/media/model-digests/34-good-01.webp',
        alt: 'FLUX.2 Klein, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/34-weak-01.webp',
        alt: 'FLUX.2 Klein, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Qwen Image 2.1 Turbo',
    model: 'qwen/qwen-image-2.1-turbo',
    use: '«КАШЕМИР», «ДВОР», «НОЧЬ», «МЫ ОТКРЫТЫ», «ДОМ», «УТРО», «ДО 11», «ТИХО» на месте.',
    avoid: 'На крышке «КОМПЛЕКТ», не «НАБОР», корешок «CBET», не «СВЕТ».',
    images: [
      {
        src: '/media/model-digests/35-good-01.webp',
        alt: 'Qwen Image 2.1 Turbo, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/35-weak-06.webp',
        alt: 'Qwen Image 2.1 Turbo, тестовый кадр 06, не брать',
      },
    ],
  },
  {
    title: 'Krea 2 Medium',
    model: 'krea/krea-2-medium',
    use: '«NORTH», «7 ДНЕЙ», «ЛЕНА», «DROP», «НОЧЬ», «УТРО», «ДОМ», «НАБОР», «390» на месте.',
    avoid: 'Вывеска «ДВОР» сидит узкой картинкой в чёрных полях.',
    images: [
      {
        src: '/media/model-digests/36-good-01.webp',
        alt: 'Krea 2 Medium, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/36-weak-01.webp',
        alt: 'Krea 2 Medium, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Riverflow V2 Pro',
    model: 'sourceful/riverflow-v2-pro',
    use: '«ДО ЗАКАТА», «ЗАЛ 2», «NORTH», «DROP», «НОЧЬ», «УТРО», «ГОРОД», «ДОМ», «НАБОР» на месте.',
    avoid: 'В тихие кадры часто садится лишний человек.',
    images: [
      {
        src: '/media/model-digests/37-good-02.webp',
        alt: 'Riverflow V2 Pro, тестовый кадр 02, брать',
      },
      {
        src: '/media/model-digests/37-weak-01.webp',
        alt: 'Riverflow V2 Pro, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'MAI Image 2.5',
    model: 'microsoft/mai-image-2.5',
    use: 'Мастерская, свеча, букет, противень, свитер и наушники читаются с первого взгляда.',
    avoid: 'Шоурум стал улицей, детская - ковром в снегу, кухня - лавкой.',
    images: [
      {
        src: '/media/model-digests/38-good-01.webp',
        alt: 'MAI Image 2.5, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/38-weak-02.webp',
        alt: 'MAI Image 2.5, тестовый кадр 02, не брать',
      },
    ],
  },
  {
    title: 'MAI Image 2.6 Flash',
    model: 'microsoft/mai-image-2.6-flash',
    use: 'Прихожая со свитером, коробка подарка, букет и манекен читаются сразу.',
    avoid: 'Слоганы Microsoft закрывают стекло, стены и экран.',
    images: [
      {
        src: '/media/model-digests/39-good-03.webp',
        alt: 'MAI Image 2.6 Flash, тестовый кадр 03, брать',
      },
      {
        src: '/media/model-digests/39-weak-02.webp',
        alt: 'MAI Image 2.6 Flash, тестовый кадр 02, не брать',
      },
    ],
  },
  {
    title: 'Recraft V4.1 Utility Pro',
    model: 'recraft/recraft-v4.1-utility-pro',
    use: 'Заказные слова читаются: «СЕВЕР», «ДОМ», «ВЫПУСК 12», меню и цены.',
    avoid: 'Иконку доставки разворачивает в баннер с кнопкой и домами.',
    images: [
      {
        src: '/media/model-digests/40-good-01.webp',
        alt: 'Recraft V4.1 Utility Pro, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/40-weak-01.webp',
        alt: 'Recraft V4.1 Utility Pro, тестовый кадр 01, брать',
      },
    ],
  },
  {
    title: 'Seedream 5 Flash',
    model: 'bytedance-seed/seedream-5-0-flash',
    use: 'Короткие слова на предметах читаются: «ОВЁС», «НОЧЬ», «ДОМ», «PLAY», «NORTH», «7 ДНЕЙ».',
    avoid: 'Мелкий абзац, комикс и юридический текст плывут.',
    images: [
      {
        src: '/media/model-digests/41-good-01.webp',
        alt: 'Seedream 5 Flash, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/41-weak-05.webp',
        alt: 'Seedream 5 Flash, тестовый кадр 05, не брать',
      },
    ],
  },
  {
    title: 'Riverflow 2.5 Fast',
    model: 'sourceful/riverflow-v2.5-fast',
    use: 'Предмет и свет часто верные: йогурт, кружка, рамен, наушники, «PLAY».',
    avoid: 'Заказной текст ломается: меню из букв, «ДОЗАКАТА», бирка «ОХИТ» вместо «ТИХО».',
    images: [
      {
        src: '/media/model-digests/42-good-01.webp',
        alt: 'Riverflow 2.5 Fast, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/42-weak-01.webp',
        alt: 'Riverflow 2.5 Fast, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'GPT Image Mini',
    model: 'openai/gpt-5-image-mini',
    use: 'Короткие слова читаются: «ОВЁС», «ДОМ», «ЛЕНА», «СЕВЕР», «ТИХО», «24 ноября».',
    avoid: 'В разборе 12 кадров: остальные стороны сервис не вернул.',
    images: [
      {
        src: '/media/model-digests/43-good-01.webp',
        alt: 'GPT Image Mini, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/43-weak-01.webp',
        alt: 'GPT Image Mini, тестовый кадр 01, править',
      },
    ],
  },
  {
    title: 'Krea 2 Turbo',
    model: 'krea/krea-2-medium-turbo',
    use: 'Короткие марки точные: «NORTH» на языке, «LINE», «НАБОР», «КАШЕМИР», «СЕВЕР», «ДО ЗАКАТА».',
    avoid: 'В кадре с лужей ноги человека, отражение «ДВОР» не сходится.',
    images: [
      {
        src: '/media/model-digests/44-good-01.webp',
        alt: 'Krea 2 Turbo, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/44-weak-01.webp',
        alt: 'Krea 2 Turbo, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Recraft V4.1 Flash',
    model: 'recraft/recraft-v4.1-flash',
    use: 'Плакаты плоские, слова на месте: «ВЫПУСК 12», «DROP», «СВЕТ», «НОЧЬ», «ВОДА», «УТРО», «СЕВЕР».',
    avoid: 'Знак доставки - лист, не коробка.',
    images: [
      {
        src: '/media/model-digests/45-good-02.webp',
        alt: 'Recraft V4.1 Flash, тестовый кадр 02, брать',
      },
      {
        src: '/media/model-digests/45-weak-01.webp',
        alt: 'Recraft V4.1 Flash, тестовый кадр 01, брать',
      },
    ],
  },
  {
    title: 'FLUX 3 Klein',
    model: 'black-forest-labs/flux-3-image-klein',
    use: 'Короткие предметные сцены целые, без полос и коллажей.',
    avoid: 'Пряжка такси читается как LNE, не LINE.',
    images: [
      {
        src: '/media/model-digests/46-good-01.webp',
        alt: 'FLUX 3 Klein, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/46-weak-01.webp',
        alt: 'FLUX 3 Klein, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Riverflow V2 Fast',
    model: 'sourceful/riverflow-v2-fast',
    use: 'Предмет и место часто совпадают: чашка, рамен, букет, свеча, ноутбук, каша.',
    avoid: 'Бирка и банка подменяют цитату: RIVERFLOW вместо КАШЕМИР, OBEC вместо ОВЁС.',
    images: [
      {
        src: '/media/model-digests/47-good-06.webp',
        alt: 'Riverflow V2 Fast, тестовый кадр 06, брать',
      },
      {
        src: '/media/model-digests/47-weak-01.webp',
        alt: 'Riverflow V2 Fast, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'GPT Image 1 Mini',
    model: 'openai/gpt-image-1-mini',
    use: 'Свитер, свеча, кружка и календарь целые и с верным словом.',
    avoid: 'NORTH сбоку, не на языке ботинка.',
    images: [
      {
        src: '/media/model-digests/48-good-05.webp',
        alt: 'GPT Image 1 Mini, тестовый кадр 05, брать',
      },
      {
        src: '/media/model-digests/48-weak-01.webp',
        alt: 'GPT Image 1 Mini, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Recraft V4.1 Utility',
    model: 'recraft/recraft-v4.1-utility',
    use: 'Плакат, не фото: сетка, пиктограммы, плоский цвет.',
    avoid: 'Справа от ТИХО нарисована улица, а просили пустое поле.',
    images: [
      {
        src: '/media/model-digests/49-good-01.webp',
        alt: 'Recraft V4.1 Utility, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/49-weak-01.webp',
        alt: 'Recraft V4.1 Utility, тестовый кадр 01, брать',
      },
    ],
  },
  {
    title: 'Nano Banana 2 Lite',
    model: 'google/gemini-3.1-flash-lite-image',
    use: 'Короткие сцены целые: вода, набор, каша, рамен, свеча, ноутбук.',
    avoid: 'Узкие 1:8 и 8:1 и часть 1:4 стали полосой или стопкой кадров.',
    images: [
      {
        src: '/media/model-digests/50-good-01.webp',
        alt: 'Nano Banana 2 Lite, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/50-weak-01.webp',
        alt: 'Nano Banana 2 Lite, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'K3 Edit',
    model: 'krea/k3-edit',
    use: 'Пока сервис не отдает кадры, сильные стороны не видны.',
    avoid: 'Это модель правки: без исходного файла сервис запрос не берет.',
    images: [],
  },
  {
    title: 'Автовыбор',
    model: 'openrouter/auto',
    use: 'Пока сервис не отдает кадры, сильные стороны не видны.',
    avoid: 'Модели нет в списке картинок сервиса.',
    images: [],
  },
  {
    title: 'Recraft V4.1 Pro Vector',
    model: 'recraft/recraft-v4.1-pro-vector',
    use: 'Когда слово помещается, получается плоский плакат с крупным шрифтом.',
    avoid: 'Заказное слово срезано: LINE, ДВОР, СВЕТ, ОТКРЫТО, 7 ДНЕЙ.',
    images: [
      {
        src: '/media/model-digests/53-good-17.webp',
        alt: 'Recraft V4.1 Pro Vector, тестовый кадр 17, брать',
      },
      {
        src: '/media/model-digests/53-weak-02.webp',
        alt: 'Recraft V4.1 Pro Vector, тестовый кадр 02, не брать',
      },
    ],
  },
  {
    title: 'Recraft V4 Pro Vector',
    model: 'recraft/recraft-v4-pro-vector',
    use: 'Ценник, утро и обложка подкаста целые, слово на месте.',
    avoid: 'Широкий кадр режет слово: ОТКРЫТО, LINE, ДВОР, СВЕТ.',
    images: [
      {
        src: '/media/model-digests/54-good-06.webp',
        alt: 'Recraft V4 Pro Vector, тестовый кадр 06, брать',
      },
      {
        src: '/media/model-digests/54-weak-02.webp',
        alt: 'Recraft V4 Pro Vector, тестовый кадр 02, не брать',
      },
    ],
  },
  {
    title: 'Recraft V4.1 Vector',
    model: 'recraft/recraft-v4.1-vector',
    use: 'Короткие знаки целые: «ЗАЛ 2», «РАМЕН 390», «-30%», «ДВОР» для спектакля.',
    avoid: 'Заказные слова часто теряют последнюю букву.',
    images: [
      {
        src: '/media/model-digests/55-good-01.webp',
        alt: 'Recraft V4.1 Vector, тестовый кадр 01, брать',
      },
      {
        src: '/media/model-digests/55-weak-01.webp',
        alt: 'Recraft V4.1 Vector, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'Recraft V4 Vector',
    model: 'recraft/recraft-v4-vector',
    use: 'Целые знаки: «ЗАЛ 2», «ДОМ», «-30%», чашка с паром на «УТРО».',
    avoid: 'Длинные заголовки срезаны: «ЧЕРНАЯ ПЯТНИЦА», «ВЫПУСК», «DROP».',
    images: [
      {
        src: '/media/model-digests/56-good-06.webp',
        alt: 'Recraft V4 Vector, тестовый кадр 06, брать',
      },
      {
        src: '/media/model-digests/56-weak-01.webp',
        alt: 'Recraft V4 Vector, тестовый кадр 01, не брать',
      },
    ],
  },
  {
    title: 'GPT Image 1',
    model: 'openai/gpt-image-1',
    use: 'Пока сервис не отдает кадры, сильные стороны не видны.',
    avoid: 'Модель скрыта: сервис не берет новые генерации.',
    images: [],
  },
  {
    title: 'GPT-5 Image',
    model: 'openai/gpt-5-image',
    use: 'Пока сервис не отдает кадры, сильные стороны не видны.',
    avoid: 'Модель скрыта: сервис не берет новые генерации.',
    images: [],
  },
];
