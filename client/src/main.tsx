import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './design/tokens.css';
import './styles/base.css';
import './styles/cards.css';
import './styles/table.css';
import './styles/dialogs.css';
import './styles/effects.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
