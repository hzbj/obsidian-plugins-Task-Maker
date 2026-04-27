import { App, TFile, TFolder, Notice } from 'obsidian';
import { PluginSettings, ArchivedItem, PhaseDefinition } from '../models/types';
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
		noteFiles: string[],
		folders: string[] = []
	): Promise<string> {
		const settings = this.getSettings();
		const basePath = settings.archiveBasePath || '归档';
		const folderName = this.buildArchiveFolderName(categoryCode, phaseLabel);
		const archivePath = `${basePath}/${folderName}`;

		await this.ensureFolder(basePath);
		await this.ensureFolder(archivePath);

		const archivedItems: ArchivedItem[] = [];

		// Move folders first
		for (const folderPath of folders) {
			const movedCount = await this.moveFolder(folderPath, `${archivePath}/${folderPath.split('/').pop()}`);
			archivedItems.push({
				type: 'folder',
				originalPath: folderPath,
				archivedPath: `${archivePath}/${folderPath.split('/').pop()}`,
			});
		}

		// Collect file paths that are inside already-moved folders (skip them)
		const movedFolderPrefixes = folders.map(f => f + '/');
		const remainingFiles = noteFiles.filter(f => !movedFolderPrefixes.some(prefix => f.startsWith(prefix)));

		// Move individual files
		let movedCount = 0;
		for (const filePath of remainingFiles) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				const newPath = `${archivePath}/${file.name}`;
				try {
					await this.app.fileManager.renameFile(file, newPath);
					archivedItems.push({
						type: 'file',
						originalPath: filePath,
						archivedPath: newPath,
					});
					movedCount++;
				} catch (e) {
					console.error(`Failed to archive file ${filePath}:`, e);
					new Notice(`归档文件失败: ${file.name}`);
				}
			}
		}

		// Record archive metadata
		const archivedPhase = settings.phases.find(p => p.id === phaseId);
		if (archivedPhase) {
			archivedPhase.archived = true;
			archivedPhase.archiveInfo = {
				archivePath,
				categoryCode,
				archivedAt: new Date().toISOString(),
				originalPaths: [...noteFiles, ...folders],
				archivedItems,
			};
		}
		await this.saveSettings();

		this.eventBus.emit('phase-archived', { phaseId, archivePath });
		const totalMoved = archivedItems.length;
		new Notice(`阶段「${phaseLabel}」已归档，移动了 ${totalMoved} 个项目到 ${archivePath}`);
		return archivePath;
	}

	/**
	 * Delete a phase: remove from settings and delete associated note files.
	 */
	async deletePhase(phaseId: string, noteFiles: string[] = [], folders: string[] = []): Promise<void> {
		const settings = this.getSettings();
		const phase = settings.phases.find(p => p.id === phaseId);
		const label = phase?.label ?? phaseId;

		// Delete associated folders
		const deletedFolderPrefixes = folders.map(f => f + '/');
		for (const folderPath of folders) {
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (folder instanceof TFolder) {
				try {
					await this.app.vault.trash(folder, false);
				} catch (e) {
					console.error(`Failed to delete folder ${folderPath}:`, e);
					new Notice(`删除文件夹失败: ${folderPath}`);
				}
			}
		}

		// Filter out files that were inside deleted folders
		const remainingFiles = noteFiles.filter(f => !deletedFolderPrefixes.some(prefix => f.startsWith(prefix)));

		// Delete associated note files
		let deletedCount = 0;
		for (const filePath of remainingFiles) {
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
		const folderInfo = folders.length > 0 ? `${folders.length} 个文件夹` : '';
		const fileInfo = deletedCount > 0 ? `${deletedCount} 个笔记` : '';
		const separator = folderInfo && fileInfo ? '和 ' : '';
		const deletedInfo = folderInfo || fileInfo ? `，移除了 ${folderInfo}${separator}${fileInfo}` : '';
		new Notice(`阶段「${label}」已删除${deletedInfo}`);
	}

	/**
	 * Restore a previously archived phase back to its original locations.
	 */
	async restorePhase(phaseId: string, targetBasePath?: string): Promise<void> {
		const settings = this.getSettings();
		const phase = settings.phases.find(p => p.id === phaseId);
		if (!phase || !phase.archived) {
			new Notice('未找到已归档的阶段');
			return;
		}

		const archiveInfo = phase.archiveInfo;
		const restoredPaths: string[] = [];

		if (archiveInfo && archiveInfo.archivedItems.length > 0) {
			// Restore items in reverse order (files first, then folders structure is implicitly handled)
			for (const item of archiveInfo.archivedItems) {
				const targetPath = targetBasePath
					? `${targetBasePath}/${item.originalPath.split('/').pop()}`
					: item.originalPath;

				if (item.type === 'folder') {
					// Move folder contents back
					const archiveFolder = this.app.vault.getAbstractFileByPath(item.archivedPath);
					if (archiveFolder instanceof TFolder) {
						await this.ensureFolder(targetPath);
						await this.moveFolder(item.archivedPath, targetPath);
						restoredPaths.push(targetPath);
					}
				} else {
					// Move individual file back
					const file = this.app.vault.getAbstractFileByPath(item.archivedPath);
					if (file instanceof TFile) {
						const restorePath = targetBasePath
							? `${targetBasePath}/${file.name}`
							: item.originalPath;
						// Ensure parent folder exists
						const parentPath = restorePath.substring(0, restorePath.lastIndexOf('/'));
						if (parentPath) {
							await this.ensureFolder(parentPath);
						}
						try {
							await this.app.fileManager.renameFile(file, restorePath);
							restoredPaths.push(restorePath);
						} catch (e) {
							console.error(`Failed to restore file ${item.archivedPath}:`, e);
							new Notice(`恢复文件失败: ${file.name}`);
						}
					}
				}
			}

			// Try to clean up empty archive folder
			await this.cleanEmptyFolder(archiveInfo.archivePath);
		}

		// Clear archived status
		phase.archived = false;
		delete phase.archiveInfo;
		await this.saveSettings();

		this.eventBus.emit('phase-restored', { phaseId, restoredPaths });
		new Notice(`阶段「${phase.label}」已恢复，还原了 ${restoredPaths.length} 个项目`);
	}

	/**
	 * Get all archived phases.
	 */
	getArchivedPhases(): PhaseDefinition[] {
		return this.getSettings().phases.filter(p => p.archived === true);
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

	private async moveFolder(sourcePath: string, targetPath: string): Promise<number> {
		const sourceFolder = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(sourceFolder instanceof TFolder)) return 0;

		await this.ensureFolder(targetPath);

		let movedCount = 0;
		// Recursively collect all files first to avoid modification during iteration
		const files: TFile[] = [];
		const collectFiles = (folder: TFolder) => {
			for (const child of folder.children) {
				if (child instanceof TFile) {
					files.push(child);
				} else if (child instanceof TFolder) {
					collectFiles(child);
				}
			}
		};
		collectFiles(sourceFolder);

		for (const file of files) {
			const relativePath = file.path.substring(sourcePath.length + 1);
			const newPath = `${targetPath}/${relativePath}`;
			// Ensure subdirectory exists
			const parentPath = newPath.substring(0, newPath.lastIndexOf('/'));
			if (parentPath) {
				await this.ensureFolder(parentPath);
			}
			try {
				await this.app.fileManager.renameFile(file, newPath);
				movedCount++;
			} catch (e) {
				console.error(`Failed to move file ${file.path}:`, e);
			}
		}

		// Clean up empty source folder
		await this.cleanEmptyFolder(sourcePath);
		return movedCount;
	}

	private async cleanEmptyFolder(path: string): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!(folder instanceof TFolder)) return;
		if (folder.children.length === 0) {
			try {
				await this.app.vault.delete(folder);
			} catch {
				// Folder may not be empty or already deleted
			}
		}
	}
}
