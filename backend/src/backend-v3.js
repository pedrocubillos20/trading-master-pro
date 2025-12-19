// =============================================
// TRADING MASTER PRO - BACKEND API v3.0
// Sistema SMC Multi-Timeframe con Aprendizaje
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
// VERIFICACIÓN DE CONFIGURACIÓN
// =============================================
console.log('\n🔧 VERIFICANDO CONFIGURACIÓN...\n');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Configurada' : '❌ NO CONFIGURADA');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Configurada' : '❌ NO CONFIGURADA');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Configurada' : '❌ NO CONFIGURADA');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL || 'No configurada (usando *)');
console.log('\n');

// =============================================
// CONFIGURACIÓN DE CLIENTES
// =============================================

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Verificar conexión con OpenAI al iniciar
const verifyOpenAI = async () => {
  if (!openai) {
    console.log('⚠️ OpenAI NO está configurado - Los análisis no funcionarán');
    return false;
  }
  try {
    const test = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 5
    });
    console.log('✅ OpenAI conectado correctamente');
    return true;
  } catch (error) {
    console.log('❌ Error conectando con OpenAI:', error.message);
    return false;
  }
};

// Multer para imágenes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
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

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin: '*', // Permitir todos los orígenes por ahora
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Rate limiting
const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: 'Límite de análisis alcanzado, espera 1 hora' }
});

// =============================================
// MIDDLEWARE DE AUTENTICACIÓN (SIMPLIFICADO)
// =============================================

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    // Si no hay supabase configurado, permitir acceso (modo demo)
    if (!supabase) {
      req.user = { id: 'demo-user', email: 'demo@example.com' };
      return next();
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Modo demo si no hay token
      req.user = { id: 'demo-user', email: 'demo@example.com' };
      return next();
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      req.user = { id: 'demo-user', email: 'demo@example.com' };
      return next();
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
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
    service: 'Trading Master Pro API v3.0',
    version: '3.0.0',
    ai: openai ? 'OpenAI GPT-4 Vision ✅' : 'OpenAI NO CONFIGURADO ❌',
    supabase: supabase ? 'Conectado ✅' : 'No configurado',
    features: [
      'Multi-Timeframe SMC Analysis',
      'ICT Methodology', 
      'Precise Entries',
      'Learning System',
      'Risk Management'
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    openai: openai ? 'connected' : 'not configured',
    supabase: supabase ? 'connected' : 'not configured'
  });
});

// Verificar estado de OpenAI
app.get('/api/check-ai', async (req, res) => {
  if (!openai) {
    return res.json({ 
      connected: false, 
      error: 'OPENAI_API_KEY no está configurada en el servidor' 
    });
  }
  
  try {
    const test = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Responde solo: OK' }],
      max_tokens: 10
    });
    res.json({ 
      connected: true, 
      model: 'gpt-4o',
      response: test.choices[0]?.message?.content 
    });
  } catch (error) {
    res.json({ 
      connected: false, 
      error: error.message 
    });
  }
});

// =============================================
// PROMPT SMC/ICT PROFESIONAL v3
// =============================================

const createAnalysisPrompt = (asset, userHistory) => {
  const historyContext = userHistory && userHistory.length > 0
    ? `
HISTORIAL DEL TRADER (últimos ${userHistory.length} trades):
- Win Rate: ${userHistory.winRate}%
- Trades ganados: ${userHistory.wins}
- Trades perdidos: ${userHistory.losses}
- Activos más operados: ${userHistory.topAssets?.join(', ') || 'N/A'}
- Errores comunes: ${userHistory.commonMistakes?.join(', ') || 'N/A'}

Considera este historial para dar recomendaciones personalizadas.
`
    : '';

  return `Eres un TRADER INSTITUCIONAL EXPERTO con más de 15 años de experiencia en Smart Money Concepts (SMC) e Inner Circle Trader (ICT).

Tu rol es analizar gráficos como lo haría un trader de un banco de inversión o hedge fund. Debes ser PRECISO, PROFESIONAL y PRÁCTICO.

${historyContext}

═══════════════════════════════════════════════════════════
METODOLOGÍA DE ANÁLISIS MULTI-TIMEFRAME
═══════════════════════════════════════════════════════════

📊 ANÁLISIS H1 (Macro):
- Identificar TENDENCIA PRINCIPAL usando estructura HH/HL o LH/LL
- Localizar zonas de LIQUIDEZ MAYOR (máximos/mínimos de swing)
- Identificar ORDER BLOCKS institucionales
- Buscar IMBALANCES (FVG) significativos

📊 ANÁLISIS 15M (Contexto):
- Confirmar dirección de H1
- Identificar BOS o ChoCH reciente
- Localizar ORDER BLOCKS de interés
- Identificar zonas PREMIUM/DISCOUNT

📊 ANÁLISIS 5M (Refinamiento):
- Buscar el OB de entrada específico
- Confirmar barrido de liquidez (sweep)
- Identificar OTE (61.8%-79% Fibonacci)
- Buscar FVG para entrada

📊 ANÁLISIS 1M (Entrada Sniper):
- Esperar confirmación de entrada (rejection, engulfing)
- Definir SL preciso (detrás del OB)
- Entrada en el OB o FVG confirmado

═══════════════════════════════════════════════════════════
CONCEPTOS CLAVE SMC/ICT
═══════════════════════════════════════════════════════════

ESTRUCTURA:
• BOS (Break of Structure) = Continuación de tendencia
• ChoCH (Change of Character) = Posible reversión
• MSS (Market Structure Shift) = Cambio confirmado

LIQUIDEZ:
• BSL (Buy Side Liquidity) = Stops sobre máximos (target para shorts)
• SSL (Sell Side Liquidity) = Stops bajo mínimos (target para longs)
• EQH/EQL = Liquidez acumulada en dobles techos/suelos

ZONAS DE INTERÉS:
• Order Block (OB) = Zona donde entró el dinero institucional
• Fair Value Gap (FVG) = Imbalance que el precio tiende a rellenar
• Breaker Block = OB invalidado que actúa en reversa

ENTRADA:
• OTE = Optimal Trade Entry (61.8%-79% del retroceso)
• Confirmation Entry = Esperar vela de confirmación
• Aggressive Entry = Entrar en la zona sin confirmación

═══════════════════════════════════════════════════════════
RESPUESTA JSON OBLIGATORIA
═══════════════════════════════════════════════════════════

IMPORTANTE: Responde ÚNICAMENTE con este JSON, sin texto adicional antes o después:

{
  "analisis_general": {
    "tendencia_principal": "ALCISTA | BAJISTA | RANGO",
    "sesgo_operativo": "COMPRA | VENTA | ESPERAR",
    "confianza": "ALTA | MEDIA | BAJA",
    "probabilidad_exito": "XX%",
    "confluencias_encontradas": 0
  },
  
  "analisis_por_timeframe": {
    "H1": {
      "tendencia": "Descripción clara",
      "estructura": "HH/HL o LH/LL detectados",
      "liquidez_pendiente": "BSL o SSL por barrer",
      "order_blocks": ["OB 1 en precio X", "OB 2 en precio Y"],
      "fvg": ["FVG en zona X-Y"]
    },
    "M15": {
      "alineacion_con_H1": true,
      "ultimo_bos_choch": "Descripción",
      "zona_actual": "PREMIUM | DISCOUNT | EQUILIBRIO",
      "poi_identificados": ["POI 1", "POI 2"]
    },
    "M5": {
      "ob_de_entrada": "Descripción del OB específico",
      "liquidity_sweep": "¿Se barrió liquidez? Sí/No - Descripción",
      "fvg_entrada": "FVG identificado para entrada",
      "ote_zone": "Zona OTE identificada"
    },
    "M1": {
      "confirmacion": "Tipo de confirmación esperada",
      "patron_vela": "Engulfing, Pin Bar, etc.",
      "timing": "Descripción del momento de entrada"
    }
  },
  
  "setup_operativo": {
    "direccion": "COMPRA | VENTA",
    "tipo_entrada": "AGRESIVA | CONFIRMACIÓN | LIMIT ORDER",
    "precio_entrada": "X.XXXXX",
    "stop_loss": "X.XXXXX",
    "take_profit_1": "X.XXXXX",
    "take_profit_2": "X.XXXXX",
    "take_profit_3": "X.XXXXX",
    "pips_riesgo": "XX",
    "pips_tp1": "XX",
    "ratio_rr": "1:X.X",
    "ratio_rr_tp2": "1:X.X",
    "ratio_rr_tp3": "1:X.X"
  },
  
  "ejecucion_metatrader": {
    "accion": "ENTRAR AHORA | ESPERAR CONFIRMACIÓN | COLOCAR ORDEN PENDIENTE | NO OPERAR",
    "tipo_orden": "BUY MARKET | SELL MARKET | BUY LIMIT | SELL LIMIT | BUY STOP | SELL STOP",
    "instrucciones": [
      "1. Instrucción específica",
      "2. Instrucción específica",
      "3. Instrucción específica",
      "4. Instrucción específica",
      "5. Instrucción específica"
    ],
    "confirmacion_requerida": "Descripción de qué esperar antes de entrar",
    "tiempo_validez": "Setup válido por X horas/minutos",
    "invalidacion": "El setup se invalida si..."
  },
  
  "gestion_riesgo": {
    "riesgo_sugerido": "1-2%",
    "gestion_parciales": {
      "tp1": "Cerrar 50%, mover SL a BE",
      "tp2": "Cerrar 30%",
      "tp3": "Cerrar 20% restante"
    },
    "breakeven": "Mover a BE cuando precio alcance TP1"
  },
  
  "confluencias": [
    "✅ Confluencia 1 identificada",
    "✅ Confluencia 2 identificada",
    "✅ Confluencia 3 identificada"
  ],
  
  "advertencias": [
    "⚠️ Advertencia 1",
    "⚠️ Advertencia 2"
  ],
  
  "consejo_personalizado": "Consejo específico basado en el análisis actual",
  
  "resumen_ejecutivo": "Resumen de 2-3 oraciones explicando claramente el setup: qué hacer, dónde entrar, dónde poner SL y TP, y por qué."
}`;
};

// =============================================
// RUTA PRINCIPAL DE ANÁLISIS
// =============================================

app.post('/api/analyze', authenticate, upload.array('images', 4), async (req, res) => {
  console.log('\n═══════════════════════════════════════');
  console.log('📊 NUEVA SOLICITUD DE ANÁLISIS');
  console.log('═══════════════════════════════════════');
  
  try {
    // Verificar que OpenAI esté configurado
    if (!openai) {
      console.log('❌ OpenAI no configurado');
      return res.status(500).json({ 
        error: 'El servicio de IA no está configurado',
        details: 'OPENAI_API_KEY no está configurada en el servidor. Contacta al administrador.',
        solution: 'Configura OPENAI_API_KEY en las variables de entorno de Railway'
      });
    }

    const { asset, accountBalance, riskPercent } = req.body;
    
    // Obtener imágenes de múltiples fuentes
    let imageContents = [];
    
    // 1. Imágenes subidas via multer (form-data)
    if (req.files && req.files.length > 0) {
      console.log(`📷 Recibidas ${req.files.length} imágenes via form-data`);
      for (const file of req.files) {
        const base64 = file.buffer.toString('base64');
        imageContents.push({
          type: 'image_url',
          image_url: {
            url: `data:${file.mimetype};base64,${base64}`,
            detail: 'high'
          }
        });
      }
    }
    
    // 2. Imágenes en base64 desde JSON body
    if (req.body.images) {
      let imagesArray = [];
      try {
        imagesArray = typeof req.body.images === 'string' 
          ? JSON.parse(req.body.images) 
          : req.body.images;
      } catch (e) {
        console.log('Error parseando imágenes JSON:', e.message);
      }
      
      if (Array.isArray(imagesArray) && imagesArray.length > 0) {
        console.log(`📷 Recibidas ${imagesArray.length} imágenes via JSON`);
        for (const img of imagesArray) {
          const imgData = typeof img === 'string' ? img : (img.data || img);
          if (imgData && imgData.length > 100) { // Verificar que hay datos reales
            imageContents.push({
              type: 'image_url',
              image_url: {
                url: imgData.startsWith('data:') ? imgData : `data:image/png;base64,${imgData}`,
                detail: 'high'
              }
            });
          }
        }
      }
    }

    // 3. Imágenes individuales (image1, image2, etc.)
    for (let i = 1; i <= 4; i++) {
      const imgKey = `image${i}`;
      if (req.body[imgKey]) {
        const imgData = req.body[imgKey];
        if (imgData && imgData.length > 100) {
          imageContents.push({
            type: 'image_url',
            image_url: {
              url: imgData.startsWith('data:') ? imgData : `data:image/png;base64,${imgData}`,
              detail: 'high'
            }
          });
        }
      }
    }

    console.log(`📊 Total imágenes procesadas: ${imageContents.length}`);
    console.log(`📈 Activo: ${asset || 'No especificado'}`);
    console.log(`👤 Usuario: ${req.user?.email || 'demo'}`);

    if (imageContents.length === 0) {
      return res.status(400).json({ 
        error: 'No se recibieron imágenes',
        details: 'Debes subir al menos 1 imagen del gráfico para analizar',
        received: {
          files: req.files?.length || 0,
          bodyImages: req.body.images ? 'presente' : 'no',
        }
      });
    }

    // Obtener historial del usuario para aprendizaje
    let userHistory = null;
    if (supabase && req.user?.id && req.user.id !== 'demo-user') {
      try {
        const { data: trades } = await supabase
          .from('trades')
          .select('*')
          .eq('user_id', req.user.id)
          .order('created_at', { ascending: false })
          .limit(100);

        if (trades && trades.length > 0) {
          const wins = trades.filter(t => t.result === 'win').length;
          const losses = trades.filter(t => t.result === 'loss').length;
          userHistory = {
            totalTrades: trades.length,
            wins,
            losses,
            winRate: ((wins / (wins + losses)) * 100).toFixed(1),
            topAssets: [...new Set(trades.map(t => t.asset))].slice(0, 5)
          };
        }
      } catch (e) {
        console.log('No se pudo obtener historial:', e.message);
      }
    }

    // Construir mensaje para GPT-4 Vision
    const userMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `ANALIZA ESTOS GRÁFICOS DE TRADING:

ACTIVO: ${asset || 'Identificar del gráfico'}
BALANCE: $${accountBalance || 1000}
RIESGO POR TRADE: ${riskPercent || 1}%

IMÁGENES ADJUNTAS (${imageContents.length}):
${imageContents.length >= 4 ? '- Imagen 1: H1 (contexto)\n- Imagen 2: 15M (zonas)\n- Imagen 3: 5M (refinamiento)\n- Imagen 4: 1M (entrada)' : 
  imageContents.length === 1 ? '- Una sola imagen para análisis rápido' :
  `- ${imageContents.length} imágenes proporcionadas`}

INSTRUCCIONES:
1. Analiza la estructura de mercado (HH/HL o LH/LL)
2. Identifica zonas de liquidez (BSL/SSL)
3. Localiza Order Blocks y FVGs
4. Determina si hay setup válido
5. Si hay setup, da precios EXACTOS de entrada, SL y TP
6. Explica paso a paso cómo ejecutar en MetaTrader

RESPONDE SOLO CON EL JSON ESTRUCTURADO.`
        },
        ...imageContents
      ]
    };

    console.log('\n🤖 Enviando a GPT-4 Vision...');
    const startTime = Date.now();

    // Llamar a OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: createAnalysisPrompt(asset, userHistory) },
        userMessage
      ],
      max_tokens: 4000,
      temperature: 0.3
    });

    const endTime = Date.now();
    console.log(`✅ Respuesta recibida en ${(endTime - startTime) / 1000}s`);
    console.log(`📊 Tokens usados: ${response.usage?.total_tokens || 'N/A'}`);

    const analysisText = response.choices[0]?.message?.content || '';
    
    // Parsear respuesta JSON
    let analysisData;
    try {
      // Limpiar el texto
      let cleanText = analysisText
        .replace(/```json\n?/gi, '')
        .replace(/```\n?/gi, '')
        .trim();
      
      // Buscar el JSON
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[0]);
        console.log('✅ JSON parseado correctamente');
      } else {
        throw new Error('No se encontró JSON en la respuesta');
      }
    } catch (parseError) {
      console.log('⚠️ Error parseando JSON, usando texto raw');
      analysisData = { 
        analisis_general: {
          tendencia_principal: 'VER ANÁLISIS',
          sesgo_operativo: 'VER ANÁLISIS',
          confianza: 'MEDIA',
          probabilidad_exito: 'N/A'
        },
        resumen_ejecutivo: analysisText,
        raw_response: true
      };
    }

    // Guardar análisis en BD
    if (supabase && req.user?.id && req.user.id !== 'demo-user') {
      try {
        await supabase.from('analyses').insert({
          user_id: req.user.id,
          asset: asset || 'Unknown',
          timeframe: `Multi-TF (${imageContents.length} imgs)`,
          direction: analysisData.setup_operativo?.direccion || analysisData.analisis_general?.sesgo_operativo,
          analysis_data: analysisData,
          tokens_used: response.usage?.total_tokens || 0,
          created_at: new Date().toISOString()
        });
        console.log('💾 Análisis guardado en BD');
      } catch (dbError) {
        console.log('⚠️ Error guardando en BD:', dbError.message);
      }
    }

    // Respuesta exitosa
    res.json({
      success: true,
      analysis: analysisData,
      meta: {
        tokensUsed: response.usage?.total_tokens || 0,
        model: 'gpt-4o',
        imagesAnalyzed: imageContents.length,
        processingTime: `${(endTime - startTime) / 1000}s`,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error en análisis:', error);
    
    // Errores específicos de OpenAI
    if (error.code === 'insufficient_quota') {
      return res.status(402).json({
        error: 'Créditos de OpenAI agotados',
        details: 'La cuenta de OpenAI no tiene créditos suficientes',
        solution: 'Agrega créditos en platform.openai.com'
      });
    }
    
    if (error.code === 'invalid_api_key') {
      return res.status(401).json({
        error: 'API Key de OpenAI inválida',
        details: 'La OPENAI_API_KEY configurada no es válida',
        solution: 'Verifica la API key en Railway'
      });
    }

    res.status(500).json({ 
      error: 'Error al procesar el análisis',
      details: error.message,
      type: error.code || 'unknown'
    });
  }
});

// =============================================
// RUTA DE ANÁLISIS RÁPIDO (1 imagen)
// =============================================

app.post('/api/analyze-quick', authenticate, async (req, res) => {
  try {
    if (!openai) {
      return res.status(500).json({ error: 'OpenAI no configurado' });
    }

    const { image, asset, timeframe } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Se requiere una imagen' });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { 
          role: 'system', 
          content: 'Eres un analista de trading experto en SMC/ICT. Proporciona análisis concisos y prácticos.' 
        },
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: `Analiza rápidamente este gráfico de ${asset || 'trading'} en ${timeframe || 'el timeframe mostrado'}.
              
Da una respuesta breve con:
- Tendencia actual
- Zona de interés más cercana
- Posible dirección
- Nivel clave a observar` 
            },
            {
              type: 'image_url',
              image_url: {
                url: image.startsWith('data:') ? image : `data:image/png;base64,${image}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.3
    });

    res.json({
      success: true,
      analysis: response.choices[0]?.message?.content,
      tokensUsed: response.usage?.total_tokens || 0
    });

  } catch (error) {
    console.error('Error en análisis rápido:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// RUTAS DE DATOS (Trades, Stats, etc.)
// =============================================

// Obtener trades
app.get('/api/trades', authenticate, async (req, res) => {
  if (!supabase) {
    return res.json([]);
  }
  
  try {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear trade
app.post('/api/trades', authenticate, async (req, res) => {
  if (!supabase) {
    return res.json({ id: uuidv4(), ...req.body });
  }
  
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
    res.status(500).json({ error: error.message });
  }
});

// Estadísticas
app.get('/api/stats', authenticate, async (req, res) => {
  if (!supabase) {
    return res.json({
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalProfit: 0
    });
  }
  
  try {
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', req.user.id);

    if (error) throw error;

    const closedTrades = trades?.filter(t => t.result && t.result !== 'open') || [];
    const wins = closedTrades.filter(t => t.result === 'win').length;
    const losses = closedTrades.filter(t => t.result === 'loss').length;

    res.json({
      totalTrades: trades?.length || 0,
      wins,
      losses,
      breakeven: closedTrades.filter(t => t.result === 'be').length,
      winRate: (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0,
      totalProfit: closedTrades.reduce((sum, t) => sum + (parseFloat(t.profit) || 0), 0).toFixed(2)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Historial de análisis
app.get('/api/analyses', authenticate, async (req, res) => {
  if (!supabase) {
    return res.json([]);
  }
  
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
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// MANEJO DE ERRORES
// =============================================

app.use((err, req, res, next) => {
  console.error('Error global:', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: err.message
  });
});

// =============================================
// INICIAR SERVIDOR
// =============================================

app.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║       TRADING MASTER PRO - API SERVER v3.0                ║
╠═══════════════════════════════════════════════════════════╣
║  🚀 Server: http://localhost:${PORT}                         ║
║  🤖 AI: ${openai ? 'OpenAI GPT-4 Vision ✅' : 'NO CONFIGURADO ❌'}
║  💾 DB: ${supabase ? 'Supabase ✅' : 'NO CONFIGURADO ⚠️'}
╠═══════════════════════════════════════════════════════════╣
║  Endpoints:                                               ║
║  GET  /              - Status del servidor                ║
║  GET  /health        - Health check                       ║
║  GET  /api/check-ai  - Verificar conexión OpenAI          ║
║  POST /api/analyze   - Análisis Multi-Timeframe           ║
║  POST /api/analyze-quick - Análisis rápido (1 imagen)     ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  // Verificar OpenAI al iniciar
  if (openai) {
    await verifyOpenAI();
  }
});

export default app;
