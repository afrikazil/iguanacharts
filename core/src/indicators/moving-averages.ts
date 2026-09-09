import type { Bar } from '../model/bars.js';
import { EmaCore, type EmaSnapshot } from './ema-core.js';
import {
    IncrementalIndicator,
    WindowIndicator,
    requirePositiveInt,
    type Indicator,
} from './indicator.js';
import { priceOf, type PriceSource } from './price.js';
import { Sma } from './sma.js';

/** Экспоненциальное скользящее среднее. */
export class Ema extends IncrementalIndicator<EmaSnapshot> {
    readonly name: string;
    readonly outputs = ['EMA'] as const;

    private readonly ema: EmaCore;

    constructor(
        period = 30,
        private readonly source: PriceSource = 'close',
    ) {
        super();
        this.ema = new EmaCore(period);
        this.name = `EMA(${period})`;
    }

    protected initState(): void {
        this.ema.reset();
    }

    protected captureState(): EmaSnapshot {
        return this.ema.capture();
    }

    protected restoreState(state: EmaSnapshot): void {
        this.ema.restore(state);
    }

    protected step(bar: Bar, out: Float64Array): void {
        out[0] = this.ema.push(priceOf(bar, this.source));
    }
}

/**
 * Взвешенное скользящее среднее: вес растёт линейно к текущему бару.
 * Текущий бар получает вес period, самый старый — 1.
 */
export class Wma extends WindowIndicator {
    readonly name: string;
    readonly outputs = ['WMA'] as const;
    private readonly weightSum: number;

    constructor(
        private readonly period = 30,
        private readonly source: PriceSource = 'close',
    ) {
        super(requirePositiveInt(period, 'период WMA'));
        this.name = `WMA(${period})`;
        this.weightSum = (period * (period + 1)) / 2;
    }

    protected compute(out: Float64Array): void {
        if (!this.window.full) {
            this.fillUnready(out);
            return;
        }
        let sum = 0;
        for (let back = 0; back < this.period; back += 1) {
            sum += this.valueAt(back) * (this.period - back);
        }
        out[0] = sum / this.weightSum;
    }

    private valueAt(back: number): number {
        switch (this.source) {
            case 'open':
                return this.window.open(back);
            case 'high':
                return this.window.high(back);
            case 'low':
                return this.window.low(back);
            case 'close':
                return this.window.close(back);
        }
    }
}

/**
 * Треугольное скользящее среднее — среднее от среднего, что эквивалентно
 * весам, нарастающим к середине окна: 1, 2, ..., 2, 1. Формула
 * min(i + 1, period - i) даёт правильные веса и для чётных, и для нечётных
 * периодов, поэтому отдельных ветвей не требуется.
 */
export class Trima extends WindowIndicator {
    readonly name: string;
    readonly outputs = ['TRIMA'] as const;

    private readonly weights: Float64Array;
    private readonly weightSum: number;

    constructor(
        private readonly period = 20,
        private readonly source: PriceSource = 'close',
    ) {
        super(requirePositiveInt(period, 'период TRIMA'));
        this.name = `TRIMA(${period})`;
        this.weights = new Float64Array(period);
        let sum = 0;
        for (let i = 0; i < period; i += 1) {
            const weight = Math.min(i + 1, period - i);
            this.weights[i] = weight;
            sum += weight;
        }
        this.weightSum = sum;
    }

    protected compute(out: Float64Array): void {
        if (!this.window.full) {
            this.fillUnready(out);
            return;
        }
        let sum = 0;
        for (let back = 0; back < this.period; back += 1) {
            // Вес задан от старого бара к новому, окно индексируется наоборот.
            sum += this.valueAt(back) * this.weights[this.period - 1 - back]!;
        }
        out[0] = sum / this.weightSum;
    }

    private valueAt(back: number): number {
        switch (this.source) {
            case 'open':
                return this.window.open(back);
            case 'high':
                return this.window.high(back);
            case 'low':
                return this.window.low(back);
            case 'close':
                return this.window.close(back);
        }
    }
}

interface TemaState {
    first: EmaSnapshot;
    second: EmaSnapshot;
    third: EmaSnapshot;
}

/**
 * Тройное экспоненциальное среднее: 3·EMA − 3·EMA(EMA) + EMA(EMA(EMA)).
 * Каскад из трёх EMA даёт разогрев 3·(period − 1).
 */
export class Tema extends IncrementalIndicator<TemaState> {
    readonly name: string;
    readonly outputs = ['TEMA'] as const;

    private readonly first: EmaCore;
    private readonly second: EmaCore;
    private readonly third: EmaCore;

    constructor(
        period = 12,
        private readonly source: PriceSource = 'close',
    ) {
        super();
        this.first = new EmaCore(period);
        this.second = new EmaCore(period);
        this.third = new EmaCore(period);
        this.name = `TEMA(${period})`;
    }

    protected initState(): void {
        this.first.reset();
        this.second.reset();
        this.third.reset();
    }

    protected captureState(): TemaState {
        return {
            first: this.first.capture(),
            second: this.second.capture(),
            third: this.third.capture(),
        };
    }

    protected restoreState(state: TemaState): void {
        this.first.restore(state.first);
        this.second.restore(state.second);
        this.third.restore(state.third);
    }

    protected step(bar: Bar, out: Float64Array): void {
        const ema1 = this.first.push(priceOf(bar, this.source));
        if (Number.isNaN(ema1)) {
            out[0] = NaN;
            return;
        }
        const ema2 = this.second.push(ema1);
        if (Number.isNaN(ema2)) {
            out[0] = NaN;
            return;
        }
        const ema3 = this.third.push(ema2);
        out[0] = Number.isNaN(ema3) ? NaN : 3 * ema1 - 3 * ema2 + ema3;
    }
}

interface ZlemaState {
    value: number;
    seen: number;
    ring: Float64Array;
}

/**
 * Zero-Lag EMA: EMA от «упреждённой» цены 2·C − C[lag], lag = ceil((period−1)/2).
 *
 * Перенесено с особенностями legacy-реализации, а не по учебнику: значения
 * идут с самого первого бара (на первых lag барах равны закрытию), несмотря на
 * то, что сама legacy-функция вычисляет lookback и не пользуется им. Расхождение
 * с «правильным» разогревом сохранено сознательно — по этим значениям в проде
 * годами строились сохранённые графики.
 */
export class Zlema extends IncrementalIndicator<ZlemaState> {
    readonly name: string;
    readonly outputs = ['ZLEMA'] as const;

    private readonly k: number;
    private readonly lag: number;
    /** Кольцо закрытий длиной lag + 1: нужно C[i - lag]. */
    private readonly ring: Float64Array;
    private value = NaN;
    private seen = 0;

    constructor(period = 12) {
        super();
        requirePositiveInt(period, 'период ZLEMA');
        this.k = 2 / (period + 1);
        this.lag = Math.ceil((period - 1) / 2);
        this.ring = new Float64Array(this.lag + 1);
        this.name = `ZLEMA(${period})`;
    }

    protected initState(): void {
        this.value = NaN;
        this.seen = 0;
        this.ring.fill(0);
    }

    protected captureState(): ZlemaState {
        return { value: this.value, seen: this.seen, ring: this.ring.slice() };
    }

    protected restoreState(state: ZlemaState): void {
        this.value = state.value;
        this.seen = state.seen;
        this.ring.set(state.ring);
    }

    protected step(bar: Bar, out: Float64Array): void {
        const slot = this.seen % this.ring.length;
        this.ring[slot] = bar.close;

        if (this.seen < this.lag) {
            this.value = bar.close;
        } else {
            const lagged = this.ring[(this.seen - this.lag) % this.ring.length]!;
            this.value = this.k * (2 * bar.close - lagged) + (1 - this.k) * this.value;
        }
        this.seen += 1;
        out[0] = this.value;
    }
}

/** Типы средних из legacy TA.MATypes. */
export const MaType = {
    Sma: 0,
    Ema: 1,
    Wma: 2,
    Tema: 4,
    Trima: 5,
} as const;

export type MaTypeValue = (typeof MaType)[keyof typeof MaType];

/** Фабрика среднего по типу — так его выбирают BBANDS, STOCH и ELDR. */
export function createMovingAverage(
    type: MaTypeValue,
    period: number,
    source: PriceSource = 'close',
): Indicator {
    switch (type) {
        case MaType.Sma:
            return new Sma(period);
        case MaType.Ema:
            return new Ema(period, source);
        case MaType.Wma:
            return new Wma(period, source);
        case MaType.Tema:
            return new Tema(period, source);
        case MaType.Trima:
            return new Trima(period, source);
    }
}
