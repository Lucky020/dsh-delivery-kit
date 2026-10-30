#!/usr/bin/env node
/** 冒烟测试：注册 + 目录 + 数据库文档生成 + 缺材料提示。 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { apply, name, inject } from '../lib/index.js'

const registered = new Map()
apply({
  tools: { register(t) { registered.set(t.name, t); return () => registered.delete(t.name) } },
  effect(fn) { const d = fn(); assert.equal(typeof d, 'function'); return d },
})

assert.equal(name, 'dsh-delivery-kit')
assert.deepEqual([...registered.keys()].sort(), ['delivery_catalog', 'delivery_doc'])

const dir = mkdtempSync(path.join(tmpdir(), 'delivery-kit-'))
const repo = path.join(dir, 'repo')
mkdirSync(path.join(repo, 'app', 'models'), { recursive: true })
writeFileSync(path.join(repo, 'app', 'models', 'order.py'), [
  'from sqlalchemy import Column, BigInteger, String',
  'from app.core.database import Base',
  '',
  'class Order(Base):',
  '    __tablename__ = "orders"',
  '    id = Column(BigInteger, primary_key=True)',
  '    order_no = Column(String(64))',
].join('\n'))
writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ dependencies: { vue: '2.7.16' } }))

const catalog = await registered.get('delivery_catalog').execute({ root: repo, software_name: '测试系统' })
assert.ok(catalog.docs.length >= 9)
assert.equal(catalog.project.tables, 1)

const out = path.join(dir, 'out', '数据库设计文档.docx')
const doc = await registered.get('delivery_doc').execute({ doc_id: 'database', root: repo, software_name: '测试系统', out_path: out })
assert.ok(existsSync(out))
assert.equal(doc.tables, 1)

const manual = await registered.get('delivery_doc').execute({
  doc_id: 'user-manual', root: repo, software_name: '测试系统',
  out_path: path.join(dir, 'out', '使用说明书.docx'), base_url: 'http://127.0.0.1:59999',
})
assert.ok(manual.missing.some((m) => m.includes('未运行')))

console.log('✓ smoke passed:', [...registered.keys()].join(', '))
