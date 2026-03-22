import { App, TFile, moment } from 'obsidian';
import { AssociatedNote, PluginSettings, TimeNodeType } from '../models/types';
import { TimeTreeService } from './TimeTreeService';

export class NoteLinkerService {
	constructor(
		private app: App,
		private timeTree: TimeTreeService,
		private getSettings: () => PluginSettings
	) {}

	/**
	 * Find notes associated with a given viewId based on filename date matching.
	 */
	findAssociatedNotes(viewId: string): TFile[] {
		const settings = this.getSettings();
		if (!settings.noteAssociation.enabled) return [];

		const node = this.timeTree.getNode(viewId);
		if (!node) {
			// Could be a phase view - check for direct file path
			const phase = settings.phases.find(p => p.id === viewId);
			if (phase?.noteFilePath) {
				const file = this.app.vault.getAbstractFileByPath(phase.noteFilePath);
				if (file instanceof TFile) return [file];
			}
			return [];
		}

		// Get the Moment.js pattern for this time node type
		const pattern = settings.noteAssociation.timeNotePatterns[node.type];
		if (!pattern) return [];

		// Generate the expected date string
		const expectedStr = moment(node.start).format(pattern);

		// Build a regex that requires word boundaries around the expected string
		// so "2026" matches "2026" or "2026-年报" but not "2026W11" or "20260101"
		const escaped = expectedStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const boundaryRegex = new RegExp(`(?<![\\w])${escaped}(?![\\w])`);

		// Search through vault files
		const searchFolders = settings.noteAssociation.noteSearchFolders;
		const files = this.app.vault.getMarkdownFiles().filter(file => {
			// Filter by search folders if specified
			if (searchFolders.length > 0) {
				const inFolder = searchFolders.some(folder =>
					file.path.startsWith(folder.endsWith('/') ? folder : folder + '/')
				);
				if (!inFolder) return false;
			}
			// Check if filename contains the expected date string with word boundaries
			return boundaryRegex.test(file.basename);
		});

		return files;
	}

	/**
	 * Extract content from an associated note under specific headings.
	 */
	async extractNoteContent(file: TFile): Promise<string> {
		const settings = this.getSettings();
		const headings = settings.noteAssociation.contentHeadings;

		if (headings.length === 0) return '';

		const content = await this.app.vault.cachedRead(file);
		const lines = content.split('\n');
		const extracted: string[] = [];

		let capturing = false;
		let captureLevel = 0;

		for (const line of lines) {
			const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

			if (headingMatch) {
				const level = headingMatch[1].length;
				const title = headingMatch[2].trim();

				if (capturing && level <= captureLevel) {
					// End of captured section
					capturing = false;
				}

				if (headings.some(h => title.toLowerCase().includes(h.toLowerCase()))) {
					capturing = true;
					captureLevel = level;
					extracted.push(line);
					continue;
				}
			}

			if (capturing) {
				extracted.push(line);
			}
		}

		return extracted.join('\n').trim();
	}

	/**
	 * Get associated notes with their extracted content.
	 */
	async getAssociatedNotesWithContent(viewId: string): Promise<AssociatedNote[]> {
		const files = this.findAssociatedNotes(viewId);
		const results: AssociatedNote[] = [];

		for (const file of files) {
			const extractedContent = await this.extractNoteContent(file);
			results.push({
				file,
				viewId,
				extractedContent,
			});
		}

		return results;
	}
}
