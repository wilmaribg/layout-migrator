import { describe, test, expect } from 'vitest';
import { convertWildcards } from '../../converters/wildcardConverter.js';

describe('wildcardConverter', () => {
  test('{{ x }} → {{{ x }}}', () => {
    expect(convertWildcards('{{ x }}')).toBe('{{{ x }}}');
  });

  test('{{{ x }}} → {{{ x }}} (unchanged)', () => {
    expect(convertWildcards('{{{ x }}}')).toBe('{{{ x }}}');
  });

  test('converts multiple wildcards', () => {
    const input = 'Hello {{ name }}, your total is {{ total }}';
    const expected = 'Hello {{{ name }}}, your total is {{{ total }}}';
    expect(convertWildcards(input)).toBe(expected);
  });

  test('{{ proposal.title }} → {{{ proposal.title }}}', () => {
    expect(convertWildcards('{{ proposal.title }}')).toBe('{{{ proposal.title }}}');
  });

  test('{{ toCurrency x }} → {{{ toCurrency x }}}', () => {
    expect(convertWildcards('{{ toCurrency x }}')).toBe('{{{ toCurrency x }}}');
  });

  test('no wildcards → unchanged', () => {
    expect(convertWildcards('Hello world')).toBe('Hello world');
  });

  test('empty string → empty string', () => {
    expect(convertWildcards('')).toBe('');
  });

  test('mixed double and triple braces', () => {
    const input = '{{ a }} and {{{ b }}}';
    const expected = '{{{ a }}} and {{{ b }}}';
    expect(convertWildcards(input)).toBe(expected);
  });
});
