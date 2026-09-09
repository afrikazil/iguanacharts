import { createChart, type Bar } from '../src/index.js';

const chartHost = document.querySelector<HTMLDivElement>('#chart')!;
const stats = document.querySelector<HTMLDivElement>('#stats')!;
const readout = document.querySelector<HTMLDivElement>('#readout')!;
const barCountSelect = document.querySelector<HTMLSelectElement>('#barCount')!;
const modeSelect = document.querySelector<HTMLSelectElement>('#mode')!;

function generate(count: number): Bar[] {
    // Случайное блуждание с всплесками волатильности — чтобы автоскейл и
    // логарифмическая шкала проверялись на чём-то похожем на реальный ряд.
    const bars: Bar[] = new Array<Bar>(count);
    const start = Date.UTC(2000, 0, 1);
    let price = 100;
    let volatility = 0.012;

    for (let i = 0; i < count; i += 1) {
        volatility += (0.012 - volatility) * 0.01 + (Math.random() - 0.5) * 0.001;
        volatility = Math.min(Math.max(volatility, 0.003), 0.05);

        const open = price;
        const close = open * (1 + (Math.random() - 0.5) * volatility * 2);
        bars[i] = {
            time: start + i * 60_000,
            open,
            high: Math.max(open, close) * (1 + Math.random() * volatility),
            low: Math.min(open, close) * (1 - Math.random() * volatility),
            close,
            volume: Math.round(Math.random() * 1e6),
        };
        price = close;
    }
    return bars;
}

const chart = createChart(chartHost);

// Отладочный хук: демо-стенд, тут это уместно.
(globalThis as unknown as { __chart: unknown }).__chart = chart;

chart.on('crosshairMove', ({ bar, price }) => {
    readout.textContent =
        bar === null
            ? `цена ${price.toFixed(2)}`
            : `${new Date(bar.time).toISOString().slice(0, 16).replace('T', ' ')}   ` +
              `O ${bar.open.toFixed(2)}  H ${bar.high.toFixed(2)}  ` +
              `L ${bar.low.toFixed(2)}  C ${bar.close.toFixed(2)}  V ${bar.volume}`;
});
chart.on('crosshairLeave', () => {
    readout.textContent = '';
});

let lastBar: Bar | null = null;

function load(): void {
    const count = Number(barCountSelect.value);
    const started = performance.now();
    const bars = generate(count);
    const generated = performance.now() - started;

    const applyStart = performance.now();
    chart.setData(bars);
    const applied = performance.now() - applyStart;

    lastBar = bars.at(-1) ?? null;
    stats.dataset.load = `генерация ${generated.toFixed(0)} мс · setData ${applied.toFixed(1)} мс`;
}

barCountSelect.addEventListener('change', load);
modeSelect.addEventListener('change', () => {
    chart.setPriceScaleMode(modeSelect.value as 'linear' | 'logarithmic' | 'percentage');
});
document.querySelector('#fit')!.addEventListener('click', () => chart.fitContent());

// Поток тиков: проверяем, что обновление последнего бара не стоит как полная
// перерисовка истории.
let streaming = 0;
document.querySelector('#stream')!.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    if (streaming !== 0) {
        clearInterval(streaming);
        streaming = 0;
        button.textContent = 'Пустить тики';
        return;
    }
    button.textContent = 'Остановить тики';
    streaming = window.setInterval(() => {
        if (lastBar === null) return;
        const close = lastBar.close * (1 + (Math.random() - 0.5) * 0.004);
        lastBar = {
            ...lastBar,
            close,
            high: Math.max(lastBar.high, close),
            low: Math.min(lastBar.low, close),
        };
        chart.update(lastBar);
    }, 16);
});

// Счётчик кадров: без него любые заявления о производительности — слова.
let frames = 0;
let fpsSince = performance.now();
let fps = 0;
const tick = (): void => {
    frames += 1;
    const now = performance.now();
    if (now - fpsSince >= 500) {
        fps = (frames * 1000) / (now - fpsSince);
        frames = 0;
        fpsSince = now;
        const visible = chart.visibleBars();
        stats.innerHTML =
            `<b>${fps.toFixed(0)}</b> fps · видно <b>${Math.max(visible.to - visible.from + 1, 0)}</b> ` +
            `из <b>${chart.barCount().toLocaleString('ru')}</b> · ${stats.dataset.load ?? ''}`;
    }
    requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

load();
