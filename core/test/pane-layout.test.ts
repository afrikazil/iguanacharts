import { describe, expect, it } from 'vitest';
import { layoutPanes, type PaneSpec } from '../src/model/pane-layout.js';

const spec = (weight: number, minHeight = 0): PaneSpec => ({ weight, minHeight });

describe('layoutPanes', () => {
    it('делит высоту по весам', () => {
        const rects = layoutPanes(400, [spec(3), spec(1)], 0);
        expect(rects[0]).toEqual({ top: 0, height: 300 });
        expect(rects[1]).toEqual({ top: 300, height: 100 });
    });

    it('вычитает разделители из доступной высоты', () => {
        const rects = layoutPanes(410, [spec(1), spec(1)], 10);
        expect(rects[0]!.height).toBe(200);
        expect(rects[1]).toEqual({ top: 210, height: 200 });
    });

    it('сумма высот и разделителей равна общей высоте', () => {
        const rects = layoutPanes(500, [spec(4), spec(1), spec(1)], 6);
        const total = rects.reduce((sum, rect) => sum + rect.height, 0) + 6 * 2;
        expect(total).toBeCloseTo(500, 9);
    });

    it('уважает минимальную высоту, отдавая остаток остальным', () => {
        // При весах 9:1 второму пейну досталось бы 30px — поднимаем до 60.
        const rects = layoutPanes(300, [spec(9), spec(1, 60)], 0);
        expect(rects[1]!.height).toBe(60);
        expect(rects[0]!.height).toBe(240);
    });

    it('несколько минимумов срабатывают одновременно', () => {
        const rects = layoutPanes(300, [spec(20), spec(1, 50), spec(1, 50)], 0);
        expect(rects[1]!.height).toBe(50);
        expect(rects[2]!.height).toBe(50);
        expect(rects[0]!.height).toBe(200);
    });

    it('когда минимумов больше, чем места, сжимает пропорционально', () => {
        const rects = layoutPanes(100, [spec(1, 200), spec(1, 200)], 0);
        expect(rects[0]!.height).toBeCloseTo(50, 9);
        expect(rects[1]!.height).toBeCloseTo(50, 9);
        expect(rects.every((rect) => Number.isFinite(rect.height))).toBe(true);
    });

    it('один пейн занимает всё', () => {
        expect(layoutPanes(400, [spec(1)], 8)).toEqual([{ top: 0, height: 400 }]);
    });

    it('пустой список даёт пустую раскладку', () => {
        expect(layoutPanes(400, [], 8)).toEqual([]);
    });

    it('нулевые веса не дают NaN', () => {
        const rects = layoutPanes(300, [spec(0), spec(0)], 0);
        expect(rects.every((rect) => Number.isFinite(rect.height))).toBe(true);
        expect(rects[0]!.height + rects[1]!.height).toBeCloseTo(300, 9);
    });

    it('нулевая высота не роняет раскладку', () => {
        const rects = layoutPanes(0, [spec(1, 10), spec(1, 10)], 4);
        expect(rects.every((rect) => Number.isFinite(rect.height))).toBe(true);
    });
});
