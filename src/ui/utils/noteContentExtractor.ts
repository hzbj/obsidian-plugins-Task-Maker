/**
 * Extracts content from specific headings in a markdown note.
 * Skips frontmatter, filters out checkbox lines (tasks),
 * and returns the combined markdown string.
 */
export function extractNoteContent(
	rawContent: string,
	targetHeadings: string[]
): string {
	if (!rawContent || targetHeadings.length === 0) return '';

	const lines = rawContent.split('\n');
	const lowerTargets = targetHeadings.map(h => h.toLowerCase());

	const resultBlocks: string[] = [];
	let capturing = false;
	let captureLevel = 0;
	let inFrontmatter = false;
	let frontmatterPassed = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Skip frontmatter
		if (i === 0 && line.trim() === '---') {
			inFrontmatter = true;
			continue;
		}
		if (inFrontmatter) {
			if (line.trim() === '---') {
				inFrontmatter = false;
				frontmatterPassed = true;
			}
			continue;
		}

		// Check if this is a heading line
		const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			const headingText = headingMatch[2].trim().toLowerCase();

			if (capturing) {
				// Stop capturing if we hit a heading at the same or higher level
				if (level <= captureLevel) {
					capturing = false;
				}
			}

			if (!capturing && lowerTargets.includes(headingText)) {
				capturing = true;
				captureLevel = level;
				continue; // Don't include the heading itself
			}

			if (capturing) {
				// Sub-heading within target section — include it
				resultBlocks.push(line);
			}
			continue;
		}

		if (capturing) {
			// Filter out checkbox lines (tasks) to avoid duplication
			if (/^\s*- \[[ xX]\]/.test(line)) {
				continue;
			}
			resultBlocks.push(line);
		}
	}

	// Trim trailing empty lines
	while (resultBlocks.length > 0 && resultBlocks[resultBlocks.length - 1].trim() === '') {
		resultBlocks.pop();
	}

	return resultBlocks.join('\n');
}
