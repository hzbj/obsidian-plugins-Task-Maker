import { Plugin, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { PluginSettings, DetectedPhaseInfo } from './models/types';
import { VIEW_TYPE_MATRIX, DEFAULT_SETTINGS } from './models/constants';
import { EventBus } from './services/EventBus';
import { TagManagerService } from './services/TagManagerService';
import { TaskScannerService } from './services/TaskScannerService';
import { ViewRegistryService } from './services/ViewRegistryService';
import { MatrixView } from './ui/MatrixView';
import { SettingsTab } from './settings/SettingsTab';

export default class TaskMakerPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;

	private eventBus: EventBus = new EventBus();
	private tagManager!: TagManagerService;
	private taskScanner!: TaskScannerService;
	private viewRegistry!: ViewRegistryService;
	private reconcileTimer: ReturnType<typeof setTimeout> | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Initialize services
		this.tagManager = new TagManagerService(this.app, () => this.settings);
		this.taskScanner = new TaskScannerService(
			this.app,
			this.tagManager,
			this.eventBus,
			() => this.settings
		);
		this.viewRegistry = new ViewRegistryService(() => this.settings);

		// Register the matrix view
		this.registerView(VIEW_TYPE_MATRIX, (leaf) =>
			new MatrixView(
				leaf,
				this.eventBus,
				this.taskScanner,
				this.tagManager,
				this.viewRegistry,
				() => this.settings,
				(file, id, label) => this.addPhaseToActiveNote(file, id, label)
			)
		);

		// Add ribbon icon
		this.addRibbonIcon('layout-grid', 'Task Maker Matrix', () => {
			this.activateView();
		});

		// Add commands
		this.addCommand({
			id: 'open-matrix-view',
			name: 'Open Eisenhower Matrix',
			callback: () => {
				this.activateView();
			},
		});

		this.addCommand({
			id: 'rescan-tasks',
			name: 'Rescan all tasks',
			callback: async () => {
				await this.taskScanner.fullScan();
				await this.reconcilePhaseNotes();
			},
		});

		// Register settings tab
		this.addSettingTab(new SettingsTab(
			this.app,
			this,
			this.viewRegistry,
			this.eventBus
		));

		// Listen for file modifications for incremental scanning
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.taskScanner.incrementalScan(file);
				}
			})
		);

		// Debounced reconciliation on incremental scans
		this.eventBus.on('tasks-changed', () => {
			if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
			this.reconcileTimer = setTimeout(() => {
				this.reconcilePhaseNotes();
			}, 500);
		});

		// On layout ready, do initial scan
		this.app.workspace.onLayoutReady(async () => {
			await this.taskScanner.fullScan();
			await this.reconcilePhaseNotes();
		});
	}

	onunload(): void {
		if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
		this.eventBus.clear();
		this.taskScanner.clearCache();
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		// Deep merge nested objects
		if (data) {
			this.settings.ui = Object.assign({}, DEFAULT_SETTINGS.ui, data.ui);
			if (data.ui?.quadrantLabels) {
				this.settings.ui.quadrantLabels = Object.assign(
					{}, DEFAULT_SETTINGS.ui.quadrantLabels, data.ui.quadrantLabels
				);
			}
			if (data.ui?.quadrantColors) {
				this.settings.ui.quadrantColors = Object.assign(
					{}, DEFAULT_SETTINGS.ui.quadrantColors, data.ui.quadrantColors
				);
			}
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.eventBus.emit('settings-changed', { settings: this.settings });
	}

	async reconcilePhaseNotes(): Promise<void> {
		const detected = this.taskScanner.getDetectedPhases();
		const settings = this.settings;
		let changed = false;
		const added: string[] = [];
		const updated: string[] = [];
		const removed: string[] = [];

		// Build a map of detected phases by phaseId (first one wins for duplicates)
		const detectedById = new Map<string, DetectedPhaseInfo>();
		for (const info of detected) {
			if (detectedById.has(info.phaseId)) {
				console.warn(`[TaskMaker] Duplicate phase-id "${info.phaseId}" in files: ${detectedById.get(info.phaseId)!.filePath} and ${info.filePath}`);
				continue;
			}
			detectedById.set(info.phaseId, info);
		}

		// Sync detected phases into settings
		for (const [phaseId, info] of detectedById) {
			const existing = settings.phases.find(p => p.id === phaseId);
			if (existing) {
				if (existing.noteFilePath !== info.filePath) {
					existing.noteFilePath = info.filePath;
					changed = true;
					updated.push(phaseId);
				}
				if (existing.autoDetected && existing.label !== info.phaseLabel) {
					existing.label = info.phaseLabel;
					changed = true;
					if (!updated.includes(phaseId)) updated.push(phaseId);
				}
			} else {
				const validation = this.viewRegistry.isValidPhaseId(phaseId);
				if (!validation.valid) {
					console.warn(`[TaskMaker] Auto-detected phase-id "${phaseId}" is invalid: ${validation.reason}`);
					continue;
				}
				settings.phases.push({
					id: phaseId,
					label: info.phaseLabel,
					order: settings.phases.length,
					noteFilePath: info.filePath,
					autoDetected: true,
				});
				changed = true;
				added.push(phaseId);
			}
		}

		// Remove auto-detected phases whose notes no longer have the phase tag
		settings.phases = settings.phases.filter(p => {
			if (!p.autoDetected) return true;
			if (detectedById.has(p.id)) return true;
			removed.push(p.id);
			changed = true;
			return false;
		});

		if (changed) {
			await this.saveSettings();
			this.eventBus.emit('phases-synced', { added, updated, removed });
		}
	}

	async createPhaseNote(phaseId: string, phaseLabel: string): Promise<void> {
		const validation = this.viewRegistry.isValidPhaseId(phaseId);
		if (!validation.valid) {
			new Notice(`无效的阶段 ID: ${validation.reason}`);
			return;
		}

		if (this.settings.phases.some(p => p.id === phaseId)) {
			new Notice(`阶段 "${phaseId}" 已存在`);
			return;
		}

		const filePath = `${phaseId}.md`;

		const content = [
			'---',
			'phase: true',
			`phase-id: ${phaseId}`,
			`phase-label: ${phaseLabel}`,
			'---',
			'',
			`# ${phaseLabel}`,
			'',
		].join('\n');

		try {
			if (this.app.vault.getAbstractFileByPath(filePath)) {
				new Notice(`文件 ${filePath} 已存在`);
				return;
			}

			await this.app.vault.create(filePath, content);
			new Notice(`已创建阶段笔记: ${filePath}`);

			// Wait for Obsidian's metadata cache to index the new file before scanning
			await this.waitForMetadataCache(filePath);

			await this.taskScanner.fullScan();
			await this.reconcilePhaseNotes();
		} catch (e) {
			new Notice(`创建失败: ${(e as Error).message}`);
		}
	}

	async addPhaseToActiveNote(file: TFile, phaseId: string, phaseLabel: string): Promise<void> {
		const validation = this.viewRegistry.isValidPhaseId(phaseId);
		if (!validation.valid) {
			new Notice(`无效的阶段 ID: ${validation.reason}`);
			return;
		}

		if (this.settings.phases.some(p => p.id === phaseId)) {
			new Notice(`阶段 "${phaseId}" 已存在`);
			return;
		}

		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fm.phase = true;
				fm['phase-id'] = phaseId;
				fm['phase-label'] = phaseLabel;
			});

			new Notice(`已将阶段属性添加到: ${file.basename}`);

			await this.waitForMetadataCache(file.path);
			await this.taskScanner.fullScan();
			await this.reconcilePhaseNotes();
		} catch (e) {
			new Notice(`添加阶段属性失败: ${(e as Error).message}`);
		}
	}

	private waitForMetadataCache(filePath: string): Promise<void> {
		return new Promise(resolve => {
			// If cache already available, resolve immediately
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile && this.app.metadataCache.getFileCache(file)?.frontmatter) {
				resolve();
				return;
			}
			// Otherwise wait for the metadata cache event, with a timeout fallback
			const timeout = setTimeout(() => {
				this.app.metadataCache.off('resolved', onResolved);
				resolve();
			}, 2000);
			const onResolved = () => {
				const f = this.app.vault.getAbstractFileByPath(filePath);
				if (f instanceof TFile && this.app.metadataCache.getFileCache(f)?.frontmatter) {
					clearTimeout(timeout);
					this.app.metadataCache.off('resolved', onResolved);
					resolve();
				}
			};
			this.app.metadataCache.on('resolved', onResolved);
		});
	}

	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_MATRIX);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_MATRIX,
				active: true,
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}
}
