import { App, Modal, Setting, Notice } from 'obsidian';

export class DeletePhaseModal extends Modal {
	private selectedFiles: Set<string> = new Set();
	private selectedFolders: Set<string> = new Set();
	private fileCheckboxes: Map<string, HTMLInputElement> = new Map();

	constructor(
		app: App,
		private phaseLabel: string,
		private isAutoDetected: boolean,
		private noteFiles: { filePath: string; fileName: string }[],
		private parentFolders: { folderPath: string; folderName: string; fileCount: number }[],
		private onConfirm: (selectedFiles: string[], selectedFolders: string[]) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('tm-delete-modal');

		contentEl.createEl('h3', { text: `删除阶段: ${this.phaseLabel}` });

		if (this.isAutoDetected) {
			contentEl.createEl('p', {
				text: '⚠️ 自动检测的阶段会在下次扫描时重新出现，除非移除笔记中的 phase frontmatter。',
				cls: 'tm-delete-warning',
			});
		}

		contentEl.createEl('p', {
			text: '删除的文件将被移到回收站，可以从回收站中恢复。',
			cls: 'setting-item-description',
		});

		// Folder selection
		if (this.parentFolders.length > 0) {
			contentEl.createEl('h4', { text: '关联文件夹' });
			const folderListEl = contentEl.createDiv({ cls: 'tm-archive-folder-list' });

			for (const folder of this.parentFolders) {
				const itemEl = folderListEl.createDiv({ cls: 'tm-archive-folder-item' });
				const label = itemEl.createEl('label');
				const checkbox = label.createEl('input', { type: 'checkbox' });

				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						this.selectedFolders.add(folder.folderPath);
						this.updateFileCheckboxesForFolder(folder.folderPath, true);
					} else {
						this.selectedFolders.delete(folder.folderPath);
						this.updateFileCheckboxesForFolder(folder.folderPath, false);
					}
				});

				label.createSpan({ text: ` 📁 ${folder.folderName} (${folder.fileCount} 个文件)` });
			}
		}

		// Note file list
		if (this.noteFiles.length > 0) {
			contentEl.createEl('h4', { text: '关联笔记' });
			const listEl = contentEl.createDiv({ cls: 'tm-archive-note-list' });

			for (const note of this.noteFiles) {
				const itemEl = listEl.createDiv({ cls: 'tm-archive-note-item' });
				const label = itemEl.createEl('label');
				const checkbox = label.createEl('input', { type: 'checkbox' });
				checkbox.checked = true;
				this.selectedFiles.add(note.filePath);

				this.fileCheckboxes.set(note.filePath, checkbox);

				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						this.selectedFiles.add(note.filePath);
					} else {
						this.selectedFiles.delete(note.filePath);
					}
				});

				label.createSpan({ text: note.fileName });
			}
		} else {
			contentEl.createEl('p', {
				text: '此阶段没有关联的笔记文件',
				cls: 'setting-item-description',
			});
		}

		// Buttons
		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('确认删除')
				.setWarning()
				.onClick(() => this.handleSubmit())
			)
			.addButton(btn => btn
				.setButtonText('取消')
				.onClick(() => this.close())
			);
	}

	private updateFileCheckboxesForFolder(folderPath: string, folderSelected: boolean): void {
		const prefix = folderPath + '/';
		for (const note of this.noteFiles) {
			if (note.filePath.startsWith(prefix)) {
				const cb = this.fileCheckboxes.get(note.filePath);
				if (cb) {
					if (folderSelected) {
						cb.checked = true;
						cb.disabled = true;
						this.selectedFiles.add(note.filePath);
					} else {
						cb.disabled = false;
					}
				}
			}
		}
	}

	private handleSubmit(): void {
		this.onConfirm(Array.from(this.selectedFiles), Array.from(this.selectedFolders));
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
