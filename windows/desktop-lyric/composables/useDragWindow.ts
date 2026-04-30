/**
 * 自定义拖拽窗口：clientX/Y 作为窗口内偏移，pointermove 时 targetX = screenX - offsetX。
 * 不依赖任何渲染端窗口位置缓存，避开 Windows 高 DPI 下 DIP↔物理像素回环造成的尺寸漂移。
 * setPointerCapture 保证拖拽期间鼠标移出窗口（透明区/边界外）也能持续派发事件。
 * rAF 节流降低 IPC 频率。
 */
export const useDragWindow = (
  isLocked: () => boolean,
): {
  onRootPointerDown: (event: PointerEvent) => void;
} => {
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragPointerId = -1;
  let dragTarget: HTMLElement | null = null;
  let moveRafPending = false;
  let pendingX = 0;
  let pendingY = 0;

  const flushMove = (): void => {
    moveRafPending = false;
    window.api.desktopLyric.move(pendingX, pendingY);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging) return;
    pendingX = Math.round(event.screenX - dragOffsetX);
    pendingY = Math.round(event.screenY - dragOffsetY);
    if (!moveRafPending) {
      moveRafPending = true;
      requestAnimationFrame(flushMove);
    }
  };

  const onPointerUp = (): void => {
    if (!dragging) return;
    dragging = false;
    if (dragTarget && dragPointerId !== -1) {
      try {
        dragTarget.releasePointerCapture(dragPointerId);
      } catch {
        /* 捕获已失效 */
      }
    }
    dragTarget?.removeEventListener("pointermove", onPointerMove);
    dragTarget?.removeEventListener("pointerup", onPointerUp);
    dragTarget?.removeEventListener("pointercancel", onPointerUp);
    dragTarget = null;
    dragPointerId = -1;
    window.api.desktopLyric.saveState();
  };

  const onRootPointerDown = (event: PointerEvent): void => {
    if (isLocked()) return;
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(".header-btn")) return;
    // 边缘 6px 留给 OS 进行窗口 resize（透明无边框窗口的隐形 resize 边）
    const root = event.currentTarget as HTMLElement | null;
    if (root) {
      const rect = root.getBoundingClientRect();
      const ex = event.clientX - rect.left;
      const ey = event.clientY - rect.top;
      const RESIZE_EDGE = 6;
      if (
        ex < RESIZE_EDGE ||
        ex > rect.width - RESIZE_EDGE ||
        ey < RESIZE_EDGE ||
        ey > rect.height - RESIZE_EDGE
      ) {
        return;
      }
    }
    dragging = true;
    dragOffsetX = event.clientX;
    dragOffsetY = event.clientY;
    dragPointerId = event.pointerId;
    dragTarget = target;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      /* target 不支持捕获 */
    }
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerUp);
    event.preventDefault();
  };

  onBeforeUnmount(() => {
    if (dragTarget) {
      dragTarget.removeEventListener("pointermove", onPointerMove);
      dragTarget.removeEventListener("pointerup", onPointerUp);
      dragTarget.removeEventListener("pointercancel", onPointerUp);
    }
  });

  return { onRootPointerDown };
};
