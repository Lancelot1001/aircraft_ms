-- ============================================================
-- 集成测试用例 — 非法操作拦截 + 事务回滚验证
-- ============================================================
USE aircraft_ms;

-- -------------------------------------------------------
-- 测试一：退役部件安装（应被拒绝）
-- -------------------------------------------------------
-- AVI-002 已退役
INSERT INTO InstallationRecord (component_id, aircraft_id, operator_id, installed_at, position, install_reason)
VALUES (8, 1, 1, NOW(), 'test', '退役部件安装测试');
-- 预期：ERROR 1644 - 退役部件不允许安装操作

-- -------------------------------------------------------
-- 测试二：已安装部件重复安装（应被拒绝）
-- -------------------------------------------------------
-- ENG-001 当前安装在 B-1001
INSERT INTO InstallationRecord (component_id, aircraft_id, operator_id, installed_at, position, install_reason)
VALUES (1, 2, 1, NOW(), 'test', '重复安装测试');
-- 预期：ERROR 1062 - Duplicate entry (uq_active_install)

-- -------------------------------------------------------
-- 测试三：DELETE 核心数据（应被拒绝）
-- -------------------------------------------------------
DELETE FROM InstallationRecord WHERE id = 1;
-- 预期：ERROR 1644 - 禁止物理删除安装记录

DELETE FROM MaintenanceRecord WHERE id = 1;
-- 预期：ERROR 1644 - 禁止物理删除维修记录

DELETE FROM FlightLog WHERE id = 1;
-- 预期：ERROR 1644 - 禁止物理删除飞行日志

DELETE FROM ScrapOrRetirementRecord WHERE id = 1;
-- 预期：ERROR 1644 - 禁止物理删除退役记录

-- -------------------------------------------------------
-- 测试四：篡改安装历史（应被拒绝）
-- -------------------------------------------------------
UPDATE InstallationRecord SET component_id = 999 WHERE id = 1;
-- 预期：ERROR 1644 - 禁止篡改安装记录

UPDATE InstallationRecord SET installed_at = '2000-01-01' WHERE id = 1;
-- 预期：ERROR 1644 - 禁止篡改安装记录

-- -------------------------------------------------------
-- 测试五：退役后创建维修（应被拒绝）
-- -------------------------------------------------------
INSERT INTO MaintenanceRecord (component_id, operator_id, maintenance_type, started_at)
VALUES (8, 2, 'routine', NOW());
-- 预期：ERROR 1644 - 退役部件不允许创建新的维修记录

-- -------------------------------------------------------
-- 测试六：退役后重复退役（应被拒绝）
-- -------------------------------------------------------
INSERT INTO ScrapOrRetirementRecord (component_id, operator_id, retired_at, reason, approval_info)
VALUES (8, 3, NOW(), '技术淘汰', 'test');
-- 预期：ERROR 1644 - 该部件已经退役
