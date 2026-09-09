export interface Bar {
    /** unix-время в миллисекундах */
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface MinMax {
    min: number;
    max: number;
}

const DEFAULT_CAPACITY = 1024;

/**
 * Бары в колоночных типизированных массивах.
 *
 * Колоночная раскладка выбрана не ради экономии памяти, а потому что горячие
 * проходы (autoscale по видимому диапазону, построение геометрии) читают одну
 * колонку целиком — так это один линейный проход по непрерывной памяти вместо
 * прыжков по объектам. Плюс формат данных tradernet (hloc/vl/xSeries —
 * параллельные массивы) ложится сюда без промежуточного преобразования.
 *
 * Данные занимают [offset, offset + count). Запас слева нужен для prepend:
 * догрузка истории при скролле влево — обычная операция, и она не должна
 * копировать весь массив.
 */
export class BarSeries {
    private time: Float64Array;
    private open: Float64Array;
    private high: Float64Array;
    private low: Float64Array;
    private close: Float64Array;
    private volume: Float64Array;

    private offset = 0;
    private count = 0;

    constructor(capacity: number = DEFAULT_CAPACITY) {
        const size = Math.max(capacity, 1);
        this.time = new Float64Array(size);
        this.open = new Float64Array(size);
        this.high = new Float64Array(size);
        this.low = new Float64Array(size);
        this.close = new Float64Array(size);
        this.volume = new Float64Array(size);
    }

    get length(): number {
        return this.count;
    }

    get capacity(): number {
        return this.time.length;
    }

    timeAt(index: number): number {
        return this.time[this.offset + index]!;
    }

    openAt(index: number): number {
        return this.open[this.offset + index]!;
    }

    highAt(index: number): number {
        return this.high[this.offset + index]!;
    }

    lowAt(index: number): number {
        return this.low[this.offset + index]!;
    }

    closeAt(index: number): number {
        return this.close[this.offset + index]!;
    }

    volumeAt(index: number): number {
        return this.volume[this.offset + index]!;
    }

    barAt(index: number): Bar {
        const i = this.offset + index;
        return {
            time: this.time[i]!,
            open: this.open[i]!,
            high: this.high[i]!,
            low: this.low[i]!,
            close: this.close[i]!,
            volume: this.volume[i]!,
        };
    }

    setData(bars: readonly Bar[]): void {
        // Сброс до перевыделения: reallocate копирует [offset, offset + count),
        // и со старым count новый буфер меньшего размера не вмещает копию.
        // Именно так падала смена инструмента на бумагу с меньшей историей.
        this.offset = 0;
        this.count = 0;
        if (this.time.length < bars.length) {
            this.allocate(Math.max(bars.length, DEFAULT_CAPACITY));
        }
        for (const bar of bars) this.append(bar);
    }

    append(bar: Bar): void {
        if (this.offset + this.count >= this.time.length) {
            this.reallocate(Math.max(this.time.length * 2, DEFAULT_CAPACITY), this.offset);
        }
        this.write(this.offset + this.count, bar);
        this.count += 1;
    }

    /** Перезаписывает последний бар — приход тика по уже открытой свече. */
    updateLast(bar: Bar): void {
        if (this.count === 0) {
            this.append(bar);
            return;
        }
        this.write(this.offset + this.count - 1, bar);
    }

    /** Догрузка истории: бары идут в порядке возрастания времени и встают слева. */
    prepend(bars: readonly Bar[]): void {
        if (bars.length === 0) return;
        if (this.offset < bars.length) {
            const headroom = Math.max(bars.length, this.count >> 1, DEFAULT_CAPACITY);
            this.reallocate(this.count + headroom + bars.length, headroom + bars.length);
        }
        this.offset -= bars.length;
        for (let i = 0; i < bars.length; i += 1) this.write(this.offset + i, bars[i]!);
        this.count += bars.length;
    }

    /**
     * Минимум low и максимум high на [from, to] включительно.
     * Один линейный проход, без аллокаций — вызывается на каждом кадре.
     */
    lowHighInRange(from: number, to: number): MinMax {
        const start = this.offset + Math.max(from, 0);
        const end = this.offset + Math.min(to, this.count - 1);
        if (end < start) return { min: NaN, max: NaN };

        let min = this.low[start]!;
        let max = this.high[start]!;
        for (let i = start + 1; i <= end; i += 1) {
            const l = this.low[i]!;
            const h = this.high[i]!;
            if (l < min) min = l;
            if (h > max) max = h;
        }
        return { min, max };
    }

    /** Максимум объёма на [from, to] включительно. Минимум объёма всегда 0. */
    volumeMaxInRange(from: number, to: number): number {
        const start = this.offset + Math.max(from, 0);
        const end = this.offset + Math.min(to, this.count - 1);
        if (end < start) return NaN;

        let max = this.volume[start]!;
        for (let i = start + 1; i <= end; i += 1) {
            const v = this.volume[i]!;
            if (v > max) max = v;
        }
        return max;
    }

    /** Индекс бара по времени; при точном промахе — индекс ближайшего слева. */
    indexOfTime(time: number): number {
        let lo = 0;
        let hi = this.count - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const t = this.time[this.offset + mid]!;
            if (t === time) return mid;
            if (t < time) lo = mid + 1;
            else hi = mid - 1;
        }
        return hi;
    }

    private write(i: number, bar: Bar): void {
        this.time[i] = bar.time;
        this.open[i] = bar.open;
        this.high[i] = bar.high;
        this.low[i] = bar.low;
        this.close[i] = bar.close;
        this.volume[i] = bar.volume;
    }

    private allocate(capacity: number): void {
        this.time = new Float64Array(capacity);
        this.open = new Float64Array(capacity);
        this.high = new Float64Array(capacity);
        this.low = new Float64Array(capacity);
        this.close = new Float64Array(capacity);
        this.volume = new Float64Array(capacity);
    }

    /** Инвариант: capacity >= newOffset + count, иначе копия не вмещается. */
    private reallocate(capacity: number, newOffset: number): void {
        const grow = (src: Float64Array): Float64Array => {
            const next = new Float64Array(capacity);
            next.set(src.subarray(this.offset, this.offset + this.count), newOffset);
            return next;
        };
        this.time = grow(this.time);
        this.open = grow(this.open);
        this.high = grow(this.high);
        this.low = grow(this.low);
        this.close = grow(this.close);
        this.volume = grow(this.volume);
        this.offset = newOffset;
    }
}
