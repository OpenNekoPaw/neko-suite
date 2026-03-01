import React from 'react';
import ReactDOM from 'react-dom/client';
import { VideoPlayer } from './VideoPlayer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import '../styles/player.css';

const root = document.getElementById('root');
if (root) {
	ReactDOM.createRoot(root).render(
		<React.StrictMode>
			<ErrorBoundary>
				<VideoPlayer />
			</ErrorBoundary>
		</React.StrictMode>
	);
}
