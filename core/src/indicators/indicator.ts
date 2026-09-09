import type { Bar } from '../model/bars.js';

export interface Indicator {
    readonly name: string;
    reset(): void;
    /** Новый бар закрылся. undefined — периода ещё не хватает. */
    push(bar: Bar): number | undefined;
    /** Тик по уже открытому последнему бару. */
    updateLast(bar: Bar): number | undefined;
}

/**
 * База для инкрементальных индикаторов.
 *
 * Ключевая проблема реального времени: последний бар меняется много раз в
 * секунду, а рекуррентные индикаторы (EMA, RSI по Уайлдеру) не обратимы —
 * из состояния после бара нельзя вычесть его вклад. Поэтому перед каждым шагом
 * снимается снимок состояния, и updateLast откатывается к нему и шагает заново.
 * Снимок один и тот же для любого числа updateLast подряд, так что стоимость
 * тика — O(1), а не полный пересчёт истории, как в текущей библиотеке.
 */
export abstract class IncrementalIndicator<TState> implements Indicator {
    abstract readonly name: string;

    private savedState: TState | undefined;

    push(bar: Bar): number | undefined {
        this.savedState = this.captureState();
        return this.step(bar);
    }

    updateLast(bar: Bar): number | undefined {
        if (this.savedState === undefined) return this.push(bar);
        this.restoreState(this.savedState);
        return this.step(bar);
    }

    reset(): void {
        this.savedState = undefined;
        this.initState();
    }

    protected abstract initState(): void;
    protected abstract captureState(): TState;
    protected abstract restoreState(state: TState): void;
    protected abstract step(bar: Bar): number | undefined;
}
