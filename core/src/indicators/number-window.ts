import { requirePositiveInt } from './indicator.js';

/**
 * Окно последних N чисел — для индикаторов, которые сглаживают не бары, а
 * промежуточный ряд: STOCH усредняет свой же fastK, ADX — DX, ELDR — силу
 * быков и медведей.
 *
 * replaceLast нужен для тиков: пересчёт последнего значения производного ряда
 * не должен сдвигать окно.
 */
export class NumberWindow {
    private readonly values: Float64Array;
    private head = -1;
    private seenCount = 0;

    constructor(readonly size: number) {
        requirePositiveInt(size, 'размер окна');
        this.values = new Float64Array(size);
    }

    get seen(): number {
        return this.seenCount;
    }

    get full(): boolean {
        return this.seenCount >= this.size;
    }

    clear(): void {
        this.head = -1;
        this.seenCount = 0;
    }

    push(value: number): void {
        this.head = (this.head + 1) % this.size;
        this.seenCount += 1;
        this.values[this.head] = value;
    }

    replaceLast(value: number): void {
        if (this.seenCount === 0) {
            this.push(value);
            return;
        }
        this.values[this.head] = value;
    }

    /** back = 0 — последнее добавленное значение. */
    at(back = 0): number {
        const index = this.head - back;
        return this.values[index >= 0 ? index : index + this.size]!;
    }

    /** Простое среднее по всему окну; NaN, если окно не заполнено. */
    mean(): number {
        if (!this.full) return NaN;
        let sum = 0;
        for (let back = 0; back < this.size; back += 1) sum += this.at(back);
        return sum / this.size;
    }

    snapshot(): Float64Array {
        return this.values.slice();
    }

    restore(values: Float64Array, head: number, seen: number): void {
        this.values.set(values);
        this.head = head;
        this.seenCount = seen;
    }

    get headIndex(): number {
        return this.head;
    }
}
