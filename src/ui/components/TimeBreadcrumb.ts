import { TimeNode } from '../../models/types';
import { TimeTreeService } from '../../services/TimeTreeService';
import { EventBus } from '../../services/EventBus';

export class TimeBreadcrumb {
	el: HTMLElement;

	constructor(
		private container: HTMLElement,
		private timeTree: TimeTreeService,
		private eventBus: EventBus
	) {
		this.el = container.createDiv({ cls: 'tm-breadcrumb' });
	}

	render(currentViewId: string): void {
		this.el.empty();
		const currentNode = this.timeTree.getNode(currentViewId);

		// Navigation arrows for siblings (all weeks)
		if (currentNode) {
			const siblings = this.timeTree.getSiblings(currentViewId);
			const currentIdx = siblings.findIndex(s => s.viewId === currentViewId);

			// Left arrow
			const leftBtn = this.el.createEl('button', { cls: 'tm-breadcrumb-arrow' });
			leftBtn.textContent = '\u25C0';
			leftBtn.disabled = currentIdx <= 0;
			if (currentIdx > 0) {
				leftBtn.addEventListener('click', () => {
					this.navigateTo(siblings[currentIdx - 1]);
				});
			}

			// Current week label
			this.el.createSpan({
				cls: 'tm-breadcrumb-item tm-breadcrumb-current',
				text: currentNode.label,
			});

			// Right arrow
			const rightBtn = this.el.createEl('button', { cls: 'tm-breadcrumb-arrow' });
			rightBtn.textContent = '\u25B6';
			rightBtn.disabled = currentIdx >= siblings.length - 1;
			if (currentIdx < siblings.length - 1) {
				rightBtn.addEventListener('click', () => {
					this.navigateTo(siblings[currentIdx + 1]);
				});
			}
		}
	}

	private navigateTo(node: TimeNode): void {
		this.eventBus.emit('view-switched', {
			viewId: node.viewId,
			viewType: node.type,
		});
	}
}
