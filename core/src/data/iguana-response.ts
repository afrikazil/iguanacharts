import type { Bar } from '../model/bars.js';

/** Число или строка: JSON от API приходит и в том, и в другом виде. */
type Numeric = number | string;

/**
 * Ответ chart-API tradernet. Все поля разложены по тикерам.
 *
 * ВНИМАНИЕ на порядок внутри строки hloc: **high, low, open, close**, а не
 * OHLC. Перепутанный порядок не приводит к ошибке — график продолжает
 * рисоваться, просто свечи оказываются вывернутыми, и заметить это можно
 * далеко не сразу. Отсюда отдельный тест именно на порядок.
 */
export interface IguanaChartResponse {
    hloc?: Record<string, readonly (readonly Numeric[])[]>;
    vl?: Record<string, readonly Numeric[]>;
    /** Метки времени в **секундах**. */
    xSeries?: Record<string, readonly Numeric[]>;
}

export interface ReadResult {
    /** Тикер, из которого читали; null — в ответе нет данных. */
    ticker: string | null;
    bars: Bar[];
    /** Отброшено из-за незаполненных или нечисловых цен. */
    skipped: number;
    /** Пришло не по возрастанию времени; такие бары отсортированы. */
    outOfOrder: number;
    /** Повторяющиеся метки времени; оставлен последний бар. */
    duplicates: number;
}

/**
 * Приведение к числу с честным «нет значения».
 *
 * Прямой Number() здесь опасен: Number(null) и Number('') равны нулю и
 * проходят проверку на конечность. Незаполненный бар вида [null,null,null,null]
 * из ответа при сравнении нескольких бумаг превратился бы в свечу по нулевой
 * цене, а она уносит автоскейл всего окна.
 */
function numberOf(value: Numeric | null | undefined): number {
    if (value === null || value === undefined || value === '') return NaN;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}

const HIGH = 0;
const LOW = 1;
const OPEN = 2;
const CLOSE = 3;

export function tickersOf(response: IguanaChartResponse): string[] {
    return response.hloc === undefined ? [] : Object.keys(response.hloc);
}

/**
 * Читает бары одного тикера.
 *
 * Время переводится в миллисекунды UTC и **не сдвигается**. Legacy прибавлял к
 * меткам разницу между Москвой и таймзоной зрителя, чтобы подписи выглядели
 * московскими, но брал эту разницу на текущий момент и применял ко всей
 * истории — у зрителя в зоне с переходом на летнее время бары из другой
 * половины года уезжали на час. Здесь данные остаются истинными, а нужный
 * часовой пояс задаётся отображению через ChartOptions.timeZone.
 */
export function readIguanaResponse(
    response: IguanaChartResponse,
    ticker?: string,
): ReadResult {
    const tickers = tickersOf(response);
    const key = ticker ?? tickers[0];
    const empty: ReadResult = {
        ticker: key ?? null,
        bars: [],
        skipped: 0,
        outOfOrder: 0,
        duplicates: 0,
    };
    if (key === undefined) return empty;

    const rows = response.hloc?.[key];
    const times = response.xSeries?.[key];
    if (rows === undefined || times === undefined) return empty;

    const volumes = response.vl?.[key];
    // Длины полей у API могут разойтись; берём общую часть, а не индексируем
    // вслепую, как делал legacy.
    const length = Math.min(rows.length, times.length);

    const bars: Bar[] = [];
    let skipped = 0;
    let outOfOrder = 0;
    let previousTime = -Infinity;

    for (let i = 0; i < length; i += 1) {
        const row = rows[i];
        if (row === undefined) {
            skipped += 1;
            continue;
        }
        const time = numberOf(times[i]) * 1000;
        const high = numberOf(row[HIGH]);
        const low = numberOf(row[LOW]);
        const open = numberOf(row[OPEN]);
        const close = numberOf(row[CLOSE]);

        if (
            !Number.isFinite(time) ||
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(open) ||
            !Number.isFinite(close)
        ) {
            // При сравнении нескольких бумаг API присылает [null,null,null,null]
            // на барах, которых у инструмента нет.
            skipped += 1;
            continue;
        }

        if (time < previousTime) outOfOrder += 1;
        previousTime = time;

        const volume = volumes === undefined ? 0 : numberOf(volumes[i]);
        bars.push({
            time,
            open,
            high,
            low,
            close,
            volume: Number.isFinite(volume) ? volume : 0,
        });
    }

    // Модель требует строгого возрастания времени: на нём держится и
    // двоичный поиск по времени, и склейка последнего бара с тиком.
    if (outOfOrder > 0) bars.sort((a, b) => a.time - b.time);

    const duplicates = dedupeByTime(bars);
    return { ticker: key, bars, skipped, outOfOrder, duplicates };
}

/** Оставляет последний бар для каждой метки времени. Возвращает число удалённых. */
function dedupeByTime(bars: Bar[]): number {
    let write = 0;
    let removed = 0;

    for (let read = 0; read < bars.length; read += 1) {
        const bar = bars[read]!;
        if (write > 0 && bars[write - 1]!.time === bar.time) {
            // Повтор метки обычно означает уточнённый бар — берём последний.
            bars[write - 1] = bar;
            removed += 1;
            continue;
        }
        bars[write] = bar;
        write += 1;
    }
    bars.length = write;
    return removed;
}

/** Один бар из строки hloc — для точечных обновлений по вебсокету. */
export function barFromHlocRow(
    timeSeconds: Numeric,
    row: readonly Numeric[],
    volume: Numeric = 0,
): Bar | null {
    const time = numberOf(timeSeconds) * 1000;
    const bar: Bar = {
        time,
        open: numberOf(row[OPEN]),
        high: numberOf(row[HIGH]),
        low: numberOf(row[LOW]),
        close: numberOf(row[CLOSE]),
        volume: numberOf(volume),
    };
    const finite =
        Number.isFinite(bar.time) &&
        Number.isFinite(bar.open) &&
        Number.isFinite(bar.high) &&
        Number.isFinite(bar.low) &&
        Number.isFinite(bar.close);
    if (!finite) return null;
    if (!Number.isFinite(bar.volume)) bar.volume = 0;
    return bar;
}
