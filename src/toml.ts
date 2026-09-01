/**
 * Minimal TOML subset parser for warroom unit files (agent-definition
 * TOML shape). Supports: blank lines, `#` comments, `[table]` headers (flat names),
 * and `key = value` with basic strings ("…" with \" \\ \n escapes), literal
 * strings ('…' verbatim), booleans, and bare tokens (kept as strings).
 * Deliberately tiny: unit files are flat scalars; anything fancier fails loud.
 * @module dsh-plugin-stardeck/toml
 */

/** Parse a TOML-subset document into tables of scalar values. */
export function parseToml(text: string): Map<string, Record<string, string | boolean>> {
  const tables = new Map<string, Record<string, string | boolean>>()
  let current = ''
  tables.set(current, {})
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]!).trim()
    if (line === '') continue
    const header = /^\[([^\]]+)\]$/.exec(line)
    if (header !== null) {
      current = header[1]!.trim()
      if (current === '') throw new TomlError(i + 1, 'empty table name')
      if (!tables.has(current)) tables.set(current, {})
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0) throw new TomlError(i + 1, `expected key = value, got: ${line.slice(0, 40)}`)
    const key = line.slice(0, eq).trim()
    if (key === '') throw new TomlError(i + 1, 'empty key')
    const value = parseValue(line.slice(eq + 1).trim(), i + 1)
    tables.get(current)![key] = value
  }
  return tables
}

/** Error carrying the offending 1-based line number. */
export class TomlError extends Error {
  constructor(line: number, reason: string) {
    super(`TOML line ${line}: ${reason}`)
  }
}

function stripComment(line: string): string {
  // A '#' inside a quoted string must not start a comment; scan respecting quotes.
  let inBasic = false
  let inLiteral = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' && !inLiteral) inBasic = !inBasic
    else if (ch === "'" && !inBasic) inLiteral = !inLiteral
    else if (ch === '#' && !inBasic && !inLiteral) return line.slice(0, i)
  }
  return line
}

function parseValue(raw: string, line: number): string | boolean {
  if (raw === '') throw new TomlError(line, 'empty value')
  const first = raw[0]!
  if (first === "'") {
    const end = raw.indexOf("'", 1)
    if (end === -1) throw new TomlError(line, 'unterminated literal string')
    return raw.slice(1, end)
  }
  if (first === '"') {
    const end = findBasicEnd(raw, line)
    return unescapeBasic(raw.slice(1, end))
  }
  if (raw === 'true') return true
  if (raw === 'false') return false
  // Bare token (names, numbers kept as strings) — up to end of line.
  return raw.trim()
}

function findBasicEnd(raw: string, line: number): number {
  for (let i = 1; i < raw.length; i++) {
    const ch = raw[i]!
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '"') return i
  }
  throw new TomlError(line, 'unterminated basic string')
}

function unescapeBasic(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|["\\nrt])/g, (_m, c: string) => {
    if (c[0] === 'u') return String.fromCharCode(Number.parseInt(c.slice(1), 16))
    switch (c) {
      case 'n': return '\n'
      case 'r': return '\r'
      case 't': return '\t'
      default: return c
    }
  })
}
