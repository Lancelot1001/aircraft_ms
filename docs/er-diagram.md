# ER 图 — 航空部件生命周期与维修管理系统

## 实体关系总览

```
┌──────────────┐       ┌──────────────────┐       ┌─────────────────────┐
│   Operator   │       │    Aircraft      │       │   ComponentModel    │
│──────────────│       │──────────────────│       │─────────────────────│
│ id (PK)      │       │ id (PK)          │       │ id (PK)             │
│ operator_code│       │ aircraft_sn (UQ)  │       │ model_name (UQ)     │
│ name         │       │ model             │       │ category            │
│ role         │       │ status            │       │ design_life_hours   │
│ notes        │       │ entry_date        │       │ maintenance_interval│
└──────┬───────┘       │ notes             │       │ applicable_aircraft │
       │               └────────┬──────────┘       │ notes               │
       │                        │                  └──────────┬──────────┘
       │    ┌───────────────────┼─────────────┐              │
       │    │                   │             │              │
       │    │          ┌────────┴────────┐    │              │
       │    │          │                 │    │              │
       ▼    ▼          ▼                 ▼    │              ▼
┌───────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
│ScrapOrRetirement  │  │ InstallationRecord   │  │     Component      │
│    Record         │  │──────────────────────│  │────────────────────│
│───────────────────│  │ id (PK)              │  │ id (PK)            │
│ id (PK)           │  │ component_id (FK)    │──│ component_sn (UQ)  │
│ component_id (FK) │──│ aircraft_id (FK)     │  │ model_id (FK)      │
│ operator_id (FK)  │  │ operator_id (FK)     │  │ batch_number       │
│ retired_at        │  │ installed_at         │  │ production_date    │
│ reason            │  │ removed_at           │  │ status             │
│ approval_info     │  │ position             │  │ cumulative_hours   │
│ notes             │  │ install_reason       │  │ notes              │
└───────────────────┘  │ removal_reason       │  └────────┬───────────┘
                       │ active_flag (GC)     │           │
                       │ notes                │           │
                       └──────────────────────┘           │
                                              ┌───────────┘
                                              │
                                              ▼
                                  ┌──────────────────────┐
                                  │ MaintenanceRecord    │
                                  │──────────────────────│
                                  │ id (PK)              │
                                  │ component_id (FK)    │
                                  │ operator_id (FK)     │
                                  │ maintenance_type     │
                                  │ started_at           │
                                  │ completed_at         │
                                  │ maintenance_result   │
                                  │ notes                │
                                  └──────────────────────┘

                     ┌──────────────────────┐
                     │     FlightLog        │
                     │──────────────────────│
                     │ id (PK)              │
                     │ aircraft_id (FK)     │──┐
                     │ takeoff_time         │  │ (aircraft_id → Aircraft.id)
                     │ landing_time         │  │
                     │ flight_duration      │  │
                     │ mission_type         │  │
                     │ notes                │  │
                     └──────────────────────┘  │
                                               │
                                               ▼
                                       ┌──────────────┐
                                       │   Aircraft   │
                                       │ (如上)        │
                                       └──────────────┘
```

## 8 张核心表

| # | 表名 | 说明 | 主键 | 外键关系 |
|---|------|------|------|----------|
| 1 | Operator | 操作人员 | id (自增) | — |
| 2 | Aircraft | 飞机信息 | id (自增) | — |
| 3 | ComponentModel | 部件型号 | id (自增) | — |
| 4 | Component | 部件实例 | id (自增) | model_id → ComponentModel.id |
| 5 | InstallationRecord | 安装/拆卸历史 | id (自增) | component_id → Component.id; aircraft_id → Aircraft.id; operator_id → Operator.id |
| 6 | MaintenanceRecord | 维修记录 | id (自增) | component_id → Component.id; operator_id → Operator.id |
| 7 | FlightLog | 飞行日志 | id (自增) | aircraft_id → Aircraft.id |
| 8 | ScrapOrRetirementRecord | 退役记录 | id (自增) | component_id → Component.id; operator_id → Operator.id |

## 实体关系说明

### Component（部件）— 生命周期核心实体

部件实例是系统核心实体，贯穿整个数据模型：

- **1 个部件型号 → N 个部件实例**：ComponentModel.id ← Component.model_id
- **1 个部件实例 → N 条安装记录**：Component.id ← InstallationRecord.component_id（历史保留）
- **1 个部件实例 → N 条维修记录**：Component.id ← MaintenanceRecord.component_id
- **1 个部件实例 → 0 或 1 条退役记录**：Component.id ← ScrapOrRetirementRecord.component_id

### InstallationRecord（安装记录）— 时间区间建模

- 每条记录通过 `installed_at`（起点）和 `removed_at`（终点）定义一个时间区间
- `removed_at IS NULL` 表示当前仍在安装中
- 通过 `unique(component_id, active_flag)` 约束保证同一部件同一时刻只有一条有效安装
- `active_flag` 是生成列：`removed_at IS NULL → 1`，否则 `NULL`

### 操作人员关联

- Operator 表出现在 InstallationRecord、MaintenanceRecord、ScrapOrRetirementRecord 三张表中
- 分别记录安装/拆卸操作员、维修工程师、退役审批人

## 约束清单

| 约束类型 | 表 | 约束名 | 说明 |
|----------|-----|--------|------|
| 主键 | 全部 8 表 | PRIMARY KEY | 自增主键 |
| 唯一 | Operator | uq_operator_code | 工号唯一 |
| 唯一 | Aircraft | uq_aircraft_sn | 飞机编号唯一 |
| 唯一 | ComponentModel | uq_model_name | 型号名称唯一 |
| 唯一 | Component | uq_component_sn | 部件编号唯一 |
| 唯一（条件） | InstallationRecord | uq_active_install | (component_id, active_flag) 唯一 — 同一部件最多一条活跃安装 |
| 外键 | Component | fk_component_model | model_id → ComponentModel.id |
| 外键 | InstallationRecord | fk_install_component | component_id → Component.id |
| 外键 | InstallationRecord | fk_install_aircraft | aircraft_id → Aircraft.id |
| 外键 | InstallationRecord | fk_install_operator | operator_id → Operator.id |
| 外键 | MaintenanceRecord | fk_maintenance_component | component_id → Component.id |
| 外键 | MaintenanceRecord | fk_maintenance_operator | operator_id → Operator.id |
| 外键 | FlightLog | fk_flight_aircraft | aircraft_id → Aircraft.id |
| 外键 | ScrapOrRetirementRecord | fk_scrap_component | component_id → Component.id |
| 外键 | ScrapOrRetirementRecord | fk_scrap_operator | operator_id → Operator.id |
| CHECK | Aircraft | chk_aircraft_status | status IN ('active','maintenance','retired') |
| CHECK | ComponentModel | chk_category | category IN (8类) |
| CHECK | ComponentModel | chk_design_life | design_life_hours > 0 |
| CHECK | ComponentModel | chk_maintenance_interval | maintenance_interval_hours > 0 |
| CHECK | Component | chk_component_status | status IN ('available','installed','under_maintenance','retired') |
| CHECK | Component | chk_cumulative_hours | cumulative_hours >= 0 |
| CHECK | InstallationRecord | chk_install_time | removed_at IS NULL OR removed_at > installed_at |
| CHECK | MaintenanceRecord | chk_maintenance_time | completed_at IS NULL OR completed_at >= started_at |
| CHECK | FlightLog | chk_flight_time | landing_time > takeoff_time |
| CHECK | FlightLog | chk_flight_duration | flight_duration > 0 |
| CHECK | ScrapOrRetirementRecord | chk_scrap_reason | reason ∈ {寿命到期, 不可修复损坏, 技术淘汰, 其他} |

## 触发器清单

| 触发器 | 触发时机 | 功能 |
|--------|----------|------|
| trg_install_check_retired | BEFORE INSERT ON InstallationRecord | 拒绝退役/维修中部件的安装操作 |
| trg_install_check_overlap | BEFORE INSERT ON InstallationRecord | 拒绝与已有记录时间区间重叠的安装 |
| trg_install_before_update | BEFORE UPDATE ON InstallationRecord | 保证更新时间区间的合理性 |
| trg_maintenance_check | BEFORE INSERT ON MaintenanceRecord | 拒绝为退役部件创建维修记录 |
| trg_scrap_check | BEFORE INSERT ON ScrapOrRetirementRecord | 拒绝重复退役 |
| trg_component_before_update | BEFORE UPDATE ON Component | 退役状态不可逆保护 |

## 视图

| 视图 | 说明 |
|------|------|
| v_current_installations | 当前各飞机上安装的部件一览（含型号、位置、安装天数） |
| v_component_lifecycle | 部件生命周期摘要（含安装次数、维修次数、是否退役） |
