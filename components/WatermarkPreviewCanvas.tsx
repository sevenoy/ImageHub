import React from 'react';

export const WatermarkPreviewCanvas: React.FC<{ toolbar: React.ReactNode; children: React.ReactNode }> = ({ toolbar, children }) => (
  <section className="order-3 flex w-full min-h-[440px] flex-1 flex-col gap-4 lg:relative lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:min-h-0 lg:h-full">
    {toolbar ? <div className="flex min-h-10 items-center justify-between gap-3">{toolbar}</div> : null}
    {children}
  </section>
);
