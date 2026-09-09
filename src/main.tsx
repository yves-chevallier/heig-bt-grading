import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ExpertEditor } from './ExpertEditor';
import { HelpProvider } from './help';
import './style.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelpProvider>{location.pathname === '/expert' ? <ExpertEditor /> : <App />}</HelpProvider>
  </React.StrictMode>,
);
