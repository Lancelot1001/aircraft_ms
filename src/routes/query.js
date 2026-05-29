const express = require('express');
const router = express.Router();
const queryService = require('../services/queryService');
const componentService = require('../services/componentService');

// 查询主页：仪表盘
router.get('/', async (req, res) => {
  try {
    const overview = await queryService.getDashboardOverview();
    const statusStats = await queryService.getComponentStatusStats();
    const retirementStats = await queryService.getRetirementReasonStats();
    const mtbm = await queryService.getMTBMStats();
    const swapRanking = await queryService.getAircraftSwapRanking();

    res.render('query/index', {
      overview, statusStats, retirementStats, mtbm, swapRanking,
      error: null
    });
  } catch (err) {
    res.render('query/index', {
      overview: [], statusStats: [], retirementStats: [], mtbm: [], swapRanking: [],
      error: err.message
    });
  }
});

// 生命周期追溯
router.get('/lifecycle', async (req, res) => {
  try {
    const { q } = req.query;
    let result = null;
    if (q) {
      result = await queryService.getLifecycleTrace(q.trim());
    }
    res.render('query/lifecycle', { q: q || '', result, error: null });
  } catch (err) {
    res.render('query/lifecycle', { q: '', result: null, error: err.message });
  }
});

// 统计查询页（MTBM + 更换频率 + 退役分布）
router.get('/stats', async (req, res) => {
  try {
    const mtbm = await queryService.getMTBMStats();
    const swapRanking = await queryService.getAircraftSwapRanking();
    const retirementStats = await queryService.getRetirementReasonStats();

    res.render('query/stats', { mtbm, swapRanking, retirementStats, error: null });
  } catch (err) {
    res.render('query/stats', { mtbm: [], swapRanking: [], retirementStats: [], error: err.message });
  }
});

module.exports = router;
