/**
 * 结构来源解析：把「人们手上真有的东西」转成表结构。
 *
 * 支持：
 *   - 建表 SQL（DDL）：CREATE TABLE / COMMENT ON / 行内 COMMENT
 *   - CSV / TSV：表名,字段名,类型,可空,说明
 *   - JSON：{ tables: [...] } 或 [ ... ]
 *
 * 不连数据库——真实项目里没人会给库账号。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** 解析 DDL：支持 MySQL 反引号、PostgreSQL 双引号、行内 COMMENT 与独立 COMMENT ON 语句。 */
export function parseDdl(sql) {
  const tables = new Map()
  const clean = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  const headRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?([`".\w]+)\s*\(/gi
  let m
  while ((m = headRe.exec(clean))) {
    const name = m[1].replace(/[`"]/g, '').split('.').pop()
    // 括号配对，取出表定义主体
    let depth = 0
    let i = headRe.lastIndex - 1
    const startIdx = i + 1
    for (; i < clean.length; i++) {
      if (clean[i] === '(') depth++
      else if (clean[i] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    const body = clean.slice(startIdx, i)
    const tailEnd = clean.indexOf(';', i)
    const tail = clean.slice(i + 1, tailEnd === -1 ? clean.length : tailEnd)

    const fields = []
    let d2 = 0
    let buf = ''
    const parts = []
    for (const ch of body) {
      if (ch === '(') d2++
      if (ch === ')') d2--
      if (ch === ',' && d2 === 0) {
        parts.push(buf)
        buf = ''
      } else {
        buf += ch
      }
    }
    if (buf.trim()) parts.push(buf)

    for (const raw of parts) {
      const line = raw.trim()
      if (!line) continue
      if (/^(primary|unique|key|index|constraint|foreign|check)\b/i.test(line)) continue
      const fm = line.match(/^([`"\w]+)\s+([a-zA-Z]+(?:\s*\([\d,\s]+\))?(?:\s+unsigned)?)/)
      if (!fm) continue
      const col = fm[1].replace(/[`"]/g, '')
      const type = fm[2].replace(/\s+/g, ' ')
      const nullable = !/not\s+null/i.test(line)
      const def = (line.match(/default\s+('([^']*)'|[\w.()]+)/i) || [])[1]
      const comment = (line.match(/comment\s+'([^']*)'/i) || [])[1] || ''
      fields.push({ name: col, type, nullable, default: def ?? null, comment })
    }

    const tableComment = (tail.match(/comment\s*=?\s*'([^']*)'/i) || [])[1] || ''
    if (fields.length) tables.set(name, { name, comment: tableComment, fields })
  }

  // 独立的 COMMENT ON TABLE / COLUMN（PostgreSQL 风格）
  const tcRe = /comment\s+on\s+table\s+([`".\w]+)\s+is\s+'([^']*)'/gi
  while ((m = tcRe.exec(clean))) {
    const name = m[1].replace(/[`"]/g, '').split('.').pop()
    if (tables.has(name)) tables.get(name).comment = m[2]
  }
  const ccRe = /comment\s+on\s+column\s+([`".\w]+)\.([`"\w]+)\s+is\s+'([^']*)'/gi
  while ((m = ccRe.exec(clean))) {
    const name = m[1].replace(/[`"]/g, '').split('.').pop()
    const col = m[2].replace(/[`"]/g, '')
    const t = tables.get(name)
    if (!t) continue
    const f = t.fields.find((x) => x.name === col)
    if (f) f.comment = m[3]
  }

  return [...tables.values()]
}

/** 解析 CSV/TSV 字段清单：列名可以是中文或英文表头。 */
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const sep = (lines[0].match(/\t/g) || []).length > (lines[0].match(/,/g) || []).length ? '\t' : ','
  const cells = (line) => line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
  const header = cells(lines[0]).map((h) => h.toLowerCase())
  const idx = (names, fallback) => {
    for (const n of names) {
      const i = header.findIndex((h) => h.includes(n))
      if (i !== -1) return i
    }
    return fallback
  }
  const ti = idx(['表名', 'table'], 0)
  const fi = idx(['字段', '列名', 'column', 'field'], 1)
  const tyi = idx(['类型', 'type'], 2)
  const ci = idx(['说明', '注释', 'comment', '含义'], 3)
  const ni = idx(['可空', 'null'], -1)

  const tables = new Map()
  for (const line of lines.slice(1)) {
    const c = cells(line)
    // 类型里可能含逗号（decimal(14,2)），列数多出时并回「类型」列
    if (c.length > header.length) {
      const extra = c.length - header.length
      c.splice(tyi, extra + 1, c.slice(tyi, tyi + extra + 1).join(','))
    }
    if (!c[ti]) continue
    const name = c[ti]
    if (!tables.has(name)) tables.set(name, { name, comment: '', fields: [] })
    if (c[fi]) {
      tables.get(name).fields.push({
        name: c[fi],
        type: c[tyi] || '—',
        nullable: ni === -1 ? null : /是|yes|true|y/i.test(c[ni] || ''),
        default: null,
        comment: c[ci] || '',
      })
    }
  }
  return [...tables.values()]
}

/** 从文件读结构：按扩展名选择解析器。 */
export function readSchemaFile(file) {
  const ext = path.extname(file).toLowerCase()
  const text = readFileSync(file, 'utf8')
  if (ext === '.sql') return parseDdl(text)
  if (ext === '.csv' || ext === '.tsv' || ext === '.txt') return parseCsv(text)
  if (ext === '.json') {
    const data = JSON.parse(text)
    const tables = data.tables || data
    return tables.map((t) => ({
      name: t.name || t.table,
      comment: t.comment || '',
      fields: (t.fields || []).map((f) =>
        typeof f === 'string'
          ? { name: f, type: '—', nullable: null, default: null, comment: '' }
          : { name: f.name, type: f.type || '—', nullable: f.nullable ?? null, default: f.default ?? null, comment: f.comment || '' },
      ),
    }))
  }
  throw new Error(`不支持的结构文件类型：${ext}（支持 .sql / .csv / .tsv / .json）`)
}
