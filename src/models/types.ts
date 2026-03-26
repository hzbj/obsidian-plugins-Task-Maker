// ============ Quadrant Types ============

export type QuadrantCode = 'ui' | 'in' | 'un' | 'nn';

export type ViewType = 'phase';

// ============ Task ============

export interface Task {
	/** Stable ID: `filePath:lineNumber` */
	id: string;
	/** Clean text without checkbox prefix and quadrant tags */
	text: string;
	/** Original line text as-is */
	rawLine: string;
	/** Source file path */
	filePath: string;
	/** Line number (0-based) */
	lineNumber: number;
	/** Whether the checkbox is checked */
	completed: boolean;
	/** How this task was triggered for extraction */
	triggerType: 'frontmatter' | 'inline';
	/** viewId -> QuadrantCode mapping, parsed from inline tags */
	quadrantAssignments: Record<string, QuadrantCode>;
	/** Tab-based indent depth (0 = no indent, 1 = one tab, etc.) */
	indentLevel: number;
}

// ============ Task Tree ============

export interface TaskTreeNode {
	task: Task;
	children: TaskTreeNode[];
}

// ============ Views ============

export interface ViewDefinition {
	id: string;
	type: ViewType;
	label: string;
	parentId: string | null;
	timePeriod?: { start: string; end: string };
	notePattern?: string;
}

export interface PhaseDefinition {
	id: string;
	label: string;
	order: number;
	timePeriod?: { start: string; end: string };
	noteFilePath?: string;
	description?: string;
	autoDetected?: boolean;
}

// ============ Settings ============

export interface PluginSettings {
	triggerTags: string[];
	tagNamespace: string;
	phases: PhaseDefinition[];
	ui: {
		quadrantLabels: Record<QuadrantCode, string>;
		quadrantColors: Record<QuadrantCode, string>;
		showSourceFile: boolean;
		compactMode: boolean;
		notePanel: {
			enabled: boolean;
			headings: string[];
			defaultExpanded: boolean;
		};
	};
}

// ============ Events ============

export interface EventMap {
	'scan-complete': { tasks: Task[] };
	'scan-progress': { scanned: number; total: number };
	'tasks-changed': { filePath: string; tasks: Task[] };
	'task-updated': { taskId: string; viewId: string; quadrant: QuadrantCode | null };
	'task-toggled': { taskId: string; completed: boolean };
	'view-switched': { viewId: string; viewType: ViewType };
	'settings-changed': { settings: PluginSettings };
	'phases-synced': { added: string[]; updated: string[]; removed: string[] };
	'timeline-toggled': { active: boolean };
}

// ============ Phase Detection ============

export interface DetectedPhaseInfo {
	phaseId: string;
	phaseLabel: string;
	filePath: string;
	timePeriod?: { start: string; end: string };
}
