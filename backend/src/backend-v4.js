// =============================================
// TRADING MASTER PRO - BACKEND API v4.0
// Chat Interactivo + SMC Avanzado + Seguimiento
// =============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅' : '❌');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅' : '❌');

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '100mb' }));

// =============================================
// REGLAS SMC/ICT PROFESIONALES
// =============================================

const SMC_RULES = `
═══════════════════════════════════════════════════════════
REGLAS ESTRICTAS SMC/ICT - SI NO SE CUMPLEN, NO HAY SEÑAL
═══════════════════════════════════════════════════════════

🚨 REGLA #1: ESTRUCTURA DE MERCADO CLARA
- Debe existir un BOS (Break of Structure) o CHoCH (Change of Character) CONFIRMADO
- BOS = Continuación de tendencia (rompe el último swing en dirección de la tendencia)
- CHoCH = Cambio de tendencia (rompe estructura contraria)
- Sin BOS o CHoCH claro = NO HAY SEÑAL

🚨 REGLA #2: RETROCESO A ZONA DE INTERÉS
- Después del BOS/CHoCH, el precio DEBE retroceder a:
  * Order Block (OB) de oferta (para ventas) o demanda (para compras)
  * Fair Value Gap (FVG) sin mitigar
  * Zona OTE (Optimal Trade Entry) 61.8%-79% del movimiento
- Si no hay retroceso a zona de interés = NO HAY SEÑAL

🚨 REGLA #3: LIQUIDEZ BARRIDA
- Preferiblemente debe existir un barrido de liquidez (sweep) antes de la entrada
- BSL (Buy Side Liquidity) barrido para compras
- SSL (Sell Side Liquidity) barrido para ventas
- El barrido indica que el "smart money" ya tomó liquidez

🚨 REGLA #4: CONFIRMACIÓN EN TEMPORALIDAD MENOR
- La entrada se ejecuta en 5M o 1M
- Debe haber confirmación: vela de rechazo, engulfing, o shift de estructura menor
- Sin confirmación = ESPERAR o NO OPERAR

🚨 REGLA #5: ALINEACIÓN MULTI-TIMEFRAME
- H1/H4: Define la TENDENCIA PRINCIPAL
- 15M: Define ZONAS DE INTERÉS (OB, FVG)
- 5M: REFINAMIENTO de entrada
- 1M: ENTRADA PRECISA (sniper entry)
- Si las temporalidades están en CONFLICTO = NO HAY SEÑAL

═══════════════════════════════════════════════════════════
RATIO RIESGO:BENEFICIO POR MERCADO
═══════════════════════════════════════════════════════════

📊 ÍNDICES SINTÉTICOS (Deriv):
- Volatility Index: Mínimo 1:3, Objetivo 1:5
- Step Index: Mínimo 1:2, Objetivo 1:3 (movimientos más pequeños)
- Boom/Crash: Mínimo 1:3, Objetivo 1:5 (alta volatilidad)
- Jump Index: Mínimo 1:2, Objetivo 1:4

📊 FOREX:
- Majors (EUR/USD, GBP/USD): Mínimo 1:2, Objetivo 1:3
- Minors: Mínimo 1:2, Objetivo 1:2.5
- Exotics: Mínimo 1:3, Objetivo 1:4 (spreads altos)

📊 METALES:
- XAU/USD (Oro): Mínimo 1:2, Objetivo 1:3 (alta volatilidad)
- XAG/USD (Plata): Mínimo 1:2.5, Objetivo 1:3.5

📊 CRYPTO:
- BTC/USD: Mínimo 1:3, Objetivo 1:5
- Altcoins: Mínimo 1:3, Objetivo 1:5 (muy volátiles)

═══════════════════════════════════════════════════════════
CONCEPTOS SMC/ICT QUE DEBES IDENTIFICAR
═══════════════════════════════════════════════════════════

1. ESTRUCTURA DE MERCADO:
   • HH (Higher High) + HL (Higher Low) = Tendencia ALCISTA
   • LH (Lower High) + LL (Lower Low) = Tendencia BAJISTA
   • BOS (Break of Structure) = Confirma continuación
   • CHoCH (Change of Character) = Indica posible reversión
   • MSS (Market Structure Shift) = Cambio confirmado

2. ORDER BLOCKS (OB):
   • OB de DEMANDA: Última vela BAJISTA antes de un movimiento alcista fuerte
   • OB de OFERTA: Última vela ALCISTA antes de un movimiento bajista fuerte
   • El OB debe ser RESPETADO (precio retorna a él)
   • Mitigación: Cuando el precio atraviesa completamente el OB

3. FAIR VALUE GAP (FVG):
   • Imbalance de 3 velas donde la vela del medio no toca las otras
   • FVG Alcista: Gap entre el high de vela 1 y low de vela 3
   • FVG Bajista: Gap entre el low de vela 1 y high de vela 3
   • El precio tiende a RELLENAR estos gaps

4. LIQUIDEZ:
   • BSL (Buy Side Liquidity): Stops sobre máximos iguales o swing highs
   • SSL (Sell Side Liquidity): Stops bajo mínimos iguales o swing lows
   • EQH (Equal Highs): Dobles/triples techos = acumulación de stops
   • EQL (Equal Lows): Dobles/triples suelos = acumulación de stops

5. ZONAS PREMIUM/DISCOUNT:
   • Premium Zone: Por encima del 50% del rango = zona para VENDER
   • Discount Zone: Por debajo del 50% del rango = zona para COMPRAR
   • Equilibrium: El 50% exacto del rango

6. ENTRADA ÓPTIMA:
   • OTE (Optimal Trade Entry): Retroceso al 61.8%-79% Fibonacci
   • Entrada en OB + FVG = ALTA probabilidad
   • Entrada después de sweep de liquidez = MUY ALTA probabilidad
`;

// =============================================
// PROMPT PRINCIPAL DE ANÁLISIS
// =============================================

const ANALYSIS_PROMPT = `Eres un TRADER INSTITUCIONAL con 15+ años de experiencia en Smart Money Concepts (SMC) e Inner Circle Trader (ICT).

${SMC_RULES}

═══════════════════════════════════════════════════════════
PROCESO DE ANÁLISIS (SIGUE ESTE ORDEN EXACTO)
═══════════════════════════════════════════════════════════

PASO 1: IDENTIFICAR ESTRUCTURA EN H1/H4
- ¿Tendencia alcista (HH/HL) o bajista (LH/LL)?
- ¿Hay BOS o CHoCH reciente?
- ¿Dónde está el último swing high y swing low?

PASO 2: LOCALIZAR ZONAS EN 15M
- Identificar Order Blocks válidos
- Identificar FVGs sin rellenar
- ¿Hay liquidez pendiente de barrer (EQH/EQL)?

PASO 3: REFINAR EN 5M
- ¿El precio está en zona de interés?
- ¿Hubo barrido de liquidez?
- ¿Hay OB de entrada específico?

PASO 4: CONFIRMAR EN 1M
- ¿Hay patrón de confirmación? (rejection, engulfing, shift)
- Definir entrada EXACTA
- Definir SL (detrás del OB o swing)
- Definir TPs según el mercado

PASO 5: EVALUAR SI HAY SEÑAL
- ¿Se cumplen TODAS las reglas?
- Si NO = responder "NO HAY SEÑAL" y explicar qué falta
- Si SÍ = dar setup completo

═══════════════════════════════════════════════════════════
FORMATO DE RESPUESTA JSON
═══════════════════════════════════════════════════════════

{
  "hay_senal": true/false,
  "razon_no_senal": "Explicación si no hay señal",
  
  "analisis_estructura": {
    "tendencia_h1": "ALCISTA/BAJISTA/RANGO",
    "ultimo_bos_choch": "Descripción del último BOS o CHoCH",
    "swing_high": "Precio del último swing high",
    "swing_low": "Precio del último swing low",
    "estructura_actual": "Descripción de la estructura"
  },
  
  "zonas_identificadas": {
    "order_blocks": [
      {"tipo": "DEMANDA/OFERTA", "precio_inicio": "X", "precio_fin": "Y", "estado": "VÁLIDO/MITIGADO"}
    ],
    "fvg": [
      {"tipo": "ALCISTA/BAJISTA", "precio_inicio": "X", "precio_fin": "Y", "estado": "SIN RELLENAR/PARCIAL/RELLENADO"}
    ],
    "liquidez": {
      "bsl_pendiente": "Precio de BSL pendiente",
      "ssl_pendiente": "Precio de SSL pendiente",
      "liquidez_barrida": "Descripción de liquidez ya barrida"
    }
  },
  
  "confirmacion": {
    "en_zona_interes": true/false,
    "sweep_liquidez": true/false,
    "patron_confirmacion": "Tipo de patrón detectado",
    "alineacion_mtf": true/false
  },
  
  "setup": {
    "direccion": "COMPRA/VENTA",
    "tipo_entrada": "AGRESIVA/CONFIRMACIÓN/LIMIT",
    "precio_entrada": "X.XXXXX",
    "stop_loss": "X.XXXXX",
    "take_profit_1": "X.XXXXX",
    "take_profit_2": "X.XXXXX",
    "take_profit_3": "X.XXXXX",
    "riesgo_pips": "XX",
    "ratio_rr_tp1": "1:X",
    "ratio_rr_tp2": "1:X",
    "ratio_rr_tp3": "1:X"
  },
  
  "ejecucion": {
    "accion": "ENTRAR AHORA/ESPERAR CONFIRMACIÓN/COLOCAR LIMIT/NO OPERAR",
    "tipo_orden": "BUY MARKET/SELL MARKET/BUY LIMIT/SELL LIMIT",
    "instrucciones": ["Paso 1", "Paso 2", "Paso 3"],
    "confirmacion_necesaria": "Qué esperar antes de entrar",
    "invalidacion": "Cuándo el setup se invalida"
  },
  
  "gestion": {
    "parcial_tp1": "Cerrar X% en TP1",
    "mover_sl": "Mover SL a BE después de TP1",
    "trailing": "Trailing stop después de TP2"
  },
  
  "confianza": "ALTA/MEDIA/BAJA",
  "probabilidad": "XX%",
  
  "explicacion_detallada": "Explicación completa del análisis para que el trader entienda el razonamiento",
  
  "advertencias": ["Advertencia 1", "Advertencia 2"]
}`;

// =============================================
// PROMPT PARA CHAT DE SEGUIMIENTO
// =============================================

const FOLLOWUP_PROMPT = `Eres un MENTOR DE TRADING experto en SMC/ICT que está ayudando a un trader a gestionar una operación EN VIVO.

CONTEXTO DE LA OPERACIÓN ACTUAL:
{TRADE_CONTEXT}

Tu rol es:
1. Analizar las nuevas imágenes que el trader envía
2. Evaluar si la operación sigue siendo válida
3. Recomendar acciones: mantener, cerrar parcial, cerrar todo, mover SL, etc.
4. Explicar el POR QUÉ de cada recomendación
5. Alertar sobre cambios en la estructura del mercado

RESPONDE EN JSON:
{
  "evaluacion_actual": {
    "operacion_valida": true/false,
    "razon": "Explicación"
  },
  "accion_recomendada": "MANTENER/CERRAR PARCIAL/CERRAR TODO/MOVER SL A BE/MOVER SL A X/AÑADIR POSICIÓN",
  "precio_actual_estimado": "X.XXXXX",
  "distancia_tp": "X pips/puntos",
  "distancia_sl": "X pips/puntos",
  "cambios_estructura": "Descripción de cambios observados",
  "nueva_zona_interes": "Si hay nueva zona identificada",
  "explicacion": "Explicación detallada para el trader",
  "siguiente_paso": "Qué debe hacer el trader ahora"
}`;

// =============================================
// MIDDLEWARE DE AUTENTICACIÓN
// =============================================

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!supabase || !authHeader?.startsWith('Bearer ')) {
      req.user = { id: 'demo-user', email: 'demo@example.com' };
      return next();
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    req.user = error || !user ? { id: 'demo-user', email: 'demo@example.com' } : user;
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
    features: ['SMC Analysis', 'Interactive Chat', 'Trade Tracking', 'Multi-TF Analysis']
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
// ANÁLISIS PRINCIPAL SMC
// =============================================

app.post('/api/analyze', authenticate, upload.array('images', 4), async (req, res) => {
  console.log('\n📊 NUEVO ANÁLISIS SMC');
  
  try {
    if (!openai) {
      return res.status(500).json({ error: 'OpenAI no configurado' });
    }

    const { asset, accountBalance, riskPercent } = req.body;
    
    // Procesar imágenes
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
      const imgs = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
      for (const img of imgs) {
        const data = typeof img === 'string' ? img : img.data || img;
        if (data?.length > 100) {
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

    if (imageContents.length === 0) {
      return res.status(400).json({ error: 'No se recibieron imágenes' });
    }

    console.log(`📷 Imágenes: ${imageContents.length} | Activo: ${asset}`);

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

TEMPORALIDADES (en orden):
${imageContents.length >= 4 ? '1. H1 (Contexto)\n2. 15M (Zonas)\n3. 5M (Refinamiento)\n4. 1M (Entrada)' : `${imageContents.length} imagen(es) proporcionada(s)`}

BALANCE: $${accountBalance || 1000}
RIESGO: ${riskPercent || 1}%

INSTRUCCIONES:
1. Analiza la estructura de mercado siguiendo las REGLAS ESTRICTAS
2. Si NO se cumplen todas las reglas, responde hay_senal: false
3. Si SÍ hay señal válida, da el setup COMPLETO con precios EXACTOS
4. Ajusta el R:R según el tipo de activo (${asset})

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
    } catch {
      analysis = { raw: response.choices[0]?.message?.content };
    }

    // Guardar en BD
    if (supabase && req.user?.id !== 'demo-user') {
      await supabase.from('analyses').insert({
        user_id: req.user.id,
        asset: asset || 'Unknown',
        analysis_data: analysis,
        tokens_used: response.usage?.total_tokens || 0
      }).catch(console.error);
    }

    res.json({
      success: true,
      analysis,
      meta: {
        tokensUsed: response.usage?.total_tokens,
        images: imageContents.length
      }
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// CHAT DE SEGUIMIENTO DE OPERACIÓN
// =============================================

app.post('/api/chat', authenticate, upload.array('images', 2), async (req, res) => {
  console.log('\n💬 CHAT DE SEGUIMIENTO');
  
  try {
    if (!openai) {
      return res.status(500).json({ error: 'OpenAI no configurado' });
    }

    const { message, tradeContext, conversationHistory } = req.body;
    
    // Procesar imágenes si las hay
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
      const imgs = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
      for (const img of imgs) {
        const data = typeof img === 'string' ? img : img.data || img;
        if (data?.length > 100) {
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

    // Construir historial de conversación
    const messages = [
      { 
        role: 'system', 
        content: FOLLOWUP_PROMPT.replace('{TRADE_CONTEXT}', JSON.stringify(tradeContext || {}))
      }
    ];

    // Agregar historial previo
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-10)) { // Últimos 10 mensajes
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    // Agregar mensaje actual
    const userContent = [];
    if (message) {
      userContent.push({ type: 'text', text: message });
    }
    if (imageContents.length > 0) {
      userContent.push(...imageContents);
      if (!message) {
        userContent.unshift({ type: 'text', text: 'Aquí está la actualización del gráfico. ¿Cómo va la operación? ¿Debo hacer algo?' });
      }
    }

    messages.push({ role: 'user', content: userContent.length > 0 ? userContent : message });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 2000,
      temperature: 0.3
    });

    const assistantMessage = response.choices[0]?.message?.content || '';

    // Intentar parsear como JSON
    let parsedResponse;
    try {
      const jsonMatch = assistantMessage.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').match(/\{[\s\S]*\}/);
      parsedResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
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
// GUARDAR/OBTENER OPERACIONES ACTIVAS
// =============================================

app.post('/api/active-trades', authenticate, async (req, res) => {
  try {
    const trade = {
      id: uuidv4(),
      user_id: req.user.id,
      ...req.body,
      status: 'active',
      created_at: new Date().toISOString()
    };

    if (supabase && req.user.id !== 'demo-user') {
      const { data, error } = await supabase
        .from('active_trades')
        .insert(trade)
        .select()
        .single();
      
      if (error) throw error;
      return res.json(data);
    }

    res.json(trade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/active-trades', authenticate, async (req, res) => {
  try {
    if (supabase && req.user.id !== 'demo-user') {
      const { data, error } = await supabase
        .from('active_trades')
        .select('*')
        .eq('user_id', req.user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return res.json(data || []);
    }

    res.json([]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/active-trades/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (supabase && req.user.id !== 'demo-user') {
      const { data, error } = await supabase
        .from('active_trades')
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', req.user.id)
        .select()
        .single();
      
      if (error) throw error;
      return res.json(data);
    }

    res.json({ id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// ESTADÍSTICAS AVANZADAS
// =============================================

app.get('/api/stats/advanced', authenticate, async (req, res) => {
  try {
    if (!supabase || req.user.id === 'demo-user') {
      return res.json({
        overview: { totalTrades: 0, winRate: 0, totalProfit: 0 },
        byAsset: [],
        byDay: [],
        byHour: [],
        streaks: { currentStreak: 0, bestWinStreak: 0, worstLossStreak: 0 }
      });
    }

    const { data: trades } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (!trades?.length) {
      return res.json({
        overview: { totalTrades: 0, winRate: 0, totalProfit: 0 },
        byAsset: [],
        byDay: [],
        byHour: [],
        streaks: { currentStreak: 0, bestWinStreak: 0, worstLossStreak: 0 }
      });
    }

    // Calcular estadísticas
    const wins = trades.filter(t => t.result === 'win');
    const losses = trades.filter(t => t.result === 'loss');
    
    // Por activo
    const assetMap = {};
    trades.forEach(t => {
      if (!assetMap[t.asset]) {
        assetMap[t.asset] = { wins: 0, losses: 0, profit: 0 };
      }
      if (t.result === 'win') assetMap[t.asset].wins++;
      if (t.result === 'loss') assetMap[t.asset].losses++;
      assetMap[t.asset].profit += t.profit || 0;
    });

    const byAsset = Object.entries(assetMap).map(([asset, data]) => ({
      asset,
      ...data,
      winRate: data.wins + data.losses > 0 ? ((data.wins / (data.wins + data.losses)) * 100).toFixed(1) : 0
    }));

    // Rachas
    let currentStreak = 0;
    let bestWinStreak = 0;
    let worstLossStreak = 0;
    let tempWinStreak = 0;
    let tempLossStreak = 0;

    trades.forEach(t => {
      if (t.result === 'win') {
        tempWinStreak++;
        tempLossStreak = 0;
        if (tempWinStreak > bestWinStreak) bestWinStreak = tempWinStreak;
      } else if (t.result === 'loss') {
        tempLossStreak++;
        tempWinStreak = 0;
        if (tempLossStreak > worstLossStreak) worstLossStreak = tempLossStreak;
      }
    });

    // Racha actual
    for (let i = trades.length - 1; i >= 0; i--) {
      if (i === trades.length - 1) {
        currentStreak = trades[i].result === 'win' ? 1 : -1;
      } else if (
        (currentStreak > 0 && trades[i].result === 'win') ||
        (currentStreak < 0 && trades[i].result === 'loss')
      ) {
        currentStreak += currentStreak > 0 ? 1 : -1;
      } else {
        break;
      }
    }

    res.json({
      overview: {
        totalTrades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: wins.length + losses.length > 0 
          ? ((wins.length / (wins.length + losses.length)) * 100).toFixed(1) 
          : 0,
        totalProfit: trades.reduce((sum, t) => sum + (t.profit || 0), 0).toFixed(2),
        avgWin: wins.length > 0 ? (wins.reduce((s, t) => s + (t.profit || 0), 0) / wins.length).toFixed(2) : 0,
        avgLoss: losses.length > 0 ? (losses.reduce((s, t) => s + (t.profit || 0), 0) / losses.length).toFixed(2) : 0,
        profitFactor: losses.length > 0 
          ? (Math.abs(wins.reduce((s, t) => s + (t.profit || 0), 0)) / Math.abs(losses.reduce((s, t) => s + (t.profit || 0), 0))).toFixed(2)
          : 'N/A'
      },
      byAsset,
      streaks: {
        currentStreak,
        bestWinStreak,
        worstLossStreak
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// TRADES CRUD
// =============================================

app.get('/api/trades', authenticate, async (req, res) => {
  if (!supabase) return res.json([]);
  
  const { data } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
    
  res.json(data || []);
});

app.post('/api/trades', authenticate, async (req, res) => {
  const trade = { id: uuidv4(), user_id: req.user.id, ...req.body };
  
  if (supabase && req.user.id !== 'demo-user') {
    const { data, error } = await supabase.from('trades').insert(trade).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  
  res.json(trade);
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
╠═══════════════════════════════════════════════════════════╣
║  Nuevas funciones:                                        ║
║  • POST /api/analyze - Análisis SMC completo              ║
║  • POST /api/chat - Chat de seguimiento                   ║
║  • GET /api/stats/advanced - Estadísticas avanzadas       ║
║  • POST /api/active-trades - Gestión de operaciones       ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
