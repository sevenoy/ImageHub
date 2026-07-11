import React from 'react';

export const BatchWatermarkWorkspace: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mx-auto w-full max-w-[1600px]">
    {children}
  </div>
);
