# iguanaChart — переписывание ядра

Форк `afrikazil/iguanacharts` от `iguanaChart/iguanacharts`. Рабочая ветка — `rewrite/core`.
Цель: заменить движок графика на новое ядро без jQuery, с сохранением того, что
в старом коде реально ценно (математика индикаторов, геометрия фигур, торговый слой).

## Принятые решения

| Вопрос | Решение |
|---|---|
| Совместимость публичного API | **не сохраняем.** `$el.iguanaChart()` уходит |
| jQuery и вся обвязка | **убираем.** Pointer Events вместо hammerjs / mousewheel / event.move |
| Язык | TypeScript, strict |
| Сборка нового ядра | Vite library mode (ESM + **UMD** — UMD обязателен, tradernet грузит через RequireJS) |
| Сборка legacy-бандла | `build.mjs` на esbuild + lightningcss. Gulp удалён |
| Тесты | Vitest, `environment: 'node'` — ядро без DOM |
| FSD | в библиотеке **не применяем** (нет продуктовых срезов). В tradernet обёртка живёт в FSD как `widgets/` |
| Рендер | Canvas 2D. Интерфейс рендерера сменный, WebGL2 — позже и только для тиков/heatmap |

## Как tradernet потребляет библиотеку

```
frontend/package.json:103
  "iguanacharts": "git+https://github.com/iguanaChart/iguanacharts.git#v2.3.11"
        ↓ yarn 4.12 (yarn.lock пинит commit SHA, а не ветку)
node_modules/iguanacharts/dist/**   — только *.min.js / *.min.css, i18n игнорируется
        ↓ rspack CopyPlugin — frontend/rspack/configs/shared.js:78
frontend/dist/<hash>/iguanacharts/iguanachart.min.js
        ↓ RequireJS — public/javascripts/app/require-config.js:76
  iguanaChartCore: '/dist/iguanacharts/iguanachart.min'
```

Переключение на форк — одна строка в `frontend/package.json`:

```json
"iguanacharts": "git+https://github.com/afrikazil/iguanacharts.git#rewrite/core"
```

**https, не ssh** — иначе CI не соберёт без деплой-ключей. Yarn пинит SHA, поэтому новые
коммиты ветки сами не подтянутся: нужен `yarn up iguanacharts` либо тег/SHA явно.

Быстрый локальный цикл без пушей (yarn 4 `portal:` делает симлинк, `file:` копирует):

```json
"iguanacharts": "portal:../../iguana_fork"
```

Проверять на готовой странице `frontend/src/pages/test-iguana-chart/TestIguanaChart.vue`.

## Факты, которые легко забыть

- **`dist/` закоммичен, `prepare`/`prepack` нет.** yarn при установке из git отдаёт ровно то,
  что лежит в `dist/` в коммите. Значит **в каждом итерационном коммите dist нужно обновлять**,
  иначе стенд соберётся без графика.
- **`dist` воспроизводится побайтово из `src`** — проверено (`npm run verify:legacy`).
  `src` действительно источник правды, а не декорация над руками правленным бандлом.
- **Прод уже отдаёт ES6.** В `src/scripts/chart.js:1335` параметр по умолчанию
  (`forceUpdates = false`), и он доехал до закоммиченного `iguanachart.min.js`.
  Защищать ES5 не нужно. Старый uglify-js ES6 не парсит — это и была причина менять минификатор.
- **Торговый слой раздвоен между репозиториями.** В tradernet лежат AMD-модули, зависящие
  от `iguanaChartCore` и лезущие во внутренности `iChart.*` (~135 КБ):
  `public/javascripts/iguanachart/{draworders,drawtrandorders,drawposition,drawtradepanels}.js`.
  Контракт, который нельзя ломать, шире публичного API библиотеки.
- **Второй потребитель — Banker.** `Banker/public/javascripts/iguanachart/iguanachart.min.js`
  положен руками, путь в его require-config свой (`iguanachart/iguanachart.min`, не из
  node_modules). С форком не обновится — отдельная задача.
- **`.nvmrc` = v10.16.0** остался от gulp. Новый билд работает на Node 22, файл пора обновить.
- `dist/i18n/i18n.en.js` в репозитории устарел относительно `src` (старый gulp-таск
  `copy-resources` не запускали). rspack его всё равно игнорирует.

## Архитектура нового ядра

```
input/     события браузера → команды модели
   ↓
model/     данные и трансформации. НЕ ЗНАЕТ про DOM и canvas
   ↓       invalidate(level)
FrameLoop  один rAF на всё, копит максимум уровня за кадр
   ↓       строит render data — плоские типизированные буферы
render/    рисует. НЕ ЗНАЕТ про модель
```

Правила: поток строго односторонний; ядро без DOM; плагины вместо `switch` по типу;
композиция вместо наследования для фигур; никакой реактивности внутри; ноль рантайм-зависимостей.

Два решения, которые определяют всё остальное:

1. **Ось X живёт в пространстве индексов баров, а не времени.** Выходные, праздники и
   ночные разрывы исчезают сами: между баром N и N+1 всегда ровно `barSpacing` пикселей.
2. **Три режима шкалы цен приводятся к общему внутреннему пространству**, в котором
   отображение в пиксели линейное. Поэтому логарифм и проценты не требуют ветвей в рендерере.

### Файлы

```
core/src/
  chart.ts                   склейка: слои, кадровый цикл, оси, кросс-хэйр
  emitter.ts                 типизированный эмиттер (замена $el.trigger)
  model/bars.ts              BarSeries: колоночные Float64Array, append/updateLast/prepend
  model/time-scale.ts        индекс бара ↔ пиксель, зум с якорем, скролл
  model/price-scale.ts       linear / logarithmic / percentage, автоскейл
  model/invalidation.ts      None < Cursor < Light < Full
  render/geometry.ts         построение геометрии свечей в переиспользуемые буферы
  render/candle-renderer.ts  отрисовка ДВУМЯ fill-вызовами на кадр (батчинг по цвету)
  render/canvas-layer.ts     canvas-слой с учётом devicePixelRatio
  render/frame-loop.ts       rAF + схлопывание уровней инвалидации
  render/time-format.ts      формат подписей оси по видимому диапазону
  input/pointer.ts           Pointer Events: пан, зум колесом, пинч
  indicators/indicator.ts    база инкрементальных индикаторов со снимком состояния
  indicators/{sma,rsi}.ts    SMA и RSI (Уайлдер)
core/test/                   60 тестов, node без jsdom
core/demo/                   стенд: до 1 млн баров, поток тиков, счётчик кадров
```

### Почему инкрементальные индикаторы устроены через снимок состояния

Последний бар меняется много раз в секунду, а рекуррентные индикаторы (EMA, RSI по Уайлдеру)
необратимы — из состояния после бара нельзя вычесть его вклад. Поэтому перед каждым шагом
снимается снимок, и `updateLast` откатывается к нему и шагает заново. Снимок один и тот же
для любого числа `updateLast` подряд, так что тик стоит O(1), а не полный пересчёт истории.

## Команды

```bash
npm test                 # vitest, 60 тестов
npm run typecheck        # tsc --noEmit
npm run dev              # vite dev, стенд на /core/demo/
npm run build:core       # dist/next/chart.{es,umd}.js
npm run build:legacy     # старый бандл: less → concat → minify
npm run verify:legacy    # сверить собранный legacy-бандл с закоммиченным побайтово
npm run build            # и то, и другое
```

## Что сделано

- Legacy-сборка переведена с gulp на `build.mjs` (Node 22). `dist/iguanachart.js` и
  `.css` воспроизводятся побайтово; `min.css` уменьшился с 132 КБ до 92 КБ (lightningcss
  вместо cssnano); `min.js` 568 КБ против 532 КБ (esbuild вместо uglify, +6.8%).
- Ядро: модель, кадровый цикл, батчевый рендер свечей, оси, кросс-хэйр, ввод, SMA/RSI.
  60 тестов, типы чисто. UMD-бандл 22 КБ (7 КБ gzip) против 532 КБ у legacy.
- Стенд `core/demo` проверен в браузере на 100 000 барах: `setData` ~4 мс.

Два дефекта, найденных на стенде и уже исправленных (стоит помнить как класс проблем):
`fitContent()` терялся, если график монтируется в скрытом контейнере с нулевым размером
(частый случай: свёрнутая панель, неактивная вкладка терминала) — теперь запрос
запоминается и применяется на первом реальном ресайзе; подписи оси времени были
зафиксированы в формате «день месяц» и на минутных барах вырождались в столбец
одинаковых значений — теперь формат выбирается по видимому диапазону.

## Что дальше

1. Объём и второй пейн (индикаторы под графиком).
2. Перенести остальные 37 индикаторов из `src/scripts/ta/functions/` на TS с тестами
   против наивной реализации.
3. Контракт drawing tools: якоря (время, цена), hit-test, магнит, сериализация.
   Портировать 5 самых используемых фигур из `src/scripts/lib/charting/`.
4. Торговый слой — с переносом четырёх AMD-модулей из tradernet в форк.
5. Ветка в tradernet: `portal:` на форк, проверка на `TestIguanaChart.vue`, затем стенд.
