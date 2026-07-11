import React from 'react';

export const ProcessingResultDrawer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[1600px] px-3 sm:px-6">{children}</div>
);
