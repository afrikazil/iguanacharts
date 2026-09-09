import { describe, expect, it } from 'vitest';
import { Adx, MinusDi, MinusDm, PlusDi, PlusDm, Sar } from '../src/indicators/directional.js';
import { ElderRay } from '../src/indicators/elder-ray.js';
import type { Indicator } from '../src/indicators/indicator.js';
import { Ema, Tema, Trima, Wma, Zlema } from '../src/indicators/moving-averages.js';
import { Aroon, Cci, Macd, Stoch, WilliamsR } from '../src/indicators/oscillators.js';
import { MedPrice, TrueRange, TypPrice, WclPrice } from '../src/indicators/price.js';
import { Rsi } from '../src/indicators/rsi.js';
import { Sma } from '../src/indicators/sma.js';
import {
    Atr,
    Bbands,
    Chv,
    Dpo,
    Envelopes,
    PriceChannel,
    Roc,
    StdDev,
    Variance,
} from '../src/indicators/volatility.js';
import { Ad, Adosc, Mfi, Obv, Vpt } from '../src/indicators/volume.js';
import type { Bar } from '../src/model/bars.js';
import { feed } from './legacy-ta.js';
import { randomWalk } from './helpers.js';

/**
 * Все перенесённые индикаторы. Список полный намеренно: тик по последнему
 * бару — единственное место, где рекуррентные индикаторы могут незаметно
 * разъехаться, и проверять это нужно у каждого, а не выборочно.
 */
const all: (() => Indicator)[] = [
    () => new Sma(20),
    () => new Rsi(14),
    () => new MedPrice(),
    () => new TypPrice(),
    () => new WclPrice(),
    () => new TrueRange(),
    () => new Ema(30),
    () => new Wma(30),
    () => new Trima(20),
    () => new Tema(12),
    () => new Zlema(12),
    () => new Variance(20),
    () => new StdDev(10, 2),
    () => new Bbands({ period: 7 }),
    () => new Atr(14),
    () => new Chv(10, 10),
    () => new Envelopes(20, 1),
    () => new PriceChannel(13, 13),
    () => new Roc(10),
    () => new Dpo(20),
    () => new Cci(14),
    () => new WilliamsR(14),
    () => new Aroon(14),
    () => new Stoch(),
    () => new Macd(),
    () => new MinusDm(14),
    () => new PlusDm(14),
    () => new MinusDi(14),
    () => new PlusDi(14),
    () => new Adx(14),
    () => new Sar(),
    () => new Ad(),
    () => new Adosc(3, 10),
    () => new Obv(),
    () => new Vpt(),
    () => new Mfi(14),
    () => new ElderRay(13),
];

const bars = randomWalk(240, 43);

/**
 * Каждый бар сначала приходит «сырым» (закрытие равно открытию), затем
 * несколько раз уточняется тиками и в конце принимает истинное значение.
 * Результат обязан совпасть с прогоном, где каждый бар пришёл сразу готовым.
 */
function streamWithTicks(indicator: Indicator, source: readonly Bar[]): number[][] {
    const out = new Float64Array(indicator.outputs.length);
    indicator.reset();
    const rows: number[][] = [];

    for (const bar of source) {
        indicator.push({ ...bar, close: bar.open }, out);
        for (const factor of [0.97, 1.04, 0.99]) {
            indicator.updateLast({ ...bar, close: bar.close * factor }, out);
        }
        indicator.updateLast(bar, out);
        rows.push([...out]);
    }
    return rows;
}

describe('тики по последнему бару не искажают состояние', () => {
    for (const make of all) {
        it(make().name, () => {
            const expected = feed(make(), bars);
            const streamed = streamWithTicks(make(), bars);

            expect(streamed.length).toBe(expected.length);
            for (let i = 0; i < expected.length; i += 1) {
                const expectedRow = expected[i]!;
                const actualRow = streamed[i]!;
                for (let channel = 0; channel < expectedRow.length; channel += 1) {
                    const a = actualRow[channel]!;
                    const b = expectedRow[channel]!;
                    if (Number.isNaN(b)) expect(a, `бар ${i}, канал ${channel}`).toBeNaN();
                    else expect(a, `бар ${i}, канал ${channel}`).toBeCloseTo(b, 9);
                }
            }
        });
    }
});
