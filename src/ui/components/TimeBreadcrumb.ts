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
		const breadcrumb = this.timeTree.getBreadcrumb(currentViewId);
		const currentNode = this.timeTree.getNode(currentViewId);

		// Navigation arrows for siblings
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

			// Breadcrumb items
			for (let i = 0; i < breadcrumb.length; i++) {
				const node = breadcrumb[i];
				if (i > 0) {
					this.el.createSpan({ cls: 'tm-breadcrumb-sep', text: ' > ' });
				}
				const item = this.el.createSpan({
					cls: 'tm-breadcrumb-item',
					text: node.label,
				});
				if (node.viewId !== currentViewId) {
					item.classList.add('tm-breadcrumb-link');
					item.addEventListener('click', () => {
						this.navigateTo(node);
					});
				} else {
					item.classList.add('tm-breadcrumb-current');
				}
			}

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

		// Children navigation - show clickable children
		if (currentNode && currentNode.children.length > 0) {
			const childrenBar = this.el.createDiv({ cls: 'tm-breadcrumb-children' });
			for (const child of currentNode.children) {
				const childBtn = childrenBar.createEl('button', {
					cls: 'tm-breadcrumb-child',
					text: child.label,
				});
				childBtn.addEventListener('click', () => {
					this.navigateTo(child);
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
