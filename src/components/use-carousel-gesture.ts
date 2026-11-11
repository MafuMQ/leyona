"use client";

import {
  useRef,
  useState,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";

/** Touch swipes for paged stories; native touch scrolling and mouse dragging for rails. */
export function useCarouselGesture({
  onSwipe,
  scrollRef,
}: {
  onSwipe?: (direction: number) => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  const start = useRef<{
    x: number;
    y: number;
    scroll: number;
    dragging: boolean;
    native: boolean;
  } | null>(null);
  const suppressUntil = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const finish = (
    event: ReactPointerEvent<HTMLDivElement>,
    canceled = false,
  ) => {
    const gesture = start.current;
    start.current = null;
    setDragging(false);
    setOffset(0);
    if (!gesture?.dragging) return;
    suppressUntil.current = performance.now() + 500;
    const dx = event.clientX - gesture.x,
      dy = event.clientY - gesture.y;
    if (
      !canceled &&
      !scrollRef &&
      Math.abs(dx) >= 40 &&
      Math.abs(dx) > Math.abs(dy) * 1.25
    )
      onSwipe?.(dx < 0 ? 1 : -1);
  };
  return {
    dragging,
    offset,
    handlers: {
      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!event.isPrimary || event.button !== 0) return;
        start.current = {
          x: event.clientX,
          y: event.clientY,
          scroll: scrollRef?.current?.scrollLeft ?? 0,
          dragging: false,
          native: !!scrollRef && event.pointerType === "touch",
        };
      },
      onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = start.current;
        if (!gesture) return;
        const dx = event.clientX - gesture.x,
          dy = event.clientY - gesture.y;
        if (
          !gesture.dragging &&
          Math.abs(dy) > 12 &&
          Math.abs(dy) > Math.abs(dx)
        ) {
          start.current = null;
          return;
        }
        if (
          !gesture.dragging &&
          Math.abs(dx) > 8 &&
          Math.abs(dx) > Math.abs(dy) * 1.25
        ) {
          gesture.dragging = true;
          if (!gesture.native) {
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }
        if (gesture.dragging && !gesture.native && scrollRef?.current)
          scrollRef.current.scrollLeft = gesture.scroll - dx;
        if (gesture.dragging && !scrollRef) setOffset(dx);
      },
      onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => finish(event),
      onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) =>
        finish(event, true),
      onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => {
        if (performance.now() < suppressUntil.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onDragStart: (event: React.DragEvent<HTMLDivElement>) =>
        event.preventDefault(),
    },
  };
}
