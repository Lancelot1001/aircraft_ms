# 集成测试报告 — 航空部件生命周期与维修管理系统

**测试日期**: 2026-05-30  
**测试范围**: 阶段七 集成测试与非法操作拦截演示验证  
**测试环境**: MySQL 8.0.45 / Node.js 22 / Express 5  
**测试结果**: ✅ 29/29 全部通过

---

## 7.1 非法拦截一：退役部件安装

| 测试项 | 预期 | 结果 |
|--------|------|:---:|
| 退役部件(AVI-002)安装 | 数据库拒绝 | ✅ |
| 维修中部件的(APU-002)安装 | 数据库拒绝 | ✅ |

**拦截方式**: 数据库触发器 `trg_install_check_retired` + 应用层预检
**错误信息**: `错误：退役部件不允许安装操作`

---

## 7.2 非法拦截二：重复安装 + 历史篡改

| 测试项 | 预期 | 结果 |
|--------|------|:---:|
| 已安装部件(ENG-001)再次安装 | 数据库拒绝 | ✅ |
| UPDATE 篡改 component_id | 数据库拒绝 | ✅ |
| UPDATE 篡改 installed_at | 数据库拒绝 | ✅ |

**拦截方式**: 
- 重复安装: 触发器 `trg_install_check_overlap` + `uq_active_install` 唯一约束 + 应用层预检
- 篡改历史: 触发器 `trg_no_tamper_install`

---

## 7.3 非法拦截三：物理删除 + 退役后维修

| 测试项 | 预期 | 结果 |
|--------|------|:---:|
| DELETE InstallationRecord | 数据库拒绝 | ✅ |
| DELETE MaintenanceRecord | 数据库拒绝 | ✅ |
| DELETE FlightLog | 数据库拒绝 | ✅ |
| DELETE ScrapOrRetirementRecord | 数据库拒绝 | ✅ |
| 退役部件创建维修 | 数据库拒绝 | ✅ |

**拦截方式**: 
- 删除: 4 个 `trg_no_delete_*` 触发器
- 维修: 触发器 `trg_maintenance_check` + 应用层校验

---

## 7.4 事务回滚验证

| 测试项 | 预期 | 结果 |
|--------|------|:---:|
| 安装不存在部件 → 回滚 | 事务失败，无残留 | ✅ |
| 更换事务中旧部件不存在 → 回滚 | 事务失败，InstallationRecord 行数不变 | ✅ |

**验证方式**: 事务前后 `InstallationRecord` 行数对比：10 → 10（不变）

---

## 7.5 退役事务验证

| 测试项 | 预期 | 结果 |
|--------|------|:---:|
| 安装 ENG-002 → 有活跃记录 | removed_at IS NULL = 1 | ✅ |
| 退役 ENG-002 → 自动关闭安装记录 | removed_at IS NULL = 0 | ✅ |
| 退役后状态标记 | status = 'retired' | ✅ |
| 退役记录写入 | ScrapOrRetirementRecord 新增 | ✅ |

**事务场景二**: 完整走通 `关安装→写退役→标记retired`

---

## 7.6 端到端生命周期

测试部件 `E2E-001` 完整生命周期：

| 步骤 | 操作 | 状态变化 | 结果 |
|------|------|----------|:---:|
| 1 | 部件入库 | → available | ✅ |
| 2 | 安装到 B-3003 | → installed | ✅ |
| 3 | 飞行登记 | B-3003 测试飞行 | ✅ |
| 4 | 拆卸 | → available, 历史保留 | ✅ |
| 5 | 维修登记→完成 | → available | ✅ |
| 6 | 重新安装到 B-3003 | → installed | ✅ |
| 7 | 退役 | → retired, 安装记录关闭 | ✅ |
| 8 | 生命周期追溯 | 2次安装 + 1次维修 | ✅ |

---

## 7.7 数据一致性抽查

| 检查项 | 查询 | 违规数 | 结果 |
|--------|------|:---:|:---:|
| installed 部件有活跃安装 | LEFT JOIN WHERE NULL | 0 | ✅ |
| 安装时间 < 拆卸时间 | removed_at < installed_at | 0 | ✅ |
| 飞行起 < 降 | landing_time ≤ takeoff_time | 0 | ✅ |
| 退役部件无活跃安装 | status=retired AND active install | 0 | ✅ |
| 安装→部件 FK 完整 | LEFT JOIN WHERE NULL | 0 | ✅ |

---

## 交付物

| 文件 | 说明 |
|------|------|
| `test/test_scenarios.sql` | SQL 级非法操作拦截测试用例（含预期报错注释） |
| `test/run_tests.js` | Node.js 综合测试脚本（29 个测试用例） |
| `docs/test_report.md` | 本测试报告 |

## 总结

**通过率**: 29/29 (100%)  
**覆盖**: 3 类非法拦截 + 2 个事务回滚 + 端到端生命周期 + 5 项数据一致性检查  
**结论**: 系统所有业务规则、触发器和事务均按预期工作，无数据漏洞。
