import { App } from 'obsidian';
import { Task, PluginSettings } from '../../models/types';
import { TagManagerService } from '../../services/TagManagerService';
import { EventBus } from '../../services/EventBus';
import { DragDropManager } from '../DragDropManager';

export interface TaskItemCollapseOptions {
	hasChildren?: boolean;
	isCollapsed?: boolean;
	childCount?: number;
	onToggleCollapse?: () => void;
}

export class TaskItem {
	el: HTMLElement;

	constructor(
		private container: HTMLElement,
		private task: Task,
		private app: App,
		private tagManager: TagManagerService,
		private eventBus: EventBus,
		private dragDropManager: DragDropManager,
		private settings: PluginSettings,
		private collapseOptions?: TaskItemCollapseOptions,
		private viewId?: string
	) {
		this.el = container.createDiv({ cls: 'tm-task-item' });
		if (task.completed) {
			this.el.classList.add('tm-task-completed');
		}
		if (this.viewId && task.priorityAssignments[this.viewId] === 1) {
			this.el.classList.add('tm-priority-1');
		}
		if (this.viewId && task.priorityAssignments[this.viewId] === 2) {
			this.el.classList.add('tm-priority-2');
		}

		this.render();
		this.dragDropManager.setupDraggable(this.el, task.id);
	}

	private render(): void {
		const opts = this.collapseOptions;

		// Collapse toggle arrow (before checkbox)
		if (opts?.hasChildren) {
			const toggle = this.el.createSpan({ cls: 'tm-task-collapse-toggle' });
			toggle.textContent = opts.isCollapsed ? '\u25B6' : '\u25BC';
			toggle.addEventListener('click', (e) => {
				e.stopPropagation();
				opts.onToggleCollapse?.();
			});
		}

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

		// Priority buttons
		if (this.viewId) {
			const priorityContainer = this.el.createDiv({ cls: 'tm-priority-container' });
			const currentPriority = this.task.priorityAssignments[this.viewId] || 0;

			// 第一任务按钮
			const btn1 = priorityContainer.createEl('button', { cls: 'tm-priority-btn tm-priority-btn-1' });
			btn1.textContent = '1';
			btn1.title = '第一任务';
			if (currentPriority === 1) {
				btn1.classList.add('tm-priority-active', 'tm-priority-first');
			}
			btn1.addEventListener('click', async (e) => {
				e.stopPropagation();
				const newPriority = currentPriority === 1 ? 0 : 1;
				await this.tagManager.setTaskPriority(this.task, this.viewId!, newPriority);
				this.task.priorityAssignments[this.viewId!] = newPriority || 0;
				this.eventBus.emit('task-updated', {
					taskId: this.task.id,
					viewId: this.viewId!,
					quadrant: this.task.quadrantAssignments[this.viewId!] || null
				});
			});

			// 第二任务按钮
			const btn2 = priorityContainer.createEl('button', { cls: 'tm-priority-btn tm-priority-btn-2' });
			btn2.textContent = '2';
			btn2.title = '第二任务';
			if (currentPriority === 2) {
				btn2.classList.add('tm-priority-active');
			}
			btn2.addEventListener('click', async (e) => {
				e.stopPropagation();
				const newPriority = currentPriority === 2 ? 0 : 2;
				await this.tagManager.setTaskPriority(this.task, this.viewId!, newPriority);
				this.task.priorityAssignments[this.viewId!] = newPriority || 0;
				this.eventBus.emit('task-updated', {
					taskId: this.task.id,
					viewId: this.viewId!,
					quadrant: this.task.quadrantAssignments[this.viewId!] || null
				});
			});
		}

		// Task text
		const textEl = this.el.createDiv({ cls: 'tm-task-text' });
		textEl.textContent = this.task.text;

		// Child count badge (when collapsed)
		if (opts?.isCollapsed && opts.childCount && opts.childCount > 0) {
			const badge = this.el.createSpan({ cls: 'tm-task-child-count' });
			badge.textContent = `${opts.childCount}\u4E2A\u5B50\u4EFB\u52A1`;
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
