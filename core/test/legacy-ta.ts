import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Indicator } from '../src/indicators/indicator.js';
import type { Bar } from '../src/model/bars.js';

/**
 * Эталон переноса — оригинальные функции TA из legacy-библиотеки.
 *
 * Файлы в src/scripts/ta/functions — прямой порт TA-Lib и не зависят ни от
 * DOM, ни от jQuery в самих расчётах, поэтому их можно загрузить в node и
 * сравнивать значения численно. Это надёжнее повторного вывода формул: перенос
 * проверяется против того, что реально считалось в проде годами, включая
 * особенности реализации.
 */
export interface LegacyIndicator {
    name: string;
    DefaultSettings: Record<string, number>;
    calculate(
        startIdx: number | undefined,
        endIdx: number | undefined,
        dataShape: number[][],
        settings: Record<string, number>,
    ): number[] | Record<string, number[]>;
}

export interface LegacyTA {
    OPEN: number;
    HIGH: number;
    LOW: number;
    CLOSE: number;
    VOL: number;
    [name: string]: unknown;
}

const deepClone = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(deepClone);
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value)) {
            out[key] = deepClone((value as Record<string, unknown>)[key]);
        }
        return out;
    }
    return value;
};

/** Из jQuery нужен только глубокий клон в INDICATOR_TEMPLATE.Create(). */
const jqueryStub = {
    extend(...args: unknown[]): Record<string, unknown> {
        const deep = args[0] === true;
        const rest = deep ? args.slice(1) : args;
        const target = rest[0] as Record<string, unknown>;
        for (const source of rest.slice(1)) {
            if (source === undefined || source === null) continue;
            for (const key of Object.keys(source as object)) {
                const value = (source as Record<string, unknown>)[key];
                target[key] = deep ? deepClone(value) : value;
            }
        }
        return target;
    },
};

/** Настройки по тикеру в расчётах не участвуют, достаточно тождества. */
const mainControllerStub = { RatesController: { getTicker: (ticker: string) => ticker } };

let cached: LegacyTA | undefined;

export function loadLegacyTA(): LegacyTA {
    if (cached !== undefined) return cached;

    const root = path.join(import.meta.dirname, '../../src/scripts/ta');
    const strip = (text: string): string =>
        text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

    const parts = [strip(readFileSync(path.join(root, 'TA_prototypes.js'), 'utf8'))];
    for (const file of globSync('functions/*', { cwd: root }).sort()) {
        parts.push(strip(readFileSync(path.join(root, file), 'utf8')));
    }

    const factory = new Function(
        '$',
        'MainController',
        `${parts.join('\n')}\n; return TA;`,
    ) as (jq: unknown, mc: unknown) => LegacyTA;

    cached = factory(jqueryStub, mainControllerStub);
    return cached;
}

export function legacy(name: string): LegacyIndicator {
    const indicator = loadLegacyTA()[name];
    if (indicator === undefined) throw new Error(`в legacy TA нет индикатора ${name}`);
    return indicator as LegacyIndicator;
}

/** Бары в формат legacy: массив массивов с индексами TA.OPEN/HIGH/LOW/CLOSE/VOL. */
export function toDataShape(bars: readonly Bar[]): number[][] {
    const TA = loadLegacyTA();
    return bars.map((bar) => {
        const row: number[] = [];
        row[TA.OPEN] = bar.open;
        row[TA.HIGH] = bar.high;
        row[TA.LOW] = bar.low;
        row[TA.CLOSE] = bar.close;
        row[TA.VOL] = bar.volume;
        return row;
    });
}

/** Значения нового индикатора по каналам: rows[barIndex][channel]. */
export function feed(indicator: Indicator, bars: readonly Bar[]): number[][] {
    const out = new Float64Array(indicator.outputs.length);
    indicator.reset();
    return bars.map((bar) => {
        indicator.push(bar, out);
        return [...out];
    });
}

/** Значения одного канала. */
export function feedChannel(
    indicator: Indicator,
    bars: readonly Bar[],
    channel = 0,
): number[] {
    return feed(indicator, bars).map((row) => row[channel]!);
}

/**
 * legacy отдаёт массив только для тех баров, где значение уже определено, —
 * он короче истории на период разогрева и выровнен по её концу.
 */
export function legacyOffset(barCount: number, values: readonly number[]): number {
    return barCount - values.length;
}

export interface CompareOptions {
    /** Знаков совпадения. По умолчанию 8. */
    digits?: number;
    /** Сколько первых значений legacy пропустить (нестабильный период). */
    skip?: number;
}

/**
 * Сверяет канал нового индикатора с массивом legacy, учитывая смещение.
 * Возвращает список расхождений — пустой список означает совпадение.
 */
export function compareWithLegacy(
    mine: readonly number[],
    legacyValues: readonly number[],
    options: CompareOptions = {},
): string[] {
    const digits = options.digits ?? 8;
    const skip = options.skip ?? 0;
    const offset = legacyOffset(mine.length, legacyValues);
    const problems: string[] = [];
    const tolerance = 0.5 * 10 ** -digits;

    if (offset < 0) {
        return [`legacy длиннее истории: ${legacyValues.length} против ${mine.length}`];
    }

    for (let i = skip; i < legacyValues.length; i += 1) {
        const expected = legacyValues[i]!;
        const actual = mine[offset + i]!;
        if (Number.isNaN(actual)) {
            problems.push(`бар ${offset + i}: у нас NaN, в legacy ${expected}`);
        } else if (Math.abs(actual - expected) > tolerance * Math.max(1, Math.abs(expected))) {
            problems.push(`бар ${offset + i}: ${actual} против ${expected}`);
        }
        if (problems.length >= 5) break;
    }
    return problems;
}
