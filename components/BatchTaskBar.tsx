import React from 'react';

export const BatchTaskBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="order-7 border-t border-slate-800 bg-[#101b38] px-4 py-3 text-white sm:px-6 lg:col-span-2 lg:row-start-4 lg:min-h-[80px]">{children}</section>
);
