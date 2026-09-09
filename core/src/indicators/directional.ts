import type { Bar } from '../model/bars.js';
import { IncrementalIndicator, requirePositiveInt } from './indicator.js';
import { trueRange } from './price.js';

/**
 * Однопериодные направленные движения по Уайлдеру.
 *
 * Из семи случаев, разобранных в его книге, содержательны два: движение
 * считается только вверх либо только вниз, и только когда соответствующий
 * выход за границы предыдущего бара больше противоположного.
 */
function directionalMovement(
    high: number,
    low: number,
    previousHigh: number,
    previousLow: number,
): { plus: number; minus: number } {
    const diffPlus = high - previousHigh;
    const diffMinus = previousLow - low;

    if (diffMinus > 0 && diffPlus < diffMinus) return { plus: 0, minus: diffMinus };
    if (diffPlus > 0 && diffPlus > diffMinus) return { plus: diffPlus, minus: 0 };
    return { plus: 0, minus: 0 };
}

interface DmState {
    sum: number;
    seen: number;
    prevHigh: number;
    prevLow: number;
    ready: boolean;
}

/**
 * Сглаженное направленное движение. Отдаёт именно сумму по Уайлдеру, а не
 * среднее: следующее значение равно предыдущему минус его period-я доля плюс
 * движение текущего бара. Первое значение выходит на баре period − 1, потому
 * что накапливается period − 1 однопериодных движений (у первого бара
 * движения нет).
 */
abstract class DirectionalMovement extends IncrementalIndicator<DmState> {
    private sum = 0;
    private seen = 0;
    private prevHigh = NaN;
    private prevLow = NaN;
    private ready = false;

    constructor(protected readonly period: number) {
        super();
        requirePositiveInt(period, 'период DM');
    }

    protected abstract pick(movement: { plus: number; minus: number }): number;

    protected initState(): void {
        this.sum = 0;
        this.seen = 0;
        this.prevHigh = NaN;
        this.prevLow = NaN;
        this.ready = false;
    }

    protected captureState(): DmState {
        return {
            sum: this.sum,
            seen: this.seen,
            prevHigh: this.prevHigh,
            prevLow: this.prevLow,
            ready: this.ready,
        };
    }

    protected restoreState(state: DmState): void {
        this.sum = state.sum;
        this.seen = state.seen;
        this.prevHigh = state.prevHigh;
        this.prevLow = state.prevLow;
        this.ready = state.ready;
    }

    protected step(bar: Bar, out: Float64Array): void {
        if (this.seen === 0) {
            this.prevHigh = bar.high;
            this.prevLow = bar.low;
            this.seen = 1;
            out[0] = NaN;
            return;
        }

        const value = this.pick(
            directionalMovement(bar.high, bar.low, this.prevHigh, this.prevLow),
        );
        this.prevHigh = bar.high;
        this.prevLow = bar.low;
        this.seen += 1;

        if (!this.ready) {
            this.sum += value;
            if (this.seen < this.period) {
                out[0] = NaN;
                return;
            }
            this.ready = true;
            out[0] = this.sum;
            return;
        }
        this.sum = this.sum - this.sum / this.period + value;
        out[0] = this.sum;
    }
}

export class MinusDm extends DirectionalMovement {
    readonly name: string;
    readonly outputs = ['MINUS_DM'] as const;

    constructor(period = 14) {
        super(period);
        this.name = `MINUS_DM(${period})`;
    }

    protected pick(movement: { plus: number; minus: number }): number {
        return movement.minus;
    }
}

export class PlusDm extends DirectionalMovement {
    readonly name: string;
    readonly outputs = ['PLUS_DM'] as const;

    constructor(period = 14) {
        super(period);
        this.name = `PLUS_DM(${period})`;
    }

    protected pick(movement: { plus: number; minus: number }): number {
        return movement.plus;
    }
}

interface DiState {
    dm: number;
    tr: number;
    seen: number;
    prevHigh: number;
    prevLow: number;
    prevClose: number;
    accumulated: boolean;
}

/**
 * Направленный индекс: доля направленного движения в истинном диапазоне.
 *
 * Разогрев на бар длиннее, чем у DM: после накопления period − 1 движений
 * делается ещё один сглаживающий шаг, и только потом берётся отношение.
 */
abstract class DirectionalIndex extends IncrementalIndicator<DiState> {
    private dm = 0;
    private tr = 0;
    private seen = 0;
    private prevHigh = NaN;
    private prevLow = NaN;
    private prevClose = NaN;
    private accumulated = false;

    constructor(protected readonly period: number) {
        super();
        requirePositiveInt(period, 'период DI');
    }

    protected abstract pick(movement: { plus: number; minus: number }): number;

    protected initState(): void {
        this.dm = 0;
        this.tr = 0;
        this.seen = 0;
        this.prevHigh = NaN;
        this.prevLow = NaN;
        this.prevClose = NaN;
        this.accumulated = false;
    }

    protected captureState(): DiState {
        return {
            dm: this.dm,
            tr: this.tr,
            seen: this.seen,
            prevHigh: this.prevHigh,
            prevLow: this.prevLow,
            prevClose: this.prevClose,
            accumulated: this.accumulated,
        };
    }

    protected restoreState(state: DiState): void {
        this.dm = state.dm;
        this.tr = state.tr;
        this.seen = state.seen;
        this.prevHigh = state.prevHigh;
        this.prevLow = state.prevLow;
        this.prevClose = state.prevClose;
        this.accumulated = state.accumulated;
    }

    protected step(bar: Bar, out: Float64Array): void {
        if (this.seen === 0) {
            this.prevHigh = bar.high;
            this.prevLow = bar.low;
            this.prevClose = bar.close;
            this.seen = 1;
            out[0] = NaN;
            return;
        }

        const movement = this.pick(
            directionalMovement(bar.high, bar.low, this.prevHigh, this.prevLow),
        );
        const range = trueRange(bar.high, bar.low, this.prevClose);
        this.prevHigh = bar.high;
        this.prevLow = bar.low;
        this.prevClose = bar.close;
        this.seen += 1;

        if (!this.accumulated) {
            this.dm += movement;
            this.tr += range;
            if (this.seen < this.period) {
                out[0] = NaN;
                return;
            }
            this.accumulated = true;
            out[0] = NaN;
            return;
        }

        this.dm = this.dm - this.dm / this.period + movement;
        this.tr = this.tr - this.tr / this.period + range;
        out[0] = isZero(this.tr) ? 0 : (100 * this.dm) / this.tr;
    }
}

export class MinusDi extends DirectionalIndex {
    readonly name: string;
    readonly outputs = ['MINUS_DI'] as const;

    constructor(period = 14) {
        super(period);
        this.name = `MINUS_DI(${period})`;
    }

    protected pick(movement: { plus: number; minus: number }): number {
        return movement.minus;
    }
}

export class PlusDi extends DirectionalIndex {
    readonly name: string;
    readonly outputs = ['PLUS_DI'] as const;

    constructor(period = 14) {
        super(period);
        this.name = `PLUS_DI(${period})`;
    }

    protected pick(movement: { plus: number; minus: number }): number {
        return movement.plus;
    }
}

/** Порог из legacy: значения такой малости считаются нулём. */
function isZero(value: number): boolean {
    return value > -1e-8 && value < 1e-8;
}

interface AdxState {
    minusDm: number;
    plusDm: number;
    tr: number;
    adx: number;
    dxSum: number;
    seen: number;
    phase: number;
    prevHigh: number;
    prevLow: number;
    prevClose: number;
}

/**
 * Average Directional Index — сглаженная по Уайлдеру сила тренда.
 *
 * Разогрев складывается дважды: сначала period − 1 баров на DM и TR, потом
 * ещё period значений DX усредняются для первого ADX, отсюда 2·period − 1.
 *
 * legacy на этом участке отдаёт нули, добивая массив через unshift(0), — мы
 * отдаём NaN. Ноль на графике силы тренда рисуется как настоящая линия по
 * нулю и вводит в заблуждение, тогда как NaN просто разрывает её.
 */
export class Adx extends IncrementalIndicator<AdxState> {
    readonly name: string;
    readonly outputs = ['ADX'] as const;

    private minusDm = 0;
    private plusDm = 0;
    private tr = 0;
    private adx = 0;
    private dxSum = 0;
    private seen = 0;
    private prevHigh = NaN;
    private prevLow = NaN;
    private prevClose = NaN;

    constructor(private readonly period = 14) {
        super();
        requirePositiveInt(period, 'период ADX');
        this.name = `ADX(${period})`;
    }

    protected initState(): void {
        this.minusDm = 0;
        this.plusDm = 0;
        this.tr = 0;
        this.adx = 0;
        this.dxSum = 0;
        this.seen = 0;
        this.prevHigh = NaN;
        this.prevLow = NaN;
        this.prevClose = NaN;
    }

    protected captureState(): AdxState {
        return {
            minusDm: this.minusDm,
            plusDm: this.plusDm,
            tr: this.tr,
            adx: this.adx,
            dxSum: this.dxSum,
            seen: this.seen,
            phase: 0,
            prevHigh: this.prevHigh,
            prevLow: this.prevLow,
            prevClose: this.prevClose,
        };
    }

    protected restoreState(state: AdxState): void {
        this.minusDm = state.minusDm;
        this.plusDm = state.plusDm;
        this.tr = state.tr;
        this.adx = state.adx;
        this.dxSum = state.dxSum;
        this.seen = state.seen;
        this.prevHigh = state.prevHigh;
        this.prevLow = state.prevLow;
        this.prevClose = state.prevClose;
    }

    protected step(bar: Bar, out: Float64Array): void {
        if (this.seen === 0) {
            this.prevHigh = bar.high;
            this.prevLow = bar.low;
            this.prevClose = bar.close;
            this.seen = 1;
            out[0] = NaN;
            return;
        }

        const movement = directionalMovement(bar.high, bar.low, this.prevHigh, this.prevLow);
        const range = trueRange(bar.high, bar.low, this.prevClose);
        this.prevHigh = bar.high;
        this.prevLow = bar.low;
        this.prevClose = bar.close;
        this.seen += 1;

        // Первая фаза: period - 1 однопериодных значений, то есть бары
        // 1..period-1. seen уже увеличен, поэтому граница — period.
        if (this.seen <= this.period) {
            this.minusDm += movement.minus;
            this.plusDm += movement.plus;
            this.tr += range;
            out[0] = NaN;
            return;
        }

        this.minusDm = this.minusDm - this.minusDm / this.period + movement.minus;
        this.plusDm = this.plusDm - this.plusDm / this.period + movement.plus;
        this.tr = this.tr - this.tr / this.period + range;

        const dx = this.currentDx();

        // Вторая фаза: period значений DX усредняются в первый ADX,
        // который выходит на баре 2*period - 1.
        if (this.seen <= 2 * this.period) {
            this.dxSum += dx;
            if (this.seen < 2 * this.period) {
                out[0] = NaN;
                return;
            }
            this.adx = this.dxSum / this.period;
            out[0] = this.adx;
            return;
        }

        this.adx = (this.adx * (this.period - 1) + dx) / this.period;
        out[0] = this.adx;
    }

    private currentDx(): number {
        if (isZero(this.tr)) return 0;
        const minusDi = (100 * this.minusDm) / this.tr;
        const plusDi = (100 * this.plusDm) / this.tr;
        const sum = minusDi + plusDi;
        return isZero(sum) ? 0 : (100 * Math.abs(minusDi - plusDi)) / sum;
    }
}

interface SarState {
    isLong: boolean;
    sar: number;
    ep: number;
    af: number;
    prevHigh: number;
    prevLow: number;
    newHigh: number;
    newLow: number;
    seen: number;
}

/**
 * Parabolic SAR. Направление первой сделки определяется по однопериодному
 * направленному движению между первыми двумя барами, дальше точка разворота
 * подтягивается к экстремуму с ускорением, растущим на каждом новом экстремуме.
 */
export class Sar extends IncrementalIndicator<SarState> {
    readonly name: string;
    readonly outputs = ['SAR'] as const;

    private isLong = true;
    private sar = NaN;
    private ep = NaN;
    private af = 0;
    private prevHigh = NaN;
    private prevLow = NaN;
    private newHigh = NaN;
    private newLow = NaN;
    private seen = 0;

    constructor(
        private readonly acceleration = 0.02,
        private readonly maximum = 0.2,
    ) {
        super();
        this.name = `SAR(${acceleration},${maximum})`;
    }

    protected initState(): void {
        this.isLong = true;
        this.sar = NaN;
        this.ep = NaN;
        this.af = this.acceleration;
        this.prevHigh = NaN;
        this.prevLow = NaN;
        this.newHigh = NaN;
        this.newLow = NaN;
        this.seen = 0;
    }

    protected captureState(): SarState {
        return {
            isLong: this.isLong,
            sar: this.sar,
            ep: this.ep,
            af: this.af,
            prevHigh: this.prevHigh,
            prevLow: this.prevLow,
            newHigh: this.newHigh,
            newLow: this.newLow,
            seen: this.seen,
        };
    }

    protected restoreState(state: SarState): void {
        this.isLong = state.isLong;
        this.sar = state.sar;
        this.ep = state.ep;
        this.af = state.af;
        this.prevHigh = state.prevHigh;
        this.prevLow = state.prevLow;
        this.newHigh = state.newHigh;
        this.newLow = state.newLow;
        this.seen = state.seen;
    }

    protected step(bar: Bar, out: Float64Array): void {
        if (this.seen === 0) {
            this.newHigh = bar.high;
            this.newLow = bar.low;
            this.seen = 1;
            out[0] = NaN;
            return;
        }

        if (this.seen === 1) {
            // Направление задаёт -DM(1) между первым и вторым баром.
            const movement = directionalMovement(bar.high, bar.low, this.newHigh, this.newLow);
            this.isLong = movement.minus <= 0;
            this.af = this.acceleration;

            if (this.isLong) {
                this.ep = bar.high;
                this.sar = this.newLow;
            } else {
                this.ep = bar.low;
                this.sar = this.newHigh;
            }

            // В оригинале к моменту первого шага и prev, и new указывают на
            // второй бар: newHigh/newLow перезаписываются до входа в цикл, а
            // внутри цикла prev получает уже их. Начальный sar при этом
            // остаётся взятым с первого бара.
            this.prevHigh = bar.high;
            this.prevLow = bar.low;
            this.newHigh = bar.high;
            this.newLow = bar.low;
            this.seen = 2;
            out[0] = this.advance();
            return;
        }

        this.prevHigh = this.newHigh;
        this.prevLow = this.newLow;
        this.newHigh = bar.high;
        this.newLow = bar.low;
        this.seen += 1;
        out[0] = this.advance();
    }

    /** Один шаг: отдаёт текущий SAR и подготавливает следующий. */
    private advance(): number {
        if (this.isLong) {
            if (this.newLow <= this.sar) {
                this.isLong = false;
                this.sar = Math.max(this.ep, this.prevHigh, this.newHigh);
                const output = this.sar;
                this.af = this.acceleration;
                this.ep = this.newLow;
                this.sar = Math.max(
                    this.sar + this.af * (this.ep - this.sar),
                    this.prevHigh,
                    this.newHigh,
                );
                return output;
            }
            const output = this.sar;
            if (this.newHigh > this.ep) {
                this.ep = this.newHigh;
                this.af = Math.min(this.af + this.acceleration, this.maximum);
            }
            this.sar = Math.min(
                this.sar + this.af * (this.ep - this.sar),
                this.prevLow,
                this.newLow,
            );
            return output;
        }

        if (this.newHigh >= this.sar) {
            this.isLong = true;
            this.sar = Math.min(this.ep, this.prevLow, this.newLow);
            const output = this.sar;
            this.af = this.acceleration;
            this.ep = this.newHigh;
            this.sar = Math.min(
                this.sar + this.af * (this.ep - this.sar),
                this.prevLow,
                this.newLow,
            );
            return output;
        }
        const output = this.sar;
        if (this.newLow < this.ep) {
            this.ep = this.newLow;
            this.af = Math.min(this.af + this.acceleration, this.maximum);
        }
        this.sar = Math.max(
            this.sar + this.af * (this.ep - this.sar),
            this.prevHigh,
            this.newHigh,
        );
        return output;
    }
}
