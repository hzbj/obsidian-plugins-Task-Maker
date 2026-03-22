import { ItemView, WorkspaceLeaf, App } from 'obsidian';
import { Task, ViewType, PluginSettings, QuadrantCode } from '../models/types';
import { VIEW_TYPE_MATRIX } from '../models/constants';
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

export class MatrixView extends ItemView {
	private currentViewId: string = '';
	private currentViewType: ViewType = 'month';

	private navigator: ViewNavigator | null = null;
	private quadrantGrid: QuadrantGrid | null = null;
	private contextPanel: ContextPanel | null = null;
	private dragDropManager: DragDropManager;
	private noteContentEl: HTMLElement | null = null;

	// Bound event handlers for cleanup
	private onScanComplete: (p: { tasks: Task[] }) => void;
	private onTasksChanged: (p: { filePath: string; tasks: Task[] }) => void;
	private onTaskUpdated: (p: { taskId: string; viewId: string; quadrant: QuadrantCode | null }) => void;
	private onTaskToggled: (p: { taskId: string; completed: boolean }) => void;
	private onViewSwitched: (p: { viewId: string; viewType: ViewType }) => void;
	private onSettingsChanged: (p: { settings: PluginSettings }) => void;

	constructor(
		leaf: WorkspaceLeaf,
		private eventBus: EventBus,
		private taskScanner: TaskScannerService,
		private tagManager: TagManagerService,
		private timeTree: TimeTreeService,
		private viewRegistry: ViewRegistryService,
		private noteLinker: NoteLinkerService,
		private getSettings: () => PluginSettings
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
		this.onScanComplete = () => this.refresh();
		this.onTasksChanged = () => this.refresh();
		this.onTaskUpdated = () => this.refresh();
		this.onTaskToggled = () => this.refresh();
		this.onViewSwitched = (p) => this.switchView(p.viewId, p.viewType);
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
		this.eventBus.on('tasks-changed', this.onTasksChanged);
		this.eventBus.on('task-updated', this.onTaskUpdated);
		this.eventBus.on('task-toggled', this.onTaskToggled);
		this.eventBus.on('view-switched', this.onViewSwitched);
		this.eventBus.on('settings-changed', this.onSettingsChanged);

		this.buildUI();

		// Set default view
		const settings = this.getSettings();
		const defaultViewId = this.timeTree.getCurrentViewId(settings.timeView.defaultLevel);
		this.switchView(defaultViewId, settings.timeView.defaultLevel);
	}

	async onClose(): Promise<void> {
		this.eventBus.off('scan-complete', this.onScanComplete);
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
			this.timeTree,
			this.eventBus
		);

		// Context Panel
		this.contextPanel = new ContextPanel(contentEl, this.timeTree, settings);

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

		const tasks = this.taskScanner.getAllTasks();

		// Render quadrant grid
		this.quadrantGrid?.render(this.currentViewId, tasks);

		// Render context panel (parent summary)
		if (this.currentViewType !== 'phase') {
			this.contextPanel?.render(this.currentViewId, tasks);
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
}
