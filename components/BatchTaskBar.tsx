import React from 'react';

export const BatchTaskBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="order-7 border-t border-slate-200 bg-white px-4 py-3 sm:px-6 lg:col-span-2 lg:row-start-4 lg:min-h-[76px]">{children}</section>
);
