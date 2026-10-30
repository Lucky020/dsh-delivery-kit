# dsh-delivery-kit · 交付工坊

把一个代码仓库变成**系统验收材料**。DeepSeek Harness 插件。

## 能生成哪些文档

| 文档 | 自动化 | 需要你提供 |
|---|---|---|
| 数据库设计文档 | 95% | — |
| 概要设计说明书 | 70% | 架构取舍（可选） |
| 详细设计说明书 | 60% | 关键流程（可选） |
| 技术协议 | 10% | **合同范围 / 性能指标 / 验收标准** |
| 测试报告 | 30% | **测试环境、真实执行结果** |
| 上线报告 | 30% | **上线时间、参与人** |
| 验收报告 | 40% | **合同号、验收日期、结论、签认** |
| 使用说明书 | 50% | **界面截图**（系统在跑可自动截） |

## 用法

```
delivery_catalog   先问：能生成哪些、每份要什么材料、项目规模多大
        ↓ 用户挑
delivery_doc       逐份生成；材料缺了就返回 missing，不替你编
```

**核心约定**：代码里没有的事实，工具不写。数量（功能数/字段数）、结论（测试通过/验收符合）一律留「待填写 / 待验证」。

## 数据库结构从哪来

数据库设计文档的质量取决于能不能拿到真实表结构。三条路，按推荐排序：

| 方式 | 需要你给 | 能拿到 |
|---|---|---|
| **① 建表 SQL**（推荐） | 一份 `.sql` 文件 | 表名、字段、真实类型、可空、默认值、**注释** |
| ② 字段清单 | `.csv` / `.tsv` / Excel 另存 | 同上（手动整理，最省事） |
| ③ 结构 JSON | `.json` | 同上 |
| ④ 只读连接 | 连接串（多数场景拿不到） | 同上，自动 |
| ⑤ 扫代码模型 | 无 | 仅模型字段名，类型靠推断，没有注释 |

**不需要数据库账号**：一条 `mysqldump --no-data` 或 `pg_dump --schema-only`，或者从 Navicat/DBeaver 右键「DDL」，就能拿到建表 SQL。

```jsonc
// schema_path 文件格式
{ "tables": [ { "name": "banqian_xieyi", "comment": "搬迁补偿协议",
  "fields": [ { "name": "xieyi_no", "type": "varchar(64)", "nullable": false, "comment": "协议编号" } ] } ] }
```

支持 PostgreSQL 与 MySQL，只读 `information_schema`，不做任何写操作。

## 使用说明书的截图

- 系统在运行：给 `base_url` + 页面清单，自动 headless 截图并插图
- 系统没运行：返回提示，由你后期手动补图

## 安装

```bash
dsh plugin --profile web add github:Lucky020/dsh-delivery-kit
```

装完重启 `dsh web`。

## 依赖

| 用途 | 依赖 |
|---|---|
| 文档渲染 | `python3` + `python-docx` |
| 自动截图 | Google Chrome（或 `DSH_COPYRIGHT_CHROME` 指定路径） |

```bash
python3 -m pip install python-docx
```

## 与 dsh-copyright-kit 的关系

两者独立：**软著工坊**出软著登记材料（源程序 + 说明书），**交付工坊**出验收材料（设计/测试/上线/验收/协议）。渲染引擎各自内置，互不依赖。

MIT
