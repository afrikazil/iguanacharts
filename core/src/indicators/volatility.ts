import type { Bar } from '../model/bars.js';
import { EmaCore, type EmaSnapshot } from './ema-core.js';
import {
    BarWindow,
    IncrementalIndicator,
    WindowIndicator,
    requirePositiveInt,
    type Indicator,
} from './indicator.js';
import { MaType, createMovingAverage, type MaTypeValue } from './moving-averages.js';
import { priceOf, trueRange, type PriceSource } from './price.js';

/** Дисперсия по совокупности за период: E[x²] − (E[x])². */
export class Variance extends WindowIndicator {
    readonly name: string;
    readonly outputs = ['VAR'] as const;

    constructor(
        private readonly period = 2,
        private readonly source: PriceSource = 'close',
    ) {
        super(requirePositiveInt(period, 'период VAR'));
        this.name = `VAR(${period})`;
    }

    protected compute(out: Float64Array): void {
        if (!this.window.full) {
            this.fillUnready(out);
            return;
        }
        out[0] = varianceOf(this.window, this.period, this.source);
    }
}

/** Стандартное отклонение, умноженное на число отклонений. */
export class StdDev extends WindowIndicator {
    readonly name: string;
    readonly outputs = ['STDDEV'] as const;

    constructor(
        private readonly period = 10,
        private readonly deviations = 1,
        private readonly source: PriceSource = 'close',
    ) {
        super(requirePositiveInt(period, 'период STDDEV'));
        this.name = `STDDEV(${period})`;
    }

    protected compute(out: Float64Array): void {
        if (!this.window.full) {
            this.fillUnready(out);
            return;
        }
        const variance = varianceOf(this.window, this.period, this.source);
        out[0] = Math.sqrt(Math.max(variance, 0)) * this.deviations;
    }
}

export function varianceOf(
    window: BarWindow,
    period: number,
    source: PriceSource,
): number {
    let sum = 0;
    let sumSquares = 0;
    for (let back = 0; back < period; back += 1) {
        const value = valueFromWindow(window, back, source);
        sum += value;
        sumSquares += value * value;
    }
    const mean = sum / period;
    return sumSquares / period - mean * mean;
}

export function valueFromWindow(
    window: BarWindow,
    back: number,
    source: PriceSource,
): number {
    switch (source) {
        case 'open':
            return window.open(back);
        case 'high':
            return window.high(back);
        case 'low':
            return window.low(back);
        case 'close':
            return window.close(back);
    }
}

export interface BbandsOptions {
    period: number;
    deviationsUp: number;
    deviationsDown: number;
    maType: MaTypeValue;
    source: PriceSource;
}

/**
 * Полосы Боллинджера: среднее плюс-минус стандартное отклонение.
 *
 * Порядок каналов взят из legacy — верхняя, нижняя, средняя, — чтобы
 * сохранённые настройки цветов не перепутались местами.
 */
export class Bbands implements Indicator {
    readonly name: string;
    readonly outputs = ['UpperBand', 'LowerBand', 'MiddleBand'] as const;

    private readonly window: BarWindow;
    private readonly ma: Indicator;
    private readonly maOut: Float64Array;
    private readonly options: BbandsOptions;

    constructor(options: Partial<BbandsOptions> = {}) {
        this.options = {
            period: 7,
            deviationsUp: 2,
            deviationsDown: 2,
            maType: MaType.Sma,
            source: 'close',
            ...options,
        };
        requirePositiveInt(this.options.period, 'период BBANDS');
        this.window = new BarWindow(this.options.period);
        this.ma = createMovingAverage(this.options.maType, this.options.period, this.options.source);
        this.maOut = new Float64Array(this.ma.outputs.length);
        this.name = `BBANDS(${this.options.period})`;
    }

    reset(): void {
        this.window.clear();
        this.ma.reset();
    }

    push(bar: Bar, out: Float64Array): void {
        this.window.push(bar);
        this.ma.push(bar, this.maOut);
        this.compute(out);
    }

    updateLast(bar: Bar, out: Float64Array): void {
        this.window.replaceLast(bar);
        this.ma.updateLast(bar, this.maOut);
        this.compute(out);
    }

    private compute(out: Float64Array): void {
        const middle = this.maOut[0]!;
        if (!this.window.full || Number.isNaN(middle)) {
            out[0] = NaN;
            out[1] = NaN;
            out[2] = NaN;
            return;
        }
        const variance = varianceOf(this.window, this.options.period, this.options.source);
        const deviation = Math.sqrt(Math.max(variance, 0));
        out[0] = middle + deviation * this.options.deviationsUp;
        out[1] = middle - deviation * this.options.deviationsDown;
        out[2] = middle;
    }
}

interface AtrState {
    value: number;
    seen: number;
    seedSum: number;
    ready: boolean;
    prevClose: number;
    hasPrev: boolean;
}

/**
 * Средний истинный диапазон со сглаживанием Уайлдера.
 *
 * Затравка — простое среднее первых period значений истинного диапазона,
 * а сам диапазон требует предыдущего бара, поэтому первое значение выходит
 * на баре period, а не period − 1.
 */
export class Atr extends IncrementalIndicator<AtrState> {
    readonly name: string;
    readonly outputs = ['ATR'] as const;

    private value = NaN;
    private seen = 0;
    private seedSum = 0;
    private ready = false;
    private prevClose = NaN;
    private hasPrev = false;

    constructor(private readonly period = 14) {
        super();
        requirePositiveInt(period, 'период ATR');
        this.name = `ATR(${period})`;
    }

    protected initState(): void {
        this.value = NaN;
        this.seen = 0;
        this.seedSum = 0;
        this.ready = false;
        this.prevClose = NaN;
        this.hasPrev = false;
    }

    protected captureState(): AtrState {
        return {
            value: this.value,
            seen: this.seen,
            seedSum: this.seedSum,
            ready: this.ready,
            prevClose: this.prevClose,
            hasPrev: this.hasPrev,
        };
    }

    protected restoreState(state: AtrState): void {
        this.value = state.value;
        this.seen = state.seen;
        this.seedSum = state.seedSum;
        this.ready = state.ready;
        this.prevClose = state.prevClose;
        this.hasPrev = state.hasPrev;
    }

    protected step(bar: Bar, out: Float64Array): void {
        if (!this.hasPrev) {
            this.prevClose = bar.close;
            this.hasPrev = true;
            out[0] = NaN;
            return;
        }
        const range = trueRange(bar.high, bar.low, this.prevClose);
        this.prevClose = bar.close;

        if (!this.ready) {
            this.seedSum += range;
            this.seen += 1;
            if (this.seen < this.period) {
                out[0] = NaN;
                return;
            }
            this.value = this.seedSum / this.period;
            this.ready = true;
            out[0] = this.value;
            return;
        }
        this.value = (this.value * (this.period - 1) + range) / this.period;
        out[0] = this.value;
    }
}

interface ChvState {
    ema: EmaSnapshot;
    ring: Float64Array;
    seen: number;
}

/**
 * Волатильность Чайкина: скорость изменения EMA от размаха бара (H − L).
 * Растущее значение означает расширение диапазонов, то есть рост волатильности.
 */
export class Chv extends IncrementalIndicator<ChvState> {
    readonly name: string;
    readonly outputs = ['CHV'] as const;

    private readonly ema: EmaCore;
    /** Кольцо значений EMA длиной rocPeriod + 1 — нужно значение rocPeriod назад. */
    private readonly ring: Float64Array;
    private seen = 0;

    constructor(
        period = 10,
        private readonly rocPeriod = 10,
    ) {
        super();
        requirePositiveInt(rocPeriod, 'период ROC для CHV');
        this.ema = new EmaCore(period);
        this.ring = new Float64Array(rocPeriod + 1);
        this.name = `CHV(${period},${rocPeriod})`;
    }

    protected initState(): void {
        this.ema.reset();
        this.ring.fill(NaN);
        this.seen = 0;
    }

    protected captureState(): ChvState {
        return { ema: this.ema.capture(), ring: this.ring.slice(), seen: this.seen };
    }

    protected restoreState(state: ChvState): void {
        this.ema.restore(state.ema);
        this.ring.set(state.ring);
        this.seen = state.seen;
    }

    protected step(bar: Bar, out: Float64Array): void {
        const current = this.ema.push(bar.high - bar.low);
        if (Number.isNaN(current)) {
            out[0] = NaN;
            return;
        }
        this.ring[this.seen % this.ring.length] = current;
        const lagged =
            this.seen >= this.rocPeriod
                ? this.ring[(this.seen - this.rocPeriod) % this.ring.length]!
                : NaN;
        this.seen += 1;

        out[0] =
            Number.isNaN(lagged) || lagged === 0 ? NaN : ((current - lagged) / lagged) * 100;
    }
}

/**
 * Конверты: скользящее среднее, сдвинутое вверх и вниз на процент.
 * Порядок каналов — нижний, верхний, как в legacy.
 */
export class Envelopes implements Indicator {
    readonly name: string;
    readonly outputs = ['Lower', 'Upper'] as const;

    private readonly ma: Indicator;
    private readonly maOut: Float64Array;

    constructor(
        period = 20,
        private readonly shiftPercent = 1,
        maType: MaTypeValue = MaType.Sma,
        source: PriceSource = 'close',
    ) {
        this.ma = createMovingAverage(maType, period, source);
        this.maOut = new Float64Array(this.ma.outputs.length);
        this.name = `ENV(${period},${shiftPercent})`;
    }

    reset(): void {
        this.ma.reset();
    }

    push(bar: Bar, out: Float64Array): void {
        this.ma.push(bar, this.maOut);
        this.compute(out);
    }

    updateLast(bar: Bar, out: Float64Array): void {
        this.ma.updateLast(bar, this.maOut);
        this.compute(out);
    }

    private compute(out: Float64Array): void {
        const middle = this.maOut[0]!;
        if (Number.isNaN(middle)) {
            out[0] = NaN;
            out[1] = NaN;
            return;
        }
        const shift = this.shiftPercent / 100;
        out[0] = middle * (1 - shift);
        out[1] = middle * (1 + shift);
    }
}

/**
 * Ценовой канал: максимум максимумов и минимум минимумов за свои периоды.
 * Периоды у границ независимы, поэтому окно берётся по большему из них.
 */
export class PriceChannel extends WindowIndicator {
    readonly name: string;
    readonly outputs = ['high', 'low'] as const;

    constructor(
        private readonly upperPeriod = 13,
        private readonly lowerPeriod = 13,
    ) {
        super(
            Math.max(
                requirePositiveInt(upperPeriod, 'верхний период PCH'),
                requirePositiveInt(lowerPeriod, 'нижний период PCH'),
            ),
        );
        this.name = `PCH(${lowerPeriod},${upperPeriod})`;
    }

    protected compute(out: Float64Array): void {
        if (!this.window.full) {
            this.fillUnready(out);
            return;
        }
        let highest = this.window.high();
        for (let back = 1; back < this.upperPeriod; back += 1) {
            const value = this.window.high(back);
            if (value > highest) highest = value;
        }
        let lowest = this.window.low();
        for (let back = 1; back < this.lowerPeriod; back += 1) {
            const value = this.window.low(back);
            if (value < lowest) lowest = value;
        }
        out[0] = highest;
        out[1] = lowest;
    }
}

/** Скорость изменения цены в процентах за period баров. */
export class Roc extends WindowIndicator {
    readonly name: string;
    readonly outputs = ['ROC'] as const;

    constructor(
        private readonly period = 10,
        private readonly source: PriceSource = 'close',
    ) {
        super(requirePositiveInt(period, 'период ROC') + 1);
        this.name = `ROC(${period})`;
    }

    protected compute(out: Float64Array): void {
        if (!this.window.full) {
            this.fillUnready(out);
            return;
        }
        const current = valueFromWindow(this.window, 0, this.source);
        const past = valueFromWindow(this.window, this.period, this.source);
        out[0] = past === 0 ? NaN : ((current - past) / past) * 100;
    }
}

/**
 * Detrended Price Oscillator: разница между текущей ценой и средним,
 * сдвинутым в прошлое на period / 2 + 1 баров.
 */
export class Dpo implements Indicator {
    readonly name: string;
    readonly outputs = ['DPO'] as const;

    private readonly shift: number;
    private readonly ma: Indicator;
    private readonly maOut: Float64Array;
    /** Кольцо значений среднего — нужно значение shift баров назад. */
    private readonly ring: Float64Array;
    private seen = 0;

    constructor(
        private readonly period = 20,
        private readonly source: PriceSource = 'close',
        maType: MaTypeValue = MaType.Sma,
    ) {
        requirePositiveInt(period, 'период DPO');
        this.shift = Math.floor(period / 2) + 1;
        this.ma = createMovingAverage(maType, period, source);
        this.maOut = new Float64Array(this.ma.outputs.length);
        this.ring = new Float64Array(this.shift + 1).fill(NaN);
        this.name = `DPO(${period})`;
    }

    reset(): void {
        this.ma.reset();
        this.ring.fill(NaN);
        this.seen = 0;
    }

    push(bar: Bar, out: Float64Array): void {
        this.ma.push(bar, this.maOut);
        this.ring[this.seen % this.ring.length] = this.maOut[0]!;
        this.compute(bar, out);
        this.seen += 1;
    }

    updateLast(bar: Bar, out: Float64Array): void {
        this.ma.updateLast(bar, this.maOut);
        const slot = (this.seen - 1 + this.ring.length) % this.ring.length;
        if (this.seen > 0) this.ring[slot] = this.maOut[0]!;
        this.compute(bar, out, this.seen - 1);
    }

    private compute(bar: Bar, out: Float64Array, at = this.seen): void {
        const laggedIndex = at - this.shift;
        if (laggedIndex < 0) {
            out[0] = NaN;
            return;
        }
        const lagged = this.ring[laggedIndex % this.ring.length]!;
        out[0] = Number.isNaN(lagged) ? NaN : priceOf(bar, this.source) - lagged;
    }
}
