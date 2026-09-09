import { describe, expect, it } from 'vitest';
import { PriceScale } from '../src/model/price-scale.js';

describe('PriceScale', () => {
    it('линейный режим: yAt и priceAt взаимно обратны', () => {
        const scale = new PriceScale();
        scale.setHeight(400);
        scale.setPriceRange(100, 200);
        for (const price of [100, 137.5, 200]) {
            expect(scale.priceAt(scale.yAt(price))).toBeCloseTo(price, 9);
        }
    });

    it('ось направлена вверх: большая цена — меньший y', () => {
        const scale = new PriceScale();
        scale.setHeight(400);
        scale.setPriceRange(100, 200);
        expect(scale.yAt(200)).toBeLessThan(scale.yAt(100));
    });

    it('autoScale оставляет поля сверху и снизу', () => {
        const scale = new PriceScale({ topMargin: 0.1, bottomMargin: 0.1 });
        scale.setHeight(400);
        scale.autoScale(100, 200);

        // Крайние цены не должны попадать на самые границы полотна.
        expect(scale.yAt(200)).toBeGreaterThan(0);
        expect(scale.yAt(100)).toBeLessThan(400);
        const { min, max } = scale.priceRange();
        expect(min).toBeCloseTo(90, 6);
        expect(max).toBeCloseTo(210, 6);
    });

    it('autoScale на плоском участке не делит на ноль', () => {
        const scale = new PriceScale();
        scale.setHeight(400);
        scale.autoScale(150, 150);

        const y = scale.yAt(150);
        expect(Number.isFinite(y)).toBe(true);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(400);
    });

    it('логарифмический режим: равные отношения дают равные расстояния', () => {
        const scale = new PriceScale({ mode: 'logarithmic' });
        scale.setHeight(400);
        scale.setPriceRange(10, 1000);

        const d1 = scale.yAt(10) - scale.yAt(100);
        const d2 = scale.yAt(100) - scale.yAt(1000);
        expect(d1).toBeCloseTo(d2, 6);
    });

    it('логарифмический режим обратим', () => {
        const scale = new PriceScale({ mode: 'logarithmic' });
        scale.setHeight(400);
        scale.setPriceRange(10, 1000);
        expect(scale.priceAt(scale.yAt(57.3))).toBeCloseTo(57.3, 6);
    });

    it('процентный режим считает от базы', () => {
        const scale = new PriceScale({ mode: 'percentage' });
        scale.setHeight(400);
        scale.setBase(100);
        scale.setPriceRange(100, 120);

        expect(scale.yAt(100)).toBeCloseTo(400, 6);
        expect(scale.yAt(120)).toBeCloseTo(0, 6);
        expect(scale.yAt(110)).toBeCloseTo(200, 6);
    });

    it('нулевая база в процентном режиме не ломает шкалу', () => {
        const scale = new PriceScale({ mode: 'percentage' });
        scale.setHeight(400);
        scale.setBase(0);
        scale.autoScale(1, 2);
        expect(Number.isFinite(scale.yAt(1.5))).toBe(true);
    });
});
