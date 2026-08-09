import React, { useLayoutEffect, useRef } from 'react';

type BatchTaskBarProps = {
  children: React.ReactNode;
  onHeightChange: (height: number) => void;
};

export const BatchTaskBar: React.FC<BatchTaskBarProps> = ({ children, onHeightChange }) => {
  const taskBarRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const taskBar = taskBarRef.current;
    if (!taskBar) return;

    const updateHeight = () => onHeightChange(Math.ceil(taskBar.getBoundingClientRect().height));
    updateHeight();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(taskBar);
    return () => observer.disconnect();
  }, [onHeightChange]);

  return (
    <section
      ref={taskBarRef}
      data-testid="batch-taskbar"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-[#101b38] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-white sm:px-6 lg:min-h-[80px] lg:px-6 lg:py-4"
    >
      {children}
    </section>
  );
};
