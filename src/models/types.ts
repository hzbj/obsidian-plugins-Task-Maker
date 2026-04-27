// ============ Quadrant Types ============

export type QuadrantCode = 'ui' | 'in' | 'un' | 'nn';

export type ViewType = 'phase';

/** Priority level: 1 = 第一任务, 2 = 第二任务 */
export type PriorityLevel = 1 | 2;

// ============ Subdivision Types ============

export type SubdivisionUnit = 'day' | 'week' | 'biweek' | 'month';

export interface PhaseSubdivision {
	id: string;
	start: string;
	end: string;
	description?: string;
}

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
	/** viewId -> priority level (1=第一任务, 2=第二任务, 0或undefined=无优先级) */
	priorityAssignments: Record<string, number>;
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

export interface ArchivedItem {
	type: 'file' | 'folder';
	originalPath: string;
	archivedPath: string;
}

export interface PhaseDefinition {
	id: string;
	label: string;
	order: number;
	timePeriod?: { start: string; end: string };
	noteFilePath?: string;
	description?: string;
	autoDetected?: boolean;
	subdivisionUnit?: SubdivisionUnit;
	customSubdivisions?: PhaseSubdivision[];
	priority?: number;
	archived?: boolean;
	archiveInfo?: {
		archivePath: string;
		categoryCode: string;
		archivedAt: string;
		originalPaths: string[];
		archivedItems: ArchivedItem[];
	};
}

export interface PhaseGroup {
	id: string;
	label: string;
	order: number;
	phaseIds: string[];
}

// ============ Settings ============

export interface PluginSettings {
	triggerTags: string[];
	tagNamespace: string;
	phases: PhaseDefinition[];
	phaseGroups: PhaseGroup[];
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
		showOverviewSubdivisions: boolean;
		showOverviewCustomSegments: boolean;
		deadlineWarningDays: number;
	};
	defaultSubdivisionUnit: SubdivisionUnit;
	archiveBasePath: string;
	archiveCategories: ArchiveCategoryDef[];
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
	'phase-archived': { phaseId: string; archivePath: string };
	'phase-restored': { phaseId: string; restoredPaths: string[] };
	'phase-deleted': { phaseId: string };
}

// ============ Phase Detection ============

export interface DetectedPhaseInfo {
	phaseId: string;
	phaseLabel: string;
	filePath: string;
	timePeriod?: { start: string; end: string };
}

// ============ Archive ============

export interface ArchiveCategoryDef {
	code: string;
	label: string;
}

export interface PhaseNoteInfo {
	filePath: string;
	fileName: string;
	phaseId: string;
}
