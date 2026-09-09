import type { Bar } from '../model/bars.js';
import { EmaCore, type EmaSnapshot } from './ema-core.js';
import { IncrementalIndicator, requirePositiveInt } from './indicator.js';
import { MaType, type MaTypeValue } from './moving-averages.js';
import { NumberWindow } from './number-window.js';

/** Сглаживание производного ряда чисел — не баров. */
interface NumberSmoother {
    reset(): void;
    push(value: number): number;
    capture(): unknown;
    restore(state: unknown): void;
}

class EmaSmoother implements NumberSmoother {
    private readonly ema: EmaCore;

    constructor(period: number) {
        this.ema = new EmaCore(period);
    }

    reset(): void {
        this.ema.reset();
    }

    push(value: number): number {
        return this.ema.push(value);
    }

    capture(): unknown {
        return this.ema.capture();
    }

    restore(state: unknown): void {
        this.ema.restore(state as EmaSnapshot);
    }
}

class SmaSmoother implements NumberSmoother {
    private readonly window: NumberWindow;

    constructor(period: number) {
        this.window = new NumberWindow(period);
    }

    reset(): void {
        this.window.clear();
    }

    push(value: number): number {
        this.window.push(value);
        return this.window.mean();
    }

    capture(): unknown {
        return {
            values: this.window.snapshot(),
            head: this.window.headIndex,
            seen: this.window.seen,
        };
    }

    restore(state: unknown): void {
        const { values, head, seen } = state as {
            values: Float64Array;
            head: number;
            seen: number;
        };
        this.window.restore(values, head, seen);
    }
}

function createSmoother(type: MaTypeValue, period: number): NumberSmoother {
    if (type === MaType.Sma) return new SmaSmoother(period);
    if (type === MaType.Ema) return new EmaSmoother(period);
    throw new RangeError(`ELDR поддерживает только SMA и EMA, получен тип ${type}`);
}

/** Период сглаживания взят из legacy, где он зашит константой. */
const SMOOTH_PERIOD = 2;

interface ElderRayState {
    price: EmaSnapshot;
    signal: unknown;
    smooth: unknown;
}

/**
 * Elder-Ray в том виде, в котором его отдаёт legacy: отклонение средней цены
 * бара от скользящего среднего, плюс его собственное сглаживание и сама
 * средняя.
 *
 * Классических bull power и bear power здесь нет — в оригинале они
 * вычисляются в локальные массивы Bulls и Bears и никуда не возвращаются,
 * то есть до графика никогда не доходили. Повторять мёртвый расчёт незачем,
 * но и добавлять недостающие каналы в перенос нельзя: это была бы новая
 * функциональность под видом переноса.
 */
export class ElderRay extends IncrementalIndicator<ElderRayState> {
    readonly name: string;
    readonly outputs = ['ELDR', 'Signal', 'Smooth', 'EMA'] as const;

    private readonly price: EmaCore;
    private readonly signal: NumberSmoother;
    private readonly smooth: NumberSmoother;

    constructor(period = 13, maType: MaTypeValue = MaType.Ema) {
        super();
        requirePositiveInt(period, 'период ELDR');
        this.price = new EmaCore(period);
        this.signal = createSmoother(maType, period);
        this.smooth = createSmoother(maType, SMOOTH_PERIOD);
        this.name = `ELDR(${period})`;
    }

    protected initState(): void {
        this.price.reset();
        this.signal.reset();
        this.smooth.reset();
    }

    protected captureState(): ElderRayState {
        return {
            price: this.price.capture(),
            signal: this.signal.capture(),
            smooth: this.smooth.capture(),
        };
    }

    protected restoreState(state: ElderRayState): void {
        this.price.restore(state.price);
        this.signal.restore(state.signal);
        this.smooth.restore(state.smooth);
    }

    protected step(bar: Bar, out: Float64Array): void {
        const average = this.price.push(bar.close);
        if (Number.isNaN(average)) {
            out[0] = NaN;
            out[1] = NaN;
            out[2] = NaN;
            out[3] = NaN;
            return;
        }

        const eldr = (bar.high + bar.low) / 2 - average;
        out[0] = eldr;
        out[1] = this.signal.push(eldr);
        out[2] = this.smooth.push(eldr);
        out[3] = average;
    }
}
