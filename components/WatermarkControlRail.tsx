import React from 'react';

export const WatermarkControlRail: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="contents lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:flex lg:min-h-0 lg:flex-col lg:space-y-6 lg:overflow-y-auto lg:border-r lg:border-slate-200">{children}</div>
);
