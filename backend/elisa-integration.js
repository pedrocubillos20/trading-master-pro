// =============================================
// ELISA INTEGRATION - Endpoints y funciones de integración
// Para agregar al backend principal (index.js)
// =============================================

import { elisaChat, explainSignal, analyzeMarket, SMC_MODELS } from './elisa-ai.js';
import { SMCEngine, LearningSystem } from './smc-engine.js';

// =============================================
// ENDPOINTS DE ELISA IA
// Agregar estos endpoints a tu app Express
// =============================================

export function setupElisaEndpoints(app, getAssetData, getStats) {
  
  // Chat principal con ELISA
  app.post('/api/elisa/chat', async (req, res) => {
    try {
      const { message, symbol, conversationHistory } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }
      
      // Construir contexto
      const context = {
        conversationHistory: conversationHistory || []
      };
      
      // Agregar datos del mercado si hay un símbolo seleccionado
      if (symbol && getAssetData) {
        const assetData = getAssetData(symbol);
        if (assetData) {
          const analysis = SMCEngine.analyze(assetData.candlesM5 || [], assetData.candlesH1 || []);
          const signal = SMCEngine.generateSignal(analysis);
          
          context.marketData = {
            symbol,
            price: assetData.price || analysis.price,
            structureM5: analysis.structureM5,
            structureH1: analysis.structureH1,
            mtfConfluence: analysis.mtfConfluence,
            premiumDiscount: analysis.premiumDiscount,
            demandZones: analysis.demandZones,
            supplyZones: analysis.supplyZones,
            fvgZones: analysis.fvgZones
          };
          
          context.signal = signal;
        }
      }
      
      // Agregar estadísticas
      if (getStats) {
        context.stats = getStats();
      } else {
        context.stats = LearningSystem.getStats();
      }
      
      // Llamar a ELISA
      const result = await elisaChat(message, context);
      
      res.json({
        success: result.success,
        response: result.response,
        fallback: result.fallback || false,
        usage: result.usage
      });
      
    } catch (error) {
      console.error('ELISA Chat Error:', error);
      res.status(500).json({ 
        error: 'Error processing message',
        response: 'Lo siento, hubo un error. ¿Puedes intentar de nuevo?' 
      });
    }
  });
  
  // Explicar señal actual
  app.get('/api/elisa/explain-signal/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      
      let signal = null;
      
      if (getAssetData) {
        const assetData = getAssetData(symbol);
        if (assetData) {
          const analysis = SMCEngine.analyze(assetData.candlesM5 || [], assetData.candlesH1 || []);
          signal = SMCEngine.generateSignal(analysis);
        }
      }
      
      const result = await explainSignal(signal, { stats: LearningSystem.getStats() });
      
      res.json({
        success: result.success,
        response: result.response,
        signal
      });
      
    } catch (error) {
      console.error('Explain Signal Error:', error);
      res.status(500).json({ error: 'Error explaining signal' });
    }
  });
  
  // Análisis de mercado
  app.get('/api/elisa/analyze/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      
      if (!getAssetData) {
        return res.status(400).json({ error: 'Asset data not available' });
      }
      
      const assetData = getAssetData(symbol);
      if (!assetData) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      
      const analysis = SMCEngine.analyze(assetData.candlesM5 || [], assetData.candlesH1 || []);
      
      const marketData = {
        symbol,
        price: assetData.price || analysis.price,
        structureM5: analysis.structureM5,
        structureH1: analysis.structureH1,
        mtfConfluence: analysis.mtfConfluence,
        premiumDiscount: analysis.premiumDiscount
      };
      
      const result = await analyzeMarket(marketData, { stats: LearningSystem.getStats() });
      
      res.json({
        success: result.success,
        response: result.response,
        analysis: {
          structure: {
            m5: analysis.structureM5,
            h1: analysis.structureH1
          },
          mtfConfluence: analysis.mtfConfluence,
          premiumDiscount: analysis.premiumDiscount,
          zones: {
            demand: analysis.demandZones.length,
            supply: analysis.supplyZones.length,
            fvg: analysis.fvgZones.length
          }
        }
      });
      
    } catch (error) {
      console.error('Analyze Market Error:', error);
      res.status(500).json({ error: 'Error analyzing market' });
    }
  });
  
  // Obtener modelos SMC
  app.get('/api/elisa/models', (req, res) => {
    res.json({
      success: true,
      models: SMC_MODELS.models || {},
      concepts: SMC_MODELS.concepts || {}
    });
  });
  
  // Obtener concepto específico
  app.get('/api/elisa/concept/:name', (req, res) => {
    const { name } = req.params;
    const concepts = SMC_MODELS.concepts || {};
    
    const normalizedName = name.toLowerCase();
    const concept = concepts[normalizedName] || 
                    Object.values(concepts).find(c => 
                      c.name?.toLowerCase().includes(normalizedName)
                    );
    
    if (concept) {
      res.json({ success: true, concept });
    } else {
      res.status(404).json({ error: 'Concept not found' });
    }
  });
  
  // Estadísticas de aprendizaje
  app.get('/api/elisa/stats', (req, res) => {
    res.json({
      success: true,
      stats: LearningSystem.getStats()
    });
  });
  
  // Registrar resultado de trade (para aprendizaje)
  app.post('/api/elisa/record-result', (req, res) => {
    try {
      const { model, asset, result } = req.body;
      
      if (!model || !asset || !result) {
        return res.status(400).json({ error: 'model, asset, and result are required' });
      }
      
      if (!['WIN', 'LOSS'].includes(result.toUpperCase())) {
        return res.status(400).json({ error: 'result must be WIN or LOSS' });
      }
      
      LearningSystem.recordResult(model, asset, result.toUpperCase());
      
      res.json({
        success: true,
        message: 'Result recorded',
        stats: LearningSystem.getStats()
      });
      
    } catch (error) {
      console.error('Record Result Error:', error);
      res.status(500).json({ error: 'Error recording result' });
    }
  });
  
  console.log('✅ ELISA AI Endpoints configured');
}

// =============================================
// FUNCIÓN HELPER PARA SMC ANALYSIS
// =============================================

export function performSMCAnalysis(candlesM5, candlesH1, decimals = 2) {
  const analysis = SMCEngine.analyze(candlesM5, candlesH1);
  const signal = SMCEngine.generateSignal(analysis, decimals);
  return { analysis, signal };
}

// =============================================
// EXPORTS
// =============================================

export { SMCEngine, LearningSystem, elisaChat };
