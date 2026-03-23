import { ItemView, WorkspaceLeaf, App } from 'obsidian';
import { Task, ViewType, PluginSettings, QuadrantCode } from '../models/types';
import { VIEW_TYPE_MATRIX, TIME_VIEW_ID_PATTERNS } from '../models/constants';
import { EventBus } from '../services/EventBus';
import { TaskScannerService } from '../services/TaskScannerService';
import { TagManagerService } from '../services/TagManagerService';
import { TimeTreeService } from '../services/TimeTreeService';
import { ViewRegistryService } from '../services/ViewRegistryService';
import { NoteLinkerService } from '../services/NoteLinkerService';
import { DragDropManager } from './DragDropManager';
import { ViewNavigator, ViewMode } from './components/ViewNavigator';
import { QuadrantGrid } from './components/QuadrantGrid';
import { ContextPanel } from './components/ContextPanel';
import { CreatePhaseModal } from './components/CreatePhaseModal';

export class MatrixView extends ItemView {
	private currentViewId: string = '';
	private currentViewType: ViewType = 'week';

	private navigator: ViewNavigator | null = null;
	private quadrantGrid: QuadrantGrid | null = null;
	private contextPanel: ContextPanel | null = null;
	private dragDropManager: DragDropManager;
	private noteContentEl: HTMLElement | null = null;

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
	private onViewSwitched: (p: { viewId: string; viewType: ViewType }) => void;
	private onSettingsChanged: (p: { settings: PluginSettings }) => void;
	private onCategoryChanged: (p: { taskId: string; category: string | null }) => void;

	constructor(
		leaf: WorkspaceLeaf,
		private eventBus: EventBus,
		private taskScanner: TaskScannerService,
		private tagManager: TagManagerService,
		private timeTree: TimeTreeService,
		private viewRegistry: ViewRegistryService,
		private noteLinker: NoteLinkerService,
		private getSettings: () => PluginSettings,
		private onCreatePhase?: (id: string, label: string) => Promise<void>
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
		this.onViewSwitched = (p) => this.switchView(p.viewId, p.viewType);
		this.onSettingsChanged = () => this.rebuildUI();
		this.onCategoryChanged = () => this.refresh();
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
		this.eventBus.on('task-category-changed', this.onCategoryChanged);

		this.buildUI();

		// Set default view — always start with current week
		const defaultViewId = this.timeTree.getCurrentViewId('week');
		this.switchView(defaultViewId, 'week');
	}

	async onClose(): Promise<void> {
		this.eventBus.off('scan-complete', this.onScanComplete);
		this.eventBus.off('scan-progress', this.onScanProgress);
		this.eventBus.off('tasks-changed', this.onTasksChanged);
		this.eventBus.off('task-updated', this.onTaskUpdated);
		this.eventBus.off('task-toggled', this.onTaskToggled);
		this.eventBus.off('view-switched', this.onViewSwitched);
		this.eventBus.off('settings-changed', this.onSettingsChanged);
		this.eventBus.off('task-category-changed', this.onCategoryChanged);
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
			this.timeTree,
			this.eventBus,
			this.onCreatePhase
				? () => {
					new CreatePhaseModal(this.app, (id, label) => {
						this.onCreatePhase!(id, label);
					}).open();
				}
				: undefined
		);

		// Scan button + progress (inside navigator's time controls, after "today" button)
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

		// Context Panel
		this.contextPanel = new ContextPanel(
			contentEl, this.timeTree, this.eventBus,
			this.app, this.tagManager, settings
		);

		// Quadrant Grid
		this.quadrantGrid = new QuadrantGrid(
			contentEl,
			this.app,
			this.tagManager,
			this.eventBus,
			this.dragDropManager,
			settings
		);

		// Associated notes content area
		this.noteContentEl = contentEl.createDiv({ cls: 'tm-note-content' });
	}

	private rebuildUI(): void {
		this.buildUI();
		this.switchView(this.currentViewId, this.currentViewType);
	}

	private switchView(viewId: string, viewType: ViewType): void {
		this.currentViewId = viewId;
		this.currentViewType = viewType;

		// Update navigator
		if (viewType === 'phase') {
			this.navigator?.setMode('phase');
			this.navigator?.updatePhaseView(viewId);
		} else {
			this.navigator?.setMode('time');
			this.navigator?.updateTimeView(viewId);
		}

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

		// For week view: force-scan associated note files so tasks without triggers are included
		if (this.currentViewType !== 'phase') {
			const associatedFiles = this.noteLinker.findAssociatedNotes(this.currentViewId);
			for (const file of associatedFiles) {
				await this.taskScanner.scanFile(file, true);
			}
		}

		// Re-read all tasks after potential forced scans
		const allTasks = this.taskScanner.getAllTasks();

		// Filter tasks based on current view type to avoid cross-view redundancy
		let gridTasks: Task[];
		if (this.currentViewType !== 'phase') {
			// Week view: include tasks from associated week note files
			const weekNoteFiles = new Set(
				this.noteLinker.findAssociatedNotes(this.currentViewId).map(f => f.path)
			);
			const phaseIds = new Set(settings.phases.map(p => p.id));
			gridTasks = allTasks.filter(task => {
				if (task.quadrantAssignments[this.currentViewId]) return true;
				if (weekNoteFiles.has(task.filePath)) return true;
				if (noteToPhase.has(task.filePath)) return false;
				const hasPhaseAssignment = Object.keys(task.quadrantAssignments)
					.some(vid => phaseIds.has(vid));
				if (hasPhaseAssignment) return false;
				return true;
			});
		} else {
			// Phase view: include tasks from this phase's note file, exclude others
			const weekPattern = TIME_VIEW_ID_PATTERNS.week;
			const phaseIds = new Set(settings.phases.map(p => p.id));
			gridTasks = allTasks.filter(task => {
				if (task.quadrantAssignments[this.currentViewId]) return true;
				if (noteToPhase.get(task.filePath) === this.currentViewId) return true;
				return false;
			});
		}

		// Render quadrant grid with filtered tasks
		this.quadrantGrid?.render(this.currentViewId, gridTasks);

		// Render context panel (phase overview) — uses full task list for accurate stats
		if (this.currentViewType !== 'phase') {
			this.contextPanel?.render(this.currentViewId, allTasks);
		} else {
			if (this.contextPanel) {
				this.contextPanel.el.style.display = 'none';
			}
		}

		// Load associated notes
		await this.loadAssociatedNotes();
	}

	private async loadAssociatedNotes(): Promise<void> {
		if (!this.noteContentEl) return;
		this.noteContentEl.empty();

		const notes = await this.noteLinker.getAssociatedNotesWithContent(this.currentViewId);
		if (notes.length === 0) {
			this.noteContentEl.style.display = 'none';
			return;
		}

		this.noteContentEl.style.display = 'block';
		const header = this.noteContentEl.createDiv({ cls: 'tm-note-header' });
		header.textContent = '关联笔记';

		for (const note of notes) {
			const noteEl = this.noteContentEl.createDiv({ cls: 'tm-note-item' });

			const titleEl = noteEl.createDiv({ cls: 'tm-note-title' });
			titleEl.textContent = note.file.basename;
			titleEl.addEventListener('click', () => {
				const leaf = this.app.workspace.getLeaf(false);
				leaf.openFile(note.file);
			});

			if (note.extractedContent) {
				const contentEl = noteEl.createDiv({ cls: 'tm-note-extract' });
				contentEl.textContent = note.extractedContent;
			}
		}
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
