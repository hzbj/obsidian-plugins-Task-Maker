import { App, TFile, Notice } from 'obsidian';
import { CategoryPreset, PluginSettings } from '../models/types';

export interface TimeBlocksCategory {
	id: string;
	name: string;
	color: string;
}

export interface TimeBlocksIndex {
	version: number;
	categories: TimeBlocksCategory[];
}

export class TimeBlocksSyncService {
	private readonly INDEX_FILE = 'time-blocks-data/index.json';

	constructor(
		private app: App,
		private getSettings: () => PluginSettings
	) {}

	/**
	 * 检查 time-blocks-data 索引文件是否存在
	 */
	async isAvailable(): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(this.INDEX_FILE);
		return file instanceof TFile;
	}

	/**
	 * 读取 time-blocks-data 的分类数据
	 */
	async fetchCategories(): Promise<TimeBlocksCategory[]> {
		const file = this.app.vault.getAbstractFileByPath(this.INDEX_FILE);
		if (!(file instanceof TFile)) {
			throw new Error('找不到 time-blocks-data/index.json 文件');
		}

		const content = await this.app.vault.read(file);
		const data: TimeBlocksIndex = JSON.parse(content);

		if (!data.categories || !Array.isArray(data.categories)) {
			throw new Error('time-blocks-data 格式不正确');
		}

		return data.categories;
	}

	/**
	 * 将 time-blocks 的分类转换为插件的分类格式
	 */
	private convertToCategoryPreset(tbCategory: TimeBlocksCategory): CategoryPreset {
		// 提取干净的 ID（去掉时间戳后缀）
		const cleanId = this.extractCleanId(tbCategory.id);
		
		return {
			id: cleanId,
			name: tbCategory.name,
			color: tbCategory.color,
		};
	}

	/**
	 * 从 time-blocks ID 中提取干净的 ID
	 * 例如 "睡觉-1772985761668" -> "睡觉"
	 */
	private extractCleanId(id: string): string {
		// 移除时间戳后缀（-数字）
		return id.replace(/-\d+$/, '');
	}

	/**
	 * 同步 time-blocks 的分类到插件设置
	 * @param mergeMode 合并模式：'replace' 替换所有，'merge' 合并（保留现有）
	 * @returns 同步结果统计
	 */
	async syncCategories(
		mergeMode: 'replace' | 'merge' = 'merge'
	): Promise<{
		success: boolean;
		added: number;
		updated: number;
		unchanged: number;
		message: string;
	}> {
		try {
			const tbCategories = await this.fetchCategories();
			const settings = this.getSettings();
			
			const newCategories = tbCategories.map(c => this.convertToCategoryPreset(c));
			
			let added = 0;
			let updated = 0;
			let unchanged = 0;

			if (mergeMode === 'replace') {
				// 替换模式：完全替换现有分类
				const existingIds = new Set(settings.categories.map(c => c.id));
				const newIds = new Set(newCategories.map(c => c.id));
				
				added = newCategories.filter(c => !existingIds.has(c.id)).length;
				updated = newCategories.filter(c => existingIds.has(c.id)).length;
				unchanged = 0;
				
				settings.categories = newCategories;
			} else {
				// 合并模式：保留现有，添加新的
				const existingMap = new Map(settings.categories.map(c => [c.id, c]));
				
				for (const newCat of newCategories) {
					const existing = existingMap.get(newCat.id);
					if (!existing) {
						settings.categories.push(newCat);
						added++;
					} else if (existing.name !== newCat.name || existing.color !== newCat.color) {
						// 更新现有分类
						existing.name = newCat.name;
						existing.color = newCat.color;
						updated++;
					} else {
						unchanged++;
					}
				}
			}

			return {
				success: true,
				added,
				updated,
				unchanged,
				message: `同步完成：新增 ${added} 个，更新 ${updated} 个，未变化 ${unchanged} 个`,
			};
		} catch (error) {
			return {
				success: false,
				added: 0,
				updated: 0,
				unchanged: 0,
				message: `同步失败：${(error as Error).message}`,
			};
		}
	}

	/**
	 * 预览将要同步的分类（不实际修改设置）
	 */
	async previewSync(): Promise<{
		success: boolean;
		categories: CategoryPreset[];
		message: string;
	}> {
		try {
			const tbCategories = await this.fetchCategories();
			const categories = tbCategories.map(c => this.convertToCategoryPreset(c));
			
			return {
				success: true,
				categories,
				message: `找到 ${categories.length} 个分类`,
			};
		} catch (error) {
			return {
				success: false,
				categories: [],
				message: `读取失败：${(error as Error).message}`,
			};
		}
	}
}
