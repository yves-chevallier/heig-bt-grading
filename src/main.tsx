import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ExpertEditor } from './ExpertEditor';
import './style.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {location.pathname === '/expert' ? <ExpertEditor /> : <App />}
  </React.StrictMode>,
);
