import { ViewTransition, type ReactNode } from 'react';
import { useLocation } from 'react-router';

/**
 * Cross-fades between screens. Every screen sits at the same spot in the tree, so the pathname
 * keys the boundary: a new path unmounts the old screen (exit) and mounts the new one (enter).
 *
 * The sidebar links are lateral moves, so this is a fade rather than a slide, which would suggest
 * depth that is not there. `default="none"` keeps it from firing on unrelated transitions such as
 * a background refetch. The animations live in styles.css (`vt-fade-in`, `vt-fade-out`).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ViewTransition key={pathname} enter="vt-fade-in" exit="vt-fade-out" default="none">
      {children}
    </ViewTransition>
  );
}
