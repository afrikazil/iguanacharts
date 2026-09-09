import { describe, expect, it } from 'vitest';
import { ElderRay } from '../src/indicators/elder-ray.js';
import { MaType } from '../src/indicators/moving-averages.js';
import { compareWithLegacy, feedChannel, legacy, toDataShape } from './legacy-ta.js';
import { randomWalk } from './helpers.js';

const bars = randomWalk(300, 41);
const shape = toDataShape(bars);

function eldrLegacy(maType: number): Record<string, number[]> {
    return legacy('ELDR').calculate(0, bars.length - 1, shape, {
        TimePeriod: 13,
        MAType: maType,
    }) as Record<string, number[]>;
}

describe('ELDR совпадает с legacy', () => {
    it('канал EMA', () => {
        const expected = eldrLegacy(MaType.Ema)['EMA']!;
        expect(
            compareWithLegacy(feedChannel(new ElderRay(13, MaType.Ema), bars, 3), expected),
        ).toEqual([]);
    });

    it('канал ELDR', () => {
        const expected = eldrLegacy(MaType.Ema)['ELDR']!;
        expect(
            compareWithLegacy(feedChannel(new ElderRay(13, MaType.Ema), bars, 0), expected),
        ).toEqual([]);
    });

    it('канал Signal', () => {
        // legacy добивает начало нулями через splice(0,0,0) — сравниваем с
        // момента, когда сигнальное сглаживание действительно определено.
        const expected = eldrLegacy(MaType.Ema)['Signal']!;
        expect(
            compareWithLegacy(feedChannel(new ElderRay(13, MaType.Ema), bars, 1), expected, {
                skip: 12,
            }),
        ).toEqual([]);
    });

    it('канал Smooth', () => {
        const expected = eldrLegacy(MaType.Ema)['Smooth']!;
        expect(
            compareWithLegacy(feedChannel(new ElderRay(13, MaType.Ema), bars, 2), expected, {
                skip: 1,
            }),
        ).toEqual([]);
    });

    it('legacy отдаёт нули на разогреве Signal, мы — NaN', () => {
        const expected = eldrLegacy(MaType.Ema)['Signal']!;
        expect(expected[0]).toBe(0);
        expect(feedChannel(new ElderRay(13, MaType.Ema), bars, 1)[12]!).toBeNaN();
    });

    it('неподдерживаемый тип средней отвергается явно', () => {
        expect(() => new ElderRay(13, 4)).toThrow(RangeError);
    });
});
