import React from 'react';
import ReactDOM from 'react-dom/client';
import { AudioPlayer } from './AudioPlayer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import '../styles/player.css';

const root = document.getElementById('root');
if (root) {
	ReactDOM.createRoot(root).render(
		<React.StrictMode>
			<ErrorBoundary>
				<AudioPlayer />
			</ErrorBoundary>
		</React.StrictMode>
	);
}
