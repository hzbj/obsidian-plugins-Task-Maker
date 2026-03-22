import { Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import { PluginSettings } from './models/types';
import { VIEW_TYPE_MATRIX, DEFAULT_SETTINGS } from './models/constants';
import { EventBus } from './services/EventBus';
import { TagManagerService } from './services/TagManagerService';
import { TaskScannerService } from './services/TaskScannerService';
import { TimeTreeService } from './services/TimeTreeService';
import { ViewRegistryService } from './services/ViewRegistryService';
import { NoteLinkerService } from './services/NoteLinkerService';
import { MatrixView } from './ui/MatrixView';
import { SettingsTab } from './settings/SettingsTab';

export default class TaskMakerPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;

	private eventBus: EventBus = new EventBus();
	private tagManager!: TagManagerService;
	private taskScanner!: TaskScannerService;
	private timeTree!: TimeTreeService;
	private viewRegistry!: ViewRegistryService;
	private noteLinker!: NoteLinkerService;

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
		this.timeTree = new TimeTreeService(() => this.settings);
		this.timeTree.rebuild();
		this.viewRegistry = new ViewRegistryService(this.timeTree, () => this.settings);
		this.noteLinker = new NoteLinkerService(this.app, this.timeTree, () => this.settings);

		// Register the matrix view
		this.registerView(VIEW_TYPE_MATRIX, (leaf) =>
			new MatrixView(
				leaf,
				this.eventBus,
				this.taskScanner,
				this.tagManager,
				this.timeTree,
				this.viewRegistry,
				this.noteLinker,
				() => this.settings
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

		// On layout ready, do initial scan
		this.app.workspace.onLayoutReady(async () => {
			await this.taskScanner.fullScan();
		});
	}

	onunload(): void {
		this.eventBus.clear();
		this.taskScanner.clearCache();
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		// Deep merge nested objects
		if (data) {
			this.settings.timeView = Object.assign({}, DEFAULT_SETTINGS.timeView, data.timeView);
			this.settings.noteAssociation = Object.assign(
				{}, DEFAULT_SETTINGS.noteAssociation, data.noteAssociation
			);
			if (data.noteAssociation?.timeNotePatterns) {
				this.settings.noteAssociation.timeNotePatterns = Object.assign(
					{}, DEFAULT_SETTINGS.noteAssociation.timeNotePatterns, data.noteAssociation.timeNotePatterns
				);
			}
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
		this.timeTree.rebuild();
		this.eventBus.emit('settings-changed', { settings: this.settings });
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
