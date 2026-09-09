import type { CandleGeometry } from './geometry.js';

export interface CandleStyle {
    upColor: string;
    downColor: string;
    upWickColor: string;
    downWickColor: string;
}

/**
 * Отрисовка свечей двумя fill-вызовами на кадр.
 *
 * Здесь весь смысл батчинга: fillStyle меняется дважды за кадр, а не дважды на
 * свечу. В старом рендерере присваивание fillStyle/strokeStyle стояло внутри
 * цикла по барам — для Canvas 2D это самая дорогая операция, потому что каждая
 * смена состояния контекста рвёт пакет отрисовки.
 */
export function drawCandles(
    ctx: CanvasRenderingContext2D,
    geometry: CandleGeometry,
    style: CandleStyle,
): void {
    if (geometry.count === 0) return;

    if (geometry.wickOnly) {
        drawWickOnly(ctx, geometry, style);
        return;
    }

    const half = (geometry.bodyWidth - 1) / 2;

    for (const up of [1, 0] as const) {
        // Тени и тела одного направления идут в один путь: один fill на группу.
        ctx.beginPath();
        for (let i = 0; i < geometry.count; i += 1) {
            if (geometry.up[i] !== up) continue;
            const x = geometry.x[i]!;
            const wickTop = geometry.wickTop[i]!;
            const wickBottom = geometry.wickBottom[i]!;
            ctx.rect(x - 0.5, wickTop, 1, wickBottom - wickTop);

            const bodyTop = geometry.bodyTop[i]!;
            const bodyBottom = geometry.bodyBottom[i]!;
            // Доджи схлопывается в ноль высоты — оставляем один пиксель.
            const height = Math.max(bodyBottom - bodyTop, 1);
            ctx.rect(x - half - 0.5, Math.round(bodyTop), geometry.bodyWidth, height);
        }
        ctx.fillStyle = up === 1 ? style.upColor : style.downColor;
        ctx.fill();
    }
}

function drawWickOnly(
    ctx: CanvasRenderingContext2D,
    geometry: CandleGeometry,
    style: CandleStyle,
): void {
    for (const up of [1, 0] as const) {
        ctx.beginPath();
        for (let i = 0; i < geometry.count; i += 1) {
            if (geometry.up[i] !== up) continue;
            const x = geometry.x[i]!;
            const top = Math.min(geometry.wickTop[i]!, geometry.bodyTop[i]!);
            const bottom = Math.max(geometry.wickBottom[i]!, geometry.bodyBottom[i]!);
            ctx.rect(x - 0.5, top, 1, Math.max(bottom - top, 1));
        }
        ctx.fillStyle = up === 1 ? style.upWickColor : style.downWickColor;
        ctx.fill();
    }
}
