-- ============================================================
-- 生命周期追溯查询（功能七核心）
-- 给定部件编号，一次性输出完整生命周期
-- ============================================================

-- 示例：追溯部件 ENG-001 的完整生命周期
SET @target_sn = 'ENG-001';

SELECT '--- 基本属性 ---' AS section;
SELECT c.id, c.component_sn, cm.model_name, cm.category,
       c.batch_number, c.production_date,
       cm.design_life_hours, cm.maintenance_interval_hours,
       c.cumulative_hours, c.status, c.notes
FROM Component c
JOIN ComponentModel cm ON c.model_id = cm.id
WHERE c.component_sn = @target_sn;

SELECT '--- 安装历史 ---' AS section;
SELECT ir.installed_at, ir.removed_at, ir.position,
       ir.install_reason, ir.removal_reason,
       a.aircraft_sn, a.model AS aircraft_model,
       CASE WHEN ir.removed_at IS NULL THEN '当前在位' ELSE '已拆卸' END AS current_status
FROM InstallationRecord ir
JOIN Aircraft a ON ir.aircraft_id = a.id
JOIN Component c ON ir.component_id = c.id
WHERE c.component_sn = @target_sn
ORDER BY ir.installed_at ASC;

SELECT '--- 维修记录 ---' AS section;
SELECT mr.maintenance_type, mr.started_at, mr.completed_at,
       mr.maintenance_result, mr.notes
FROM MaintenanceRecord mr
JOIN Component c ON mr.component_id = c.id
WHERE c.component_sn = @target_sn
ORDER BY mr.started_at ASC;

SELECT '--- 退役情况 ---' AS section;
SELECT srr.retired_at, srr.reason, srr.approval_info
FROM ScrapOrRetirementRecord srr
JOIN Component c ON srr.component_id = c.id
WHERE c.component_sn = @target_sn;
