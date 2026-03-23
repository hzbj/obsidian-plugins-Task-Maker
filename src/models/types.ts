import { TFile } from 'obsidian';

// ============ Quadrant Types ============

export type QuadrantCode = 'ui' | 'in' | 'un' | 'nn';

export type TimeNodeType = 'week';

export type ViewType = 'phase' | TimeNodeType;

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
	/** Category name parsed from inline tag, null = uncategorized */
	category: string | null;
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

export interface TimeNode {
	type: TimeNodeType;
	viewId: string;
	label: string;
	/** ISO date string */
	start: string;
	/** ISO date string */
	end: string;
	children: TimeNode[];
}

// ============ Settings ============

export interface PluginSettings {
	triggerTags: string[];
	tagNamespace: string;
	phases: PhaseDefinition[];
	categories: CategoryPreset[];
	timeView: {
		startYear: number;
		endYear: number;
		weekStart: 0 | 1;
	};
	noteAssociation: {
		enabled: boolean;
		timeNotePatterns: Record<TimeNodeType, string>;
		noteSearchFolders: string[];
		contentHeadings: string[];
	};
	ui: {
		quadrantLabels: Record<QuadrantCode, string>;
		quadrantColors: Record<QuadrantCode, string>;
		showSourceFile: boolean;
		compactMode: boolean;
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
	'task-category-changed': { taskId: string; category: string | null };
}

// ============ Category Preset ============

export interface CategoryPreset {
	id: string;
	name: string;
	color: string;
}

// ============ Phase Detection ============

export interface DetectedPhaseInfo {
	phaseId: string;
	phaseLabel: string;
	filePath: string;
}

// ============ Associated Note ============

export interface AssociatedNote {
	file: TFile;
	viewId: string;
	extractedContent: string;
}
