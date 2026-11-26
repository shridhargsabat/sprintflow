import type { ReactElement, ReactNode } from 'react';

interface ScrollableProps {
  children: ReactNode;
  className?: string;
  slim?: boolean;
  maxH?: string;
}

export default function Scrollable({ children, className = '', slim = false, maxH }: ScrollableProps): ReactElement {
  const classes = ['overflow-y-auto', slim ? 'scroll-slim' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} style={maxH ? { maxHeight: maxH } : undefined}>
      {children}
    </div>
  );
}
