// =============================================
// TRADING MASTER PRO - BACKEND v5.0
// Integración con Deriv API + Señales Automáticas SMC
// =============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import DerivAPIService, { SYNTHETIC_INDICES, TIMEFRAMES } from './services/derivAPI.js';
import SMCAnalyzer from './services/smcAnalyzer.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================
// CONFIGURACIÓN
// =============================================
console.log('\n🔧 VERIFICANDO CONFIGURACIÓN...');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅' : '❌');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅' : '❌');
console.log('DERIV_APP_ID:', process.env.DERIV_APP_ID ? '✅' : '❌');

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Deriv API Service
const DERIV_APP_ID = process.env.DERIV_APP_ID || '117347';
let derivService = null;
let smcAnalyzer = new SMCAnalyzer();

// Almacén de señales activas
const activeSignals = new Map();
const signalHistory = [];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// =============================================
// INICIALIZAR DERIV API
// =============================================

async function initDerivAPI() {
  try {
    derivService = new DerivAPIService(DERIV_APP_ID);
    await derivService.connect();
    
    // Suscribirse a índices principales
    const mainSymbols = ['R_75', 'R_100', 'stpRNG', 'BOOM500', 'CRASH500'];
    
    for (const symbol of mainSymbols) {
      derivService.subscribeTicks(symbol);
      derivService.subscribeCandles(symbol, TIMEFRAMES.M1);
      derivService.subscribeCandles(symbol, TIMEFRAMES.M5);
      derivService.subscribeCandles(symbol, TIMEFRAMES.M15);
      derivService.subscribeCandles(symbol, TIMEFRAMES.H1);
    }

    // Analizar cada vez que llega una vela nueva
    derivService.on('candle', ({ symbol, timeframe, candles }) => {
      if (timeframe === TIMEFRAMES.M5 && candles.length >= 50) {
        analyzeAndGenerateSignal(symbol, timeframe, candles);
      }
    });

    console.log('✅ Deriv API inicializada y suscrita a símbolos');
  } catch (error) {
    console.error('❌ Error inicializando Deriv API:', error);
  }
}

// Analizar y generar señal
async function analyzeAndGenerateSignal(symbol, timeframe, candles) {
  try {
    const analysis = smcAnalyzer.analyze(candles);
    const signal = smcAnalyzer.generateSignal(analysis);

    if (signal.hasSignal) {
      const signalId = `${symbol}_${Date.now()}`;
      const fullSignal = {
        id: signalId,
        symbol,
        symbolName: SYNTHETIC_INDICES[symbol]?.name || symbol,
        timeframe,
        ...signal,
        createdAt: new Date().toISOString(),
      };

      activeSignals.set(signalId, fullSignal);
      signalHistory.push(fullSignal);

      // Mantener solo últimas 100 señales en historia
      if (signalHistory.length > 100) {
        signalHistory.shift();
      }

      console.log(`🎯 SEÑAL DETECTADA: ${signal.direction} en ${symbol}`);
    }
  } catch (error) {
    console.error('Error analizando:', error);
  }
}

// Inicializar al arrancar
initDerivAPI();

// =============================================
// MIDDLEWARE AUTH
// =============================================

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!supabase || !authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = { id: 'demo-user', email: 'demo@example.com' };
      return next();
    }
    const token = authHeader.split(' ')[1];
    const { data, error } = await supabase.auth.getUser(token);
    req.user = error || !data?.user ? { id: 'demo-user', email: 'demo@example.com' } : data.user;
    next();
  } catch (error) {
    req.user = { id: 'demo-user', email: 'demo@example.com' };
    next();
  }
};

// =============================================
// RUTAS - ESTADO
// =============================================

app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Trading Master Pro API v5.0',
    openai: openai ? 'connected' : 'not configured',
    supabase: supabase ? 'connected' : 'not configured',
    deriv: derivService?.isConnected ? 'connected' : 'disconnected',
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    deriv: derivService?.isConnected || false,
  });
});

app.get('/api/check-ai', async (req, res) => {
  if (!openai) return res.json({ connected: false });
  try {
    await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 5
    });
    res.json({ connected: true, model: 'gpt-4o' });
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

// =============================================
// RUTAS - DERIV API
// =============================================

// Estado de conexión Deriv
app.get('/api/deriv/status', (req, res) => {
  res.json({
    connected: derivService?.isConnected || false,
    appId: DERIV_APP_ID,
    subscriptions: derivService?.subscriptions?.size || 0,
  });
});

// Obtener símbolos disponibles
app.get('/api/deriv/symbols', (req, res) => {
  res.json(SYNTHETIC_INDICES);
});

// Obtener precio actual de un símbolo
app.get('/api/deriv/price/:symbol', (req, res) => {
  const { symbol } = req.params;
  const ticks = derivService?.getTicks(symbol) || [];
  const lastTick = ticks[ticks.length - 1];
  
  res.json({
    symbol,
    name: SYNTHETIC_INDICES[symbol]?.name || symbol,
    price: lastTick?.price || null,
    time: lastTick?.time || null,
    ticks: ticks.slice(-100),
  });
});

// Obtener velas de un símbolo
app.get('/api/deriv/candles/:symbol/:timeframe', async (req, res) => {
  const { symbol, timeframe } = req.params;
  const tf = TIMEFRAMES[timeframe] || parseInt(timeframe);
  
  let candles = derivService?.getCandles(symbol, tf) || [];
  
  // Si no hay velas, intentar obtener historia
  if (candles.length === 0 && derivService?.isConnected) {
    candles = await derivService.getCandleHistory(symbol, tf, 200);
  }
  
  res.json({
    symbol,
    name: SYNTHETIC_INDICES[symbol]?.name || symbol,
    timeframe: tf,
    count: candles.length,
    candles,
  });
});

// Suscribirse a un nuevo símbolo
app.post('/api/deriv/subscribe', authenticate, (req, res) => {
  const { symbol, timeframes = ['M1', 'M5', 'M15', 'H1'] } = req.body;
  
  if (!derivService?.isConnected) {
    return res.status(503).json({ error: 'Deriv no conectado' });
  }

  derivService.subscribeTicks(symbol);
  timeframes.forEach(tf => {
    derivService.subscribeCandles(symbol, TIMEFRAMES[tf] || 60);
  });

  res.json({ success: true, symbol, timeframes });
});

// =============================================
// RUTAS - ANÁLISIS SMC
// =============================================

// Analizar símbolo específico
app.get('/api/analyze/live/:symbol', authenticate, async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = 'M5' } = req.query;
  
  const tf = TIMEFRAMES[timeframe] || 300;
  let candles = derivService?.getCandles(symbol, tf) || [];
  
  if (candles.length < 50 && derivService?.isConnected) {
    candles = await derivService.getCandleHistory(symbol, tf, 200);
  }

  if (candles.length < 50) {
    return res.status(400).json({ error: 'Insufficient data', candles: candles.length });
  }

  const analysis = smcAnalyzer.analyze(candles);
  const signal = smcAnalyzer.generateSignal(analysis);

  res.json({
    symbol,
    symbolName: SYNTHETIC_INDICES[symbol]?.name || symbol,
    timeframe,
    analysis,
    signal,
    timestamp: new Date().toISOString(),
  });
});

// Obtener señales activas
app.get('/api/signals/active', authenticate, (req, res) => {
  const signals = Array.from(activeSignals.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);
  
  res.json(signals);
});

// Obtener historial de señales
app.get('/api/signals/history', authenticate, (req, res) => {
  const { limit = 50 } = req.query;
  res.json(signalHistory.slice(-parseInt(limit)).reverse());
});

// Marcar señal como tomada/ignorada
app.put('/api/signals/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const { status, result } = req.body;
  
  const signal = activeSignals.get(id);
  if (signal) {
    signal.status = status;
    signal.result = result;
    signal.updatedAt = new Date().toISOString();
    activeSignals.set(id, signal);
    res.json(signal);
  } else {
    res.status(404).json({ error: 'Signal not found' });
  }
});

// =============================================
// ANÁLISIS CON IMÁGENES (existente)
// =============================================

const ANALYSIS_PROMPT = `Eres un TRADER INSTITUCIONAL experto en Smart Money Concepts (SMC).

REGLAS:
1. BOS/CHoCH confirmado
2. Retroceso a OB o FVG
3. Liquidez barrida
4. Confirmación en temporalidad menor
5. Alineación Multi-TF

RATIO R:R:
- Sintéticos: 1:3 - 1:5
- Forex: 1:2 - 1:3

Responde en JSON con: hay_senal, setup, ejecucion, confianza, probabilidad.`;

app.post('/api/analyze', authenticate, upload.array('images', 4), async (req, res) => {
  try {
    if (!openai) return res.status(500).json({ error: 'OpenAI no configurado' });

    const { asset, accountBalance, riskPercent } = req.body;
    let imageContents = [];
    
    if (req.files?.length > 0) {
      for (const file of req.files) {
        imageContents.push({
          type: 'image_url',
          image_url: {
            url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
            detail: 'high'
          }
        });
      }
    }
    
    if (req.body.images) {
      let imgs = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
      if (Array.isArray(imgs)) {
        for (const img of imgs) {
          const data = typeof img === 'string' ? img : (img.data || img);
          if (data?.length > 100) {
            imageContents.push({
              type: 'image_url',
              image_url: { url: data.startsWith('data:') ? data : `data:image/png;base64,${data}`, detail: 'high' }
            });
          }
        }
      }
    }

    if (imageContents.length === 0) return res.status(400).json({ error: 'No images' });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: ANALYSIS_PROMPT },
        { role: 'user', content: [
          { type: 'text', text: `Analiza ${asset}. Balance: $${accountBalance}, Riesgo: ${riskPercent}%. Responde JSON.` },
          ...imageContents
        ]}
      ],
      max_tokens: 4000,
      temperature: 0.2
    });

    let analysis;
    try {
      const text = response.choices[0]?.message?.content || '';
      const jsonMatch = text.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
    } catch { analysis = { raw: response.choices[0]?.message?.content }; }

    res.json({ success: true, analysis, meta: { tokensUsed: response.usage?.total_tokens, images: imageContents.length }});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// CHAT
// =============================================

app.post('/api/chat', authenticate, upload.array('images', 2), async (req, res) => {
  try {
    if (!openai) return res.status(500).json({ error: 'OpenAI no configurado' });

    const { message, tradeContext, conversationHistory } = req.body;
    let imageContents = [];
    
    if (req.files?.length > 0) {
      for (const file of req.files) {
        imageContents.push({
          type: 'image_url',
          image_url: { url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`, detail: 'high' }
        });
      }
    }

    const messages = [
      { role: 'system', content: `Mentor de trading SMC/ICT. Contexto: ${JSON.stringify(tradeContext || {})}` }
    ];

    if (conversationHistory) {
      conversationHistory.slice(-10).forEach(msg => messages.push({ role: msg.role, content: msg.content }));
    }

    const userContent = [];
    if (message) userContent.push({ type: 'text', text: message });
    if (imageContents.length > 0) userContent.push(...imageContents);
    messages.push({ role: 'user', content: userContent.length > 0 ? userContent : '¿Actualización?' });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', messages, max_tokens: 2000, temperature: 0.3
    });

    res.json({ success: true, response: { mensaje: response.choices[0]?.message?.content } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// TRADES & STATS
// =============================================

app.get('/api/trades', authenticate, async (req, res) => {
  if (!supabase) return res.json([]);
  try {
    const { data } = await supabase.from('trades').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    res.json(data || []);
  } catch { res.json([]); }
});

app.post('/api/trades', authenticate, async (req, res) => {
  const trade = { id: uuidv4(), user_id: req.user.id, ...req.body, created_at: new Date().toISOString() };
  if (supabase && req.user.id !== 'demo-user') {
    try { const { data } = await supabase.from('trades').insert(trade).select().single(); return res.json(data); } catch {}
  }
  res.json(trade);
});

app.get('/api/stats/advanced', authenticate, async (req, res) => {
  res.json({ overview: { totalTrades: 0, winRate: 0, totalProfit: 0 }, byAsset: [], streaks: {} });
});

// =============================================
// INICIAR SERVIDOR
// =============================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║       TRADING MASTER PRO - API v5.0                       ║
║       CON INTEGRACIÓN DERIV API                           ║
╠═══════════════════════════════════════════════════════════╣
║  🚀 Puerto: ${PORT}                                          ║
║  🤖 OpenAI: ${openai ? '✅' : '❌'}                                        ║
║  💾 Supabase: ${supabase ? '✅' : '❌'}                                      ║
║  📈 Deriv: Conectando...                                  ║
╠═══════════════════════════════════════════════════════════╣
║  Nuevos endpoints:                                        ║
║  • GET  /api/deriv/status                                 ║
║  • GET  /api/deriv/symbols                                ║
║  • GET  /api/deriv/price/:symbol                          ║
║  • GET  /api/deriv/candles/:symbol/:timeframe             ║
║  • GET  /api/analyze/live/:symbol                         ║
║  • GET  /api/signals/active                               ║
║  • GET  /api/signals/history                              ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
