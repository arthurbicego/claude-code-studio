import { describe, expect, it } from 'vitest';
import { buildFrontmatter, escapeYamlString, parseFrontmatter } from './frontmatter';

describe('parseFrontmatter', () => {
  it('returns empty frontmatter when the document has no delimiters', () => {
    const result = parseFrontmatter('just a body\n');
    expect(result).toEqual({ frontmatter: {}, body: 'just a body\n' });
  });

  it('parses scalar fields', () => {
    const { frontmatter, body } = parseFrontmatter('---\nname: agent\nmodel: opus\n---\nbody\n');
    expect(frontmatter).toEqual({ name: 'agent', model: 'opus' });
    expect(body).toBe('body\n');
  });

  it('parses inline array fields and strips quotes from items', () => {
    const { frontmatter } = parseFrontmatter('---\ntools: [Bash, "Read", \'Write\']\n---\n');
    expect(frontmatter).toEqual({ tools: ['Bash', 'Read', 'Write'] });
  });

  it('strips surrounding quotes from scalar values', () => {
    const { frontmatter } = parseFrontmatter('---\ndescription: "quoted value"\n---\n');
    expect(frontmatter).toEqual({ description: 'quoted value' });
  });

  it('ignores comment and blank lines in the YAML block', () => {
    const input = '---\n# comment\n\nname: x\n---\n';
    const { frontmatter } = parseFrontmatter(input);
    expect(frontmatter).toEqual({ name: 'x' });
  });
});

describe('buildFrontmatter', () => {
  it('roundtrips a simple object through parseFrontmatter', () => {
    const original = { name: 'foo', description: 'hello' };
    const { frontmatter } = parseFrontmatter(`${buildFrontmatter(original)}body`);
    expect(frontmatter).toEqual(original);
  });

  it('skips nullish and empty values', () => {
    const text = buildFrontmatter({ name: 'x', description: '', model: undefined });
    expect(text).not.toContain('description');
    expect(text).not.toContain('model');
    expect(text).toContain('name: x');
  });

  it('quotes values that contain YAML-sensitive characters', () => {
    const text = buildFrontmatter({ description: 'has: colon' });
    expect(text).toContain('"has: colon"');
  });

  it('emits arrays in inline form', () => {
    const text = buildFrontmatter({ tools: ['Bash', 'Read'] });
    expect(text).toContain('tools: [Bash, Read]');
  });

  it('emits multi-line values as block scalars', () => {
    const text = buildFrontmatter({ body: 'line 1\nline 2' });
    expect(text).toContain('body: |');
    expect(text).toContain('  line 1');
    expect(text).toContain('  line 2');
  });
});

describe('escapeYamlString', () => {
  it('leaves plain strings unquoted', () => {
    expect(escapeYamlString('hello')).toBe('hello');
  });

  it('quotes strings with leading whitespace', () => {
    expect(escapeYamlString(' leading')).toBe('" leading"');
  });

  it('quotes the empty string', () => {
    expect(escapeYamlString('')).toBe('""');
  });
});
