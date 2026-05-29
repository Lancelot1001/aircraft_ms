-- ============================================================
-- 高级统计查询
-- ============================================================

-- 查询一：某型号部件平均维修间隔（MTBM）
-- 使用窗口函数 LEAD 计算同一部件两次维修之间的天数间隔
WITH maintenance_gaps AS (
  SELECT
    cm.model_name, cm.category,
    mr.component_id,
    DATEDIFF(
      LEAD(mr.started_at) OVER (PARTITION BY mr.component_id ORDER BY mr.started_at),
      mr.started_at
    ) AS gap_days
  FROM MaintenanceRecord mr
  JOIN Component c ON mr.component_id = c.id
  JOIN ComponentModel cm ON c.model_id = cm.id
)
SELECT model_name, category,
       ROUND(AVG(gap_days), 1) AS avg_mtbm_days,
       COUNT(*) AS sample_count
FROM maintenance_gaps
WHERE gap_days IS NOT NULL AND gap_days > 0
GROUP BY model_name, category
ORDER BY avg_mtbm_days DESC;


-- 查询二：飞机部件更换频率排行
SELECT a.aircraft_sn, a.model AS aircraft_model,
       COUNT(DISTINCT ir.id) AS total_replacements
FROM InstallationRecord ir
JOIN Aircraft a ON ir.aircraft_id = a.id
WHERE ir.removal_reason LIKE '%更换%'
   OR ir.install_reason LIKE '%更换%'
GROUP BY a.id, a.aircraft_sn, a.model
ORDER BY total_replacements DESC;


-- 查询三：退役原因分布
SELECT reason, COUNT(*) AS count,
       ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM ScrapOrRetirementRecord), 1) AS percentage
FROM ScrapOrRetirementRecord
GROUP BY reason
ORDER BY count DESC;


-- 查询四（加分）：当前各飞机部件安装概况
SELECT a.aircraft_sn, a.model AS aircraft_model,
       COUNT(DISTINCT ir.component_id) AS installed_parts,
       COUNT(DISTINCT CASE WHEN c.status = 'installed' THEN c.id END) AS active_parts,
       GROUP_CONCAT(CONCAT(c.component_sn, '(', cm.model_name, ')') SEPARATOR ', ') AS parts_detail
FROM Aircraft a
LEFT JOIN InstallationRecord ir ON ir.aircraft_id = a.id AND ir.removed_at IS NULL
LEFT JOIN Component c ON ir.component_id = c.id
LEFT JOIN ComponentModel cm ON c.model_id = cm.id
GROUP BY a.id, a.aircraft_sn, a.model
HAVING installed_parts > 0
ORDER BY installed_parts DESC;
