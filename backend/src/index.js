// =============================================
// TRADING MASTER PRO - BACKEND API v4.0
// ES Modules Version (import/export)
// =============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================
// CONFIGURACIÓN
// =============================================
console.log('\n🔧 VERIFICANDO CONFIGURACIÓN...');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Configurada' : '❌ NO CONFIGURADA');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Configurada' : '❌ NO CONFIGURADA');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Configurada' : '❌ NO CONFIGURADA');
console.log('\n');

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

// =============================================
// MIDDLEWARE
// =============================================
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// =============================================
// REGLAS SMC/ICT
// =============================================

const SMC_RULES = `
═══════════════════════════════════════════════════════════
REGLAS ESTRICTAS SMC/ICT - SI NO SE CUMPLEN, NO HAY SEÑAL
═══════════════════════════════════════════════════════════

🚨 REGLA #1: ESTRUCTURA DE MERCADO CLARA
- Debe existir un BOS (Break of Structure) o CHoCH (Change of Character) CONFIRMADO
- Sin BOS o CHoCH claro = NO HAY SEÑAL

🚨 REGLA #2: RETROCESO A ZONA DE INTERÉS
- Después del BOS/CHoCH, el precio DEBE retroceder a:
  * Order Block (OB) de oferta o demanda
  * Fair Value Gap (FVG) sin mitigar
  * Zona OTE (61.8%-79%)

🚨 REGLA #3: LIQUIDEZ BARRIDA
- Debe existir un barrido de liquidez (sweep) antes de la entrada

🚨 REGLA #4: CONFIRMACIÓN EN TEMPORALIDAD MENOR
- La entrada se ejecuta en 5M o 1M con confirmación

🚨 REGLA #5: ALINEACIÓN MULTI-TIMEFRAME
- H1: Tendencia | 15M: Zonas | 5M: Refinamiento | 1M: Entrada

═══════════════════════════════════════════════════════════
RATIO R:R POR MERCADO
═══════════════════════════════════════════════════════════
📊 ÍNDICES SINTÉTICOS: 1:3 - 1:5
📊 FOREX: 1:2 - 1:3
📊 METALES: 1:2 - 1:3
📊 CRYPTO: 1:3 - 1:5
`;

// =============================================
// PROMPT ANÁLISIS
// =============================================

const ANALYSIS_PROMPT = `Eres un TRADER INSTITUCIONAL experto en Smart Money Concepts (SMC) e Inner Circle Trader (ICT).

${SMC_RULES}

FORMATO DE RESPUESTA JSON:
{
  "hay_senal": true/false,
  "razon_no_senal": "Si no hay señal, explica por qué",
  
  "analisis_estructura": {
    "tendencia_h1": "ALCISTA/BAJISTA/RANGO",
    "ultimo_bos_choch": "Descripción",
    "swing_high": "Precio",
    "swing_low": "Precio"
  },
  
  "zonas_identificadas": {
    "order_blocks": [{"tipo": "DEMANDA/OFERTA", "precio": "X", "estado": "VÁLIDO/MITIGADO"}],
    "fvg": [{"tipo": "ALCISTA/BAJISTA", "zona": "X-Y"}],
    "liquidez_barrida": "Descripción"
  },
  
  "setup": {
    "direccion": "COMPRA/VENTA",
    "precio_entrada": "X.XXXXX",
    "stop_loss": "X.XXXXX",
    "take_profit_1": "X.XXXXX",
    "take_profit_2": "X.XXXXX",
    "take_profit_3": "X.XXXXX",
    "ratio_rr_tp1": "1:X",
    "ratio_rr_tp2": "1:X",
    "ratio_rr_tp3": "1:X"
  },
  
  "ejecucion": {
    "accion": "ENTRAR AHORA/ESPERAR/LIMIT ORDER/NO OPERAR",
    "tipo_orden": "BUY MARKET/SELL MARKET/BUY LIMIT/SELL LIMIT",
    "instrucciones": ["Paso 1", "Paso 2", "Paso 3"],
    "invalidacion": "Cuándo se invalida el setup"
  },
  
  "gestion": {
    "parcial_tp1": "Cerrar 50% en TP1, mover SL a BE",
    "parcial_tp2": "Cerrar 30%",
    "parcial_tp3": "Cerrar 20% restante"
  },
  
  "confianza": "ALTA/MEDIA/BAJA",
  "probabilidad": "XX%",
  "explicacion_detallada": "Explicación completa del análisis"
}`;

// =============================================
// PROMPT CHAT
// =============================================

const FOLLOWUP_PROMPT = `Eres un MENTOR DE TRADING experto en SMC/ICT ayudando a gestionar una operación EN VIVO.

CONTEXTO DE LA OPERACIÓN:
{TRADE_CONTEXT}

Responde en JSON:
{
  "evaluacion": "¿La operación sigue válida?",
  "accion_recomendada": "MANTENER/CERRAR PARCIAL/CERRAR TODO/MOVER SL/AÑADIR",
  "razon": "Por qué recomiendas esta acción",
  "cambios_detectados": "Qué cambios ves en el mercado",
  "siguiente_paso": "Qué debe hacer el trader ahora"
}`;

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
// RUTAS PÚBLICAS
// =============================================

app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Trading Master Pro API v4.0',
    openai: openai ? 'connected' : 'not configured',
    supabase: supabase ? 'connected' : 'not configured'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/check-ai', async (req, res) => {
  if (!openai) {
    return res.json({ connected: false, error: 'OPENAI_API_KEY no configurada' });
  }
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
// ANÁLISIS PRINCIPAL
// =============================================

app.post('/api/analyze', authenticate, upload.array('images', 4), async (req, res) => {
  console.log('\n📊 NUEVO ANÁLISIS SMC');
  
  try {
    if (!openai) {
      return res.status(500).json({ error: 'OpenAI no configurado' });
    }

    const { asset, accountBalance, riskPercent } = req.body;
    
    let imageContents = [];
    
    // Imágenes de multer
    if (req.files && req.files.length > 0) {
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
    
    // Imágenes de body JSON
    if (req.body.images) {
      let imgs;
      try {
        imgs = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
      } catch (e) {
        imgs = [];
      }
      
      if (Array.isArray(imgs)) {
        for (const img of imgs) {
          const data = typeof img === 'string' ? img : (img.data || img);
          if (data && data.length > 100) {
            imageContents.push({
              type: 'image_url',
              image_url: {
                url: data.startsWith('data:') ? data : `data:image/png;base64,${data}`,
                detail: 'high'
              }
            });
          }
        }
      }
    }

    console.log(`📷 Imágenes: ${imageContents.length} | Activo: ${asset}`);

    if (imageContents.length === 0) {
      return res.status(400).json({ error: 'No se recibieron imágenes' });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: ANALYSIS_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `ANALIZA ESTOS GRÁFICOS DE ${asset || 'TRADING'}

TEMPORALIDADES: ${imageContents.length >= 4 ? 'H1, 15M, 5M, 1M' : `${imageContents.length} imagen(es)`}
BALANCE: $${accountBalance || 1000}
RIESGO: ${riskPercent || 1}%

IMPORTANTE:
1. Si NO se cumplen TODAS las reglas SMC, responde hay_senal: false
2. Ajusta el R:R según el tipo de activo
3. Da precios EXACTOS

RESPONDE SOLO CON JSON.`
            },
            ...imageContents
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0.2
    });

    let analysis;
    try {
      const text = response.choices[0]?.message?.content || '';
      const jsonMatch = text.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
    } catch (e) {
      analysis = { raw: response.choices[0]?.message?.content };
    }

    // Guardar en BD
    if (supabase && req.user?.id !== 'demo-user') {
      try {
        await supabase.from('analyses').insert({
          user_id: req.user.id,
          asset: asset || 'Unknown',
          analysis_data: analysis,
          tokens_used: response.usage?.total_tokens || 0
        });
      } catch (e) {
        console.log('Error guardando análisis:', e.message);
      }
    }

    res.json({
      success: true,
      analysis,
      meta: { tokensUsed: response.usage?.total_tokens, images: imageContents.length }
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// CHAT DE SEGUIMIENTO
// =============================================

app.post('/api/chat', authenticate, upload.array('images', 2), async (req, res) => {
  console.log('\n💬 CHAT DE SEGUIMIENTO');
  
  try {
    if (!openai) {
      return res.status(500).json({ error: 'OpenAI no configurado' });
    }

    const { message, tradeContext, conversationHistory } = req.body;
    
    let imageContents = [];
    
    if (req.files && req.files.length > 0) {
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
      let imgs;
      try {
        imgs = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
      } catch (e) {
        imgs = [];
      }
      
      if (Array.isArray(imgs)) {
        for (const img of imgs) {
          const data = typeof img === 'string' ? img : (img.data || img);
          if (data && data.length > 100) {
            imageContents.push({
              type: 'image_url',
              image_url: {
                url: data.startsWith('data:') ? data : `data:image/png;base64,${data}`,
                detail: 'high'
              }
            });
          }
        }
      }
    }

    const messages = [
      { 
        role: 'system', 
        content: FOLLOWUP_PROMPT.replace('{TRADE_CONTEXT}', JSON.stringify(tradeContext || {}))
      }
    ];

    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const userContent = [];
    if (message) userContent.push({ type: 'text', text: message });
    if (imageContents.length > 0) {
      userContent.push(...imageContents);
      if (!message) userContent.unshift({ type: 'text', text: '¿Cómo va la operación?' });
    }

    messages.push({ role: 'user', content: userContent.length > 0 ? userContent : message || '¿Actualización?' });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 2000,
      temperature: 0.3
    });

    const assistantMessage = response.choices[0]?.message?.content || '';

    let parsedResponse;
    try {
      const jsonMatch = assistantMessage.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').match(/\{[\s\S]*\}/);
      parsedResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (e) {
      parsedResponse = null;
    }

    res.json({
      success: true,
      response: parsedResponse || { mensaje: assistantMessage },
      rawMessage: assistantMessage,
      tokensUsed: response.usage?.total_tokens
    });

  } catch (error) {
    console.error('❌ Error chat:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// TRADES & STATS
// =============================================

app.get('/api/trades', authenticate, async (req, res) => {
  if (!supabase) return res.json([]);
  
  try {
    const { data } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) {
    res.json([]);
  }
});

app.post('/api/trades', authenticate, async (req, res) => {
  const trade = { id: uuidv4(), user_id: req.user.id, ...req.body, created_at: new Date().toISOString() };
  
  if (supabase && req.user.id !== 'demo-user') {
    try {
      const { data } = await supabase.from('trades').insert(trade).select().single();
      return res.json(data);
    } catch (e) {
      console.log('Error guardando trade:', e.message);
    }
  }
  
  res.json(trade);
});

app.get('/api/stats/advanced', authenticate, async (req, res) => {
  if (!supabase || req.user.id === 'demo-user') {
    return res.json({
      overview: { totalTrades: 0, winRate: 0, totalProfit: 0, avgWin: 0, avgLoss: 0, profitFactor: 'N/A' },
      byAsset: [],
      streaks: { currentStreak: 0, bestWinStreak: 0, worstLossStreak: 0 }
    });
  }

  try {
    const { data: trades } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (!trades || trades.length === 0) {
      return res.json({
        overview: { totalTrades: 0, winRate: 0, totalProfit: 0, avgWin: 0, avgLoss: 0, profitFactor: 'N/A' },
        byAsset: [],
        streaks: { currentStreak: 0, bestWinStreak: 0, worstLossStreak: 0 }
      });
    }

    const wins = trades.filter(t => t.result === 'win');
    const losses = trades.filter(t => t.result === 'loss');
    
    const assetMap = {};
    trades.forEach(t => {
      if (!assetMap[t.asset]) assetMap[t.asset] = { wins: 0, losses: 0, profit: 0 };
      if (t.result === 'win') assetMap[t.asset].wins++;
      if (t.result === 'loss') assetMap[t.asset].losses++;
      assetMap[t.asset].profit += t.profit || 0;
    });

    const byAsset = Object.entries(assetMap).map(([asset, data]) => ({
      asset, ...data,
      winRate: data.wins + data.losses > 0 ? ((data.wins / (data.wins + data.losses)) * 100).toFixed(1) : 0
    }));

    let bestWinStreak = 0, worstLossStreak = 0, tempWin = 0, tempLoss = 0;
    trades.forEach(t => {
      if (t.result === 'win') { tempWin++; tempLoss = 0; if (tempWin > bestWinStreak) bestWinStreak = tempWin; }
      else if (t.result === 'loss') { tempLoss++; tempWin = 0; if (tempLoss > worstLossStreak) worstLossStreak = tempLoss; }
    });

    let currentStreak = 0;
    for (let i = trades.length - 1; i >= 0; i--) {
      if (i === trades.length - 1) currentStreak = trades[i].result === 'win' ? 1 : -1;
      else if ((currentStreak > 0 && trades[i].result === 'win') || (currentStreak < 0 && trades[i].result === 'loss'))
        currentStreak += currentStreak > 0 ? 1 : -1;
      else break;
    }

    const totalWinProfit = wins.reduce((s, t) => s + (t.profit || 0), 0);
    const totalLossProfit = Math.abs(losses.reduce((s, t) => s + (t.profit || 0), 0));

    res.json({
      overview: {
        totalTrades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: wins.length + losses.length > 0 ? ((wins.length / (wins.length + losses.length)) * 100).toFixed(1) : 0,
        totalProfit: trades.reduce((sum, t) => sum + (t.profit || 0), 0).toFixed(2),
        avgWin: wins.length > 0 ? (totalWinProfit / wins.length).toFixed(2) : 0,
        avgLoss: losses.length > 0 ? (totalLossProfit / losses.length).toFixed(2) : 0,
        profitFactor: totalLossProfit > 0 ? (totalWinProfit / totalLossProfit).toFixed(2) : 'N/A'
      },
      byAsset,
      streaks: { currentStreak, bestWinStreak, worstLossStreak }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// INICIAR SERVIDOR
// =============================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║       TRADING MASTER PRO - API v4.0                       ║
╠═══════════════════════════════════════════════════════════╣
║  🚀 Puerto: ${PORT}                                          ║
║  🤖 OpenAI: ${openai ? '✅ Conectado' : '❌ No configurado'}                       ║
║  💾 Supabase: ${supabase ? '✅ Conectado' : '❌ No configurado'}                     ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
