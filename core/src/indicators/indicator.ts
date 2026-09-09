import type { Bar } from '../model/bars.js';

export interface Indicator {
    readonly name: string;
    /**
     * Имена выходных каналов: у SMA один, у MACD три, у ELDR четыре.
     * Длина массива задаёт размер буфера, который передают в push.
     */
    readonly outputs: readonly string[];
    reset(): void;
    /**
     * Новый бар закрылся. Значения пишутся в out[0..outputs.length-1];
     * NaN означает «периода ещё не хватает».
     *
     * Буфер передаётся снаружи и переиспользуется, поэтому шаг индикатора не
     * аллоцирует — на 100 тысячах баров это разница между работой и паузами GC.
     */
    push(bar: Bar, out: Float64Array): void;
    /** Тик по уже открытому последнему бару. */
    updateLast(bar: Bar, out: Float64Array): void;
}

/**
 * База для рекуррентных индикаторов — EMA, RSI по Уайлдеру, ADX, SAR.
 *
 * Их состояние необратимо: из значения после бара нельзя вычесть его вклад.
 * Поэтому перед каждым шагом снимается снимок, и updateLast откатывается к
 * нему и шагает заново. Снимок один и тот же для любого числа updateLast
 * подряд, так что тик стоит O(1), а не полный пересчёт истории.
 */
export abstract class IncrementalIndicator<TState> implements Indicator {
    abstract readonly name: string;
    abstract readonly outputs: readonly string[];

    private savedState: TState | undefined;

    push(bar: Bar, out: Float64Array): void {
        this.savedState = this.captureState();
        this.step(bar, out);
    }

    updateLast(bar: Bar, out: Float64Array): void {
        if (this.savedState === undefined) {
            this.push(bar, out);
            return;
        }
        this.restoreState(this.savedState);
        this.step(bar, out);
    }

    reset(): void {
        this.savedState = undefined;
        this.initState();
    }

    protected abstract initState(): void;
    protected abstract captureState(): TState;
    protected abstract restoreState(state: TState): void;
    protected abstract step(bar: Bar, out: Float64Array): void;
}

/**
 * Окно последних N баров.
 *
 * Индекс отсчитывается от текущего бара назад: close(0) — текущий,
 * close(1) — предыдущий. Так формулы читаются как в учебнике.
 */
export class BarWindow {
    private readonly open_: Float64Array;
    private readonly high_: Float64Array;
    private readonly low_: Float64Array;
    private readonly close_: Float64Array;
    private readonly volume_: Float64Array;
    private readonly time_: Float64Array;

    /** Индекс последнего записанного бара в кольце. */
    private head = -1;
    /** Сколько баров прошло через окно всего, без ограничения размером. */
    private seenCount = 0;

    constructor(readonly size: number) {
        if (!Number.isInteger(size) || size < 1) {
            throw new RangeError(`размер окна должен быть целым >= 1, получено ${size}`);
        }
        this.open_ = new Float64Array(size);
        this.high_ = new Float64Array(size);
        this.low_ = new Float64Array(size);
        this.close_ = new Float64Array(size);
        this.volume_ = new Float64Array(size);
        this.time_ = new Float64Array(size);
    }

    /** Сколько баров прошло через окно всего. */
    get seen(): number {
        return this.seenCount;
    }

    /** Сколько баров доступно для чтения. */
    get length(): number {
        return Math.min(this.seenCount, this.size);
    }

    get full(): boolean {
        return this.seenCount >= this.size;
    }

    clear(): void {
        this.head = -1;
        this.seenCount = 0;
    }

    push(bar: Bar): void {
        this.head = (this.head + 1) % this.size;
        this.seenCount += 1;
        this.write(bar);
    }

    /** Перезапись текущего бара тиком. До первого push равносильна push. */
    replaceLast(bar: Bar): void {
        if (this.seenCount === 0) {
            this.push(bar);
            return;
        }
        this.write(bar);
    }

    open(back = 0): number {
        return this.open_[this.indexOf(back)]!;
    }

    high(back = 0): number {
        return this.high_[this.indexOf(back)]!;
    }

    low(back = 0): number {
        return this.low_[this.indexOf(back)]!;
    }

    close(back = 0): number {
        return this.close_[this.indexOf(back)]!;
    }

    volume(back = 0): number {
        return this.volume_[this.indexOf(back)]!;
    }

    time(back = 0): number {
        return this.time_[this.indexOf(back)]!;
    }

    private indexOf(back: number): number {
        const index = this.head - back;
        return index >= 0 ? index : index + this.size;
    }

    private write(bar: Bar): void {
        this.open_[this.head] = bar.open;
        this.high_[this.head] = bar.high;
        this.low_[this.head] = bar.low;
        this.close_[this.head] = bar.close;
        this.volume_[this.head] = bar.volume;
        this.time_[this.head] = bar.time;
    }
}

/**
 * База для оконных индикаторов — SMA, STDDEV, STOCH, WILLR, AROON и прочих,
 * чьё значение зависит только от последних N баров.
 *
 * Снимок состояния здесь не нужен вовсе: updateLast просто перезаписывает
 * текущий бар в окне и считает заново. Стоимость шага — O(N), что при
 * периодах порядка десятков дешевле, чем кажется, и взамен даёт точность
 * без накопления ошибки и без машинерии откатов.
 */
export abstract class WindowIndicator implements Indicator {
    abstract readonly name: string;
    abstract readonly outputs: readonly string[];

    protected readonly window: BarWindow;

    constructor(windowSize: number) {
        this.window = new BarWindow(windowSize);
    }

    reset(): void {
        this.window.clear();
    }

    push(bar: Bar, out: Float64Array): void {
        this.window.push(bar);
        this.compute(out);
    }

    updateLast(bar: Bar, out: Float64Array): void {
        this.window.replaceLast(bar);
        this.compute(out);
    }

    /** Заполняет out по текущему содержимому окна. */
    protected abstract compute(out: Float64Array): void;

    /** Записывает NaN во все каналы — периода не хватает. */
    protected fillUnready(out: Float64Array): void {
        for (let i = 0; i < this.outputs.length; i += 1) out[i] = NaN;
    }
}

export function requirePositiveInt(value: number, label: string): number {
    if (!Number.isInteger(value) || value < 1) {
        throw new RangeError(`${label} должен быть целым >= 1, получено ${value}`);
    }
    return value;
}
