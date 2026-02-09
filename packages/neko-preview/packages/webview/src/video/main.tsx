import React from 'react';
import ReactDOM from 'react-dom/client';
import { VideoPlayer } from './VideoPlayer';
import '../styles/player.css';

const root = document.getElementById('root');
if (root) {
	ReactDOM.createRoot(root).render(
		<React.StrictMode>
			<VideoPlayer />
		</React.StrictMode>
	);
}
