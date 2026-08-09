import React from 'react';

export const BatchWatermarkWorkspace: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mx-auto w-full lg:h-full">
    {children}
  </div>
);
