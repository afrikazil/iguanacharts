import { Emitter } from './emitter.js';
import { attachPointerInput } from './input/pointer.js';
import { BarSeries, type Bar } from './model/bars.js';
import { Invalidation, type InvalidationLevel } from './model/invalidation.js';
import { PriceScale, type PriceScaleMode } from './model/price-scale.js';
import { TimeScale, type TimeScaleOptions, type VisibleRange } from './model/time-scale.js';
import { drawCandles, type CandleStyle } from './render/candle-renderer.js';
import { CanvasLayer } from './render/canvas-layer.js';
import { FrameLoop } from './render/frame-loop.js';
import { CandleGeometry, buildCandleGeometry, niceStep } from './render/geometry.js';
import { TimeAxisFormatter } from './render/time-format.js';

export interface ChartColors extends CandleStyle {
    background: string;
    grid: string;
    text: string;
    crosshair: string;
    axisLabelBackground: string;
    axisLabelText: string;
}

export interface ChartOptions {
    colors: ChartColors;
    /** Ширина шкалы цен справа, px. */
    priceScaleWidth: number;
    /** Высота шкалы времени снизу, px. */
    timeScaleHeight: number;
    priceScaleMode: PriceScaleMode;
    timeScale: Partial<TimeScaleOptions>;
    font: string;
}

export interface CrosshairPayload {
    barIndex: number;
    price: number;
    bar: Bar | null;
}

export interface ChartEvents extends Record<string, unknown> {
    visibleRangeChange: VisibleRange;
    crosshairMove: CrosshairPayload;
    crosshairLeave: undefined;
}

export const DEFAULT_COLORS: ChartColors = {
    background: '#161a25',
    grid: '#232733',
    text: '#8b90a0',
    crosshair: '#5c6272',
    axisLabelBackground: '#2a2e39',
    axisLabelText: '#d6d9e0',
    upColor: '#26a69a',
    downColor: '#ef5350',
    upWickColor: '#26a69a',
    downWickColor: '#ef5350',
};

const DEFAULT_OPTIONS: ChartOptions = {
    colors: DEFAULT_COLORS,
    priceScaleWidth: 64,
    timeScaleHeight: 22,
    priceScaleMode: 'linear',
    timeScale: {},
    font: '11px -apple-system, Roboto, "Helvetica Neue", sans-serif',
};

/** Целевое расстояние между подписями осей, px. */
const PRICE_LABEL_SPACING = 44;
const TIME_LABEL_SPACING = 84;

export class Chart {
    private readonly options: ChartOptions;
    private readonly bars = new BarSeries();
    private readonly timeScale: TimeScale;
    private readonly priceScale: PriceScale;
    private readonly geometry = new CandleGeometry();
    private readonly emitter = new Emitter<ChartEvents>();

    private readonly host: HTMLElement;
    private readonly mainLayer: CanvasLayer;
    private readonly overlayLayer: CanvasLayer;
    private readonly frameLoop: FrameLoop;
    private readonly detachInput: () => void;
    private readonly resizeObserver: ResizeObserver;

    private paneWidth = 0;
    private paneHeight = 0;
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
            colors: { ...DEFAULT_COLORS, ...options.colors },
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
        this.priceScale = new PriceScale({ mode: this.options.priceScaleMode });

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
        this.fitContent();
    }

    /** Тик: если время совпало с последним баром — обновляем его, иначе новый бар. */
    update(bar: Bar): void {
        const length = this.bars.length;
        if (length > 0 && this.bars.timeAt(length - 1) === bar.time) {
            this.bars.updateLast(bar);
        } else {
            this.bars.append(bar);
            this.timeScale.setBarCount(this.bars.length);
        }
        this.frameLoop.invalidate(Invalidation.Full);
    }

    prependHistory(bars: readonly Bar[]): void {
        this.bars.prepend(bars);
        this.timeScale.setBarCount(this.bars.length);
        this.frameLoop.invalidate(Invalidation.Full);
    }

    setPriceScaleMode(mode: PriceScaleMode): void {
        this.priceScale.setMode(mode);
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
        this.paneHeight = Math.max(height - this.options.timeScaleHeight, 0);
        this.timeScale.setWidth(this.paneWidth);
        this.priceScale.setHeight(this.paneHeight);

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
        if (visible.to >= visible.from) {
            if (this.priceScale.mode === 'percentage') {
                this.priceScale.setBase(this.bars.closeAt(visible.from));
            }
            const { min, max } = this.bars.lowHighInRange(visible.from, visible.to);
            this.priceScale.autoScale(min, max);
        }

        this.drawGrid(ctx);

        if (visible.to >= visible.from) {
            if (rebuildGeometry) {
                buildCandleGeometry(
                    this.bars,
                    visible.from,
                    visible.to,
                    this.timeScale,
                    this.priceScale,
                    this.geometry,
                );
            }
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, this.paneWidth, this.paneHeight);
            ctx.clip();
            drawCandles(ctx, this.geometry, colors);
            ctx.restore();
        } else {
            this.geometry.count = 0;
        }

        this.drawPriceAxis(ctx);
        this.drawTimeAxis(ctx, visible);

        if (visible.from !== this.lastVisible.from || visible.to !== this.lastVisible.to) {
            this.lastVisible = visible;
            this.emitter.emit('visibleRangeChange', visible);
        }
    }

    /**
     * Шаги подписей считаются в ценах, а не во внутреннем пространстве шкалы.
     * Для линейного и процентного режимов это точно; для логарифмического на
     * широком диапазоне шаг перестаёт быть круглым — там нужны отдельные
     * декадные засечки, это следующий шаг.
     */
    private priceTickStep(): number {
        const { min, max } = this.priceScale.priceRange();
        return niceStep(max - min, Math.max(this.paneHeight / PRICE_LABEL_SPACING, 1));
    }

    private drawGrid(ctx: CanvasRenderingContext2D): void {
        const { colors } = this.options;
        const { min, max } = this.priceScale.priceRange();
        const step = this.priceTickStep();

        ctx.beginPath();
        for (let price = Math.ceil(min / step) * step; price <= max; price += step) {
            const y = Math.round(this.priceScale.yAt(price)) + 0.5;
            ctx.moveTo(0, y);
            ctx.lineTo(this.paneWidth, y);
        }
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    private drawPriceAxis(ctx: CanvasRenderingContext2D): void {
        const { colors, font, priceScaleWidth } = this.options;
        const { min, max } = this.priceScale.priceRange();
        const step = this.priceTickStep();
        const decimals = Math.max(0, -Math.floor(Math.log10(step)));

        ctx.fillStyle = colors.background;
        ctx.fillRect(this.paneWidth, 0, priceScaleWidth, this.mainLayer.height);
        ctx.font = font;
        ctx.fillStyle = colors.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (let price = Math.ceil(min / step) * step; price <= max; price += step) {
            const y = this.priceScale.yAt(price);
            if (y < 8 || y > this.paneHeight - 4) continue;
            ctx.fillText(price.toFixed(decimals), this.paneWidth + 6, y);
        }
    }

    private drawTimeAxis(ctx: CanvasRenderingContext2D, visible: VisibleRange): void {
        const { colors, font } = this.options;
        const y = this.paneHeight;

        ctx.fillStyle = colors.background;
        ctx.fillRect(0, y, this.mainLayer.width, this.options.timeScaleHeight);
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(this.mainLayer.width, y + 0.5);
        ctx.strokeStyle = colors.grid;
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
            if (x < 20 || x > this.paneWidth - 20) continue;
            ctx.fillText(this.timeFormatter.format(this.bars.timeAt(i)), x, y + 11);
        }
    }

    private drawOverlay(): void {
        const { ctx } = this.overlayLayer;
        const { colors, font } = this.options;
        this.overlayLayer.clear();

        const cursor = this.crosshair;
        if (cursor === null || cursor.x > this.paneWidth || cursor.y > this.paneHeight) return;

        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = colors.crosshair;
        ctx.lineWidth = 1;

        const barIndex = Math.round(this.timeScale.logicalAt(cursor.x));
        const snappedX = Math.round(this.timeScale.xAt(barIndex)) + 0.5;
        const y = Math.round(cursor.y) + 0.5;

        ctx.beginPath();
        ctx.moveTo(snappedX, 0);
        ctx.lineTo(snappedX, this.paneHeight);
        ctx.moveTo(0, y);
        ctx.lineTo(this.paneWidth, y);
        ctx.stroke();
        ctx.restore();

        // Подпись цены под курсором на шкале справа.
        const price = this.priceScale.priceAt(cursor.y);
        const step = this.priceTickStep();
        const decimals = Math.max(0, -Math.floor(Math.log10(step)));
        const label = price.toFixed(decimals);

        ctx.font = font;
        const width = this.options.priceScaleWidth;
        ctx.fillStyle = colors.axisLabelBackground;
        ctx.fillRect(this.paneWidth, y - 9, width, 18);
        ctx.fillStyle = colors.axisLabelText;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, this.paneWidth + 6, y);
    }

    private emitCrosshair(x: number, y: number): void {
        const barIndex = Math.round(this.timeScale.logicalAt(x));
        const inRange = barIndex >= 0 && barIndex < this.bars.length;
        this.emitter.emit('crosshairMove', {
            barIndex,
            price: this.priceScale.priceAt(y),
            bar: inRange ? this.bars.barAt(barIndex) : null,
        });
    }
}

export function createChart(container: HTMLElement, options?: Partial<ChartOptions>): Chart {
    return new Chart(container, options);
}
