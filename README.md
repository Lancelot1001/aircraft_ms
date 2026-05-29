# 航空部件生命周期与维修管理系统

数据库课程大作业。围绕飞机、部件、安装记录、维修记录、飞行记录构建完整的部件生命周期管理。

## 快速开始

### 环境要求
- MySQL 8.0+
- Node.js 18+

### 安装与运行

```bash
# 1. 创建数据库并导入建库脚本
mysql -u root -p --default-character-set=utf8mb4 -e "CREATE DATABASE aircraft_ms CHARACTER SET utf8mb4"
mysql -u root -p --default-character-set=utf8mb4 aircraft_ms < db/schema.sql
mysql -u root -p --default-character-set=utf8mb4 aircraft_ms < db/seed.sql

# 2. 配置数据库连接
# 编辑 src/config/db.js，修改 host/user/password

# 3. 启动应用
npm install
npm start

# 4. 访问 http://localhost:3000
```

## 项目结构

```
├── db/                     # 数据库脚本
│   ├── schema.sql          # 建库脚本（8表+11触发器+2视图）
│   └── seed.sql            # 初始测试数据
├── src/
│   ├── app.js              # Express 入口
│   ├── config/db.js        # MySQL 连接池 + 事务工具
│   ├── services/           # 业务逻辑层
│   │   ├── componentService.js
│   │   ├── installationService.js
│   │   ├── maintenanceService.js
│   │   ├── retirementService.js
│   │   ├── flightLogService.js
│   │   └── queryService.js
│   ├── routes/             # 路由层
│   ├── views/              # EJS 模板（16 页）
│   ├── public/             # 静态资源
│   └── queries/            # 参考 SQL 查询
├── test/                   # 测试
│   ├── run_tests.js        # 集成测试（29 项）
│   └── test_scenarios.sql  # SQL 测试用例
└── docs/                   # 文档
    ├── project-doc.md      # 项目说明
    ├── er-diagram.md       # ER 图
    ├── ai-audit-report.md  # AI 审计报告
    └── test_report.md      # 测试报告
```

## 核心功能

- 部件入库 / 安装 / 拆卸 / 更换（事务场景一）
- 维修登记 / 维修完成（事务场景三）
- 部件退役（事务场景二）
- 飞行日志登记 / 飞行-部件关联
- 生命周期追溯 / MTBM / 更换排行 / 退役分布

## 业务规则保障

- 11 个数据库触发器实现退役拦截、重叠区间拦截、禁止物理删除、禁止篡改历史
- 10 个 CHECK 约束实现状态枚举、时间合理性验证
- 5 个 UNIQUE 约束（含计算列实现的活跃安装唯一性）
- 3 个事务场景保证数据一致性

## 测试

```bash
node test/run_tests.js   # 29/29 全部通过
```
