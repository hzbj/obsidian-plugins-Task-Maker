import { App } from 'obsidian';
import { Task, QuadrantCode } from '../models/types';
import { TagManagerService } from '../services/TagManagerService';
import { EventBus } from '../services/EventBus';

export class DragDropManager {
	private currentDragTaskId: string | null = null;

	constructor(
		private app: App,
		private tagManager: TagManagerService,
		private eventBus: EventBus,
		private getCurrentViewId: () => string,
		private getTaskById: (id: string) => Task | undefined
	) {}

	/** Make a task element draggable */
	setupDraggable(el: HTMLElement, taskId: string): void {
		el.draggable = true;
		el.dataset.taskId = taskId;

		el.addEventListener('dragstart', (e: DragEvent) => {
			this.currentDragTaskId = taskId;
			e.dataTransfer?.setData('text/plain', taskId);
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
			}
			el.classList.add('tm-dragging');

			// Set a slight delay for visual feedback
			requestAnimationFrame(() => {
				el.style.opacity = '0.4';
			});
		});

		el.addEventListener('dragend', () => {
			this.currentDragTaskId = null;
			el.classList.remove('tm-dragging');
			el.style.opacity = '';
		});
	}

	/** Make a quadrant cell a drop target */
	setupDropZone(el: HTMLElement, quadrant: QuadrantCode): void {
		el.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			el.classList.add('tm-drag-over');
		});

		el.addEventListener('dragleave', (e: DragEvent) => {
			// Only remove highlight if actually leaving this element
			const related = e.relatedTarget as HTMLElement | null;
			if (!related || !el.contains(related)) {
				el.classList.remove('tm-drag-over');
			}
		});

		el.addEventListener('drop', async (e: DragEvent) => {
			e.preventDefault();
			el.classList.remove('tm-drag-over');

			const taskId = e.dataTransfer?.getData('text/plain');
			if (!taskId) return;

			const task = this.getTaskById(taskId);
			if (!task) return;

			const viewId = this.getCurrentViewId();
			const currentQuadrant = task.quadrantAssignments[viewId];

			if (currentQuadrant === quadrant) return; // No change

			const success = await this.tagManager.updateQuadrantTag(task, viewId, quadrant);
			if (success) {
				this.eventBus.emit('task-updated', { taskId, viewId, quadrant });
			}
		});
	}

	/** Make the unassigned tray a drop target that removes quadrant assignment */
	setupUnassignedDropZone(el: HTMLElement): void {
		el.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			el.classList.add('tm-drag-over');
		});

		el.addEventListener('dragleave', (e: DragEvent) => {
			const related = e.relatedTarget as HTMLElement | null;
			if (!related || !el.contains(related)) {
				el.classList.remove('tm-drag-over');
			}
		});

		el.addEventListener('drop', async (e: DragEvent) => {
			e.preventDefault();
			el.classList.remove('tm-drag-over');

			const taskId = e.dataTransfer?.getData('text/plain');
			if (!taskId) return;

			const task = this.getTaskById(taskId);
			if (!task) return;

			const viewId = this.getCurrentViewId();
			if (!(viewId in task.quadrantAssignments)) return; // Already unassigned

			const success = await this.tagManager.updateQuadrantTag(task, viewId, null);
			if (success) {
				this.eventBus.emit('task-updated', { taskId, viewId, quadrant: null });
			}
		});
	}
}
