import type { Indicator } from '../indicators/indicator.js';
import type { BarSeries, MinMax } from '../model/bars.js';
import { IndicatorSeries } from '../model/indicator-series.js';
import { LineGeometry, buildLineGeometry, drawLine, type LineStyle } from '../render/line.js';
import type { BuildContext, DataChange, SeriesSource } from './source.js';

export interface IndicatorSourceOptions extends LineStyle {
    /**
     * Цвета по каналам. Короче числа каналов — остальные берут color.
     * У MACD это линия, сигнал и гистограмма, у BBANDS — три полосы.
     */
    channelColors: readonly string[];
    /** Опорные уровни: 30 и 70 для RSI, ноль для осцилляторов. */
    levels: readonly number[];
    levelColor: string;
    /** Знаков после запятой в легенде. */
    precision: number;
}

const DEFAULT_OPTIONS: IndicatorSourceOptions = {
    color: '#2196f3',
    width: 1,
    channelColors: [],
    levels: [],
    levelColor: '#2a2e39',
    precision: 2,
};

export class IndicatorSource implements SeriesSource {
    readonly title: string;

    private readonly series: IndicatorSeries;
    private readonly geometries: LineGeometry[];
    private readonly options: IndicatorSourceOptions;
    /** Цвет, заданный вызывающим, тема его не перекрывает. */
    private readonly colorIsExplicit: boolean;

    private paneWidth = 0;
    private levelY: number[] = [];

    constructor(
        private readonly indicator: Indicator,
        options: Partial<IndicatorSourceOptions> = {},
        explicitColor = false,
    ) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.title = indicator.name;
        this.colorIsExplicit = explicitColor;
        this.series = new IndicatorSeries(indicator.outputs.length);
        this.geometries = indicator.outputs.map(() => new LineGeometry());
    }

    /**
     * Цвета из темы. Цвет линии применяется только если вызывающий не выбрал
     * свой: у пользователя может быть настроен красный RSI, и смена темы не
     * должна его сбрасывать.
     */
    applyTheme(lineColor: string, levelColor: string): void {
        if (!this.colorIsExplicit) this.options.color = lineColor;
        this.options.levelColor = levelColor;
    }

    setStyle(patch: Partial<IndicatorSourceOptions>): void {
        Object.assign(this.options, patch);
    }

    valueAt(index: number, channel = 0): number {
        return this.series.valueAt(index, channel);
    }

    valueRange(_bars: BarSeries, from: number, to: number): MinMax {
        return this.series.minMaxInRange(from, to);
    }

    sync(bars: BarSeries, change: DataChange): void {
        switch (change) {
            case 'reset':
                this.series.recompute(bars, this.indicator);
                return;
            case 'append':
                this.series.pushLast(bars, this.indicator);
                return;
            case 'updateLast':
                this.series.updateLast(bars, this.indicator);
                return;
        }
    }

    build(context: BuildContext): void {
        for (let channel = 0; channel < this.geometries.length; channel += 1) {
            buildLineGeometry(
                this.series,
                channel,
                context.from,
                context.to,
                context.timeScale,
                context.priceScale,
                this.geometries[channel]!,
            );
        }
        this.paneWidth = context.paneWidth;
        this.levelY = this.options.levels.map((level) => context.priceScale.yAt(level));
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (this.levelY.length > 0) {
            ctx.save();
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            for (const y of this.levelY) {
                const snapped = Math.round(y) + 0.5;
                ctx.moveTo(0, snapped);
                ctx.lineTo(this.paneWidth, snapped);
            }
            ctx.strokeStyle = this.options.levelColor;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }

        for (let channel = 0; channel < this.geometries.length; channel += 1) {
            drawLine(ctx, this.geometries[channel]!, {
                color: this.options.channelColors[channel] ?? this.options.color,
                width: this.options.width,
            });
        }
    }

    legendAt(_bars: BarSeries, index: number): string | null {
        const parts: string[] = [];
        for (let channel = 0; channel < this.indicator.outputs.length; channel += 1) {
            const value = this.series.valueAt(index, channel);
            if (Number.isNaN(value)) continue;
            const label = this.indicator.outputs[channel]!;
            parts.push(
                this.indicator.outputs.length === 1
                    ? value.toFixed(this.options.precision)
                    : `${label} ${value.toFixed(this.options.precision)}`,
            );
        }
        return parts.length === 0 ? null : parts.join('  ');
    }
}
