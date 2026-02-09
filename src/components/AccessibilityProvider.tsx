import { ReactNode } from 'react';
import { AccessibilityContext, useAccessibilityState } from '@/hooks/useAccessibility';

export default function AccessibilityProvider({ children }: { children: ReactNode }) {
  const a11y = useAccessibilityState();

  return (
    <AccessibilityContext.Provider value={a11y}>
      {children}
    </AccessibilityContext.Provider>
  );
}
