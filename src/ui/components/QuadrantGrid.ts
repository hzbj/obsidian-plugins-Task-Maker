import { App } from 'obsidian';
import { Task, QuadrantCode, PluginSettings, TaskTreeNode } from '../../models/types';
import { QUADRANT_CODES } from '../../models/constants';
import { TagManagerService } from '../../services/TagManagerService';
import { EventBus } from '../../services/EventBus';
import { DragDropManager } from '../DragDropManager';
import { QuadrantCell } from './QuadrantCell';
import { TaskItem } from './TaskItem';
import { buildTaskForest, countDescendants } from '../utils/TaskTreeBuilder';

export class QuadrantGrid {
	el: HTMLElement;
	private cells: Map<QuadrantCode, QuadrantCell> = new Map();
	private unassignedEl: HTMLElement;
	private unassignedListEl: HTMLElement;
	private unassignedCountEl: HTMLElement;

	private collapsedTaskIds: Set<string> = new Set();
	private lastViewId: string = '';
	private lastTasks: Task[] = [];

	constructor(
		private container: HTMLElement,
		private app: App,
		private tagManager: TagManagerService,
		private eventBus: EventBus,
		private dragDropManager: DragDropManager,
		private settings: PluginSettings
	) {
		this.el = container.createDiv({ cls: 'tm-quadrant-grid' });

		// Create 4 quadrant cells in order: Q1(ui), Q2(in), Q3(un), Q4(nn)
		for (const code of QUADRANT_CODES) {
			const cell = new QuadrantCell(
				this.el, code, app, tagManager, eventBus, dragDropManager, settings
			);
			this.cells.set(code, cell);
		}

		// Unassigned tray
		this.unassignedEl = container.createDiv({ cls: 'tm-unassigned-tray' });
		const header = this.unassignedEl.createDiv({ cls: 'tm-unassigned-header' });
		header.createSpan({ cls: 'tm-unassigned-title', text: '未分配任务' });
		this.unassignedCountEl = header.createSpan({ cls: 'tm-quadrant-count', text: '0' });

		// Toggle collapse
		let collapsed = false;
		header.addEventListener('click', () => {
			collapsed = !collapsed;
			this.unassignedListEl.style.display = collapsed ? 'none' : 'block';
			header.classList.toggle('tm-collapsed', collapsed);
		});

		this.unassignedListEl = this.unassignedEl.createDiv({ cls: 'tm-task-list' });
		this.dragDropManager.setupUnassignedDropZone(this.unassignedEl);
	}

	private toggleCollapse(taskId: string): void {
		if (this.collapsedTaskIds.has(taskId)) {
			this.collapsedTaskIds.delete(taskId);
		} else {
			this.collapsedTaskIds.add(taskId);
		}
		this.render(this.lastViewId, this.lastTasks);
	}

	/** Render tasks grouped by their quadrant assignment for a given viewId */
	render(viewId: string, tasks: Task[]): void {
		this.lastViewId = viewId;
		this.lastTasks = tasks;

		const grouped: Record<QuadrantCode | 'unassigned', Task[]> = {
			ui: [], in: [], un: [], nn: [], unassigned: [],
		};

		for (const task of tasks) {
			const q = task.quadrantAssignments[viewId];
			if (q && grouped[q]) {
				grouped[q].push(task);
			} else {
				grouped.unassigned.push(task);
			}
		}

		const onToggle = (id: string) => this.toggleCollapse(id);

		for (const code of QUADRANT_CODES) {
			this.cells.get(code)?.renderTasks(grouped[code], this.collapsedTaskIds, onToggle);
		}

		// Render unassigned with tree structure
		this.unassignedListEl.empty();
		this.unassignedCountEl.textContent = `${grouped.unassigned.length}`;

		const forest = buildTaskForest(grouped.unassigned);
		for (const node of forest) {
			this.renderUnassignedNode(this.unassignedListEl, node);
		}
	}

	private renderUnassignedNode(container: HTMLElement, node: TaskTreeNode): void {
		const hasChildren = node.children.length > 0;
		const isCollapsed = hasChildren && this.collapsedTaskIds.has(node.task.id);
		const childCount = hasChildren ? countDescendants(node) : 0;

		new TaskItem(
			container,
			node.task,
			this.app,
			this.tagManager,
			this.eventBus,
			this.dragDropManager,
			this.settings,
			hasChildren ? {
				hasChildren: true,
				isCollapsed,
				childCount,
				onToggleCollapse: () => this.toggleCollapse(node.task.id),
			} : undefined
		);

		if (hasChildren && !isCollapsed) {
			const childrenContainer = container.createDiv({ cls: 'tm-task-children' });
			for (const child of node.children) {
				this.renderUnassignedNode(childrenContainer, child);
			}
		}
	}
}
