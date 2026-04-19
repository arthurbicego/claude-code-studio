function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text || '');
  if (!match) return { frontmatter: {}, body: text || '' };
  const yaml = match[1];
  const body = match[2] || '';
  const fm = {};
  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf(':');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!key) continue;
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      fm[key] = inner
        ? inner
            .split(',')
            .map((s) => s.trim().replace(/^["']|["']$/g, ''))
            .filter(Boolean)
        : [];
    } else if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      fm[key] = value.slice(1, -1);
    } else {
      fm[key] = value;
    }
  }
  return { frontmatter: fm, body };
}

function escapeYamlString(s) {
  if (s === '' || /[:#\-?&*!|>'"%@`{}[\],\n\r]/.test(s) || /^\s|\s$/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

function buildFrontmatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}: [${value.map((v) => escapeYamlString(String(v))).join(', ')}]`);
    } else {
      const str = String(value);
      if (str.includes('\n')) {
        lines.push(`${key}: |`);
        for (const seg of str.split('\n')) lines.push(`  ${seg}`);
      } else {
        lines.push(`${key}: ${escapeYamlString(str)}`);
      }
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

module.exports = { parseFrontmatter, escapeYamlString, buildFrontmatter };
