/**
 * Wildcard Converter — {{ x }} → {{{ x }}}
 *
 * Prolibu uses Mustache-style double braces {{ variable }}.
 * Design Studio uses Handlebars-style triple braces {{{ variable }}}.
 * This converter upgrades double to triple without affecting existing triple braces.
 */

/**
 * Convert all double-brace wildcards to triple-brace wildcards.
 * Existing triple-brace wildcards are left unchanged.
 *
 * {{ x }} → {{{ x }}}
 * {{{ x }}} → {{{ x }}} (unchanged)
 */
export function convertWildcards(text: string): string {
  // Match {{ ... }} that are NOT already {{{ ... }}}
  // Negative lookbehind: not preceded by {
  // Negative lookahead: the closing }} must not be followed by }
  return text.replace(/(?<!\{)\{\{(?!\{)(.*?)\}\}(?!\})/g, '{{{$1}}}');
}
