const LANG_TO_ISO639: Record<string, string> = {
	en: 'eng',
	es: 'spa',
	pt: 'por',
	fr: 'fra',
	de: 'deu',
	it: 'ita',
};

const LANG_SEPARATORS = ['.', '_', '-'];

export function getLanguageCode(subtitlePath: string): string {
	for (const [code, iso] of Object.entries(LANG_TO_ISO639)) {
		if (LANG_SEPARATORS.some((sep) => subtitlePath.includes(`${sep}${code}.`))) {
			return iso;
		}
	}
	return 'und';
}
