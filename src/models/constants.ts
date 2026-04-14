import { QuadrantCode, PluginSettings } from './types';

export const VIEW_TYPE_MATRIX = 'task-maker-matrix';

export const QUADRANT_CODES: QuadrantCode[] = ['ui', 'in', 'un', 'nn'];

export const CHECKBOX_REGEX = /^(\s*- \[)([ xX])(\]\s+)(.+)$/;

export const DEFAULT_SETTINGS: PluginSettings = {
	triggerTags: ['task', 'todo'],
	tagNamespace: 'T',
	phases: [],
	ui: {
		quadrantLabels: {
			ui: '紧急且重要',
			in: '重要不紧急',
			un: '紧急不重要',
			nn: '不紧急不重要',
		},
		quadrantColors: {
			ui: '#e74c3c',
			in: '#3498db',
			un: '#f39c12',
			nn: '#95a5a6',
		},
		showSourceFile: true,
		compactMode: false,
		notePanel: {
			enabled: true,
			headings: ['目标', 'Goals', 'Plan', '计划', '概述', 'Overview'],
			defaultExpanded: true,
		},
		showOverviewSubdivisions: false,
		showOverviewCustomSegments: false,
		deadlineWarningDays: 7,
	},
	defaultSubdivisionUnit: 'week',
	archiveBasePath: '归档',
	archiveCategories: [
		{ code: 'P', label: '个人项目' },
		{ code: 'W', label: '工作项目' },
		{ code: 'S', label: '学习项目' },
	],
};
