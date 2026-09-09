import {
    Adx,
    Aroon,
    Atr,
    Bbands,
    Cci,
    ElderRay,
    Ema,
    Envelopes,
    Macd,
    Mfi,
    Obv,
    PriceChannel,
    Rsi,
    Sar,
    Sma,
    Stoch,
    WilliamsR,
    createChart,
    type Bar,
    type Indicator,
    type ThemeName,
} from '../src/index.js';

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

chart.on('crosshairMove', ({ bar, legends }) => {
    const time =
        bar === null ? '' : new Date(bar.time).toISOString().slice(0, 16).replace('T', ' ');
    readout.textContent = [time, ...legends].filter(Boolean).join('   ');
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
const themeSelect = document.querySelector<HTMLSelectElement>('#theme')!;
themeSelect.addEventListener('change', () => {
    if (themeSelect.value === 'custom') {
        // Своя схема поверх текущей — ровно так её задаёт внешний код.
        chart.applyOptions({
            colors: {
                background: '#101820',
                grid: '#1c2a33',
                text: '#7fa6b8',
                upColor: '#00b8a9',
                downColor: '#f6416c',
                upWickColor: '#00b8a9',
                downWickColor: '#f6416c',
                volumeUpColor: 'rgba(0, 184, 169, 0.4)',
                volumeDownColor: 'rgba(246, 65, 108, 0.4)',
                indicatorLine: '#ffde7d',
                indicatorLevel: '#1c2a33',
            },
        });
        document.body.style.background = '#0a1015';
        return;
    }
    const theme = themeSelect.value as ThemeName;
    chart.setTheme(theme);
    document.body.style.background = theme === 'light' ? '#f4f6f8' : '#0f1117';
    document.body.style.color = theme === 'light' ? '#2a2e39' : '#d6d9e0';
});

document.querySelector('#fit')!.addEventListener('click', () => chart.fitContent());

// Пейны добавляются по одному контракту: объём и индикатор различаются только
// источником, ядро о их природе ничего не знает.
let volumeAdded = false;
document.querySelector('#volume')!.addEventListener('click', (event) => {
    if (volumeAdded) return;
    volumeAdded = true;
    chart.addVolumePane();
    (event.currentTarget as HTMLButtonElement).disabled = true;
});

// Наложения на цену: полосы, конверты, каналы и средние живут в координатах
// цены, поэтому идут в главный пейн, а не в отдельный.
const overlays: Record<string, () => { indicator: Indicator; channelColors?: string[] }> = {
    sma: () => ({ indicator: new Sma(30) }),
    ema: () => ({ indicator: new Ema(30) }),
    bbands: () => ({
        indicator: new Bbands({ period: 20 }),
        channelColors: ['#8e9aaf', '#8e9aaf', '#c9a227'],
    }),
    env: () => ({ indicator: new Envelopes(20, 1), channelColors: ['#8e9aaf', '#8e9aaf'] }),
    pch: () => ({ indicator: new PriceChannel(13, 13), channelColors: ['#8e9aaf', '#8e9aaf'] }),
    sar: () => ({ indicator: new Sar() }),
};

const panes: Record<string, () => { indicator: Indicator; options?: Record<string, unknown> }> = {
    rsi: () => ({
        indicator: new Rsi(14),
        options: { range: { min: 0, max: 100 }, levels: [30, 70], precision: 1 },
    }),
    macd: () => ({
        indicator: new Macd(),
        options: { channelColors: ['#2196f3', '#ef5350', '#8e9aaf'], precision: 3 },
    }),
    stoch: () => ({
        indicator: new Stoch(),
        options: {
            range: { min: 0, max: 100 },
            levels: [20, 80],
            channelColors: ['#2196f3', '#ef5350'],
            precision: 1,
        },
    }),
    adx: () => ({ indicator: new Adx(14), options: { levels: [20, 40], precision: 1 } }),
    atr: () => ({ indicator: new Atr(14), options: { precision: 3 } }),
    cci: () => ({ indicator: new Cci(14), options: { levels: [-100, 100], precision: 1 } }),
    willr: () => ({
        indicator: new WilliamsR(14),
        options: { range: { min: -100, max: 0 }, levels: [-80, -20], precision: 1 },
    }),
    aroon: () => ({
        indicator: new Aroon(14),
        options: {
            range: { min: 0, max: 100 },
            levels: [30, 70],
            channelColors: ['#ef5350', '#26a69a'],
            precision: 0,
        },
    }),
    mfi: () => ({
        indicator: new Mfi(14),
        options: { range: { min: 0, max: 100 }, levels: [20, 80], precision: 1 },
    }),
    obv: () => ({ indicator: new Obv(), options: { precision: 0 } }),
    eldr: () => ({
        indicator: new ElderRay(13),
        options: { channelColors: ['#2196f3', '#ef5350', '#c9a227', '#8e9aaf'], precision: 3 },
    }),
};

const overlaySelect = document.querySelector<HTMLSelectElement>('#overlay')!;
overlaySelect.addEventListener('change', () => {
    const make = overlays[overlaySelect.value];
    if (make === undefined) return;
    const { indicator, channelColors } = make();
    chart.addIndicatorOverlay(indicator, channelColors === undefined ? {} : { channelColors });
});

const paneSelect = document.querySelector<HTMLSelectElement>('#pane')!;
paneSelect.addEventListener('change', () => {
    const make = panes[paneSelect.value];
    if (make === undefined) return;
    const { indicator, options } = make();
    chart.addIndicatorPane(indicator, options ?? {});
});

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
            `из <b>${chart.barCount().toLocaleString('ru')}</b> · пейнов <b>${chart.paneCount()}</b> · ` +
            `${stats.dataset.load ?? ''}`;
    }
    requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

load();
