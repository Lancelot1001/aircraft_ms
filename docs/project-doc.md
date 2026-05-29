# 航空部件生命周期与维修管理系统 — 项目说明文档

## 一、需求分析

### 1.1 项目背景

在航空运维场景中，部件具有完整生命周期——从入库、安装、拆卸、维修、重新安装到退役，整个过程需要准确记录和追溯。系统围绕飞机、部件、安装记录、维修记录、飞行记录等对象展开。

### 1.2 核心需求

- 支持部件入库、安装、拆卸、更换、维修、退役
- 保留完整历史记录，不允许覆盖或删除旧数据
- 通过数据库层（非仅前端）保证业务规则
- 实现部件完整生命周期追溯

---

## 二、技术选型

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 数据库 | MySQL 8.0 | 课程要求 |
| 后端 | Node.js + Express 5 | 轻量、统一语言 |
| 前端 | EJS 模板 + Chart.js | 不考核界面，够用即可 |
| 版本管理 | Git + GitHub | 协作与交付 |

---

## 三、数据库设计

### 3.1 ER 图

详见 `docs/er-diagram.md`。

### 3.2 8 张核心表

| # | 表名 | 说明 | 主键 |
|---|------|------|------|
| 1 | Operator | 操作人员（安装/维修/审批责任人） | id |
| 2 | Aircraft | 飞机信息 | id |
| 3 | ComponentModel | 部件型号（设计寿命、维修间隔） | id |
| 4 | Component | 部件实例（生命周期核心） | id |
| 5 | InstallationRecord | 安装/拆卸历史（时间区间建模） | id |
| 6 | MaintenanceRecord | 维修记录 | id |
| 7 | FlightLog | 飞行日志 | id |
| 8 | ScrapOrRetirementRecord | 退役记录 | id |

### 3.3 关键设计决策

**时间区间建模（InstallationRecord）**

使用 `installed_at`（区间起点）+ `removed_at`（区间终点）表示安装历史。`removed_at IS NULL` 表示当前仍在安装中。通过生成列 `active_flag` + 唯一约束保证同一部件同一时刻只有一条有效安装。

**MySQL 下实现部分唯一索引**

MySQL 不支持 PostgreSQL 的 partial unique index。本系统通过生成列实现等价功能：

```sql
active_flag INT GENERATED ALWAYS AS (IF(removed_at IS NULL, 1, NULL)) STORED,
UNIQUE (component_id, active_flag)
```

`active_flag = NULL` 的条目不参与唯一约束（InnoDB 允许多个 NULL），因此只有一条活跃安装时 `active_flag = 1` 才触发唯一检查。

---

## 四、完整性约束设计

### 4.1 约束清单

| 类型 | 数量 | 典型示例 |
|------|:---:|----------|
| 主键 (PK) | 8 | 全部自增 |
| 外键 (FK) | 10 | InstallationRecord → Component/Aircraft/Operator |
| 唯一 (UNIQUE) | 5 | 部件编号、飞机编号、型号名、工号、活跃安装 |
| 检查 (CHECK) | 10 | 安装<拆卸、飞行起<降、状态枚举、正数校验 |

### 4.2 触发器（11 个）

| 触发器 | 表/事件 | 功能 |
|--------|----------|------|
| trg_install_check_retired | InstallationRecord / INSERT | 拒绝退役/维修中部件安装 |
| trg_install_check_overlap | InstallationRecord / INSERT | 拒绝重叠安装区间 |
| trg_install_before_update | InstallationRecord / UPDATE | 保证更新时间合理性 |
| trg_no_tamper_install | InstallationRecord / UPDATE | 禁止篡改 component_id/aircraft_id/installed_at |
| trg_no_delete_installation | InstallationRecord / DELETE | 禁止物理删除 |
| trg_maintenance_check | MaintenanceRecord / INSERT | 拒绝退役部件维修 |
| trg_no_delete_maintenance | MaintenanceRecord / DELETE | 禁止物理删除 |
| trg_no_delete_flightlog | FlightLog / DELETE | 禁止物理删除 |
| trg_scrap_check | ScrapOrRetirementRecord / INSERT | 拒绝重复退役 |
| trg_no_delete_scrap | ScrapOrRetirementRecord / DELETE | 禁止物理删除 |
| trg_component_before_update | Component / UPDATE | 退役状态不可逆保护 |

---

## 五、事务设计

### 5.1 事务场景一：部件更换

`installationService.swapComponent()` — `db.withTransaction()`

```
1. 关闭旧部件活跃安装记录 (SET removed_at = NOW())
2. UPDATE 旧部件状态 → available
3. 校验新部件可用性（非退役、非维修中、无活跃安装）
4. 校验飞机和操作人员存在
5. INSERT 新部件安装记录
6. UPDATE 新部件状态 → installed
```

### 5.2 事务场景二：退役处理

`retirementService.retireComponent()` — `db.withTransaction()`

```
1. 校验部件存在且非退役
2. 若 status = installed → 关闭活跃安装记录
3. INSERT ScrapOrRetirementRecord
4. UPDATE Component.status → retired
```

### 5.3 事务场景三：维修完成

`maintenanceService.completeMaintenance()` — `db.withTransaction()`

```
1. 查找维修工单，校验存在且未完成
2. UPDATE 维修结果 + completed_at = NOW()
3. UPDATE Component.status → available
```

---

## 六、业务假设说明

### 6.1 维修模式（宽松模式）

本项目采用**宽松维修模式**：部件状态为 `installed` 或 `available` 均可创建维修记录。

- `installed` 部件送修时，系统自动关闭活跃安装记录（`removal_reason = '送修拆卸'`），然后将状态标记为 `under_maintenance`
- `available` 部件送修时，仅创建工单并标记 `under_maintenance`
- 维修完成后，状态统一恢复为 `available`

### 6.2 退役假设

- 若部件当前处于 `installed` 状态，退役操作会先自动关闭安装记录再标记退役
- 退役后部件不可安装、不可维修、不可重复退役

### 6.3 飞行时长

- 若未提供 `flight_duration`，系统自动根据起降时间计算（应用层计算，单位小时）
- 数据库层仅校验 `flight_duration > 0`

---

## 七、系统架构

```
aircraft_ms/
├── db/          建库脚本 + 种子数据
├── src/
│   ├── app.js         Express 入口
│   ├── config/db.js   连接池 + 事务工具
│   ├── services/      6 个业务服务
│   ├── routes/        7 个路由模块
│   ├── views/         16 个 EJS 模板
│   ├── public/        CSS
│   └── queries/       SQL 参考查询
├── test/              测试脚本
└── docs/              文档
```

### 功能路由

| 路由 | 功能 |
|------|------|
| `/` | 仪表盘（KPI + Chart.js 图表） |
| `/components` | 部件管理（列表/入库/详情） |
| `/installations` | 安装管理（列表/安装/拆卸/更换） |
| `/flightlogs` | 飞行日志（列表/登记/关联查询/统计） |
| `/maintenance` | 维修管理（列表/创建/完成） |
| `/retirements` | 退役管理（列表/退役处理） |
| `/query` | 查询分析（仪表盘/生命周期追溯/统计） |
