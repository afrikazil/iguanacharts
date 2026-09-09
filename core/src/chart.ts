import { Emitter } from './emitter.js';
import type { Indicator } from './indicators/indicator.js';
import { attachPointerInput } from './input/pointer.js';
import { BarSeries, type Bar } from './model/bars.js';
import { Invalidation, type InvalidationLevel } from './model/invalidation.js';
import { layoutPanes, type PaneRect, type PaneSpec } from './model/pane-layout.js';
import { PriceScale, type PriceScaleMode } from './model/price-scale.js';
import { TimeScale, type TimeScaleOptions, type VisibleRange } from './model/time-scale.js';
import type { CandleStyle } from './render/candle-renderer.js';
import { CanvasLayer } from './render/canvas-layer.js';
import { FrameLoop } from './render/frame-loop.js';
import { niceStep } from './render/geometry.js';
import type { HistogramStyle } from './render/histogram.js';
import { TimeAxisFormatter } from './render/time-format.js';
import { CandleSource } from './series/candle-source.js';
import { IndicatorSource, type IndicatorSourceOptions } from './series/indicator-source.js';
import type { DataChange, SeriesSource } from './series/source.js';
import { VolumeSource } from './series/volume-source.js';

export interface ChartColors extends CandleStyle {
    background: string;
    grid: string;
    text: string;
    crosshair: string;
    axisLabelBackground: string;
    axisLabelText: string;
    separator: string;
    volumeUpColor: string;
    volumeDownColor: string;
    /** Цвет линии индикатора по умолчанию — если вызывающий не задал свой. */
    indicatorLine: string;
    /** Цвет опорных уровней осцилляторов. */
    indicatorLevel: string;
}

export type ThemeName = 'light' | 'dark';

export interface PaneOptions {
    /** Доля свободной высоты. */
    weight: number;
    minHeight: number;
    /** Фиксированный диапазон вместо автоскейла — например 0..100 для RSI. */
    range: { min: number; max: number } | null;
    /** Форматирование подписей шкалы; null — по шагу засечек. */
    formatValue: ((value: number) => string) | null;
    /**
     * Явные значения для подписей вместо круглых засечек.
     *
     * Нужно осцилляторам: на высоте пейна порядка 80px круглый шаг для
     * диапазона 0..100 вырождается в одну засечку, а читают там уровни
     * перекупленности — 30 и 70, а не «ровные» числа.
     */
    axisValues: readonly number[] | null;
}

export interface ChartOptions {
    colors: ChartColors;
    /** Ширина шкалы цен справа, px. */
    priceScaleWidth: number;
    /** Высота шкалы времени снизу, px. */
    timeScaleHeight: number;
    /** Высота полосы между пейнами, px. */
    separatorHeight: number;
    priceScaleMode: PriceScaleMode;
    timeScale: Partial<TimeScaleOptions>;
    font: string;
}

export interface CrosshairPayload {
    barIndex: number;
    price: number;
    bar: Bar | null;
    /** Значения всех источников под курсором, по пейнам сверху вниз. */
    legends: string[];
}

export interface ChartEvents extends Record<string, unknown> {
    visibleRangeChange: VisibleRange;
    crosshairMove: CrosshairPayload;
    crosshairLeave: undefined;
}

/**
 * Палитры унаследованы от тем старой библиотеки (White и Dark в
 * jquery.iguana-chart.js), чтобы график не менял вид при переходе на новое
 * ядро: те же фон, сетка и цвета свечей.
 */
export const DARK_COLORS: ChartColors = {
    background: '#1e222d',
    grid: '#2a2e39',
    text: '#787b86',
    crosshair: '#787b86',
    axisLabelBackground: '#2a2e39',
    axisLabelText: '#d6d9e0',
    separator: '#2a2e39',
    upColor: '#26a69a',
    downColor: '#ef5350',
    upWickColor: '#26a69a',
    downWickColor: '#ef5350',
    volumeUpColor: 'rgba(38, 166, 154, 0.45)',
    volumeDownColor: 'rgba(239, 83, 80, 0.45)',
    indicatorLine: '#2196f3',
    indicatorLevel: '#2a2e39',
};

export const LIGHT_COLORS: ChartColors = {
    background: '#ffffff',
    grid: '#cccccc',
    text: '#595959',
    crosshair: '#999999',
    axisLabelBackground: '#595959',
    axisLabelText: '#ffffff',
    separator: '#cccccc',
    upColor: '#66b85c',
    downColor: '#c75757',
    upWickColor: '#595959',
    downWickColor: '#595959',
    volumeUpColor: 'rgba(102, 184, 92, 0.45)',
    volumeDownColor: 'rgba(199, 87, 87, 0.45)',
    indicatorLine: '#1565c0',
    indicatorLevel: '#dddddd',
};

/** Встроенные схемы. Свои задаются через applyOptions({ colors }). */
export const THEMES: Record<ThemeName, ChartColors> = {
    light: LIGHT_COLORS,
    dark: DARK_COLORS,
};

const DEFAULT_OPTIONS: ChartOptions = {
    colors: DARK_COLORS,
    priceScaleWidth: 64,
    timeScaleHeight: 22,
    separatorHeight: 6,
    priceScaleMode: 'linear',
    timeScale: {},
    font: '11px -apple-system, Roboto, "Helvetica Neue", sans-serif',
};

/** Целевое расстояние между подписями осей, px. */
const PRICE_LABEL_SPACING = 44;
const TIME_LABEL_SPACING = 84;

const MAIN_PANE: PaneOptions = {
    weight: 3,
    minHeight: 80,
    range: null,
    formatValue: null,
    axisValues: null,
};

const compactNumber = new Intl.NumberFormat('ru', {
    notation: 'compact',
    maximumFractionDigits: 1,
});

interface PaneState {
    sources: SeriesSource[];
    priceScale: PriceScale;
    options: PaneOptions;
    rect: PaneRect;
}

export class Chart {
    private readonly options: ChartOptions;
    private readonly bars = new BarSeries();
    private readonly timeScale: TimeScale;
    private readonly emitter = new Emitter<ChartEvents>();
    private readonly panes: PaneState[] = [];
    private readonly candleSource: CandleSource;

    private readonly host: HTMLElement;
    private readonly mainLayer: CanvasLayer;
    private readonly overlayLayer: CanvasLayer;
    private readonly frameLoop: FrameLoop;
    private readonly detachInput: () => void;
    private readonly resizeObserver: ResizeObserver;

    private paneWidth = 0;
    private paneAreaHeight = 0;
    private crosshair: { x: number; y: number } | null = null;
    private lastVisible: VisibleRange = { from: 0, to: -1 };
    private readonly timeFormatter = new TimeAxisFormatter();

    /**
     * График часто монтируется в скрытой вкладке или свёрнутой панели: там
     * размер контейнера нулевой, измерять нечего. Запрошенный в этот момент
     * fitContent нельзя потерять — иначе при раскрытии панели пользователь
     * увидит дефолтный масштаб вместо вписанных данных.
     */
    private hasSize = false;
    private fitContentPending = false;

    constructor(container: HTMLElement, options: Partial<ChartOptions> = {}) {
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
            colors: { ...DARK_COLORS, ...options.colors },
        };

        this.host = container.ownerDocument.createElement('div');
        this.host.style.position = 'relative';
        this.host.style.width = '100%';
        this.host.style.height = '100%';
        this.host.style.overflow = 'hidden';
        container.appendChild(this.host);

        this.mainLayer = new CanvasLayer(this.host, 0);
        this.overlayLayer = new CanvasLayer(this.host, 1);

        this.timeScale = new TimeScale(this.options.timeScale);
        this.candleSource = new CandleSource(this.options.colors);
        this.addPane([this.candleSource], MAIN_PANE, this.options.priceScaleMode);

        this.frameLoop = new FrameLoop((level) => this.draw(level));
        this.detachInput = attachPointerInput(this.host, {
            onPan: (dx) => {
                this.timeScale.scrollBy(dx);
                this.frameLoop.invalidate(Invalidation.Full);
            },
            onZoom: (anchorX, factor) => {
                this.timeScale.zoomAt(anchorX, factor);
                this.frameLoop.invalidate(Invalidation.Full);
            },
            onCrosshairMove: (x, y) => {
                this.crosshair = { x, y };
                this.emitCrosshair(x, y);
                this.frameLoop.invalidate(Invalidation.Cursor);
            },
            onCrosshairLeave: () => {
                this.crosshair = null;
                this.emitter.emit('crosshairLeave', undefined);
                this.frameLoop.invalidate(Invalidation.Cursor);
            },
        });

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
        this.resize();
    }

    on<K extends keyof ChartEvents>(
        event: K,
        listener: (payload: ChartEvents[K]) => void,
    ): () => void {
        return this.emitter.on(event, listener);
    }

    setData(bars: readonly Bar[]): void {
        this.bars.setData(bars);
        this.timeScale.setBarCount(this.bars.length);
        this.syncSources('reset');
        this.fitContent();
    }

    /** Тик: если время совпало с последним баром — обновляем его, иначе новый бар. */
    update(bar: Bar): void {
        const length = this.bars.length;
        if (length > 0 && this.bars.timeAt(length - 1) === bar.time) {
            this.bars.updateLast(bar);
            this.syncSources('updateLast');
        } else {
            this.bars.append(bar);
            this.timeScale.setBarCount(this.bars.length);
            this.syncSources('append');
        }
        this.frameLoop.invalidate(Invalidation.Full);
    }

    /**
     * Догрузка истории сдвигает индексы, поэтому значения индикаторов
     * пересчитываются целиком — попытка сшить состояние здесь стоила бы
     * тонких ошибок выравнивания.
     */
    prependHistory(bars: readonly Bar[]): void {
        this.bars.prepend(bars);
        this.timeScale.setBarCount(this.bars.length);
        this.syncSources('reset');
        this.frameLoop.invalidate(Invalidation.Full);
    }

    /** Пейн с объёмом под графиком цены. */
    addVolumePane(options: Partial<PaneOptions> = {}): VolumeSource {
        const source = new VolumeSource({
            upColor: this.options.colors.volumeUpColor,
            downColor: this.options.colors.volumeDownColor,
        });
        this.addPane(
            [source],
            {
                weight: 1,
                minHeight: 48,
                range: null,
                formatValue: (value) => compactNumber.format(value),
                axisValues: null,
                ...options,
            },
            'linear',
        );
        source.sync(this.bars, 'reset');
        this.relayout();
        this.frameLoop.invalidate(Invalidation.Full);
        return source;
    }

    /**
     * Индикатор поверх цены, в главном пейне.
     *
     * Средние, полосы Боллинджера, конверты, ценовой канал и SAR живут в
     * координатах цены, и выносить их в отдельный пейн бессмысленно —
     * автоскейл главного пейна уже объединяет диапазоны всех своих источников.
     */
    addIndicatorOverlay(
        indicator: Indicator,
        options: Partial<IndicatorSourceOptions> = {},
    ): IndicatorSource {
        const source = new IndicatorSource(
            indicator,
            {
                color: this.options.colors.indicatorLine,
                levelColor: this.options.colors.indicatorLevel,
                ...options,
            },
            options.color !== undefined,
        );
        this.panes[0]?.sources.push(source);
        source.sync(this.bars, 'reset');
        this.frameLoop.invalidate(Invalidation.Full);
        return source;
    }

    /** Убирает ранее добавленный источник из любого пейна. */
    removeSource(source: SeriesSource): boolean {
        for (let i = this.panes.length - 1; i >= 0; i -= 1) {
            const pane = this.panes[i]!;
            const index = pane.sources.indexOf(source);
            if (index === -1) continue;
            pane.sources.splice(index, 1);
            // Опустевший неглавный пейн убираем вместе с источником.
            if (pane.sources.length === 0 && i > 0) {
                this.panes.splice(i, 1);
                this.relayout();
            }
            this.frameLoop.invalidate(Invalidation.Full);
            return true;
        }
        return false;
    }

    /** Пейн с линией индикатора. */
    addIndicatorPane(
        indicator: Indicator,
        options: Partial<PaneOptions & IndicatorSourceOptions> = {},
    ): IndicatorSource {
        const source = new IndicatorSource(
            indicator,
            {
                color: this.options.colors.indicatorLine,
                levelColor: this.options.colors.indicatorLevel,
                ...options,
            },
            options.color !== undefined,
        );
        this.addPane(
            [source],
            {
                weight: 1,
                minHeight: 60,
                range: options.range ?? null,
                formatValue: options.formatValue ?? null,
                axisValues:
                    options.axisValues ??
                    (options.levels !== undefined && options.levels.length > 0
                        ? options.levels
                        : null),
                ...(options.weight === undefined ? {} : { weight: options.weight }),
                ...(options.minHeight === undefined ? {} : { minHeight: options.minHeight }),
            },
            'linear',
        );
        source.sync(this.bars, 'reset');
        this.relayout();
        this.frameLoop.invalidate(Invalidation.Full);
        return source;
    }

    paneCount(): number {
        return this.panes.length;
    }

    /**
     * Смена палитры на живом графике. Тема в tradernet переключается без
     * перемонтирования компонента, поэтому цвета обязаны меняться на месте.
     * Геометрия при этом не меняется — инвалидация уровня Light.
     */
    setTheme(theme: ThemeName): void {
        this.applyColors(THEMES[theme]);
    }

    /** Частичное переопределение палитры поверх текущей. */
    applyOptions(patch: { colors?: Partial<ChartColors> }): void {
        if (patch.colors !== undefined) {
            this.applyColors({ ...this.options.colors, ...patch.colors });
        }
    }

    colors(): ChartColors {
        return { ...this.options.colors };
    }

    private applyColors(colors: ChartColors): void {
        this.options.colors = colors;
        this.candleSource.setStyle(colors);
        for (const pane of this.panes) {
            for (const source of pane.sources) {
                if (source instanceof VolumeSource) {
                    source.setStyle({
                        upColor: colors.volumeUpColor,
                        downColor: colors.volumeDownColor,
                    });
                } else if (source instanceof IndicatorSource) {
                    source.applyTheme(colors.indicatorLine, colors.indicatorLevel);
                }
            }
        }
        this.frameLoop.invalidate(Invalidation.Light);
    }

    setPriceScaleMode(mode: PriceScaleMode): void {
        this.panes[0]?.priceScale.setMode(mode);
        this.frameLoop.invalidate(Invalidation.Full);
    }

    fitContent(): void {
        if (!this.hasSize) {
            this.fitContentPending = true;
            return;
        }
        this.timeScale.fitContent();
        this.frameLoop.invalidate(Invalidation.Full);
    }

    visibleBars(): VisibleRange {
        return this.timeScale.visibleBars();
    }

    barCount(): number {
        return this.bars.length;
    }

    resize(): void {
        const rect = this.host.parentElement?.getBoundingClientRect();
        const width = Math.floor(rect?.width ?? 0);
        const height = Math.floor(rect?.height ?? 0);
        if (width === 0 || height === 0) return;

        this.hasSize = true;
        const dpr = globalThis.devicePixelRatio || 1;
        this.mainLayer.resize(width, height, dpr);
        this.overlayLayer.resize(width, height, dpr);

        this.paneWidth = Math.max(width - this.options.priceScaleWidth, 0);
        this.paneAreaHeight = Math.max(height - this.options.timeScaleHeight, 0);
        this.timeScale.setWidth(this.paneWidth);
        this.relayout();

        if (this.fitContentPending) {
            this.fitContentPending = false;
            this.timeScale.fitContent();
        }

        this.frameLoop.invalidate(Invalidation.Full);
        this.frameLoop.flush();
    }

    destroy(): void {
        this.resizeObserver.disconnect();
        this.detachInput();
        this.frameLoop.dispose();
        this.emitter.clear();
        this.mainLayer.dispose();
        this.overlayLayer.dispose();
        this.host.remove();
    }

    private addPane(sources: SeriesSource[], options: PaneOptions, mode: PriceScaleMode): void {
        this.panes.push({
            sources,
            priceScale: new PriceScale({ mode }),
            options,
            rect: { top: 0, height: 0 },
        });
    }

    private relayout(): void {
        const specs: PaneSpec[] = this.panes.map((pane) => ({
            weight: pane.options.weight,
            minHeight: pane.options.minHeight,
        }));
        const rects = layoutPanes(this.paneAreaHeight, specs, this.options.separatorHeight);
        this.panes.forEach((pane, index) => {
            pane.rect = rects[index] ?? { top: 0, height: 0 };
            pane.priceScale.setHeight(pane.rect.height);
        });
    }

    private syncSources(change: DataChange): void {
        for (const pane of this.panes) {
            for (const source of pane.sources) source.sync(this.bars, change);
        }
    }

    private draw(level: InvalidationLevel): void {
        if (level >= Invalidation.Light) this.drawMain(level === Invalidation.Full);
        this.drawOverlay();
    }

    private drawMain(rebuildGeometry: boolean): void {
        const { ctx } = this.mainLayer;
        const { colors } = this.options;

        ctx.fillStyle = colors.background;
        ctx.fillRect(0, 0, this.mainLayer.width, this.mainLayer.height);

        const visible = this.timeScale.visibleBars();
        const hasData = visible.to >= visible.from;

        for (const pane of this.panes) {
            if (hasData && rebuildGeometry) {
                this.applyScale(pane, visible);
                for (const source of pane.sources) {
                    source.build({
                        bars: this.bars,
                        from: visible.from,
                        to: visible.to,
                        timeScale: this.timeScale,
                        priceScale: pane.priceScale,
                        paneWidth: this.paneWidth,
                        paneHeight: pane.rect.height,
                    });
                }
            }

            ctx.save();
            ctx.translate(0, pane.rect.top);
            this.drawPaneGrid(ctx, pane);
            ctx.beginPath();
            ctx.rect(0, 0, this.paneWidth, pane.rect.height);
            ctx.clip();
            if (hasData) {
                for (const source of pane.sources) source.draw(ctx);
            }
            ctx.restore();

            this.drawPaneAxis(ctx, pane);
        }

        this.drawSeparators(ctx);
        this.drawTimeAxis(ctx, visible);

        if (visible.from !== this.lastVisible.from || visible.to !== this.lastVisible.to) {
            this.lastVisible = visible;
            this.emitter.emit('visibleRangeChange', visible);
        }
    }

    private applyScale(pane: PaneState, visible: VisibleRange): void {
        const fixed = pane.options.range;
        if (fixed !== null) {
            pane.priceScale.setPriceRange(fixed.min, fixed.max);
            return;
        }
        if (pane.priceScale.mode === 'percentage') {
            pane.priceScale.setBase(this.bars.closeAt(visible.from));
        }

        let min = NaN;
        let max = NaN;
        for (const source of pane.sources) {
            const range = source.valueRange(this.bars, visible.from, visible.to);
            if (!Number.isNaN(range.min) && (Number.isNaN(min) || range.min < min)) min = range.min;
            if (!Number.isNaN(range.max) && (Number.isNaN(max) || range.max > max)) max = range.max;
        }
        pane.priceScale.autoScale(min, max);
    }

    /**
     * Шаги подписей считаются в ценах, а не во внутреннем пространстве шкалы.
     * Для линейного и процентного режимов это точно; для логарифмического на
     * широком диапазоне шаг перестаёт быть круглым — там нужны отдельные
     * декадные засечки, это следующий шаг.
     */
    private tickStep(pane: PaneState): number {
        const { min, max } = pane.priceScale.priceRange();
        return niceStep(max - min, Math.max(pane.rect.height / PRICE_LABEL_SPACING, 1));
    }

    private drawPaneGrid(ctx: CanvasRenderingContext2D, pane: PaneState): void {
        // На пейнах с явными подписями роль сетки играют штриховые уровни
        // самого источника — дублировать их сплошными линиями незачем.
        if (pane.options.axisValues !== null) return;

        const { min, max } = pane.priceScale.priceRange();
        const step = this.tickStep(pane);

        ctx.beginPath();
        for (let value = Math.ceil(min / step) * step; value <= max; value += step) {
            const y = Math.round(pane.priceScale.yAt(value)) + 0.5;
            if (y < 0 || y > pane.rect.height) continue;
            ctx.moveTo(0, y);
            ctx.lineTo(this.paneWidth, y);
        }
        ctx.strokeStyle = this.options.colors.grid;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    private drawPaneAxis(ctx: CanvasRenderingContext2D, pane: PaneState): void {
        const { colors, font } = this.options;
        const { min, max } = pane.priceScale.priceRange();
        const step = this.tickStep(pane);
        const decimals = Math.max(0, -Math.floor(Math.log10(step)));
        const format =
            pane.options.formatValue ?? ((value: number): string => value.toFixed(decimals));

        ctx.font = font;
        ctx.fillStyle = colors.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const drawLabel = (value: number): void => {
            const y = pane.rect.top + pane.priceScale.yAt(value);
            // Подписи у самых краёв пейна обрезались бы соседним пейном.
            if (y < pane.rect.top + 8 || y > pane.rect.top + pane.rect.height - 4) return;
            ctx.fillText(format(value), this.paneWidth + 6, y);
        };

        if (pane.options.axisValues !== null) {
            for (const value of pane.options.axisValues) drawLabel(value);
            return;
        }
        for (let value = Math.ceil(min / step) * step; value <= max; value += step) {
            drawLabel(value);
        }
    }

    private drawSeparators(ctx: CanvasRenderingContext2D): void {
        if (this.panes.length < 2) return;
        ctx.beginPath();
        for (let i = 1; i < this.panes.length; i += 1) {
            const y = Math.round(this.panes[i]!.rect.top - this.options.separatorHeight / 2) + 0.5;
            ctx.moveTo(0, y);
            ctx.lineTo(this.mainLayer.width, y);
        }
        ctx.strokeStyle = this.options.colors.separator;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    private drawTimeAxis(ctx: CanvasRenderingContext2D, visible: VisibleRange): void {
        const { colors, font } = this.options;
        const y = this.paneAreaHeight;

        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(this.mainLayer.width, y + 0.5);
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (visible.to < visible.from) return;

        this.timeFormatter.setVisibleSpan(
            this.bars.timeAt(visible.to) - this.bars.timeAt(visible.from),
        );

        const barStep = Math.max(
            1,
            Math.ceil(TIME_LABEL_SPACING / Math.max(this.timeScale.barSpacing, 0.01)),
        );
        ctx.font = font;
        ctx.fillStyle = colors.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = visible.from; i <= visible.to; i += barStep) {
            const x = this.timeScale.xAt(i);
            if (x < 40 || x > this.paneWidth - 40) continue;
            ctx.fillText(this.timeFormatter.format(this.bars.timeAt(i)), x, y + 11);
        }
    }

    private paneAt(y: number): PaneState | null {
        for (const pane of this.panes) {
            if (y >= pane.rect.top && y <= pane.rect.top + pane.rect.height) return pane;
        }
        return null;
    }

    private drawOverlay(): void {
        const { ctx } = this.overlayLayer;
        const { colors, font } = this.options;
        this.overlayLayer.clear();

        const cursor = this.crosshair;
        if (cursor === null || cursor.x > this.paneWidth || cursor.y > this.paneAreaHeight) return;

        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = colors.crosshair;
        ctx.lineWidth = 1;

        const barIndex = Math.round(this.timeScale.logicalAt(cursor.x));
        const snappedX = Math.round(this.timeScale.xAt(barIndex)) + 0.5;
        const y = Math.round(cursor.y) + 0.5;

        ctx.beginPath();
        // Вертикаль идёт через все пейны — иначе связь между ценой, объёмом и
        // индикатором приходится восстанавливать глазами.
        ctx.moveTo(snappedX, 0);
        ctx.lineTo(snappedX, this.paneAreaHeight);
        ctx.moveTo(0, y);
        ctx.lineTo(this.paneWidth, y);
        ctx.stroke();
        ctx.restore();

        const pane = this.paneAt(cursor.y);
        if (pane === null) return;

        const value = pane.priceScale.priceAt(cursor.y - pane.rect.top);
        const step = this.tickStep(pane);
        const decimals = Math.max(0, -Math.floor(Math.log10(step)));
        const format =
            pane.options.formatValue ?? ((input: number): string => input.toFixed(decimals));

        ctx.font = font;
        ctx.fillStyle = colors.axisLabelBackground;
        ctx.fillRect(this.paneWidth, y - 9, this.options.priceScaleWidth, 18);
        ctx.fillStyle = colors.axisLabelText;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(format(value), this.paneWidth + 6, y);
    }

    private emitCrosshair(x: number, y: number): void {
        const barIndex = Math.round(this.timeScale.logicalAt(x));
        const inRange = barIndex >= 0 && barIndex < this.bars.length;
        const pane = this.paneAt(y);
        const legends: string[] = [];

        for (const item of this.panes) {
            for (const source of item.sources) {
                const legend = source.legendAt(this.bars, barIndex);
                if (legend !== null) legends.push(`${source.title}: ${legend}`);
            }
        }

        this.emitter.emit('crosshairMove', {
            barIndex,
            price:
                pane === null
                    ? NaN
                    : pane.priceScale.priceAt(y - pane.rect.top),
            bar: inRange ? this.bars.barAt(barIndex) : null,
            legends,
        });
    }
}

export function createChart(container: HTMLElement, options?: Partial<ChartOptions>): Chart {
    return new Chart(container, options);
}
