const LINK_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[),.;!?]+$/;

export const isWebLink = (text: string): boolean => /^https?:\/\/\S+$/i.test(text.trim());

/** Every distinct web link in a piece of text, in order. */
export function extractLinks(text: string): string[] {
  const links = (text.match(LINK_PATTERN) ?? []).map((link) => link.replace(TRAILING_PUNCTUATION, ''));
  return [...new Set(links)];
}
