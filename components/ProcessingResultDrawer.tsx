import React from 'react';

export const ProcessingResultDrawer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fixed inset-x-0 bottom-[76px] z-40 px-3 sm:px-6 lg:bottom-[80px] lg:left-[380px]">{children}</div>
);
