/**
 * Create Entity Modal Component
 *
 * Modal dialog for creating a new empty entity.
 */

import { memo, useState, useCallback } from 'react';
import type { EntityCategory, CreateEntityInput } from '@uniedit/shared';
import { CATEGORY_INFO } from './types';
import { useTranslation } from '@/i18n/I18nContext';

interface CreateEntityModalProps {
	/** Whether the modal is open */
	isOpen: boolean;
	/** Called when entity is created */
	onCreate: (input: CreateEntityInput) => void;
	/** Called when modal is closed */
	onClose: () => void;
}

export const CreateEntityModal = memo(function CreateEntityModal({
	isOpen,
	onCreate,
	onClose,
}: CreateEntityModalProps) {
	const { t } = useTranslation();
	const [name, setName] = useState('');
	const [category, setCategory] = useState<EntityCategory>('object');
	const [description, setDescription] = useState('');
	const [tagsInput, setTagsInput] = useState('');
	const [error, setError] = useState<string | null>(null);

	const resetForm = useCallback(() => {
		setName('');
		setCategory('object');
		setDescription('');
		setTagsInput('');
		setError(null);
	}, []);

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();

			// Validate name
			if (!name.trim()) {
				setError(t('assetLibrary.createEntity.nameRequired'));
				return;
			}

			// Parse tags
			const tags = tagsInput
				.split(',')
				.map((tag) => tag.trim())
				.filter((tag) => tag.length > 0);

			const input: CreateEntityInput = {
				name: name.trim(),
				category,
				description: description.trim() || undefined,
				tags,
			};

			onCreate(input);
			resetForm();
			onClose();
		},
		[name, category, description, tagsInput, onCreate, onClose, resetForm, t]
	);

	const handleClose = useCallback(() => {
		resetForm();
		onClose();
	}, [resetForm, onClose]);

	const handleBackdropClick = useCallback(
		(e: React.MouseEvent) => {
			if (e.target === e.currentTarget) {
				handleClose();
			}
		},
		[handleClose]
	);

	if (!isOpen) {
		return null;
	}

	return (
		<div
			className="fixed inset-0 flex items-center justify-center z-50"
			style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
			onClick={handleBackdropClick}
		>
			<div
				className="rounded-lg shadow-xl w-[400px]"
				style={{ backgroundColor: 'var(--vscode-editor-background)' }}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div
					className="px-4 py-3 flex items-center justify-between"
					style={{ borderBottom: '1px solid var(--vscode-widget-border)' }}
				>
					<h3 className="text-sm font-medium">{t('assetLibrary.createEntity.title')}</h3>
					<button
						onClick={handleClose}
						className="p-1 rounded"
						style={{ color: 'var(--vscode-icon-foreground)' }}
						onMouseEnter={(e) =>
							(e.currentTarget.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)')
						}
						onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
					>
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{/* Form */}
				<form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
					{/* Name */}
					<div>
						<label className="block text-xs font-medium mb-1">
							{t('assetLibrary.createEntity.name')} *
						</label>
						<input
							type="text"
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								setError(null);
							}}
							placeholder={t('assetLibrary.createEntity.namePlaceholder')}
							className="w-full px-3 py-1.5 rounded text-sm"
							style={{
								backgroundColor: 'var(--vscode-input-background)',
								border: error
									? '1px solid var(--vscode-inputValidation-errorBorder)'
									: '1px solid var(--vscode-input-border)',
								color: 'var(--vscode-input-foreground)',
							}}
							autoFocus
						/>
						{error && (
							<p
								className="text-xs mt-1"
								style={{ color: 'var(--vscode-errorForeground)' }}
							>
								{error}
							</p>
						)}
					</div>

					{/* Category */}
					<div>
						<label className="block text-xs font-medium mb-1">
							{t('assetLibrary.createEntity.category')} *
						</label>
						<div className="flex flex-wrap gap-1">
							{CATEGORY_INFO.map((cat) => (
								<button
									key={cat.id}
									type="button"
									onClick={() => setCategory(cat.id)}
									className="px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5"
									style={{
										backgroundColor:
											category === cat.id
												? 'var(--vscode-button-background)'
												: 'var(--vscode-button-secondaryBackground)',
										color:
											category === cat.id
												? 'var(--vscode-button-foreground)'
												: 'var(--vscode-button-secondaryForeground)',
									}}
								>
									<span>{cat.icon}</span>
									<span>{t(cat.labelKey)}</span>
								</button>
							))}
						</div>
					</div>

					{/* Description */}
					<div>
						<label className="block text-xs font-medium mb-1">
							{t('assetLibrary.createEntity.description')}
						</label>
						<textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder={t('assetLibrary.createEntity.descriptionPlaceholder')}
							className="w-full px-3 py-1.5 rounded text-sm resize-none"
							style={{
								backgroundColor: 'var(--vscode-input-background)',
								border: '1px solid var(--vscode-input-border)',
								color: 'var(--vscode-input-foreground)',
							}}
							rows={2}
						/>
					</div>

					{/* Tags */}
					<div>
						<label className="block text-xs font-medium mb-1">
							{t('assetLibrary.createEntity.tags')}
						</label>
						<input
							type="text"
							value={tagsInput}
							onChange={(e) => setTagsInput(e.target.value)}
							placeholder={t('assetLibrary.createEntity.tagsPlaceholder')}
							className="w-full px-3 py-1.5 rounded text-sm"
							style={{
								backgroundColor: 'var(--vscode-input-background)',
								border: '1px solid var(--vscode-input-border)',
								color: 'var(--vscode-input-foreground)',
							}}
						/>
						<p
							className="text-xs mt-1"
							style={{ color: 'var(--vscode-descriptionForeground)' }}
						>
							{t('assetLibrary.createEntity.tagsHint')}
						</p>
					</div>
				</form>

				{/* Footer */}
				<div
					className="px-4 py-3 flex justify-end gap-2"
					style={{ borderTop: '1px solid var(--vscode-widget-border)' }}
				>
					<button
						type="button"
						onClick={handleClose}
						className="px-3 py-1.5 rounded text-sm"
						style={{
							backgroundColor: 'var(--vscode-button-secondaryBackground)',
							color: 'var(--vscode-button-secondaryForeground)',
						}}
						onMouseEnter={(e) =>
							(e.currentTarget.style.backgroundColor =
								'var(--vscode-button-secondaryHoverBackground)')
						}
						onMouseLeave={(e) =>
							(e.currentTarget.style.backgroundColor =
								'var(--vscode-button-secondaryBackground)')
						}
					>
						{t('common.cancel')}
					</button>
					<button
						type="submit"
						onClick={handleSubmit}
						className="px-3 py-1.5 rounded text-sm"
						style={{
							backgroundColor: 'var(--vscode-button-background)',
							color: 'var(--vscode-button-foreground)',
						}}
						onMouseEnter={(e) =>
							(e.currentTarget.style.backgroundColor =
								'var(--vscode-button-hoverBackground)')
						}
						onMouseLeave={(e) =>
							(e.currentTarget.style.backgroundColor = 'var(--vscode-button-background)')
						}
					>
						{t('assetLibrary.createEntity.create')}
					</button>
				</div>
			</div>
		</div>
	);
});
