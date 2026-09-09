import type { Bar } from '../model/bars.js';
import { EmaCore, type EmaSnapshot } from './ema-core.js';
import {
    BarWindow,
    IncrementalIndicator,
    WindowIndicator,
    requirePositiveInt,
    type Indicator,
} from './indicator.js';
import { NumberWindow } from './number-window.js';

/**
 * Commodity Channel Index: отклонение типичной цены от её среднего,
 * нормированное средним абсолютным отклонением. Множитель 0.015 подобран так,
 * чтобы большая часть значений укладывалась в диапазон ±100.
 */
export class Cci extends WindowIndicator {
    readonly name: string;
    readonly outputs = ['CCI'] as const;

    constructor(private readonly period = 14) {
        super(requirePositiveInt(period, 'период CCI'));
        this.name = `CCI(${period})`;
    }

    protected compute(out: Float64Array): void {
        if (!this.window.full) {
            this.fillUnready(out);
            return;
        }
        let sum = 0;
        for (let back = 0; back < this.period; back += 1) sum += typicalPrice(this.window, back);
        const mean = sum / this.period;

        let deviationSum = 0;
        for (let back = 0; back < this.period; back += 1) {
            deviationSum += Math.abs(typicalPrice(this.window, back) - mean);
        }
        const meanDeviation = deviationSum / this.period;
        const current = typicalPrice(this.window, 0);

        out[0] = meanDeviation === 0 ? 0 : (current - mean) / (0.015 * meanDeviation);
    }
}

function typicalPrice(window: BarWindow, back: number): number {
    return (window.high(back) + window.low(back) + window.close(back)) / 3;
}

/**
 * Williams %R: положение закрытия внутри диапазона периода, от 0 до −100.
 * Ноль означает закрытие на максимуме, −100 — на минимуме.
 */
export class WilliamsR extends WindowIndicator {
    readonly name: string;
    readonly outputs = ['WILLR'] as const;

    constructor(private readonly period = 14) {
        super(requirePositiveInt(period, 'период WILLR'));
        this.name = `WILLR(${period})`;
    }

    protected compute(out: Float64Array): void {
        if (!this.window.full) {
            this.fillUnready(out);
            return;
        }
        const { highest, lowest } = extremes(this.window, this.period);
        const span = highest - lowest;
        out[0] = span === 0 ? 0 : ((highest - this.window.close()) / span) * -100;
    }
}

function extremes(window: BarWindow, period: number): { highest: number; lowest: number } {
    let highest = window.high();
    let lowest = window.low();
    for (let back = 1; back < period; back += 1) {
        const high = window.high(back);
        const low = window.low(back);
        if (high > highest) highest = high;
        if (low < lowest) lowest = low;
    }
    return { highest, lowest };
}

/**
 * Aroon: сколько баров прошло с момента максимума и минимума периода.
 * 100 означает, что экстремум пришёлся на текущий бар.
 *
 * Окно на бар больше периода: TA-Lib смотрит на period + 1 значений,
 * включая текущее, поэтому разогрев равен period, а не period − 1.
 */
export class Aroon extends WindowIndicator {
    readonly name: string;
    readonly outputs = ['AroonDown', 'AroonUp'] as const;

    constructor(private readonly period = 14) {
        super(requirePositiveInt(period, 'период AROON') + 1);
        this.name = `AROON(${period})`;
    }

    protected compute(out: Float64Array): void {
        if (!this.window.full) {
            this.fillUnready(out);
            return;
        }
        let highestBack = 0;
        let lowestBack = 0;
        let highest = this.window.high();
        let lowest = this.window.low();

        for (let back = 1; back <= this.period; back += 1) {
            const high = this.window.high(back);
            const low = this.window.low(back);
            if (high > highest) {
                highest = high;
                highestBack = back;
            }
            if (low < lowest) {
                lowest = low;
                lowestBack = back;
            }
        }
        out[0] = ((this.period - lowestBack) / this.period) * 100;
        out[1] = ((this.period - highestBack) / this.period) * 100;
    }
}

export interface StochOptions {
    fastKPeriod: number;
    slowKPeriod: number;
    slowDPeriod: number;
}

/**
 * Стохастик: положение закрытия в диапазоне, дважды сглаженное.
 *
 * Разогрев складывается из трёх звеньев — (fastK − 1) + (slowK − 1) +
 * (slowD − 1), потому что каждое следующее сглаживание работает уже по
 * производному ряду.
 */
export class Stoch implements Indicator {
    readonly name: string;
    readonly outputs = ['slowK', 'slowD'] as const;

    private readonly options: StochOptions;
    private readonly bars: BarWindow;
    private readonly fastKWindow: NumberWindow;
    private readonly slowKWindow: NumberWindow;

    constructor(options: Partial<StochOptions> = {}) {
        this.options = { fastKPeriod: 5, slowKPeriod: 3, slowDPeriod: 3, ...options };
        requirePositiveInt(this.options.fastKPeriod, 'период fastK');
        this.bars = new BarWindow(this.options.fastKPeriod);
        this.fastKWindow = new NumberWindow(this.options.slowKPeriod);
        this.slowKWindow = new NumberWindow(this.options.slowDPeriod);
        this.name = `STOCH(${this.options.fastKPeriod},${this.options.slowKPeriod},${this.options.slowDPeriod})`;
    }

    reset(): void {
        this.bars.clear();
        this.fastKWindow.clear();
        this.slowKWindow.clear();
    }

    push(bar: Bar, out: Float64Array): void {
        this.bars.push(bar);
        this.advance(false, out);
    }

    updateLast(bar: Bar, out: Float64Array): void {
        this.bars.replaceLast(bar);
        this.advance(true, out);
    }

    private advance(replace: boolean, out: Float64Array): void {
        const fastK = this.computeFastK();
        if (Number.isNaN(fastK)) {
            out[0] = NaN;
            out[1] = NaN;
            return;
        }
        if (replace && this.fastKWindow.seen > 0) this.fastKWindow.replaceLast(fastK);
        else this.fastKWindow.push(fastK);

        const slowK = this.fastKWindow.mean();
        if (Number.isNaN(slowK)) {
            out[0] = NaN;
            out[1] = NaN;
            return;
        }
        if (replace && this.slowKWindow.seen > 0) this.slowKWindow.replaceLast(slowK);
        else this.slowKWindow.push(slowK);

        out[0] = slowK;
        out[1] = this.slowKWindow.mean();
    }

    private computeFastK(): number {
        if (!this.bars.full) return NaN;
        const { highest, lowest } = extremes(this.bars, this.options.fastKPeriod);
        const span = highest - lowest;
        return span === 0 ? 0 : ((this.bars.close() - lowest) / span) * 100;
    }
}

export interface MacdOptions {
    fastPeriod: number;
    slowPeriod: number;
    signalPeriod: number;
}

interface MacdState {
    fast: EmaSnapshot;
    slow: EmaSnapshot;
    signal: EmaSnapshot;
}

/**
 * MACD: разница быстрой и медленной EMA, её сигнальная EMA и разность между
 * ними. Гистограмма отдаётся третьим каналом.
 */
export class Macd extends IncrementalIndicator<MacdState> {
    readonly name: string;
    readonly outputs = ['MACD', 'MACDSignal', 'MACDHist'] as const;

    private readonly fast: EmaCore;
    private readonly slow: EmaCore;
    private readonly signal: EmaCore;

    constructor(options: Partial<MacdOptions> = {}) {
        super();
        const { fastPeriod = 12, slowPeriod = 26, signalPeriod = 9 } = options;
        // Обе EMA обязаны стартовать на одном баре, иначе быстрая приходит к
        // нему с накопленной рекурсией и MACD расходится с эталоном.
        const slower = Math.max(fastPeriod, slowPeriod);
        this.fast = new EmaCore(fastPeriod, slower - fastPeriod);
        this.slow = new EmaCore(slowPeriod, slower - slowPeriod);
        this.signal = new EmaCore(signalPeriod);
        this.name = `MACD(${fastPeriod},${slowPeriod},${signalPeriod})`;
    }

    protected initState(): void {
        this.fast.reset();
        this.slow.reset();
        this.signal.reset();
    }

    protected captureState(): MacdState {
        return {
            fast: this.fast.capture(),
            slow: this.slow.capture(),
            signal: this.signal.capture(),
        };
    }

    protected restoreState(state: MacdState): void {
        this.fast.restore(state.fast);
        this.slow.restore(state.slow);
        this.signal.restore(state.signal);
    }

    protected step(bar: Bar, out: Float64Array): void {
        const fast = this.fast.push(bar.close);
        const slow = this.slow.push(bar.close);
        if (Number.isNaN(fast) || Number.isNaN(slow)) {
            out[0] = NaN;
            out[1] = NaN;
            out[2] = NaN;
            return;
        }
        const macd = fast - slow;
        const signal = this.signal.push(macd);
        if (Number.isNaN(signal)) {
            out[0] = NaN;
            out[1] = NaN;
            out[2] = NaN;
            return;
        }
        out[0] = macd;
        out[1] = signal;
        out[2] = macd - signal;
    }
}
