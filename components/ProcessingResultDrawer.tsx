import React from 'react';

export const ProcessingResultDrawer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fixed inset-x-0 bottom-[calc(var(--batch-taskbar-height)+0.75rem)] z-40 px-3 sm:px-6">{children}</div>
);
