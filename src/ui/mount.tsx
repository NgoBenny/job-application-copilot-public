import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { watchTheme } from './theme';

export function mount(node: ReactNode) {
  watchTheme();
  createRoot(document.getElementById('root')!).render(<StrictMode>{node}</StrictMode>);
}
