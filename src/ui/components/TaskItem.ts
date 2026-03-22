import { App, setIcon } from 'obsidian';
import { Task, PluginSettings } from '../../models/types';
import { TagManagerService } from '../../services/TagManagerService';
import { EventBus } from '../../services/EventBus';
import { DragDropManager } from '../DragDropManager';

export class TaskItem {
	el: HTMLElement;

	constructor(
		private container: HTMLElement,
		private task: Task,
		private app: App,
		private tagManager: TagManagerService,
		private eventBus: EventBus,
		private dragDropManager: DragDropManager,
		private settings: PluginSettings
	) {
		this.el = container.createDiv({ cls: 'tm-task-item' });
		if (task.completed) {
			this.el.classList.add('tm-task-completed');
		}
		this.render();
		this.dragDropManager.setupDraggable(this.el, task.id);
	}

	private render(): void {
		// Checkbox
		const checkbox = this.el.createEl('input', {
			type: 'checkbox',
			cls: 'tm-task-checkbox',
		});
		checkbox.checked = this.task.completed;
		checkbox.addEventListener('change', async () => {
			const success = await this.tagManager.toggleTaskCompletion(this.task);
			if (success) {
				this.eventBus.emit('task-toggled', {
					taskId: this.task.id,
					completed: !this.task.completed,
				});
			}
		});

		// Task text
		const textEl = this.el.createDiv({ cls: 'tm-task-text' });
		textEl.textContent = this.task.text;

		// Source file link
		if (this.settings.ui.showSourceFile) {
			const sourceEl = this.el.createDiv({ cls: 'tm-task-source' });
			const fileName = this.task.filePath.split('/').pop() ?? this.task.filePath;
			sourceEl.textContent = fileName;
			sourceEl.addEventListener('click', (e) => {
				e.stopPropagation();
				const file = this.app.vault.getAbstractFileByPath(this.task.filePath);
				if (file) {
					const leaf = this.app.workspace.getLeaf(false);
					leaf.openFile(file as any, {
						eState: { line: this.task.lineNumber },
					});
				}
			});
		}
	}
}
