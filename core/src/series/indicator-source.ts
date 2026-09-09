import type { Indicator } from '../indicators/indicator.js';
import type { BarSeries, MinMax } from '../model/bars.js';
import { IndicatorSeries } from '../model/indicator-series.js';
import { LineGeometry, buildLineGeometry, drawLine, type LineStyle } from '../render/line.js';
import type { BuildContext, DataChange, SeriesSource } from './source.js';

export interface IndicatorSourceOptions extends LineStyle {
    /** Опорные уровни: 30 и 70 для RSI, ноль для осцилляторов. */
    levels: readonly number[];
    levelColor: string;
    /** Знаков после запятой в легенде. */
    precision: number;
}

const DEFAULT_OPTIONS: IndicatorSourceOptions = {
    color: '#c9a227',
    width: 1,
    levels: [],
    levelColor: '#3a3f4c',
    precision: 2,
};

export class IndicatorSource implements SeriesSource {
    readonly title: string;

    private readonly series = new IndicatorSeries();
    private readonly geometry = new LineGeometry();
    private readonly options: IndicatorSourceOptions;

    private paneWidth = 0;
    private levelY: number[] = [];

    constructor(
        private readonly indicator: Indicator,
        options: Partial<IndicatorSourceOptions> = {},
    ) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.title = indicator.name;
    }

    valueAt(index: number): number {
        return this.series.valueAt(index);
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
        buildLineGeometry(
            this.series,
            context.from,
            context.to,
            context.timeScale,
            context.priceScale,
            this.geometry,
        );
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
        drawLine(ctx, this.geometry, this.options);
    }

    legendAt(_bars: BarSeries, index: number): string | null {
        const value = this.series.valueAt(index);
        return Number.isNaN(value) ? null : value.toFixed(this.options.precision);
    }
}
