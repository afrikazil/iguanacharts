/**
 * Один canvas-слой. Слоёв два: серии и оверлей (кросс-хэйр). Разделение нужно
 * ровно для того, чтобы движение мыши не перерисовывало свечи.
 */
export class CanvasLayer {
    readonly canvas: HTMLCanvasElement;
    readonly ctx: CanvasRenderingContext2D;

    private cssWidth = 0;
    private cssHeight = 0;

    constructor(container: HTMLElement, zIndex: number) {
        this.canvas = container.ownerDocument.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.inset = '0';
        this.canvas.style.zIndex = String(zIndex);
        container.appendChild(this.canvas);

        const ctx = this.canvas.getContext('2d');
        if (ctx === null) throw new Error('canvas 2d context недоступен');
        this.ctx = ctx;
    }

    get width(): number {
        return this.cssWidth;
    }

    get height(): number {
        return this.cssHeight;
    }

    /**
     * Ресайз с учётом devicePixelRatio: бэкинг-стор в физических пикселях,
     * а все координаты рисования остаются в CSS-пикселях за счёт трансформации.
     */
    resize(cssWidth: number, cssHeight: number, dpr: number): void {
        this.cssWidth = cssWidth;
        this.cssHeight = cssHeight;
        this.canvas.width = Math.round(cssWidth * dpr);
        this.canvas.height = Math.round(cssHeight * dpr);
        this.canvas.style.width = `${cssWidth}px`;
        this.canvas.style.height = `${cssHeight}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    clear(): void {
        this.ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    }

    dispose(): void {
        this.canvas.remove();
    }
}
