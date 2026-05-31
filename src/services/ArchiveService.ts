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

	/** Build archive folder name: "YYYY.MM_categoryCode.phaseLabel" */
	buildArchiveFolderName(categoryCode: string, phaseLabel: string): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		return `${year}.${month}_${categoryCode}.${phaseLabel}`;
	}

	/** Archive a phase by moving selected files/folders and recording archive metadata. */
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

		for (const folderPath of folders) {
			const targetPath = `${archivePath}/${folderPath.split('/').pop()}`;
			await this.moveFolder(folderPath, targetPath);
			archivedItems.push({
				type: 'folder',
				originalPath: folderPath,
				archivedPath: targetPath,
			});
		}

		const movedFolderPrefixes = folders.map(f => `${f}/`);
		const remainingFiles = noteFiles.filter(f => !movedFolderPrefixes.some(prefix => f.startsWith(prefix)));

		for (const filePath of remainingFiles) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) continue;

			const newPath = `${archivePath}/${file.name}`;
			try {
				await this.app.fileManager.renameFile(file, newPath);
				archivedItems.push({
					type: 'file',
					originalPath: filePath,
					archivedPath: newPath,
				});
			} catch (e) {
				console.error(`Failed to archive file ${filePath}:`, e);
				new Notice(`归档文件失败: ${file.name}`);
			}
		}

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
		new Notice(`阶段「${phaseLabel}」已归档，移动了 ${archivedItems.length} 个项目到 ${archivePath}`);
		return archivePath;
	}

	/** Delete a phase and selected associated files/folders. */
	async deletePhase(phaseId: string, noteFiles: string[] = [], folders: string[] = []): Promise<void> {
		const settings = this.getSettings();
		const phase = settings.phases.find(p => p.id === phaseId);
		const label = phase?.label ?? phaseId;

		const deletedFolderPrefixes = folders.map(f => `${f}/`);
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

		const remainingFiles = noteFiles.filter(f => !deletedFolderPrefixes.some(prefix => f.startsWith(prefix)));
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
		const separator = folderInfo && fileInfo ? '和' : '';
		const deletedInfo = folderInfo || fileInfo ? `，移除了 ${folderInfo}${separator}${fileInfo}` : '';
		new Notice(`阶段「${label}」已删除${deletedInfo}`);
	}

	/** Restore a previously archived phase back to its original locations. */
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
			for (const item of archiveInfo.archivedItems) {
				const targetPath = targetBasePath
					? `${targetBasePath}/${item.originalPath.split('/').pop()}`
					: item.originalPath;

				if (item.type === 'folder') {
					const archiveFolder = this.app.vault.getAbstractFileByPath(item.archivedPath);
					if (archiveFolder instanceof TFolder) {
						await this.ensureFolder(targetPath);
						await this.moveFolder(item.archivedPath, targetPath);
						restoredPaths.push(targetPath);
					}
				} else {
					const file = this.app.vault.getAbstractFileByPath(item.archivedPath);
					if (file instanceof TFile) {
						const restorePath = targetBasePath ? `${targetBasePath}/${file.name}` : item.originalPath;
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

			await this.cleanEmptyFolder(archiveInfo.archivePath);
		}

		phase.archived = false;
		delete phase.archiveInfo;
		await this.saveSettings();

		this.eventBus.emit('phase-restored', { phaseId, restoredPaths });
		new Notice(`阶段「${phase.label}」已恢复，还原了 ${restoredPaths.length} 个项目`);
	}

	/** Clear Task Maker fields, then remove the phase from archived records without deleting files. */
	async clearArchivedTaskFields(phaseId: string): Promise<void> {
		const settings = this.getSettings();
		const phase = settings.phases.find(p => p.id === phaseId);
		if (!phase || !phase.archived) {
			new Notice('未找到已归档的阶段');
			return;
		}

		const files = this.getArchivedMarkdownFiles(phase);
		let cleaned = 0;
		for (const file of files) {
			await this.clearTaskMakerFields(file, phaseId);
			cleaned++;
		}

		settings.phases = settings.phases.filter(p => p.id !== phaseId);
		await this.saveSettings();

		this.eventBus.emit('phase-deleted', { phaseId });
		new Notice(`已清除 ${cleaned} 个归档笔记中的任务字段，并从已归档中删除`);
	}

	/** Metadata-only archive record clear; kept for compatibility and not used by the archive modal. */
	async clearArchiveRecord(phaseId: string): Promise<void> {
		const settings = this.getSettings();
		const phase = settings.phases.find(p => p.id === phaseId);
		if (!phase || !phase.archived) {
			new Notice('未找到已归档的阶段记录');
			return;
		}

		phase.archived = false;
		delete phase.archiveInfo;
		await this.saveSettings();

		this.eventBus.emit('phase-restored', { phaseId, restoredPaths: [] });
		new Notice(`已清除阶段「${phase.label}」的归档记录`);
	}

	/** Get all archived phases. */
	getArchivedPhases(): PhaseDefinition[] {
		return this.getSettings().phases.filter(p => p.archived === true);
	}

	private getArchivedMarkdownFiles(phase: PhaseDefinition): TFile[] {
		const files: TFile[] = [];
		const archiveInfo = phase.archiveInfo;
		if (!archiveInfo) return files;

		for (const item of archiveInfo.archivedItems) {
			const entry = this.app.vault.getAbstractFileByPath(item.archivedPath);
			if (entry instanceof TFile && entry.extension === 'md') {
				files.push(entry);
			} else if (entry instanceof TFolder) {
				this.collectMarkdownFiles(entry, files);
			}
		}

		return files;
	}

	private collectMarkdownFiles(folder: TFolder, files: TFile[]): void {
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				files.push(child);
			} else if (child instanceof TFolder) {
				this.collectMarkdownFiles(child, files);
			}
		}
	}

	private async clearTaskMakerFields(file: TFile, phaseId: string): Promise<void> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (cache?.frontmatter) {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				delete fm.phase;
				delete fm['phase-id'];
				delete fm['phase-label'];
				delete fm['phase-start'];
				delete fm['phase-end'];
			});
		}

		const tagRegex = this.buildPhaseTagRegex(phaseId);
		await this.app.vault.process(file, (content) => {
			return content.split('\n').map(line => this.removePhaseTagsFromLine(line, tagRegex)).join('\n');
		});
	}

	private buildPhaseTagRegex(phaseId: string): RegExp {
		const namespace = this.getSettings().tagNamespace.trim();
		const prefix = namespace ? `${this.escapeRegex(namespace)}/` : '';
		return new RegExp(`\\s*#${prefix}${this.escapeRegex(phaseId)}-(ui|in|un|nn|p1|p2)\\b`, 'g');
	}

	private removePhaseTagsFromLine(line: string, tagRegex: RegExp): string {
		const match = /^(\s*)(.*)$/.exec(line);
		if (!match) return line;

		const [, leading, body] = match;
		tagRegex.lastIndex = 0;
		const cleanedBody = body
			.replace(tagRegex, '')
			.replace(/[ \t]{2,}/g, ' ')
			.replace(/[ \t]+$/g, '');
		return `${leading}${cleanedBody}`;
	}

	private async ensureFolder(path: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) return;

		const parts = path.split('/');
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const folder = this.app.vault.getAbstractFileByPath(current);
			if (!folder) {
				try {
					await this.app.vault.createFolder(current);
				} catch {
					// Folder may have been created concurrently.
				}
			}
		}
	}

	private async moveFolder(sourcePath: string, targetPath: string): Promise<number> {
		const sourceFolder = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(sourceFolder instanceof TFolder)) return 0;

		await this.ensureFolder(targetPath);

		let movedCount = 0;
		const files: TFile[] = [];
		this.collectAllFiles(sourceFolder, files);

		for (const file of files) {
			const relativePath = file.path.substring(sourcePath.length + 1);
			const newPath = `${targetPath}/${relativePath}`;
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

		await this.cleanEmptyFolder(sourcePath);
		return movedCount;
	}

	private collectAllFiles(folder: TFolder, files: TFile[]): void {
		for (const child of folder.children) {
			if (child instanceof TFile) {
				files.push(child);
			} else if (child instanceof TFolder) {
				this.collectAllFiles(child, files);
			}
		}
	}

	private async cleanEmptyFolder(path: string): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!(folder instanceof TFolder)) return;
		if (folder.children.length === 0) {
			try {
				await this.app.vault.delete(folder);
			} catch {
				// Folder may not be empty or may already be gone.
			}
		}
	}

	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
