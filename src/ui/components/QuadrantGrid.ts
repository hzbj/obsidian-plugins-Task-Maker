import { App } from 'obsidian';
import { Task, QuadrantCode, PluginSettings } from '../../models/types';
import { QUADRANT_CODES } from '../../models/constants';
import { TagManagerService } from '../../services/TagManagerService';
import { EventBus } from '../../services/EventBus';
import { DragDropManager } from '../DragDropManager';
import { QuadrantCell } from './QuadrantCell';
import { TaskItem } from './TaskItem';

export class QuadrantGrid {
	el: HTMLElement;
	private cells: Map<QuadrantCode, QuadrantCell> = new Map();
	private unassignedEl: HTMLElement;
	private unassignedListEl: HTMLElement;
	private unassignedCountEl: HTMLElement;

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

	/** Render tasks grouped by their quadrant assignment for a given viewId */
	render(viewId: string, tasks: Task[]): void {
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

		for (const code of QUADRANT_CODES) {
			this.cells.get(code)?.renderTasks(grouped[code]);
		}

		// Render unassigned
		this.unassignedListEl.empty();
		this.unassignedCountEl.textContent = `${grouped.unassigned.length}`;
		for (const task of grouped.unassigned) {
			new TaskItem(
				this.unassignedListEl,
				task,
				this.app,
				this.tagManager,
				this.eventBus,
				this.dragDropManager,
				this.settings
			);
		}
	}
}
