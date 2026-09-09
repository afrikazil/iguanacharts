export interface PointerHandlers {
    /** Протяжка полотна: dx в пикселях, положительный — вправо. */
    onPan(dx: number, dy: number): void;
    /** factor > 1 — приближение; anchorX — точка, которая должна остаться на месте. */
    onZoom(anchorX: number, factor: number): void;
    onCrosshairMove(x: number, y: number): void;
    onCrosshairLeave(): void;
}

/** Плавность колеса. Подобрано так, чтобы один щелчок давал ~10%. */
const WHEEL_SENSITIVITY = 0.002;

/**
 * Ввод на нативных Pointer Events.
 *
 * Один API покрывает мышь, тач и стилус, поэтому hammerjs, jquery-mousewheel и
 * jquery.event.move не нужны — вместе они тянули четыре зависимости ради того,
 * что сегодня умеет платформа.
 */
export function attachPointerInput(
    element: HTMLElement,
    handlers: PointerHandlers,
): () => void {
    const active = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;

    const localPoint = (event: PointerEvent | WheelEvent): { x: number; y: number } => {
        const rect = element.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onPointerDown = (event: PointerEvent): void => {
        element.setPointerCapture(event.pointerId);
        active.set(event.pointerId, localPoint(event));
        if (active.size === 2) pinchDistance = currentPinchDistance();
    };

    const onPointerMove = (event: PointerEvent): void => {
        const point = localPoint(event);
        const previous = active.get(event.pointerId);

        if (previous === undefined) {
            handlers.onCrosshairMove(point.x, point.y);
            return;
        }
        active.set(event.pointerId, point);

        if (active.size >= 2) {
            const distance = currentPinchDistance();
            if (pinchDistance > 0 && distance > 0) {
                handlers.onZoom(pinchCenterX(), distance / pinchDistance);
            }
            pinchDistance = distance;
            return;
        }

        handlers.onPan(point.x - previous.x, point.y - previous.y);
        handlers.onCrosshairMove(point.x, point.y);
    };

    const onPointerUp = (event: PointerEvent): void => {
        active.delete(event.pointerId);
        pinchDistance = active.size === 2 ? currentPinchDistance() : 0;
        if (element.hasPointerCapture(event.pointerId)) {
            element.releasePointerCapture(event.pointerId);
        }
    };

    const onWheel = (event: WheelEvent): void => {
        // Колесо на графике — это зум, а не скролл страницы.
        event.preventDefault();
        const { x } = localPoint(event);
        handlers.onZoom(x, Math.exp(-event.deltaY * WHEEL_SENSITIVITY));
    };

    const onPointerLeave = (): void => {
        if (active.size === 0) handlers.onCrosshairLeave();
    };

    function currentPinchDistance(): number {
        const points = [...active.values()];
        const a = points[0];
        const b = points[1];
        if (a === undefined || b === undefined) return 0;
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function pinchCenterX(): number {
        const points = [...active.values()];
        const a = points[0];
        const b = points[1];
        if (a === undefined || b === undefined) return 0;
        return (a.x + b.x) / 2;
    }

    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('wheel', onWheel, { passive: false });

    return () => {
        element.removeEventListener('pointerdown', onPointerDown);
        element.removeEventListener('pointermove', onPointerMove);
        element.removeEventListener('pointerup', onPointerUp);
        element.removeEventListener('pointercancel', onPointerUp);
        element.removeEventListener('pointerleave', onPointerLeave);
        element.removeEventListener('wheel', onWheel);
    };
}
