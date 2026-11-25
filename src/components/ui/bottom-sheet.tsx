"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const DISMISS_THRESHOLD_PX = 84;

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  const tCommon = useTranslations("common");
  const titleId = useId();
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const onCloseRef = useRef(onClose);
  const touchStartYRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener && opener.isConnected) {
        opener.focus();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const firstTouch = event.touches[0];
    if (!firstTouch) {
      return;
    }
    touchStartYRef.current = firstTouch.clientY;
    dragOffsetRef.current = 0;
    setDragOffsetPx(0);
    setIsDragging(true);
  }

  function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStartYRef.current === null) {
      return;
    }
    const firstTouch = event.touches[0];
    if (!firstTouch) {
      return;
    }
    const delta = firstTouch.clientY - touchStartYRef.current;
    const clamped = delta > 0 ? Math.min(delta, 240) : 0;
    dragOffsetRef.current = clamped;
    setDragOffsetPx(clamped);
  }

  function handleTouchEnd() {
    const finalOffset = dragOffsetRef.current;
    touchStartYRef.current = null;
    dragOffsetRef.current = 0;
    setDragOffsetPx(0);
    setIsDragging(false);
    if (finalOffset >= DISMISS_THRESHOLD_PX) {
      onCloseRef.current();
    }
  }

  function handleTouchCancel() {
    touchStartYRef.current = null;
    dragOffsetRef.current = 0;
    setDragOffsetPx(0);
    setIsDragging(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="fixed inset-0 bg-canvas/85"
        aria-hidden="true"
        onClick={() => onCloseRef.current()}
      />

      <div
        ref={sheetRef}
        tabIndex={-1}
        style={
          dragOffsetPx > 0
            ? { transform: `translateY(${dragOffsetPx}px)` }
            : undefined
        }
        className={`relative z-10 flex max-h-[90dvh] w-full max-w-[480px] flex-col rounded-t-3xl border border-border-subtle bg-surface outline-none sm:rounded-2xl ${
          isDragging ? "" : "transition-transform duration-150"
        }`}
      >
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          className="shrink-0 touch-none border-b border-border-subtle px-4 pt-3 pb-3"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-subtle sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <h2
              id={titleId}
              className="text-[18px] font-semibold text-text-primary"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              aria-label={tCommon("close")}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-elevated hover:text-text-primary"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-4 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          {children}
        </div>
      </div>
    </div>
  );
}
