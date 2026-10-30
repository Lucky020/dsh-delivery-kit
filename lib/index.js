/**
 * dsh-delivery-kit — 交付工坊
 *
 * 面向系统验收材料：先列能生成哪些文档、各需要什么材料，再逐份生成。
 * 缺材料返回 missing，由 agent 去问用户，不猜。
 */
import { createCatalogTool, createDocTool } from './delivery/tools.js'

export const name = 'dsh-delivery-kit'

export const inject = ['tools']

export function apply(ctx) {
  for (const factory of [createCatalogTool, createDocTool]) {
    ctx.effect(
      () => ctx.tools.register(factory()),
      `dsh-delivery-kit: ${factory.name}`,
    )
  }
}
