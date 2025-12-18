// =============================================
// TRADING MASTER PRO - BACKEND API v2.0
// Análisis SMC Multi-Timeframe con OpenAI GPT-4 Vision
// =============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import Stripe from 'stripe';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================
// CONFIGURACIÓN DE CLIENTES
// =============================================

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'));
    }
  }
});

// =============================================
// MIDDLEWARE
// =============================================

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes, intenta más tarde' }
});

const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Límite de análisis alcanzado, espera 1 hora' }
});

app.use('/api', generalLimiter);
app.use('/api/analyze', analysisLimiter);

// =============================================
// MIDDLEWARE DE AUTENTICACIÓN
// =============================================

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Error de autenticación' });
  }
};

// =============================================
// RUTAS PÚBLICAS
// =============================================

app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Trading Master Pro API v2.0',
    version: '2.0.0',
    ai: 'OpenAI GPT-4 Vision',
    features: ['Multi-Timeframe SMC Analysis', 'ICT Methodology', 'Precise Entries']
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// =============================================
// PROMPT SMC/ICT MULTI-TIMEFRAME PROFESIONAL
// =============================================

const SMC_MULTI_TIMEFRAME_PROMPT = `Eres un analista de trading institucional EXPERTO en Smart Money Concepts (SMC) e Inner Circle Trader (ICT). 

Tu trabajo es analizar 4 gráficos de diferentes temporalidades (H1, 15M, 5M, 1M) y proporcionar un análisis PROFESIONAL con entradas EXACTAS para que el trader solo tenga que ejecutar en MetaTrader.

═══════════════════════════════════════════════════════════
METODOLOGÍA DE ANÁLISIS MULTI-TIMEFRAME (DE MAYOR A MENOR)
═══════════════════════════════════════════════════════════

📊 H1 (TEMPORALIDAD ALTA - Contexto y Dirección):
- Determinar la TENDENCIA PRINCIPAL (Alcista/Bajista/Rango)
- Identificar la ESTRUCTURA DE MERCADO (HH/HL o LH/LL)
- Localizar ZONAS DE LIQUIDEZ principales (BSL/SSL)
- Marcar ORDER BLOCKS institucionales de H1
- Identificar FAIR VALUE GAPS (FVG) sin rellenar

📊 15M (TEMPORALIDAD MEDIA - Zonas de Interés):
- Confirmar la dirección de H1
- Identificar BOS (Break of Structure) o ChoCH (Change of Character)
- Localizar ORDER BLOCKS refinados
- Identificar zonas de PREMIUM/DISCOUNT
- Buscar LIQUIDEZ que fue barrida o pendiente de barrer

📊 5M (TEMPORALIDAD DE ENTRADA - Refinamiento):
- Buscar el ORDER BLOCK de entrada preciso
- Identificar FVG para entrada
- Confirmar barrido de liquidez
- Buscar SHIFT en estructura de mercado
- Zona OTE (Optimal Trade Entry) 61.8%-79%

📊 1M (TEMPORALIDAD DE PRECISIÓN - Entrada Exacta):
- Entrada SNIPER en el Order Block
- Confirmación de vela de rechazo
- Stop Loss detrás del Order Block
- Identificar el momento EXACTO de entrada

═══════════════════════════════════════════════════════════
CONCEPTOS SMC/ICT QUE DEBES APLICAR
═══════════════════════════════════════════════════════════

1. ESTRUCTURA DE MERCADO:
   - BOS (Break of Structure): Continuación de tendencia
   - ChoCH (Change of Character): Cambio de tendencia
   - HH/HL (Higher High/Higher Low): Tendencia alcista
   - LH/LL (Lower High/Lower Low): Tendencia bajista

2. ZONAS DE INTERÉS INSTITUCIONAL:
   - Order Block (OB): Última vela contraria antes de movimiento impulsivo
   - Breaker Block: OB que fue invalidado y ahora actúa inverso
   - Mitigation Block: OB que ya fue tocado parcialmente
   - Fair Value Gap (FVG): Imbalance de 3 velas (la del medio no toca las otras)

3. LIQUIDEZ:
   - BSL (Buy Side Liquidity): Stops de vendedores sobre máximos
   - SSL (Sell Side Liquidity): Stops de compradores bajo mínimos
   - Equal Highs/Lows: Dobles/triples techos o suelos (liquidez acumulada)
   - Liquidity Sweep: Barrido de liquidez antes de reversión

4. CONCEPTOS DE ENTRADA:
   - OTE (Optimal Trade Entry): Zona 61.8%-79% del movimiento
   - Premium Zone: Por encima del 50% (zona para vender)
   - Discount Zone: Por debajo del 50% (zona para comprar)

═══════════════════════════════════════════════════════════
FORMATO DE RESPUESTA (JSON ESTRICTO)
═══════════════════════════════════════════════════════════

RESPONDE ÚNICAMENTE con este JSON (sin texto adicional):

{
  "analisis_general": {
    "tendencia_principal": "ALCISTA | BAJISTA | RANGO",
    "sesgo": "COMPRA | VENTA | NEUTRAL",
    "confianza": "ALTA | MEDIA | BAJA",
    "probabilidad_exito": "XX%"
  },
  
  "analisis_por_temporalidad": {
    "H1": {
      "estructura": "Descripción de la estructura de mercado",
      "zonas_clave": ["zona 1", "zona 2"],
      "liquidez": "Descripción de liquidez BSL/SSL"
    },
    "M15": {
      "estructura": "Descripción de estructura",
      "order_blocks": ["OB 1", "OB 2"],
      "fvg": ["FVG 1 si existe"]
    },
    "M5": {
      "estructura": "Descripción de estructura",
      "zona_entrada": "Descripción de la zona de entrada",
      "confirmaciones": ["confirmación 1", "confirmación 2"]
    },
    "M1": {
      "entrada_precisa": "Descripción del punto exacto de entrada",
      "patron_vela": "Tipo de vela de confirmación esperada"
    }
  },
  
  "setup_de_entrada": {
    "tipo": "COMPRA | VENTA",
    "precio_entrada": "X.XXXXX (precio exacto)",
    "stop_loss": "X.XXXXX (precio exacto)",
    "take_profit_1": "X.XXXXX (primer objetivo)",
    "take_profit_2": "X.XXXXX (segundo objetivo)", 
    "take_profit_3": "X.XXXXX (tercer objetivo)",
    "pips_de_riesgo": "XX pips",
    "pips_de_ganancia_tp1": "XX pips",
    "ratio_rr": "1:X.X"
  },
  
  "instrucciones_metatrader": {
    "accion_inmediata": "ESPERAR | ENTRAR AHORA | ORDEN PENDIENTE",
    "tipo_orden": "BUY MARKET | SELL MARKET | BUY LIMIT | SELL LIMIT | BUY STOP | SELL STOP",
    "pasos": [
      "Paso 1: Descripción detallada",
      "Paso 2: Descripción detallada",
      "Paso 3: Descripción detallada",
      "Paso 4: Descripción detallada"
    ],
    "confirmacion_necesaria": "Descripción de qué esperar antes de entrar (si aplica)",
    "invalidacion": "Qué debe pasar para que el setup se invalide"
  },
  
  "gestion_de_riesgo": {
    "riesgo_recomendado": "1-2% del capital",
    "parciales": [
      {"en_tp1": "Cerrar 50% de la posición"},
      {"en_tp2": "Cerrar 30% de la posición"},
      {"en_tp3": "Cerrar 20% restante"}
    ],
    "mover_sl_a_be": "Cuando el precio alcance TP1, mover SL a Break Even"
  },
  
  "advertencias": [
    "Advertencia 1 si existe",
    "Advertencia 2 si existe"
  ],
  
  "resumen_ejecutivo": "Resumen de 2-3 oraciones explicando el setup de forma clara y concisa para que cualquier trader lo entienda."
}

═══════════════════════════════════════════════════════════
REGLAS IMPORTANTES
═══════════════════════════════════════════════════════════

1. Si no hay setup claro, indica "ESPERAR" y explica qué condiciones faltan
2. El SL siempre debe estar DETRÁS del Order Block de entrada
3. Mínimo ratio R:R de 1:2 para considerar válido el setup
4. Si la liquidez no ha sido barrida, recomienda esperar
5. Prioriza setups con múltiples confluencias (OB + FVG + Liquidez barrida)
6. Sé ESPECÍFICO con los precios - no uses rangos vagos
7. Explica el "POR QUÉ" de cada nivel que sugieras
8. Si las temporalidades están en conflicto, indica "NEUTRAL" y explica

═══════════════════════════════════════════════════════════`;

// =============================================
// RUTA DE ANÁLISIS SMC MULTI-TIMEFRAME
// =============================================

app.post('/api/analyze', authenticate, upload.array('images', 4), async (req, res) => {
  try {
    const { asset, direction, accountBalance, riskPercent } = req.body;
    const images = req.files || [];
    
    // También aceptar imágenes en base64 desde el body
    let base64Images = [];
    if (req.body.images) {
      try {
        base64Images = JSON.parse(req.body.images);
      } catch {
        base64Images = [];
      }
    }

    const totalImages = images.length + base64Images.length;

    if (totalImages === 0) {
      return res.status(400).json({ 
        error: 'Se requieren imágenes para el análisis',
        required: 'Sube 4 imágenes: H1, 15M, 5M, 1M'
      });
    }

    if (totalImages < 4) {
      return res.status(400).json({ 
        error: `Solo subiste ${totalImages} imagen(es)`,
        required: 'Para un análisis completo necesitas 4 imágenes: H1, 15M, 5M y 1M',
        tip: 'Puedes continuar pero el análisis será menos preciso'
      });
    }

    // Verificar que OpenAI está configurado
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API no configurada' });
    }

    // Construir el mensaje para GPT-4 Vision
    const userMessage = `
ACTIVO A ANALIZAR: ${asset || 'Identificar del gráfico'}
DIRECCIÓN QUE CONSIDERA EL TRADER: ${direction || 'Sin preferencia - analiza objetivamente'}
${accountBalance ? `BALANCE DE CUENTA: $${accountBalance}` : ''}
${riskPercent ? `RIESGO POR TRADE: ${riskPercent}%` : ''}

IMÁGENES PROPORCIONADAS (en orden):
- Imagen 1: Gráfico H1 (1 hora) - Contexto general
- Imagen 2: Gráfico 15M (15 minutos) - Zonas de interés
- Imagen 3: Gráfico 5M (5 minutos) - Refinamiento de entrada
- Imagen 4: Gráfico 1M (1 minuto) - Entrada precisa

Por favor, analiza estos 4 timeframes usando la metodología SMC/ICT y proporciona:
1. Análisis completo de cada temporalidad
2. Setup de entrada con precios EXACTOS (Entry, SL, TP1, TP2, TP3)
3. Instrucciones paso a paso para ejecutar en MetaTrader
4. Si debo ESPERAR alguna confirmación o ENTRAR AHORA

Responde SOLO con el JSON estructurado.`;

    const content = [
      { type: 'text', text: userMessage }
    ];

    // Agregar imágenes subidas via multer
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const base64 = image.buffer.toString('base64');
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimetype};base64,${base64}`,
          detail: 'high'
        }
      });
    }

    // Agregar imágenes en base64 del body
    for (const img of base64Images) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${img.data || img}`,
          detail: 'high'
        }
      });
    }

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║  📊 NUEVO ANÁLISIS SMC MULTI-TIMEFRAME                    ║
╠═══════════════════════════════════════════════════════════╣
║  Activo: ${(asset || 'No especificado').padEnd(43)}║
║  Imágenes: ${String(totalImages).padEnd(42)}║
║  Usuario: ${(req.user.email || 'N/A').substring(0, 42).padEnd(42)}║
╚═══════════════════════════════════════════════════════════╝
    `);

    // Llamar a OpenAI GPT-4 Vision
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SMC_MULTI_TIMEFRAME_PROMPT },
        { role: 'user', content: content }
      ],
      max_tokens: 4000,
      temperature: 0.2 // Más bajo para respuestas más consistentes
    });

    const analysisText = response.choices[0]?.message?.content || '';
    
    // Intentar parsear como JSON
    let analysisData;
    try {
      // Limpiar el texto y buscar JSON
      let cleanText = analysisText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      console.error('Error parsing JSON:', parseError);
      // Si no se puede parsear, crear estructura básica
      analysisData = { 
        analisis_general: {
          tendencia_principal: 'NO DETERMINADA',
          sesgo: 'NEUTRAL',
          confianza: 'BAJA',
          probabilidad_exito: 'N/A'
        },
        resumen_ejecutivo: analysisText,
        error_parsing: true
      };
    }

    // Guardar en base de datos
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        await supabase.from('analyses').insert({
          user_id: req.user.id,
          asset: asset || 'Unknown',
          timeframe: 'Multi-TF (H1, 15M, 5M, 1M)',
          direction: analysisData.setup_de_entrada?.tipo || analysisData.analisis_general?.sesgo,
          analysis_data: analysisData,
          tokens_used: response.usage?.total_tokens || 0,
          created_at: new Date().toISOString()
        });
      } catch (dbError) {
        console.error('Error guardando análisis:', dbError);
      }
    }

    res.json({
      success: true,
      analysis: analysisData,
      tokensUsed: response.usage?.total_tokens || 0,
      model: 'gpt-4o',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error en análisis:', error);
    res.status(500).json({ 
      error: 'Error al analizar',
      details: error.message 
    });
  }
});

// =============================================
// RUTA DE ANÁLISIS RÁPIDO (1 sola imagen)
// =============================================

app.post('/api/analyze-quick', authenticate, upload.single('image'), async (req, res) => {
  try {
    const { asset, timeframe } = req.body;
    const image = req.file;
    
    let base64Image = null;
    if (req.body.image) {
      base64Image = req.body.image;
    }

    if (!image && !base64Image) {
      return res.status(400).json({ error: 'Se requiere una imagen' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API no configurada' });
    }

    const content = [
      { 
        type: 'text', 
        text: `Analiza este gráfico de ${asset || 'trading'} en temporalidad ${timeframe || 'desconocida'}.
        
Proporciona un análisis SMC/ICT rápido con:
- Tendencia actual
- Zonas de interés (OB, FVG)
- Posible dirección
- Nivel de entrada sugerido
- Stop Loss y Take Profit

Responde de forma concisa y práctica.`
      }
    ];

    if (image) {
      const base64 = image.buffer.toString('base64');
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimetype};base64,${base64}`,
          detail: 'high'
        }
      });
    } else if (base64Image) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${base64Image}`,
          detail: 'high'
        }
      });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Eres un analista de trading experto en SMC/ICT. Proporciona análisis concisos y accionables.' },
        { role: 'user', content: content }
      ],
      max_tokens: 1500,
      temperature: 0.3
    });

    res.json({
      success: true,
      analysis: response.choices[0]?.message?.content,
      tokensUsed: response.usage?.total_tokens || 0
    });

  } catch (error) {
    console.error('Error en análisis rápido:', error);
    res.status(500).json({ error: 'Error al analizar', details: error.message });
  }
});

// =============================================
// RUTAS DE TRADES
// =============================================

app.get('/api/trades', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error obteniendo trades:', error);
    res.status(500).json({ error: 'Error al obtener trades' });
  }
});

app.post('/api/trades', authenticate, async (req, res) => {
  try {
    const trade = {
      ...req.body,
      user_id: req.user.id,
      id: uuidv4()
    };

    const { data, error } = await supabase
      .from('trades')
      .insert(trade)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error creando trade:', error);
    res.status(500).json({ error: 'Error al crear trade' });
  }
});

app.put('/api/trades/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('trades')
      .update(req.body)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error actualizando trade:', error);
    res.status(500).json({ error: 'Error al actualizar trade' });
  }
});

app.delete('/api/trades/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('trades')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando trade:', error);
    res.status(500).json({ error: 'Error al eliminar trade' });
  }
});

// =============================================
// RUTAS DE ESTADÍSTICAS
// =============================================

app.get('/api/stats', authenticate, async (req, res) => {
  try {
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', req.user.id);

    if (error) throw error;

    const closedTrades = trades?.filter(t => t.result && t.result !== 'open') || [];
    
    const stats = {
      totalTrades: trades?.length || 0,
      closedTrades: closedTrades.length,
      wins: closedTrades.filter(t => t.result === 'win').length,
      losses: closedTrades.filter(t => t.result === 'loss').length,
      breakeven: closedTrades.filter(t => t.result === 'be').length,
      totalProfit: closedTrades.reduce((sum, t) => sum + (parseFloat(t.profit) || 0), 0),
      winRate: 0,
      avgRR: 0,
      profitFactor: 0
    };

    if (stats.wins + stats.losses > 0) {
      stats.winRate = ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1);
    }

    const winningTrades = closedTrades.filter(t => t.result === 'win' && t.profit > 0);
    const losingTrades = closedTrades.filter(t => t.result === 'loss' && t.profit < 0);
    
    const totalWinnings = winningTrades.reduce((sum, t) => sum + parseFloat(t.profit), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + parseFloat(t.profit), 0));
    
    if (totalLosses > 0) {
      stats.profitFactor = (totalWinnings / totalLosses).toFixed(2);
    }

    res.json(stats);
  } catch (error) {
    console.error('Error obteniendo stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// =============================================
// RUTAS DE PERFIL
// =============================================

app.get('/api/profile', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json(data || { id: req.user.id, email: req.user.email });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

app.put('/api/profile', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: req.user.id,
        ...req.body,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// =============================================
// RUTAS DE ALERTAS
// =============================================

app.get('/api/alerts', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error obteniendo alertas:', error);
    res.status(500).json({ error: 'Error al obtener alertas' });
  }
});

app.post('/api/alerts', authenticate, async (req, res) => {
  try {
    const alert = {
      ...req.body,
      user_id: req.user.id,
      id: uuidv4()
    };

    const { data, error } = await supabase
      .from('alerts')
      .insert(alert)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error creando alerta:', error);
    res.status(500).json({ error: 'Error al crear alerta' });
  }
});

app.delete('/api/alerts/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('alerts')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando alerta:', error);
    res.status(500).json({ error: 'Error al eliminar alerta' });
  }
});

// =============================================
// RUTA DE HISTORIAL DE ANÁLISIS
// =============================================

app.get('/api/analyses', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error obteniendo análisis:', error);
    res.status(500).json({ error: 'Error al obtener historial de análisis' });
  }
});

// =============================================
// STRIPE (Suscripciones) - Opcional
// =============================================

if (stripe) {
  app.post('/api/stripe/create-checkout', authenticate, async (req, res) => {
    try {
      const { priceId } = req.body;
      
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.FRONTEND_URL}/settings?success=true`,
        cancel_url: `${process.env.FRONTEND_URL}/settings?canceled=true`,
        customer_email: req.user.email,
        metadata: { userId: req.user.id }
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error('Stripe error:', error);
      res.status(500).json({ error: 'Error al crear sesión de pago' });
    }
  });
}

// =============================================
// MANEJO DE ERRORES
// =============================================

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// =============================================
// INICIAR SERVIDOR
// =============================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║       TRADING MASTER PRO - API SERVER v2.0                ║
╠═══════════════════════════════════════════════════════════╣
║  🚀 Server running on port ${String(PORT).padEnd(28)}║
║  🤖 AI: OpenAI GPT-4 Vision                               ║
║  📊 Analysis: Multi-Timeframe SMC/ICT                     ║
║  📈 Timeframes: H1, 15M, 5M, 1M                           ║
║  💾 Database: Supabase                                    ║
║  💳 Payments: ${stripe ? 'Stripe Enabled' : 'Stripe Disabled'}                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
