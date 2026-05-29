# AI 使用审计报告

## 一、AI 参与环节

本项目使用 AI 编程助手（WorkBuddy）辅助完成以下工作：

| 环节 | AI 参与程度 | 说明 |
|------|:---:|------|
| 数据库模式设计 | 辅助 | AI 生成建表 DDL，人工审核约束和触发器逻辑 |
| 触发器编写 | 辅助 | AI 写触发器框架，人工修正逻辑错误 |
| 种子数据编写 | 辅助 | AI 生成初始数据，人工调整状态和时序 |
| ER 图文档 | 辅助 | AI 生成结构，人工补充设计决策说明 |
| Express 服务层代码 | 主力 | AI 写业务逻辑，人工审查事务边界 |
| 路由和 EJS 模板 | 主力 | AI 生成页面，人工验证渲染和错误处理 |
| 复杂 SQL 查询 | 辅助 | AI 写多表 JOIN 和窗口函数查询 |
| CSS 样式 | 主力 | AI 按设计规范重写 CSS |
| 集成测试 | 辅助 | AI 写测试用例，人工验证结果 |
| 文档撰写 | 辅助 | AI 生成初稿，人工补充业务说明 |

---

## 二、AI 输出错误案例

### 错误 1：触发器重叠区间判断逻辑 Bug

**位置**: `db/schema.sql` — `trg_install_check_overlap`

**AI 原始输出**:
```sql
(removed_at IS NULL AND NEW.installed_at < '9999-12-31')
```

**问题**: Case 1 条件 `NEW.installed_at < '9999-12-31'` 对任何真实日期恒为真。导致当部件有活跃安装时，无法插入任何历史记录——即使时间区间完全不重叠。

**影响**: 违反"历史保留规则"——无法为曾安装过的部件补充历史记录。

**识别方式**: 项目经理代码审查时发现。

**修正方法**: 将 3 个分支的 OR 条件重构为通用公式：
```sql
installed_at < COALESCE(NEW.removed_at, '9999-12-31 23:59:59')
AND COALESCE(removed_at, '9999-12-31 23:59:59') > NEW.installed_at
```

---

### 错误 2：MySQL CHECK 约束 IN 子句的编码冲突

**位置**: `db/schema.sql` — `chk_scrap_reason`

**AI 原始输出**:
```sql
CONSTRAINT chk_scrap_reason CHECK (reason IN ('寿命到期', '不可修复损坏', '技术淘汰', '其他'))
```

**问题**: Windows 终端下 MySQL 客户端使用 gbk 编码读取 SQL 文件，而表使用 utf8mb4_unicode_ci 排序规则。`IN` 子句中的中文字面量产生 `Illegal mix of collations` 错误。

**识别方式**: 执行 schema.sql 时 MySQL 报错，ERROR 1267。

**修正方法**: 将 `IN (...)` 改为 `reason = 'xxx' OR reason = 'yyy' OR ...`，执行时加 `--default-character-set=utf8mb4` 参数。

---

### 错误 3：种子数据触发器误拦截

**位置**: `db/seed.sql`

**AI 原始输出**: 将 APU-002（最终状态 `under_maintenance`）和 AVI-002（最终状态 `retired`）直接在 INSERT 时设为最终状态。

**问题**: 种子数据中安装记录先于部件状态更新执行，`trg_install_check_retired` 触发器会拒绝为 `retired`/`under_maintenance` 状态的部件插入安装记录。

**识别方式**: 执行 seed.sql 时报错 `ERROR 1644 (45000): 错误：维修中的部件不允许安装`。

**修正方法**: 初始插入时所有有安装历史的部件设为 `available`，安装记录插入完毕后，批量 UPDATE 修正为最终状态。

---

### 错误 4：SQL JOIN 列名歧义

**位置**: `src/routes/maintenance.js`, `src/routes/retirement.js`

**AI 原始输出**:
```sql
SELECT id, component_sn, cm.model_name, c.status FROM Component c JOIN ComponentModel cm ON ...
```

**问题**: Component 和 ComponentModel 都有 `id` 列，`SELECT id` 产生歧义。

**识别方式**: 运行时抛异常 `Column 'id' in field list is ambiguous`。

**修正方法**: 改为 `SELECT c.id`。

---

### 错误 5：createMaintenance 事务缺失 + 状态不一致

**位置**: `src/services/maintenanceService.js`

**AI 原始输出**: 
1. `createMaintenance` 未使用事务包裹（INSERT + UPDATE 不原子）
2. 已安装部件送修时，状态改为 `under_maintenance` 但安装记录未关闭

**问题**: 
- 若 INSERT 成功但 UPDATE 失败，维修记录存在但部件状态未更新
- `installed` 部件送修后，同时有状态 `under_maintenance` 和活跃安装记录（`removed_at IS NULL`），数据矛盾

**识别方式**: 项目经理验收时发现。

**修正方法**: 
1. 用 `db.withTransaction()` 包裹整个函数
2. `installed` 部件送修时，先 `UPDATE InstallationRecord SET removed_at = NOW() WHERE removed_at IS NULL`

---

### 错误 6：JS Date() 与 MySQL NOW() 时钟偏差

**位置**: `src/services/maintenanceService.js`

**AI 原始输出**:
```sql
INSERT INTO MaintenanceRecord (...) VALUES (?, ..., ?)
```
其中 `started_at` 参数为 `new Date()`（JavaScript 客户端时间）。

**问题**: JS `new Date()` 可能比 MySQL `NOW()` 快几毫秒。维修完成时 `completed_at = NOW()` 可能早于 `started_at`（客户端时间），触发 CHECK 约束 `chk_maintenance_time`。

**识别方式**: 运行测试时报 `Check constraint 'chk_maintenance_time' is violated`。

**修正方法**: 改为 SQL `NOW()` 统一使用数据库服务器时间。

---

### 错误 7：mysql2 参数绑定 undefined 报错

**位置**: `src/services/maintenanceService.js`

**AI 原始输出**:
```javascript
[maintenance_result, notes, id]  // notes 可能为 undefined
```

**问题**: mysql2 拒绝 `undefined` 参数，报 `Bind parameters must not contain undefined`。

**识别方式**: 运行测试时抛异常。

**修正方法**: 改为 `notes || null`，确保未提供的参数为 `null` 而非 `undefined`。

---

## 三、总结

| 统计 | 数量 |
|------|:---:|
| AI 参与环节 | 10 |
| 发现 AI 输出错误 | 7 |
| 严重错误（影响核心功能） | 3（错误1、5、2） |
| 一般错误（编码/语法） | 4（错误3、4、6、7） |
| 由人工代码审查发现 | 4 |
| 由运行时测试发现 | 3 |

**核心教训**: AI 在"看起来正确"的代码（如触发器逻辑、事务边界）上容易产生隐蔽的逻辑错误。这些错误单靠语法检查无法发现，必须通过代码审查和运行时测试来识别。
