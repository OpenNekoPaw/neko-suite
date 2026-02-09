import React from 'react';
import ReactDOM from 'react-dom/client';
import { AudioPlayer } from './AudioPlayer';
import '../styles/player.css';

const root = document.getElementById('root');
if (root) {
	ReactDOM.createRoot(root).render(
		<React.StrictMode>
			<AudioPlayer />
		</React.StrictMode>
	);
}
