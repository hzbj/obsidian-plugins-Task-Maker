import { App, TFile, TFolder, Notice } from 'obsidian';
import { PluginSettings } from '../models/types';
import { EventBus } from './EventBus';

export class ArchiveService {
	constructor(
		private app: App,
		private eventBus: EventBus,
		private getSettings: () => PluginSettings,
		private saveSettings: () => Promise<void>
	) {}

	/**
	 * Build archive folder name: "YYYY.MM_categoryCode.phaseLabel"
	 */
	buildArchiveFolderName(categoryCode: string, phaseLabel: string): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		return `${year}.${month}_${categoryCode}.${phaseLabel}`;
	}

	/**
	 * Archive a phase: create archive folder, move note files, remove phase from settings.
	 * Returns the archive folder path.
	 */
	async archivePhase(
		phaseId: string,
		categoryCode: string,
		phaseLabel: string,
		noteFiles: string[]
	): Promise<string> {
		const settings = this.getSettings();
		const basePath = settings.archiveBasePath || '归档';
		const folderName = this.buildArchiveFolderName(categoryCode, phaseLabel);
		const archivePath = `${basePath}/${folderName}`;

		// Ensure base archive directory exists
		await this.ensureFolder(basePath);
		// Create the specific archive folder
		await this.ensureFolder(archivePath);

		// Move each note file into the archive folder
		let movedCount = 0;
		for (const filePath of noteFiles) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				const newPath = `${archivePath}/${file.name}`;
				try {
					await this.app.fileManager.renameFile(file, newPath);
					movedCount++;
				} catch (e) {
					console.error(`Failed to archive file ${filePath}:`, e);
					new Notice(`归档文件失败: ${file.name}`);
				}
			}
		}

		// Mark the phase as archived instead of removing
		const archivedPhase = settings.phases.find(p => p.id === phaseId);
		if (archivedPhase) {
			archivedPhase.archived = true;
		}
		await this.saveSettings();

		this.eventBus.emit('phase-archived', { phaseId, archivePath });

		new Notice(`阶段「${phaseLabel}」已归档，移动了 ${movedCount} 个文件到 ${archivePath}`);
		return archivePath;
	}

	/**
	 * Delete a phase: remove from settings and delete associated note files.
	 */
	async deletePhase(phaseId: string, noteFiles: string[] = []): Promise<void> {
		const settings = this.getSettings();
		const phase = settings.phases.find(p => p.id === phaseId);
		const label = phase?.label ?? phaseId;

		// Delete associated note files
		let deletedCount = 0;
		for (const filePath of noteFiles) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				try {
					await this.app.vault.trash(file, false);
					deletedCount++;
				} catch (e) {
					console.error(`Failed to delete file ${filePath}:`, e);
					new Notice(`删除文件失败: ${file.name}`);
				}
			}
		}

		settings.phases = settings.phases.filter(p => p.id !== phaseId);
		await this.saveSettings();

		this.eventBus.emit('phase-deleted', { phaseId });
		new Notice(`阶段「${label}」已删除${deletedCount > 0 ? `，移除了 ${deletedCount} 个笔记` : ''}`);
	}

	/** Ensure a folder exists, creating it recursively if needed */
	private async ensureFolder(path: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) return;

		// Create parent folders recursively
		const parts = path.split('/');
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const folder = this.app.vault.getAbstractFileByPath(current);
			if (!folder) {
				try {
					await this.app.vault.createFolder(current);
				} catch {
					// Folder may have been created concurrently
				}
			}
		}
	}
}
