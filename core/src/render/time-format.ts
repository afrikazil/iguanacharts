const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Формат подписей оси времени по видимому интервалу.
 *
 * Фиксированный формат — частая ошибка: на минутных барах все подписи
 * вырождаются в одну и ту же дату, а на годовом графике — в один и тот же час.
 * Порог выбирается по реально видимому диапазону, а не по таймфрейму, потому
 * что при зуме одного и того же ряда нужны разные подписи.
 */
export function timeAxisFormatOptions(visibleSpanMs: number): Intl.DateTimeFormatOptions {
    if (visibleSpanMs < DAY) return { hour: '2-digit', minute: '2-digit' };
    // Несколько суток внутридневных баров: без времени подписи повторяются
    // внутри каждого дня и ось перестаёт что-либо сообщать.
    if (visibleSpanMs < 7 * DAY) {
        return { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
    }
    if (visibleSpanMs < 60 * DAY) return { day: '2-digit', month: 'short' };
    if (visibleSpanMs < 3 * 365 * DAY) return { month: 'short', year: 'numeric' };
    return { year: 'numeric' };
}

/**
 * Кэш форматтеров: Intl.DateTimeFormat стоит дорого при создании, а формат
 * меняется только при смене масштаба, не на каждом кадре.
 */
export class TimeAxisFormatter {
    private readonly cache = new Map<string, Intl.DateTimeFormat>();
    private current: Intl.DateTimeFormat;
    private currentKey = '';

    /**
     * timeZone задаёт пояс отображения, не сдвигая сами данные. Именно этим
     * он отличается от подхода legacy, где к меткам времени прибавлялась
     * разница между Москвой и зрителем — и историю уводило на час при
     * переходе на летнее время.
     */
    constructor(
        private readonly locale?: string,
        private readonly timeZone?: string,
    ) {
        this.current = this.formatterFor(DAY);
    }

    /** Возвращает true, если формат сменился — вызывающему нужна перерисовка. */
    setVisibleSpan(spanMs: number): boolean {
        const options = timeAxisFormatOptions(spanMs);
        const key = Object.keys(options).sort().join(',');
        if (key === this.currentKey) return false;
        this.currentKey = key;
        this.current = this.cachedFormatter(key, options);
        return true;
    }

    format(timeMs: number): string {
        return this.current.format(timeMs);
    }

    private formatterFor(spanMs: number): Intl.DateTimeFormat {
        const options = timeAxisFormatOptions(spanMs);
        this.currentKey = Object.keys(options).sort().join(',');
        return this.cachedFormatter(this.currentKey, options);
    }

    private cachedFormatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
        let formatter = this.cache.get(key);
        if (formatter === undefined) {
            formatter = new Intl.DateTimeFormat(
                this.locale,
                this.timeZone === undefined ? options : { ...options, timeZone: this.timeZone },
            );
            this.cache.set(key, formatter);
        }
        return formatter;
    }
}
