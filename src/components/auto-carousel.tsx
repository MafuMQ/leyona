"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCarouselGesture } from "./use-carousel-gesture";

/** A looping, paged track: follows a drag, then settles on a complete card. */
export default function AutoCarousel<T>({
  items,
  renderItem,
  itemKey,
  label,
  variant = "watch",
  onIndexChange,
  slideLabel,
}: {
  items: T[];
  renderItem: (item: T) => ReactNode;
  itemKey: (item: T) => string;
  label: string;
  variant?: "watch" | "featured";
  onIndexChange?: (index: number) => void;
  slideLabel?: (item: T, index: number) => string;
}) {
  const featured = variant === "featured";
  const viewport = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(featured ? 1 : 3),
    [step, setStep] = useState(0);
  const [index, setIndex] = useState(0),
    [position, setPosition] = useState(featured ? 1 : 3);
  const [instant, setInstant] = useState(true),
    [paused, setPaused] = useState(false),
    [hovered, setHovered] = useState(false),
    [keyboardFocus, setKeyboardFocus] = useState(false);
  const interacting = hovered || keyboardFocus;
  const moving = useRef(false),
    latestIndex = useRef(index),
    measuredWidth = useRef(0);
  latestIndex.current = index;
  const count = items.length;
  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);
  function go(direction: number) {
    if (moving.current || count <= visible) return;
    const next = (index + direction + count) % count;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInstant(true);
      setIndex(next);
      setPosition(visible + next);
      return;
    }
    moving.current = true;
    setInstant(false);
    setIndex(next);
    setPosition((p) => p + direction);
  }
  function choose(next: number) {
    if (moving.current || next === index) return;
    moving.current = true;
    setInstant(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setIndex(next);
    setPosition(visible + next);
  }
  const gesture = useCarouselGesture({ onSwipe: go });
  function settle(event?: TransitionEvent<HTMLDivElement>) {
    if (
      event &&
      (event.target !== event.currentTarget ||
        event.propertyName !== "transform")
    )
      return;
    if (!moving.current) return;
    moving.current = false;
    if (position < visible || position >= visible + count) {
      setInstant(true);
      setPosition(visible + index);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setInstant(false)),
      );
    }
  }
  useEffect(() => {
    const node = viewport.current;
    if (!node || !count) return;
    const measure = () => {
      const width = node.getBoundingClientRect().width;
      if (measuredWidth.current === width) return;
      measuredWidth.current = width;
      const style = getComputedStyle(node);
      const columns = Math.min(
        count,
        Number(style.getPropertyValue("--watch-visible")) || 3,
      );
      const gap =
        Number.parseFloat(style.getPropertyValue("--watch-gap")) || 15;
      moving.current = false;
      setInstant(true);
      setVisible(columns);
      setStep((width - gap * (columns - 1)) / columns + gap);
      setIndex(latestIndex.current % count);
      setPosition(columns + (latestIndex.current % count));
    };
    measuredWidth.current = 0;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [count]);
  useEffect(() => {
    if (!moving.current) return;
    const timer = setTimeout(() => settle(), 450);
    return () => clearTimeout(timer);
  }, [position]);
  useEffect(() => {
    if (
      paused ||
      interacting ||
      gesture.dragging ||
      count <= visible ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = setInterval(() => {
      if (!document.hidden) go(1);
    }, 8000);
    return () => clearInterval(timer);
  }, [index, paused, interacting, gesture.dragging, count, visible]);
  if (!count) return null;
  const copies = [
    ...items.slice(-visible),
    ...items,
    ...items.slice(0, visible),
  ];
  const shifted = -position * step + gesture.offset;
  return (
    <div
      className={`watch-auto-carousel ${featured ? "featured-auto-carousel" : "watch-track-carousel"}`}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHovered(false);
      }}
      onFocusCapture={(event) =>
        setKeyboardFocus(event.target.matches(":focus-visible"))
      }
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setKeyboardFocus(false);
      }}
    >
      <div
        ref={viewport}
        className={`watch-carousel-viewport ${featured ? "carousel-stage" : ""} ${gesture.dragging ? "is-dragging" : ""}`}
        role="region"
        aria-label={label}
        aria-roledescription="carousel"
        tabIndex={0}
        {...gesture.handlers}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            go(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
        style={{ "--active-visible": visible } as CSSProperties}
      >
        <div
          className={`watch-carousel-track ${instant || gesture.dragging ? "no-transition" : ""}`}
          style={{ transform: `translate3d(${shifted}px,0,0)` }}
          onTransitionEnd={settle}
        >
          {copies.map((item, i) => (
            <div
              className="watch-carousel-item"
              key={`${i}:${itemKey(item)}`}
              aria-hidden={
                i < position || i >= position + visible ? "true" : undefined
              }
              inert={i < position || i >= position + visible}
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      </div>
      <div className="watch-carousel-controls">
        <button
          className={`watch-rail-arrow ${featured ? "featured-previous" : ""}`}
          aria-label={
            featured ? "Previous featured market" : "Previous markets to watch"
          }
          onClick={() => go(-1)}
          disabled={count <= visible}
        >
          <ChevronLeft size={14} />
        </button>
        <div
          className="carousel-pagination"
          aria-label={
            featured ? "Choose featured prediction" : "Choose markets to watch"
          }
        >
          {items.map((item, i) => (
            <button
              key={itemKey(item)}
              className={i === index ? "current" : ""}
              aria-label={slideLabel?.(item, i) ?? `Show watch slide ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => choose(i)}
            />
          ))}
        </div>
        {featured && (
          <span className="carousel-caption">
            A world of possibilities. A market for your perspective.
          </span>
        )}
        <button
          className="watch-carousel-pause"
          aria-label={
            featured
              ? paused
                ? "Play featured carousel"
                : "Pause featured carousel"
              : paused
                ? "Play markets to watch carousel"
                : "Pause markets to watch carousel"
          }
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={11} /> : <Pause size={11} />}
        </button>
        <button
          className={`watch-rail-arrow ${featured ? "featured-next" : ""}`}
          aria-label={
            featured ? "Next featured market" : "Next markets to watch"
          }
          onClick={() => go(1)}
          disabled={count <= visible}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
