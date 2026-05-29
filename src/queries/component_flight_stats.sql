-- ============================================================
-- 部件飞行统计查询（独立 SQL 参考）
-- ============================================================

-- 查询一：某段时间内某飞机上安装的所有部件
-- 核心逻辑：飞行时间区间与安装时间区间交集判断
SELECT DISTINCT c.id, c.component_sn, cm.model_name, cm.category,
       ir.installed_at, ir.removed_at, ir.position
FROM InstallationRecord ir
JOIN Component c ON ir.component_id = c.id
JOIN ComponentModel cm ON c.model_id = cm.id
WHERE ir.aircraft_id = 1                          -- 指定飞机
  AND ir.installed_at < '2026-04-15 12:00:00'     -- 飞行降落时间（区间终点）
  AND (ir.removed_at IS NULL OR ir.removed_at > '2026-04-01 07:00:00') -- 飞行起飞时间（区间起点）
ORDER BY c.component_sn;


-- 查询二：部件飞行统计
-- 统计某部件在所有安装期间经历的飞行次数和累计飞行时长
SELECT
  c.id, c.component_sn, cm.model_name,
  COUNT(DISTINCT fl.id) AS total_flights,
  COALESCE(SUM(fl.flight_duration), 0) AS total_flight_hours,
  COUNT(DISTINCT ir.id) AS total_installations
FROM Component c
JOIN ComponentModel cm ON c.model_id = cm.id
LEFT JOIN InstallationRecord ir ON ir.component_id = c.id
LEFT JOIN FlightLog fl ON fl.aircraft_id = ir.aircraft_id
  AND fl.takeoff_time >= ir.installed_at
  AND fl.takeoff_time < COALESCE(ir.removed_at, '9999-12-31 23:59:59')
WHERE c.id = 1    -- 指定部件
GROUP BY c.id, c.component_sn, cm.model_name;


-- 查询三：某飞机当前在位部件列表
SELECT c.id, c.component_sn, cm.model_name, cm.category,
       ir.installed_at, ir.position,
       DATEDIFF(NOW(), ir.installed_at) AS days_installed
FROM InstallationRecord ir
JOIN Component c ON ir.component_id = c.id
JOIN ComponentModel cm ON c.model_id = cm.id
WHERE ir.aircraft_id = 1
  AND ir.removed_at IS NULL
ORDER BY ir.installed_at;
