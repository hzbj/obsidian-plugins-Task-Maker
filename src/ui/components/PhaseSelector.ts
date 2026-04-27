import { PhaseDefinition, PriorityLevel, PluginSettings } from '../../models/types';
import { EventBus } from '../../services/EventBus';
import { ViewRegistryService } from '../../services/ViewRegistryService';
import { Menu } from 'obsidian';

export class PhaseSelector {
	el: HTMLElement;
	private currentViewId = '';

	constructor(
		private container: HTMLElement,
		private viewRegistry: ViewRegistryService,
		private eventBus: EventBus,
		private getPhases: () => PhaseDefinition[],
		private savePhases: () => Promise<void>,
		private getSettings: () => PluginSettings,
		private onArchivePhase?: (phaseId: string) => void,
		private onDeletePhase?: (phaseId: string) => void,
		private onRestoreArchive?: () => void
	) {
		this.el = container.createDiv({ cls: 'tm-phase-selector' });
		this.refresh();
	}

	refresh(): void {
		this.el.empty();
		const phases = this.viewRegistry.getPhaseViews();

		if (phases.length === 0) {
			this.el.createSpan({
				cls: 'tm-phase-empty',
				text: '(无阶段 - 请在设置中添加)',
			});
			return;
		}

		const settings = this.getSettings();
		const phaseGroups = [...settings.phaseGroups].sort((a, b) => a.order - b.order);
		const phaseDefinitions = this.getPhases();

		// Track which phases are already in groups
		const groupedPhaseIds = new Set<string>();
		for (const group of phaseGroups) {
			for (const pid of group.phaseIds) {
				groupedPhaseIds.add(pid);
			}
		}

		// Render groups
		for (const group of phaseGroups) {
			const groupEl = this.el.createDiv({ cls: 'tm-phase-group' });
			groupEl.dataset.groupId = group.id;

			const titleEl = groupEl.createDiv({ cls: 'tm-phase-group-title', text: group.label });
			titleEl.draggable = true;
			titleEl.addEventListener('dragstart', (e) => {
				e.dataTransfer?.setData('text/plain', `group:${group.id}`);
				e.dataTransfer!.effectAllowed = 'move';
			});

			this.setupGroupDropZone(groupEl, group.id);

			for (const phaseId of group.phaseIds) {
				const phase = phases.find(p => p.id === phaseId);
				if (phase) {
					this.renderPhaseButton(phase, phaseDefinitions, groupEl);
				}
			}
		}

		// Render ungrouped phases directly (no group container)
		const ungroupedPhases = phases.filter(p => !groupedPhaseIds.has(p.id));
		for (const phase of ungroupedPhases) {
			this.renderPhaseButton(phase, phaseDefinitions, this.el);
		}

		// Setup ungrouped drop zone on the selector itself
		this.el.addEventListener('dragover', (e) => {
			const groupEl = (e.target as HTMLElement).closest('.tm-phase-group');
			if (!groupEl) {
				e.preventDefault();
				e.dataTransfer!.dropEffect = 'move';
			}
		});
		this.el.addEventListener('drop', async (e) => {
			const groupEl = (e.target as HTMLElement).closest('.tm-phase-group');
			if (groupEl) return;
			e.preventDefault();
			const data = e.dataTransfer?.getData('text/plain');
			if (data?.startsWith('phase:')) {
				const phaseId = data.slice(6);
				await this.movePhaseToGroup(phaseId, null);
			}
		});

		// Archived phases entry button
		const currentSettings = this.getSettings();
		const archivedCount = currentSettings.phases.filter(p => p.archived === true).length;
		if (archivedCount > 0 && this.onRestoreArchive) {
			const archiveBtn = this.el.createEl('button', {
				cls: 'tm-phase-btn tm-phase-archived-btn',
				text: `已归档 (${archivedCount})`,
			});
			archiveBtn.addEventListener('click', () => {
				this.onRestoreArchive!();
			});
		}
	}

	private renderPhaseButton(phase: { id: string; label: string }, phaseDefinitions: PhaseDefinition[], container: HTMLElement): HTMLElement {
		const phaseDef = phaseDefinitions.find(p => p.id === phase.id);
		const btn = container.createEl('button', {
			cls: 'tm-phase-btn',
			text: phase.label,
		});
		btn.dataset.viewId = phase.id;
		btn.draggable = true;
		if (phase.id === this.currentViewId) {
			btn.classList.add('tm-phase-btn-active');
		}
		// Add priority visual indicators
		// 确保 priority 是数字类型进行比较
		const priorityNum = typeof phaseDef?.priority === 'number' ? phaseDef.priority : parseInt(phaseDef?.priority as unknown as string, 10);
		if (priorityNum === 1) {
			btn.classList.add('tm-phase-btn-priority-1');
		}
		btn.addEventListener('click', () => {
			this.eventBus.emit('view-switched', { viewId: phase.id, viewType: 'phase' });
		});

		btn.addEventListener('dragstart', (e) => {
			e.dataTransfer?.setData('text/plain', `phase:${phase.id}`);
			e.dataTransfer!.effectAllowed = 'move';
		});

		btn.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			const menu = new Menu();

			// Priority submenu
			// 确保 priority 是数字类型进行比较
			const currentPriorityRaw = phaseDef?.priority;
			const currentPriority = typeof currentPriorityRaw === 'number' ? currentPriorityRaw : parseInt(currentPriorityRaw as unknown as string, 10);
			menu.addItem(item => item
				.setTitle(`设为第一阶段${currentPriority === 1 ? ' ✓' : ''}`)
				.setIcon('star')
				.onClick(async () => {
					await this.setPhasePriority(phase.id, currentPriority === 1 ? undefined : 1);
				}));

			menu.addSeparator();

			if (this.onArchivePhase) {
				menu.addItem(item => item
					.setTitle('归档阶段')
					.setIcon('archive')
					.onClick(() => this.onArchivePhase!(phase.id))
				);
			}
			if (this.onDeletePhase) {
				menu.addItem(item => item
					.setTitle('删除阶段')
					.setIcon('trash')
					.onClick(() => this.onDeletePhase!(phase.id))
				);
			}
			menu.showAtMouseEvent(e);
		});

		return btn;
	}

	private setupGroupDropZone(groupEl: HTMLElement, groupId: string): void {
		groupEl.addEventListener('dragover', (e) => {
			e.preventDefault();
			e.dataTransfer!.dropEffect = 'move';
			groupEl.classList.add('tm-phase-group-drop-active');
		});

		groupEl.addEventListener('dragleave', () => {
			groupEl.classList.remove('tm-phase-group-drop-active');
		});

		groupEl.addEventListener('drop', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			groupEl.classList.remove('tm-phase-group-drop-active');
			const data = e.dataTransfer?.getData('text/plain');
			if (!data) return;

			if (data.startsWith('phase:')) {
				const phaseId = data.slice(6);
				await this.movePhaseToGroup(phaseId, groupId);
			} else if (data.startsWith('group:')) {
				const draggedGroupId = data.slice(6);
				if (draggedGroupId !== groupId) {
					await this.reorderGroups(draggedGroupId, groupId);
				}
			}
		});
	}

	private async movePhaseToGroup(phaseId: string, targetGroupId: string | null): Promise<void> {
		const settings = this.getSettings();

		// Remove from all groups
		for (const group of settings.phaseGroups) {
			const idx = group.phaseIds.indexOf(phaseId);
			if (idx !== -1) {
				group.phaseIds.splice(idx, 1);
			}
		}

		// Add to target group
		if (targetGroupId) {
			const targetGroup = settings.phaseGroups.find(g => g.id === targetGroupId);
			if (targetGroup) {
				targetGroup.phaseIds.push(phaseId);
			}
		}

		await this.savePhases();
		this.refresh();
	}

	private async reorderGroups(draggedGroupId: string, targetGroupId: string): Promise<void> {
		const settings = this.getSettings();
		const groups = settings.phaseGroups;
		const draggedIdx = groups.findIndex(g => g.id === draggedGroupId);
		const targetIdx = groups.findIndex(g => g.id === targetGroupId);
		if (draggedIdx === -1 || targetIdx === -1) return;

		const [dragged] = groups.splice(draggedIdx, 1);
		groups.splice(targetIdx, 0, dragged);

		// Recalculate orders
		groups.forEach((g, i) => { g.order = i; });

		await this.savePhases();
		this.refresh();
	}

	setCurrentPhase(viewId: string): void {
		this.currentViewId = viewId;
		this.el.querySelectorAll('.tm-phase-btn').forEach(btn => {
			const el = btn as HTMLElement;
			el.classList.toggle('tm-phase-btn-active', el.dataset.viewId === viewId);
		});
	}

	private async setPhasePriority(phaseId: string, priority: PriorityLevel | undefined): Promise<void> {
		const phases = this.getPhases();

		// Clear existing priority of the same level from other phases
		if (priority !== undefined) {
			for (const p of phases) {
				// 确保 priority 是数字类型进行比较
				const pPriority = typeof p.priority === 'number' ? p.priority : parseInt(p.priority as unknown as string, 10);
				if (p.id !== phaseId && pPriority === priority) {
					p.priority = undefined;
				}
			}
		}

		// Set or clear priority for the current phase
		const currentPhase = phases.find(p => p.id === phaseId);
		if (currentPhase) {
			currentPhase.priority = priority;
		}

		await this.savePhases();
		// 注意：savePhases 会触发 settings-changed -> rebuildUI，创建新的 PhaseSelector
		// 这里的 refresh 在旧的 PhaseSelector 上执行，不会影响新 UI
		// 但为了确保当前 UI 立即更新，仍然调用 refresh
		this.refresh();
	}
}
