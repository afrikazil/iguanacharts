import type { Bar } from '../model/bars.js';
import { EmaCore, type EmaSnapshot } from './ema-core.js';
import { IncrementalIndicator, WindowIndicator, requirePositiveInt } from './indicator.js';

/** Вклад бара в накопление-распределение. Нулевой размах вклада не даёт. */
function accumulationStep(bar: Bar): number {
    const span = bar.high - bar.low;
    if (span <= 0) return 0;
    return ((bar.close - bar.low - (bar.high - bar.close)) / span) * bar.volume;
}

interface CumulativeState {
    value: number;
    seen: number;
    prevClose: number;
}

/**
 * Накопление-распределение: кумулятивный объём, взвешенный положением
 * закрытия внутри диапазона бара.
 */
export class Ad extends IncrementalIndicator<CumulativeState> {
    readonly name = 'AD';
    readonly outputs = ['AD'] as const;

    private value = 0;

    protected initState(): void {
        this.value = 0;
    }

    protected captureState(): CumulativeState {
        return { value: this.value, seen: 0, prevClose: NaN };
    }

    protected restoreState(state: CumulativeState): void {
        this.value = state.value;
    }

    protected step(bar: Bar, out: Float64Array): void {
        this.value += accumulationStep(bar);
        out[0] = this.value;
    }
}

interface AdoscState {
    ad: number;
    fast: EmaSnapshot;
    slow: EmaSnapshot;
}

/**
 * Осциллятор Чайкина: разность быстрой и медленной EMA от линии накопления.
 *
 * Обе EMA засеваются первым значением AD, а не средним, — так устроен
 * оригинал, и от этого зависят все последующие значения.
 */
export class Adosc extends IncrementalIndicator<AdoscState> {
    readonly name: string;
    readonly outputs = ['ADOSC'] as const;

    private readonly fast: EmaCore;
    private readonly slow: EmaCore;
    private ad = 0;

    constructor(fastPeriod = 3, slowPeriod = 10) {
        super();
        requirePositiveInt(fastPeriod, 'быстрый период ADOSC');
        requirePositiveInt(slowPeriod, 'медленный период ADOSC');
        // Оба выхода открываются на баре max(period) - 1.
        const slowest = Math.max(fastPeriod, slowPeriod);
        this.fast = new EmaCore(fastPeriod, slowest - 1, 'first');
        this.slow = new EmaCore(slowPeriod, slowest - 1, 'first');
        this.name = `ADOSC(${fastPeriod},${slowPeriod})`;
    }

    protected initState(): void {
        this.ad = 0;
        this.fast.reset();
        this.slow.reset();
    }

    protected captureState(): AdoscState {
        return { ad: this.ad, fast: this.fast.capture(), slow: this.slow.capture() };
    }

    protected restoreState(state: AdoscState): void {
        this.ad = state.ad;
        this.fast.restore(state.fast);
        this.slow.restore(state.slow);
    }

    protected step(bar: Bar, out: Float64Array): void {
        this.ad += accumulationStep(bar);
        const fast = this.fast.push(this.ad);
        const slow = this.slow.push(this.ad);
        out[0] = Number.isNaN(fast) || Number.isNaN(slow) ? NaN : fast - slow;
    }
}

/**
 * On Balance Volume: объём со знаком изменения закрытия.
 * Первое значение равно объёму первого бара — сравнивать ещё не с чем.
 */
export class Obv extends IncrementalIndicator<CumulativeState> {
    readonly name = 'OBV';
    readonly outputs = ['OBV'] as const;

    private value = 0;
    private prevClose = NaN;
    private seen = 0;

    protected initState(): void {
        this.value = 0;
        this.prevClose = NaN;
        this.seen = 0;
    }

    protected captureState(): CumulativeState {
        return { value: this.value, seen: this.seen, prevClose: this.prevClose };
    }

    protected restoreState(state: CumulativeState): void {
        this.value = state.value;
        this.seen = state.seen;
        this.prevClose = state.prevClose;
    }

    protected step(bar: Bar, out: Float64Array): void {
        if (this.seen === 0) {
            this.value = bar.volume;
            this.prevClose = bar.close;
            this.seen = 1;
            out[0] = this.value;
            return;
        }
        if (bar.close > this.prevClose) this.value += bar.volume;
        else if (bar.close < this.prevClose) this.value -= bar.volume;
        this.prevClose = bar.close;
        this.seen += 1;
        out[0] = this.value;
    }
}

/**
 * Volume Price Trend: кумулятивный объём, взвешенный относительным изменением
 * закрытия. Первое значение — ноль, потому что изменения ещё нет.
 */
export class Vpt extends IncrementalIndicator<CumulativeState> {
    readonly name = 'VPT';
    readonly outputs = ['VPT'] as const;

    private value = 0;
    private prevClose = NaN;
    private seen = 0;

    protected initState(): void {
        this.value = 0;
        this.prevClose = NaN;
        this.seen = 0;
    }

    protected captureState(): CumulativeState {
        return { value: this.value, seen: this.seen, prevClose: this.prevClose };
    }

    protected restoreState(state: CumulativeState): void {
        this.value = state.value;
        this.seen = state.seen;
        this.prevClose = state.prevClose;
    }

    protected step(bar: Bar, out: Float64Array): void {
        if (this.seen === 0) {
            this.value = 0;
            this.prevClose = bar.close;
            this.seen = 1;
            out[0] = 0;
            return;
        }
        if (this.prevClose !== 0) {
            this.value += (bar.volume * (bar.close - this.prevClose)) / this.prevClose;
        }
        this.prevClose = bar.close;
        this.seen += 1;
        out[0] = this.value;
    }
}

/**
 * Money Flow Index: доля положительного денежного потока за период.
 *
 * Поток считается по типичной цене против предыдущей, поэтому окно на бар
 * длиннее периода, а первое значение выходит на баре period.
 */
export class Mfi extends WindowIndicator {
    readonly name: string;
    readonly outputs = ['MFI'] as const;

    constructor(private readonly period = 14) {
        super(requirePositiveInt(period, 'период MFI') + 1);
        this.name = `MFI(${period})`;
    }

    protected compute(out: Float64Array): void {
        if (!this.window.full) {
            this.fillUnready(out);
            return;
        }
        let positive = 0;
        let negative = 0;

        // Идём от старого бара к новому: поток определяется сравнением с
        // предыдущей типичной ценой.
        for (let back = this.period - 1; back >= 0; back -= 1) {
            const current = this.typical(back);
            const previous = this.typical(back + 1);
            const flow = current * this.window.volume(back);
            if (current > previous) positive += flow;
            else if (current < previous) negative += flow;
        }

        const total = positive + negative;
        out[0] = total === 0 ? 0 : (100 * positive) / total;
    }

    private typical(back: number): number {
        return (this.window.high(back) + this.window.low(back) + this.window.close(back)) / 3;
    }
}
