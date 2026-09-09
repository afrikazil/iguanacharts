import { requirePositiveInt } from './indicator.js';
import { NumberWindow } from './number-window.js';

export interface EmaSnapshot {
    value: number;
    seen: number;
    ready: boolean;
    /** Содержимое окна затравки; null — затравка уже произошла. */
    window: Float64Array | null;
    head: number;
}

/**
 * Рекуррентная EMA над потоком чисел — примитив, из которого собираются TEMA,
 * MACD, ADOSC и прочие производные.
 *
 * Затравка классическая: значение равно простому среднему последних period
 * значений, дальше идёт рекурсия с k = 2 / (period + 1).
 *
 * seedDelay сдвигает момент затравки на несколько баров вперёд. Это нужно
 * MACD: TA-Lib начинает обе его EMA на одном и том же баре (slowPeriod − 1),
 * то есть быстрая засевается средним последних fastPeriod закрытий именно
 * там, а не тянет рекурсию с бара fastPeriod − 1. Без этого сдвига значения
 * расходятся с проверенными в проде.
 */
/**
 * Способ затравки. 'sma' — простое среднее последних period значений (так
 * устроены EMA, TEMA, MACD). 'first' — первое пришедшее значение, как в
 * ADOSC, где обе EMA стартуют от значения AD на нулевом баре.
 */
export type EmaSeedMode = 'sma' | 'first';

export class EmaCore {
    private readonly k: number;
    /** Окно нужно только до затравки; после неё не используется. */
    private readonly seedWindow: NumberWindow;
    private value = NaN;
    private seen = 0;
    private ready = false;

    constructor(
        readonly period: number,
        private readonly seedDelay = 0,
        private readonly seedMode: EmaSeedMode = 'sma',
    ) {
        requirePositiveInt(period, 'период EMA');
        this.k = 2 / (period + 1);
        this.seedWindow = new NumberWindow(period);
    }

    /** Индекс значения, на котором появляется первый результат. */
    get seedIndex(): number {
        return this.seedMode === 'first' ? this.seedDelay : this.period - 1 + this.seedDelay;
    }

    reset(): void {
        this.value = NaN;
        this.seen = 0;
        this.ready = false;
        this.seedWindow.clear();
    }

    /** NaN, пока затравка не произошла. */
    push(x: number): number {
        if (!this.ready) {
            if (this.seedMode === 'first') {
                // Затравка первым значением: рекурсия начинается сразу, но до
                // seedIndex результат наружу не отдаётся.
                const index = this.seen;
                this.seen += 1;
                this.value = index === 0 ? x : this.value + (x - this.value) * this.k;
                if (index < this.seedIndex) return NaN;
                this.ready = true;
                return this.value;
            }
            this.seedWindow.push(x);
            const index = this.seen;
            this.seen += 1;
            if (index < this.seedIndex) return NaN;
            this.value = this.seedWindow.mean();
            this.ready = true;
            return this.value;
        }
        this.seen += 1;
        this.value += (x - this.value) * this.k;
        return this.value;
    }

    capture(): EmaSnapshot {
        return {
            value: this.value,
            seen: this.seen,
            ready: this.ready,
            // Копия окна нужна только во время разогрева — дальше аллокаций нет.
            window: this.ready || this.seedMode === 'first' ? null : this.seedWindow.snapshot(),
            head: this.seedWindow.headIndex,
        };
    }

    restore(snapshot: EmaSnapshot): void {
        this.value = snapshot.value;
        this.seen = snapshot.seen;
        this.ready = snapshot.ready;
        if (snapshot.window !== null) {
            this.seedWindow.restore(snapshot.window, snapshot.head, snapshot.seen);
        }
    }
}
