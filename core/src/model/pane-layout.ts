export interface PaneSpec {
    /** Доля свободной высоты. Главный пейн обычно тяжелее остальных. */
    weight: number;
    /** Минимальная высота в пикселях — ниже пейн бесполезен. */
    minHeight: number;
}

export interface PaneRect {
    top: number;
    height: number;
}

/**
 * Раскладка пейнов по вертикали.
 *
 * Пропорции по весам, но с уважением к минимальным высотам: пейн, которому не
 * хватило доли, фиксируется на минимуме и выходит из распределения, остаток
 * делится между остальными заново. Без этого при сжатии окна индикаторный
 * пейн схлопывается в ноль раньше, чем это заметит пользователь.
 *
 * Когда минимумов больше, чем есть места, всё сжимается пропорционально —
 * это вырожденный случай, но лучше отдать неидеальную раскладку, чем NaN.
 */
export function layoutPanes(
    totalHeight: number,
    specs: readonly PaneSpec[],
    separatorHeight: number,
): PaneRect[] {
    if (specs.length === 0) return [];

    const available = Math.max(totalHeight - separatorHeight * (specs.length - 1), 0);
    const minTotal = specs.reduce((sum, spec) => sum + spec.minHeight, 0);

    let heights: number[];
    if (minTotal >= available) {
        const scale = minTotal === 0 ? 0 : available / minTotal;
        heights = specs.map((spec) => spec.minHeight * scale);
    } else {
        heights = distribute(specs, available);
    }

    const rects: PaneRect[] = [];
    let top = 0;
    for (const height of heights) {
        rects.push({ top, height });
        top += height + separatorHeight;
    }
    return rects;
}

function distribute(specs: readonly PaneSpec[], available: number): number[] {
    const heights = new Array<number>(specs.length).fill(0);
    const flexible = new Set(specs.map((_, index) => index));
    let pool = available;

    // Каждая итерация фиксирует пейны, не дотянувшие до минимума, и делит
    // остаток заново. Индексов конечное число, поэтому цикл завершается.
    for (;;) {
        const weightSum = [...flexible].reduce((sum, index) => sum + specs[index]!.weight, 0);
        if (flexible.size === 0 || weightSum <= 0) break;

        let clamped = false;
        for (const index of flexible) {
            const share = (pool * specs[index]!.weight) / weightSum;
            if (share < specs[index]!.minHeight) {
                heights[index] = specs[index]!.minHeight;
                pool -= specs[index]!.minHeight;
                flexible.delete(index);
                clamped = true;
                break;
            }
        }
        if (clamped) continue;

        for (const index of flexible) {
            heights[index] = (pool * specs[index]!.weight) / weightSum;
        }
        break;
    }

    // Весов может не остаться вовсе — раздаём остаток равными долями.
    if (flexible.size > 0 && specs.every((spec) => spec.weight <= 0)) {
        for (const index of flexible) heights[index] = pool / flexible.size;
    }
    return heights;
}
