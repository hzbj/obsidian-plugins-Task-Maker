import { ViewDefinition, ViewType, PluginSettings } from '../models/types';

export class ViewRegistryService {
	constructor(
		private getSettings: () => PluginSettings
	) {}

	/** Get a view definition by its ID */
	getView(viewId: string): ViewDefinition | undefined {
		const phase = this.getSettings().phases.find(p => p.id === viewId);
		if (phase) {
			return {
				id: phase.id,
				type: 'phase',
				label: phase.label,
				parentId: null,
				timePeriod: phase.timePeriod,
			};
		}

		return undefined;
	}

	/** Get all phase view definitions */
	getPhaseViews(): ViewDefinition[] {
		return this.getSettings().phases
			.sort((a, b) => a.order - b.order)
			.map(p => ({
				id: p.id,
				type: 'phase' as ViewType,
				label: p.label,
				parentId: null,
				timePeriod: p.timePeriod,
			}));
	}

	/** Validate that a phase ID is well-formed and unique */
	isValidPhaseId(id: string): { valid: boolean; reason?: string } {
		if (!id || id.length === 0) {
			return { valid: false, reason: 'ID cannot be empty' };
		}
		if (id.length > 20) {
			return { valid: false, reason: 'ID must be 20 characters or less' };
		}
		if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(id)) {
			return { valid: false, reason: 'ID must start with a letter and contain only letters, numbers, and underscores' };
		}
		// Check duplicate among existing phases
		if (this.getSettings().phases.some(p => p.id === id)) {
			return { valid: false, reason: 'Phase ID already exists' };
		}
		return { valid: true };
	}

	/** Determine the view type of a given viewId */
	getViewType(viewId: string): ViewType | undefined {
		if (this.getSettings().phases.some(p => p.id === viewId)) {
			return 'phase';
		}
		return undefined;
	}
}
