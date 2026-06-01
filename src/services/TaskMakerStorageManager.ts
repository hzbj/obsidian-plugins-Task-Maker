import type { App } from 'obsidian';
import {
	LocalSettingsData,
	PluginSettings,
	VaultSettingsData,
} from '../models/types';
import {
	DEFAULT_SETTINGS,
	TASK_MAKER_INDEX_FILE,
} from '../models/constants';

type RawLocalSettings = Partial<LocalSettingsData> & Partial<PluginSettings>;
type RawVaultSettings = Partial<VaultSettingsData> & Partial<PluginSettings>;
type RawUiSettings = Partial<LocalSettingsData['ui'] & PluginSettings['ui']>;

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function numberOrDefault(value: unknown, fallback: number): number {
	return typeof value === 'number' ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function stringOrDefault(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}

function arrayOrDefault<T>(value: T[] | undefined, fallback: T[]): T[] {
	return clone(Array.isArray(value) ? value : fallback);
}

export function toVaultSettingsData(settings: PluginSettings): VaultSettingsData {
	return {
		version: 1,
		triggerTags: clone(settings.triggerTags),
		tagNamespace: settings.tagNamespace,
		phases: clone(settings.phases),
		phaseGroups: clone(settings.phaseGroups),
		defaultSubdivisionUnit: settings.defaultSubdivisionUnit,
		archiveBasePath: settings.archiveBasePath,
		archiveCategories: clone(settings.archiveCategories),
		quadrantLabels: clone(settings.ui.quadrantLabels),
	};
}

export function toLocalSettingsData(settings: PluginSettings, migrated = true): LocalSettingsData {
	return {
		migrated,
		ui: {
			quadrantColors: clone(settings.ui.quadrantColors),
			showSourceFile: settings.ui.showSourceFile,
			compactMode: settings.ui.compactMode,
			notePanel: clone(settings.ui.notePanel),
			showOverviewSubdivisions: settings.ui.showOverviewSubdivisions,
			showOverviewCustomSegments: settings.ui.showOverviewCustomSegments,
			deadlineWarningDays: settings.ui.deadlineWarningDays,
		},
	};
}

export function normalizeLocalSettingsData(raw: unknown): LocalSettingsData {
	const data = (isRecord(raw) ? raw : {}) as RawLocalSettings;
	const ui = (data.ui ?? {}) as RawUiSettings;
	const defaultUi = DEFAULT_SETTINGS.ui;

	return {
		migrated: booleanOrDefault(data.migrated, false),
		ui: {
			quadrantColors: {
				...clone(defaultUi.quadrantColors),
				...(ui.quadrantColors ?? {}),
			},
			showSourceFile: booleanOrDefault(ui.showSourceFile, defaultUi.showSourceFile),
			compactMode: booleanOrDefault(ui.compactMode, defaultUi.compactMode),
			notePanel: {
				...clone(defaultUi.notePanel),
				...(ui.notePanel ?? {}),
			},
			showOverviewSubdivisions: booleanOrDefault(
				ui.showOverviewSubdivisions,
				defaultUi.showOverviewSubdivisions
			),
			showOverviewCustomSegments: booleanOrDefault(
				ui.showOverviewCustomSegments,
				defaultUi.showOverviewCustomSegments
			),
			deadlineWarningDays: numberOrDefault(
				ui.deadlineWarningDays,
				defaultUi.deadlineWarningDays
			),
		},
	};
}

export function normalizeVaultSettingsData(raw: unknown): VaultSettingsData {
	const data = (isRecord(raw) ? raw : {}) as RawVaultSettings;
	const oldUi = (data.ui ?? {}) as RawUiSettings;

	return {
		version: 1,
		triggerTags: arrayOrDefault(data.triggerTags, DEFAULT_SETTINGS.triggerTags),
		tagNamespace: stringOrDefault(data.tagNamespace, DEFAULT_SETTINGS.tagNamespace),
		phases: arrayOrDefault(data.phases, DEFAULT_SETTINGS.phases),
		phaseGroups: arrayOrDefault(data.phaseGroups, DEFAULT_SETTINGS.phaseGroups),
		defaultSubdivisionUnit: data.defaultSubdivisionUnit ?? DEFAULT_SETTINGS.defaultSubdivisionUnit,
		archiveBasePath: stringOrDefault(data.archiveBasePath, DEFAULT_SETTINGS.archiveBasePath),
		archiveCategories: arrayOrDefault(data.archiveCategories, DEFAULT_SETTINGS.archiveCategories),
		quadrantLabels: {
			...clone(DEFAULT_SETTINGS.ui.quadrantLabels),
			...(data.quadrantLabels ?? oldUi.quadrantLabels ?? {}),
		},
	};
}

export function mergeSettings(
	vaultSettings: VaultSettingsData,
	localSettings: LocalSettingsData
): PluginSettings {
	return {
		...clone(DEFAULT_SETTINGS),
		triggerTags: clone(vaultSettings.triggerTags),
		tagNamespace: vaultSettings.tagNamespace,
		phases: clone(vaultSettings.phases),
		phaseGroups: clone(vaultSettings.phaseGroups),
		defaultSubdivisionUnit: vaultSettings.defaultSubdivisionUnit,
		archiveBasePath: vaultSettings.archiveBasePath,
		archiveCategories: clone(vaultSettings.archiveCategories),
		ui: {
			...clone(DEFAULT_SETTINGS.ui),
			...clone(localSettings.ui),
			quadrantLabels: {
				...clone(DEFAULT_SETTINGS.ui.quadrantLabels),
				...clone(vaultSettings.quadrantLabels),
			},
			quadrantColors: {
				...clone(DEFAULT_SETTINGS.ui.quadrantColors),
				...clone(localSettings.ui.quadrantColors),
			},
			notePanel: {
				...clone(DEFAULT_SETTINGS.ui.notePanel),
				...clone(localSettings.ui.notePanel),
			},
		},
	};
}

export class TaskMakerStorageManager {
	private vaultSettings: VaultSettingsData = normalizeVaultSettingsData(undefined);
	private savingPaths = new Set<string>();
	private loadError: Error | null = null;

	constructor(private app: App) {}

	isSavingPath(path: string): boolean {
		return this.savingPaths.has(path);
	}

	hasLoadError(): boolean {
		return this.loadError !== null;
	}

	getLoadError(): Error | null {
		return this.loadError;
	}

	getSettings(): VaultSettingsData {
		return clone(this.vaultSettings);
	}

	async initialize(legacyData: unknown): Promise<void> {
		const adapter = this.app.vault.adapter;
		const exists = await adapter.exists(TASK_MAKER_INDEX_FILE);

		if (exists) {
			await this.reloadIndex();
			return;
		}

		this.vaultSettings = normalizeVaultSettingsData(legacyData);
		await this.writeIndex(this.vaultSettings);
	}

	async reloadIndex(): Promise<void> {
		try {
			const raw = await this.app.vault.adapter.read(TASK_MAKER_INDEX_FILE);
			this.vaultSettings = normalizeVaultSettingsData(JSON.parse(raw));
			this.loadError = null;
		} catch (e) {
			const err = e instanceof Error ? e : new Error(String(e));
			this.loadError = err;
			this.vaultSettings = normalizeVaultSettingsData(undefined);
			console.error(`[TaskMaker] Failed to load ${TASK_MAKER_INDEX_FILE}:`, err);
		}
	}

	async saveSettings(settings: PluginSettings): Promise<void> {
		if (this.loadError) {
			throw new Error(`Refusing to overwrite unreadable ${TASK_MAKER_INDEX_FILE}: ${this.loadError.message}`);
		}

		const data = toVaultSettingsData(settings);
		await this.writeIndex(data);
		this.vaultSettings = clone(data);
	}

	private async writeIndex(data: VaultSettingsData): Promise<void> {
		await this.writeFile(TASK_MAKER_INDEX_FILE, JSON.stringify(data, null, 2));
	}

	private async writeFile(path: string, content: string): Promise<void> {
		this.savingPaths.add(path);
		try {
			const folderPath = path.substring(0, path.lastIndexOf('/'));
			if (folderPath && !(await this.app.vault.adapter.exists(folderPath))) {
				await this.app.vault.adapter.mkdir(folderPath);
			}
			await this.app.vault.adapter.write(path, content);
		} finally {
			setTimeout(() => {
				this.savingPaths.delete(path);
			}, 500);
		}
	}
}
