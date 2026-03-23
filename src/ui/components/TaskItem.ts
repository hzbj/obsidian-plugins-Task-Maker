import { App, Menu } from 'obsidian';
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

		// Category left border color bar
		if (task.category) {
			const preset = settings.categories.find(c => c.name === task.category);
			const color = preset?.color ?? '#888';
			this.el.style.setProperty('--tm-category-color', color);
			this.el.classList.add('tm-task-categorized');
		}

		this.render();
		this.dragDropManager.setupDraggable(this.el, task.id);

		// Right-click context menu for category assignment
		this.el.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			const menu = new Menu();
			for (const cat of this.settings.categories) {
				menu.addItem(item => {
					item.setTitle(cat.name);
					if (this.task.category === cat.name) item.setIcon('checkmark');
					item.onClick(async () => {
						const success = await this.tagManager.updateCategoryTag(this.task, cat.name);
						if (success) {
							this.eventBus.emit('task-category-changed', {
								taskId: this.task.id,
								category: cat.name,
							});
						}
					});
				});
			}
			if (this.task.category) {
				menu.addSeparator();
				menu.addItem(item => {
					item.setTitle('清除分类');
					item.setIcon('x');
					item.onClick(async () => {
						const success = await this.tagManager.updateCategoryTag(this.task, null);
						if (success) {
							this.eventBus.emit('task-category-changed', {
								taskId: this.task.id,
								category: null,
							});
						}
					});
				});
			}
			menu.showAtMouseEvent(e);
		});
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

		// Category badge
		if (this.task.category) {
			const preset = this.settings.categories.find(c => c.name === this.task.category);
			const color = preset?.color ?? '#888';
			const badge = this.el.createSpan({ cls: 'tm-task-category-badge' });
			badge.textContent = this.task.category;
			badge.style.setProperty('--tm-category-color', color);
		}

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