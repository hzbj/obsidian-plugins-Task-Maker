import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { Task, PluginSettings, QuadrantCode } from '../models/types';
import { VIEW_TYPE_MATRIX } from '../models/constants';
import { EventBus } from '../services/EventBus';
import { TaskScannerService } from '../services/TaskScannerService';
import { TagManagerService } from '../services/TagManagerService';
import { ViewRegistryService } from '../services/ViewRegistryService';
import { DragDropManager } from './DragDropManager';
import { ViewNavigator } from './components/ViewNavigator';
import { QuadrantGrid } from './components/QuadrantGrid';
import { CreatePhaseModal } from './components/CreatePhaseModal';

export class MatrixView extends ItemView {
	private currentViewId: string = '';

	private navigator: ViewNavigator | null = null;
	private quadrantGrid: QuadrantGrid | null = null;
	private dragDropManager: DragDropManager;

	// Refresh/progress elements (hosted inside navigator)
	private refreshBtn: HTMLButtonElement | null = null;
	private progressWrapEl: HTMLElement | null = null;
	private progressFillEl: HTMLElement | null = null;
	private progressTextEl: HTMLElement | null = null;

	// Bound event handlers for cleanup
	private onScanComplete: (p: { tasks: Task[] }) => void;
	private onScanProgress: (p: { scanned: number; total: number }) => void;
	private onTasksChanged: (p: { filePath: string; tasks: Task[] }) => void;
	private onTaskUpdated: (p: { taskId: string; viewId: string; quadrant: QuadrantCode | null }) => void;
	private onTaskToggled: (p: { taskId: string; completed: boolean }) => void;
	private onViewSwitched: (p: { viewId: string }) => void;
	private onSettingsChanged: (p: { settings: PluginSettings }) => void;

	constructor(
		leaf: WorkspaceLeaf,
		private eventBus: EventBus,
		private taskScanner: TaskScannerService,
		private tagManager: TagManagerService,
		private viewRegistry: ViewRegistryService,
		private getSettings: () => PluginSettings,
		private onAddPhaseToNote?: (file: TFile, id: string, label: string) => Promise<void>
	) {
		super(leaf);

		this.dragDropManager = new DragDropManager(
			this.app,
			this.tagManager,
			this.eventBus,
			() => this.currentViewId,
			(id) => this.taskScanner.getAllTasks().find(t => t.id === id)
		);

		// Bind event handlers
		this.onScanComplete = () => {
			this.hideProgress();
			this.refresh();
		};
		this.onScanProgress = (p) => this.updateProgress(p.scanned, p.total);
		this.onTasksChanged = () => this.refresh();
		this.onTaskUpdated = () => this.refresh();
		this.onTaskToggled = () => this.refresh();
		this.onViewSwitched = (p) => this.switchView(p.viewId);
		this.onSettingsChanged = () => this.rebuildUI();
	}

	getViewType(): string {
		return VIEW_TYPE_MATRIX;
	}

	getDisplayText(): string {
		return 'Task Maker';
	}

	getIcon(): string {
		return 'layout-grid';
	}

	async onOpen(): Promise<void> {
		// Register event listeners
		this.eventBus.on('scan-complete', this.onScanComplete);
		this.eventBus.on('scan-progress', this.onScanProgress);
		this.eventBus.on('tasks-changed', this.onTasksChanged);
		this.eventBus.on('task-updated', this.onTaskUpdated);
		this.eventBus.on('task-toggled', this.onTaskToggled);
		this.eventBus.on('view-switched', this.onViewSwitched);
		this.eventBus.on('settings-changed', this.onSettingsChanged);

		this.buildUI();

		// Set default view — start with first available phase
		const phases = this.viewRegistry.getPhaseViews();
		if (phases.length > 0) {
			this.switchView(phases[0].id);
		}
	}

	async onClose(): Promise<void> {
		this.eventBus.off('scan-complete', this.onScanComplete);
		this.eventBus.off('scan-progress', this.onScanProgress);
		this.eventBus.off('tasks-changed', this.onTasksChanged);
		this.eventBus.off('task-updated', this.onTaskUpdated);
		this.eventBus.off('task-toggled', this.onTaskToggled);
		this.eventBus.off('view-switched', this.onViewSwitched);
		this.eventBus.off('settings-changed', this.onSettingsChanged);
	}

	private buildUI(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.classList.add('task-maker-container');

		const settings = this.getSettings();

		// Navigator
		this.navigator = new ViewNavigator(
			contentEl,
			this.viewRegistry,
			this.eventBus,
			this.onAddPhaseToNote
				? () => {
					const activeFile = this.app.workspace.getActiveFile();
					if (!activeFile) {
						new Notice('\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u7B14\u8BB0');
						return;
					}
					if (activeFile.extension !== 'md') {
						new Notice('\u5F53\u524D\u6587\u4EF6\u4E0D\u662F Markdown \u7B14\u8BB0');
						return;
					}
					const cache = this.app.metadataCache.getFileCache(activeFile);
					if (cache?.frontmatter?.['phase'] === true || cache?.frontmatter?.['phase'] === 'true') {
						new Notice(`\u8BE5\u7B14\u8BB0\u5DF2\u7ECF\u662F\u9636\u6BB5\u7B14\u8BB0 (${activeFile.basename})`);
						return;
					}
					const capturedFile = activeFile;
					new CreatePhaseModal(this.app, this.getSettings().phases, (id, label) => {
						this.onAddPhaseToNote!(capturedFile, id, label);
					}, capturedFile.basename).open();
				}
				: undefined,
			() => this.refresh()
		);

		// Scan button + progress (inside navigator's scan host)
		const scanHost = this.navigator.getScanHost();
		this.refreshBtn = scanHost.createEl('button', { cls: 'tm-refresh-btn' });
		this.refreshBtn.textContent = '\u626B\u63CF\u4EFB\u52A1';
		this.refreshBtn.addEventListener('click', async () => {
			this.refreshBtn!.disabled = true;
			this.refreshBtn!.textContent = '\u626B\u63CF\u4E2D\u2026';
			await this.taskScanner.fullScan();
			this.refreshBtn!.disabled = false;
			this.refreshBtn!.textContent = '\u626B\u63CF\u4EFB\u52A1';
		});

		this.progressWrapEl = scanHost.createDiv({ cls: 'tm-progress-wrap' });
		this.progressWrapEl.style.display = 'none';
		const progressBarEl = this.progressWrapEl.createDiv({ cls: 'tm-progress-bar' });
		this.progressFillEl = progressBarEl.createDiv({ cls: 'tm-progress-fill' });
		this.progressTextEl = this.progressWrapEl.createDiv({ cls: 'tm-progress-text' });

		// Quadrant Grid
		this.quadrantGrid = new QuadrantGrid(
			contentEl,
			this.app,
			this.tagManager,
			this.eventBus,
			this.dragDropManager,
			settings
		);
	}

	private rebuildUI(): void {
		this.buildUI();
		this.switchView(this.currentViewId);
	}

	private switchView(viewId: string): void {
		this.currentViewId = viewId;
		this.navigator?.updatePhaseView(viewId);
		this.refresh();
	}

	private async refresh(): Promise<void> {
		if (!this.currentViewId) return;

		const settings = this.getSettings();

		// Build noteFilePath -> phaseId mapping
		const noteToPhase = new Map<string, string>();
		for (const phase of settings.phases) {
			if (phase.noteFilePath) {
				noteToPhase.set(phase.noteFilePath, phase.id);
			}
		}

		// Re-read all tasks
		const allTasks = this.taskScanner.getAllTasks();

		// Phase view: include tasks from this phase's note file
		let gridTasks = allTasks.filter(task => {
			if (task.quadrantAssignments[this.currentViewId]) return true;
			if (noteToPhase.get(task.filePath) === this.currentViewId) return true;
			return false;
		});

		// Apply "hide completed" filter if active
		if (this.navigator?.isHideCompleted()) {
			gridTasks = gridTasks.filter(t => !t.completed);
		}

		// Render quadrant grid with filtered tasks
		this.quadrantGrid?.render(this.currentViewId, gridTasks);
	}

	private updateProgress(scanned: number, total: number): void {
		if (!this.progressWrapEl || !this.progressFillEl || !this.progressTextEl) return;
		this.progressWrapEl.style.display = 'flex';
		const pct = total > 0 ? Math.round((scanned / total) * 100) : 0;
		this.progressFillEl.style.width = `${pct}%`;
		this.progressTextEl.textContent = `${scanned} / ${total} \u6587\u4EF6 (${pct}%)`;
	}

	private hideProgress(): void {
		if (!this.progressWrapEl || !this.progressFillEl || !this.progressTextEl) return;
		// Show 100% briefly before hiding
		this.progressFillEl.style.width = '100%';
		this.progressTextEl.textContent = '\u626B\u63CF\u5B8C\u6210';
		setTimeout(() => {
			if (this.progressWrapEl) this.progressWrapEl.style.display = 'none';
		}, 800);
	}
}
