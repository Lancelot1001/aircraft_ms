const express = require('express');
const router = express.Router();
const componentService = require('../services/componentService');

// 部件列表页面
router.get('/', async (req, res) => {
  try {
    const components = await componentService.listComponents(req.query.status || null);
    const models = await componentService.listModels();
    res.render('component/list', { components, models, error: null, success: null });
  } catch (err) {
    res.render('component/list', { components: [], models: [], error: err.message, success: null });
  }
});

// 入库表单页面
router.get('/add', async (req, res) => {
  try {
    const models = await componentService.listModels();
    res.render('component/add', { models, error: null, success: null });
  } catch (err) {
    res.render('component/add', { models: [], error: err.message, success: null });
  }
});

// 处理入库
router.post('/add', async (req, res) => {
  try {
    const { component_sn, model_id, batch_number, production_date, notes } = req.body;
    const result = await componentService.addComponent({
      component_sn, model_id: parseInt(model_id), batch_number, production_date, notes
    });
    const models = await componentService.listModels();
    res.render('component/add', {
      models,
      error: null,
      success: `部件 ${result.component_sn} 入库成功！`
    });
  } catch (err) {
    const models = await componentService.listModels();
    res.render('component/add', { models, error: err.message, success: null });
  }
});

// 部件详情
router.get('/:id', async (req, res) => {
  try {
    const component = await componentService.getComponentById(parseInt(req.params.id));
    if (!component) throw new Error('部件不存在');
    const installHistory = await require('../services/installationService').getComponentInstallHistory(parseInt(req.params.id));
    res.render('component/detail', { component, installHistory, error: null });
  } catch (err) {
    res.render('component/detail', { component: null, installHistory: [], error: err.message });
  }
});

module.exports = router;
