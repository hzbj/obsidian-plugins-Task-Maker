import { App } from 'obsidian';
import { Task, QuadrantCode, PluginSettings } from '../../models/types';
import { TagManagerService } from '../../services/TagManagerService';
import { EventBus } from '../../services/EventBus';
import { DragDropManager } from '../DragDropManager';
import { TaskItem } from './TaskItem';

export class QuadrantCell {
	el: HTMLElement;
	private taskListEl: HTMLElement;
	private countEl: HTMLElement;

	constructor(
		private container: HTMLElement,
		private quadrant: QuadrantCode,
		private app: App,
		private tagManager: TagManagerService,
		private eventBus: EventBus,
		private dragDropManager: DragDropManager,
		private settings: PluginSettings
	) {
		const color = settings.ui.quadrantColors[quadrant];
		this.el = container.createDiv({ cls: `tm-quadrant tm-quadrant-${quadrant}` });
		this.el.style.setProperty('--tm-quadrant-color', color);

		// Header
		const header = this.el.createDiv({ cls: 'tm-quadrant-header' });
		const titleEl = header.createSpan({ cls: 'tm-quadrant-title' });
		titleEl.textContent = settings.ui.quadrantLabels[quadrant];
		this.countEl = header.createSpan({ cls: 'tm-quadrant-count' });
		this.countEl.textContent = '0';

		// Task list
		this.taskListEl = this.el.createDiv({ cls: 'tm-task-list' });

		// Setup as drop zone
		this.dragDropManager.setupDropZone(this.el, quadrant);
	}

	renderTasks(tasks: Task[]): void {
		this.taskListEl.empty();
		this.countEl.textContent = `${tasks.length}`;

		for (const task of tasks) {
			new TaskItem(
				this.taskListEl,
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
