import React from 'react';
import ReactDOM from 'react-dom/client';
import MediaDiffApp from './components/MediaDiff/MediaDiffApp';
import './styles/index.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <MediaDiffApp />
    </React.StrictMode>
  );
}
