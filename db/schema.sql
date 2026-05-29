-- ============================================================
-- 航空部件生命周期与维修管理系统 — 数据库建库脚本
-- 目标数据库：MySQL 8.0+
-- 说明：包含 8 张核心表、主键/外键/唯一/检查约束、触发器
-- ============================================================

-- 创建数据库（如尚未创建）
-- CREATE DATABASE IF NOT EXISTS aircraft_ms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aircraft_ms;

-- 关闭外键检查以便批量执行
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. Operator — 操作人员表
-- ============================================================
DROP TABLE IF EXISTS Operator;
CREATE TABLE Operator (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    operator_code VARCHAR(20)  NOT NULL,
    name        VARCHAR(50)    NOT NULL,
    role        VARCHAR(20)    NOT NULL COMMENT '角色: technician/engineer/approver',
    notes       VARCHAR(200)   DEFAULT NULL,
    CONSTRAINT uq_operator_code UNIQUE (operator_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='操作人员表 — 记录安装、维修、退役等操作的责任主体';

-- ============================================================
-- 2. Aircraft — 飞机表
-- ============================================================
DROP TABLE IF EXISTS Aircraft;
CREATE TABLE Aircraft (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    aircraft_sn VARCHAR(20)  NOT NULL COMMENT '飞机编号',
    model       VARCHAR(50)  NOT NULL COMMENT '型号',
    status      VARCHAR(20)  NOT NULL DEFAULT 'active' COMMENT '服役状态: active/maintenance/retired',
    entry_date  DATE         NOT NULL COMMENT '启用日期',
    notes       VARCHAR(200) DEFAULT NULL,
    CONSTRAINT uq_aircraft_sn UNIQUE (aircraft_sn),
    CONSTRAINT chk_aircraft_status CHECK (status IN ('active', 'maintenance', 'retired'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='飞机信息表';

-- ============================================================
-- 3. ComponentModel — 部件型号表
-- ============================================================
DROP TABLE IF EXISTS ComponentModel;
CREATE TABLE ComponentModel (
    id                       INT AUTO_INCREMENT PRIMARY KEY,
    model_name               VARCHAR(50)  NOT NULL COMMENT '型号名称',
    category                 VARCHAR(30)  NOT NULL COMMENT '类别: engine/landing_gear/avionics/apu/hydraulic',
    design_life_hours        INT          NOT NULL COMMENT '设计寿命（小时）',
    maintenance_interval_hours INT         NOT NULL COMMENT '建议维修间隔（小时）',
    applicable_aircraft      VARCHAR(200) NOT NULL COMMENT '适用机型',
    notes                    VARCHAR(200) DEFAULT NULL,
    CONSTRAINT uq_model_name UNIQUE (model_name),
    CONSTRAINT chk_category CHECK (category IN ('engine', 'landing_gear', 'avionics', 'apu', 'hydraulic', 'fuel_system', 'flight_control', 'other')),
    CONSTRAINT chk_design_life CHECK (design_life_hours > 0),
    CONSTRAINT chk_maintenance_interval CHECK (maintenance_interval_hours > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='部件型号表 — 记录部件型号、设计寿命、适用机型等';

-- ============================================================
-- 4. Component — 部件实例表（生命周期核心表）
-- ============================================================
DROP TABLE IF EXISTS Component;
CREATE TABLE Component (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    component_sn    VARCHAR(30)  NOT NULL COMMENT '部件编号',
    model_id        INT          NOT NULL COMMENT 'FK → ComponentModel',
    batch_number    VARCHAR(30)  NOT NULL COMMENT '批次号',
    production_date DATE         NOT NULL COMMENT '生产日期',
    status          VARCHAR(20)  NOT NULL DEFAULT 'available' COMMENT '状态: available/installed/under_maintenance/retired',
    cumulative_hours DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '累计使用时长（小时）',
    notes           VARCHAR(200) DEFAULT NULL,
    CONSTRAINT uq_component_sn UNIQUE (component_sn),
    CONSTRAINT fk_component_model FOREIGN KEY (model_id) REFERENCES ComponentModel(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_component_status CHECK (status IN ('available', 'installed', 'under_maintenance', 'retired')),
    CONSTRAINT chk_cumulative_hours CHECK (cumulative_hours >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='部件实例表 — 生命周期核心表，记录每个具体部件的状态和历史';

-- ============================================================
-- 5. InstallationRecord — 安装/拆卸历史表（时间区间建模）
-- ============================================================
DROP TABLE IF EXISTS InstallationRecord;
CREATE TABLE InstallationRecord (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    component_id    INT          NOT NULL COMMENT 'FK → Component',
    aircraft_id     INT          NOT NULL COMMENT 'FK → Aircraft',
    operator_id     INT          NOT NULL COMMENT 'FK → Operator（安装人员）',
    installed_at    DATETIME     NOT NULL COMMENT '安装时间（区间起点）',
    removed_at      DATETIME     DEFAULT NULL COMMENT '拆卸时间（区间终点，NULL=当前仍有效）',
    position        VARCHAR(50)  NOT NULL COMMENT '安装位置',
    install_reason  VARCHAR(100) NOT NULL COMMENT '安装原因',
    removal_reason  VARCHAR(100) DEFAULT NULL COMMENT '拆卸原因',
    notes           VARCHAR(200) DEFAULT NULL,
    -- 计算列：用于唯一约束（active_flag=1时唯一，NULL允许重复）
    active_flag     INT GENERATED ALWAYS AS (IF(removed_at IS NULL, 1, NULL)) STORED,
    CONSTRAINT fk_install_component FOREIGN KEY (component_id) REFERENCES Component(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_install_aircraft FOREIGN KEY (aircraft_id) REFERENCES Aircraft(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_install_operator FOREIGN KEY (operator_id) REFERENCES Operator(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT uq_active_install UNIQUE (component_id, active_flag),
    CONSTRAINT chk_install_time CHECK (removed_at IS NULL OR removed_at > installed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='安装记录表 — 时间区间建模，保留完整安装/拆卸历史';

-- ============================================================
-- 6. MaintenanceRecord — 维修记录表
-- ============================================================
DROP TABLE IF EXISTS MaintenanceRecord;
CREATE TABLE MaintenanceRecord (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    component_id        INT          NOT NULL COMMENT 'FK → Component',
    operator_id         INT          NOT NULL COMMENT 'FK → Operator（维修人员）',
    maintenance_type    VARCHAR(30)  NOT NULL COMMENT '维修类型: routine/repair/overhaul/inspection',
    started_at          DATETIME     NOT NULL COMMENT '送修时间',
    completed_at        DATETIME     DEFAULT NULL COMMENT '完成时间（NULL=维修中）',
    maintenance_result  VARCHAR(30)  DEFAULT NULL COMMENT '维修结论: 修复完成/需更换/报废/待观察',
    notes               VARCHAR(200) DEFAULT NULL,
    CONSTRAINT fk_maintenance_component FOREIGN KEY (component_id) REFERENCES Component(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_maintenance_operator FOREIGN KEY (operator_id) REFERENCES Operator(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_maintenance_type CHECK (maintenance_type IN ('routine', 'repair', 'overhaul', 'inspection')),
    CONSTRAINT chk_maintenance_time CHECK (completed_at IS NULL OR completed_at >= started_at),
    CONSTRAINT chk_maintenance_result CHECK (maintenance_result IS NULL OR maintenance_result = '修复完成' OR maintenance_result = '需更换' OR maintenance_result = '报废' OR maintenance_result = '待观察')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='维修记录表 — 记录部件的维修工单和结果';

-- ============================================================
-- 7. FlightLog — 飞行记录表
-- ============================================================
DROP TABLE IF EXISTS FlightLog;
CREATE TABLE FlightLog (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    aircraft_id     INT          NOT NULL COMMENT 'FK → Aircraft',
    takeoff_time    DATETIME     NOT NULL COMMENT '起飞时间',
    landing_time    DATETIME     NOT NULL COMMENT '降落时间',
    flight_duration DECIMAL(8,2) NOT NULL COMMENT '飞行时长（小时）— 数据库层仅校验 >0，与 TIMESTAMPDIFF 的一致性由应用层保证',
    mission_type    VARCHAR(30)  NOT NULL COMMENT '任务类型: passenger/cargo/test/training/patrol',
    notes           VARCHAR(200) DEFAULT NULL,
    CONSTRAINT fk_flight_aircraft FOREIGN KEY (aircraft_id) REFERENCES Aircraft(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_flight_time CHECK (landing_time > takeoff_time),
    CONSTRAINT chk_flight_duration CHECK (flight_duration > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='飞行记录表 — 记录飞机飞行任务';

-- ============================================================
-- 8. ScrapOrRetirementRecord — 退役记录表
-- ============================================================
DROP TABLE IF EXISTS ScrapOrRetirementRecord;
CREATE TABLE ScrapOrRetirementRecord (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    component_id    INT          NOT NULL COMMENT 'FK → Component',
    operator_id     INT          NOT NULL COMMENT 'FK → Operator（审批人员）',
    retired_at      DATETIME     NOT NULL COMMENT '退役时间',
    reason          VARCHAR(100) NOT NULL COMMENT '退役原因: 寿命到期/不可修复损坏/技术淘汰/其他',
    approval_info   VARCHAR(200) NOT NULL COMMENT '审批信息',
    notes           VARCHAR(200) DEFAULT NULL,
    CONSTRAINT fk_scrap_component FOREIGN KEY (component_id) REFERENCES Component(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_scrap_operator FOREIGN KEY (operator_id) REFERENCES Operator(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    -- 退役原因使用 CHECK (··· OR ···) 而非 ENUM：ENUM 新增值需 ALTER TABLE，
    -- 此处约定了 4 种；如需扩展，直接 ALTER TABLE 追加 OR 分支即可。
    CONSTRAINT chk_scrap_reason CHECK (reason = '寿命到期' OR reason = '不可修复损坏' OR reason = '技术淘汰' OR reason = '其他')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='退役记录表 — 记录部件退役原因和审批信息';

-- 恢复外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 触发器：数据库层业务规则拦截
-- ============================================================

DELIMITER $$

-- -------------------------------------------------------
-- 触发器 1：安装前检查 — 拒绝退役部件安装
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_install_check_retired$$
CREATE TRIGGER trg_install_check_retired
BEFORE INSERT ON InstallationRecord
FOR EACH ROW
BEGIN
    DECLARE comp_status VARCHAR(20);
    SELECT status INTO comp_status FROM Component WHERE id = NEW.component_id;

    -- 退役部件不可安装
    IF comp_status = 'retired' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '错误：退役部件不允许安装操作。';
    END IF;

    -- 维修中的部件不可安装
    IF comp_status = 'under_maintenance' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '错误：维修中的部件不允许安装，请等待维修完成。';
    END IF;
END$$

-- -------------------------------------------------------
-- 触发器 2：安装前检查 — 拒绝重叠安装区间
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_install_check_overlap$$
CREATE TRIGGER trg_install_check_overlap
BEFORE INSERT ON InstallationRecord
FOR EACH ROW
BEGIN
    -- 检查是否存在与新区间重叠的已有记录
    -- 通用公式：两个时间区间 [A.installed_at, A.removed_at) 和 [B.installed_at, B.removed_at)
    -- 重叠 ⇔ A.installed_at < B.removed_at  AND  B.installed_at < A.removed_at
    -- 其中 NULL removed_at 表示"至今"，以 COALESCE(removed_at, '9999-12-31 23:59:59') 参与比较
    IF EXISTS (
        SELECT 1 FROM InstallationRecord
        WHERE component_id = NEW.component_id
          AND installed_at < COALESCE(NEW.removed_at, '9999-12-31 23:59:59')
          AND COALESCE(removed_at, '9999-12-31 23:59:59') > NEW.installed_at
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '错误：该部件存在重叠的安装时间区间，请检查已有安装记录。';
    END IF;
END$$

-- -------------------------------------------------------
-- 触发器 3：更新安装记录时检查 — 不允许向过去修改
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_install_before_update$$
CREATE TRIGGER trg_install_before_update
BEFORE UPDATE ON InstallationRecord
FOR EACH ROW
BEGIN
    -- 不允许修改 installed_at 使其晚于一个已设置的 removed_at
    IF NEW.removed_at IS NOT NULL AND NEW.installed_at >= NEW.removed_at THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '错误：安装时间必须早于拆卸时间。';
    END IF;

    -- 如果设置 removed_at（关闭记录），检查是否与已有历史记录重叠
    -- （通常关闭记录不会产生重叠，但做安全校验）
    IF NEW.removed_at IS NOT NULL AND OLD.removed_at IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM InstallationRecord
            WHERE component_id = NEW.component_id
              AND id != NEW.id
              AND installed_at < COALESCE(NEW.removed_at, '9999-12-31 23:59:59')
              AND COALESCE(removed_at, '9999-12-31 23:59:59') > NEW.installed_at
        ) THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = '错误：关闭此安装记录会导致与其他记录的时间区间重叠。';
        END IF;
    END IF;
END$$

-- -------------------------------------------------------
-- 触发器 4：维修记录插入前 — 检查部件未退役
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_maintenance_check$$
CREATE TRIGGER trg_maintenance_check
BEFORE INSERT ON MaintenanceRecord
FOR EACH ROW
BEGIN
    DECLARE comp_status VARCHAR(20);
    SELECT status INTO comp_status FROM Component WHERE id = NEW.component_id;

    IF comp_status = 'retired' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '错误：退役部件不允许创建新的维修记录。';
    END IF;
END$$

-- -------------------------------------------------------
-- 触发器 5：退役记录插入前 — 检查部件未重复退役
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_scrap_check$$
CREATE TRIGGER trg_scrap_check
BEFORE INSERT ON ScrapOrRetirementRecord
FOR EACH ROW
BEGIN
    DECLARE comp_status VARCHAR(20);
    SELECT status INTO comp_status FROM Component WHERE id = NEW.component_id;

    IF comp_status = 'retired' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '错误：该部件已经退役，不可重复执行退役操作。';
    END IF;
END$$

-- -------------------------------------------------------
-- 触发器 6：部件状态更新前 — 退役状态的不可逆保护
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_component_before_update$$
CREATE TRIGGER trg_component_before_update
BEFORE UPDATE ON Component
FOR EACH ROW
BEGIN
    -- 退役状态不可逆
    IF OLD.status = 'retired' AND NEW.status != 'retired' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = '错误：退役状态不可逆，已退役的部件无法恢复为其他状态。';
    END IF;
END$$

DELIMITER ;

-- ============================================================
-- 索引：优化常见查询
-- ============================================================

-- 部件查询索引
CREATE INDEX idx_component_status ON Component(status);
CREATE INDEX idx_component_model ON Component(model_id);

-- 安装记录查询索引
CREATE INDEX idx_install_aircraft ON InstallationRecord(aircraft_id);
CREATE INDEX idx_install_operator ON InstallationRecord(operator_id);
CREATE INDEX idx_install_time ON InstallationRecord(installed_at);

-- 维修记录查询索引
CREATE INDEX idx_maintenance_component ON MaintenanceRecord(component_id);
CREATE INDEX idx_maintenance_operator ON MaintenanceRecord(operator_id);
CREATE INDEX idx_maintenance_time ON MaintenanceRecord(started_at);

-- 飞行日志查询索引
CREATE INDEX idx_flight_aircraft ON FlightLog(aircraft_id);
CREATE INDEX idx_flight_time ON FlightLog(takeoff_time);

-- 退役记录查询索引
CREATE INDEX idx_scrap_component ON ScrapOrRetirementRecord(component_id);

-- ============================================================
-- 视图：便于生命周期追溯
-- ============================================================

-- 当前安装视图（哪些部件当前安装在哪些飞机上）
CREATE OR REPLACE VIEW v_current_installations AS
SELECT
    ir.id,
    c.component_sn,
    cm.model_name AS component_model,
    a.aircraft_sn,
    a.model AS aircraft_model,
    ir.position,
    ir.installed_at,
    DATEDIFF(NOW(), ir.installed_at) AS days_since_install
FROM InstallationRecord ir
JOIN Component c ON ir.component_id = c.id
JOIN ComponentModel cm ON c.model_id = cm.id
JOIN Aircraft a ON ir.aircraft_id = a.id
WHERE ir.removed_at IS NULL;

-- 部件生命周期摘要视图
CREATE OR REPLACE VIEW v_component_lifecycle AS
SELECT
    c.id,
    c.component_sn,
    cm.model_name,
    cm.category,
    c.status,
    c.cumulative_hours,
    c.batch_number,
    c.production_date,
    (SELECT COUNT(*) FROM InstallationRecord WHERE component_id = c.id) AS total_installations,
    (SELECT COUNT(*) FROM MaintenanceRecord WHERE component_id = c.id) AS total_maintenances,
    (SELECT COUNT(*) FROM ScrapOrRetirementRecord WHERE component_id = c.id) AS is_retired
FROM Component c
JOIN ComponentModel cm ON c.model_id = cm.id;

-- ============================================================
-- 执行完毕
-- ============================================================
