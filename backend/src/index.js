// =============================================
// TRADING MASTER PRO - BACKEND API
// Usando OpenAI GPT-4 Vision para análisis
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

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// OpenAI (GPT-4 Vision)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

// Stripe (opcional)
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Multer para imágenes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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

// Rate limiting general
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  message: { error: 'Demasiadas solicitudes, intenta más tarde' }
});

// Rate limiting para análisis (más estricto)
const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20, // 20 análisis por hora
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

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Trading Master Pro API',
    version: '1.0.0',
    ai: 'OpenAI GPT-4 Vision'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// =============================================
// PROMPT SMC/ICT PARA ANÁLISIS
// =============================================

const SMC_SYSTEM_PROMPT = `Eres un analista experto en Smart Money Concepts (SMC) e Inner Circle Trader (ICT). 
Tu trabajo es analizar gráficos de trading y proporcionar análisis profesionales.

METODOLOGÍA SMC/ICT:
1. ESTRUCTURA DE MERCADO:
   - Identificar Higher Highs (HH), Higher Lows (HL) para tendencia alcista
   - Identificar Lower Highs (LH), Lower Lows (LL) para tendencia bajista
   - Buscar Break of Structure (BOS) y Change of Character (ChoCH)

2. ZONAS INSTITUCIONALES:
   - Order Blocks (OB): Última vela contraria antes de un movimiento fuerte
   - Fair Value Gaps (FVG): Gaps de 3 velas donde el precio no ha rellenado
   - Breaker Blocks: Order blocks que han sido invalidados

3. LIQUIDEZ:
   - Buy Side Liquidity (BSL): Stops sobre máximos
   - Sell Side Liquidity (SSL): Stops bajo mínimos
   - Equal Highs/Lows: Zonas de acumulación de stops

4. ENTRADA ÓPTIMA:
   - OTE (Optimal Trade Entry): Zona de 61.8%-79% de Fibonacci
   - Esperar barrido de liquidez + retorno a zona de interés

RESPONDE SIEMPRE EN FORMATO JSON con esta estructura:
{
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "marketStructure": {
    "trend": "BULLISH" | "BEARISH" | "RANGING",
    "bos": true/false,
    "choch": true/false
  },
  "keyLevels": {
    "entry": "precio sugerido",
    "stopLoss": "precio SL",
    "takeProfit1": "precio TP1",
    "takeProfit2": "precio TP2",
    "takeProfit3": "precio TP3"
  },
  "zones": {
    "orderBlocks": ["descripción de OBs identificados"],
    "fvg": ["descripción de FVGs"],
    "liquidity": ["zonas de liquidez"]
  },
  "riskReward": "ratio R:R",
  "probability": "porcentaje estimado de éxito",
  "analysis": "Explicación detallada del análisis",
  "confirmations": ["lista de confirmaciones presentes"],
  "warnings": ["posibles riesgos o advertencias"]
}`;

// =============================================
// RUTA DE ANÁLISIS CON OPENAI GPT-4 VISION
// =============================================

app.post('/api/analyze', authenticate, upload.array('images', 4), async (req, res) => {
  try {
    const { asset, timeframe, direction } = req.body;
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

    if (images.length === 0 && base64Images.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos una imagen' });
    }

    // Verificar que OpenAI está configurado
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API no configurada' });
    }

    // Construir el contenido del mensaje con las imágenes
    const content = [
      {
        type: 'text',
        text: `Analiza este gráfico de trading para ${asset || 'el activo mostrado'}.
Timeframe: ${timeframe || 'Detectar del gráfico'}
Dirección considerada por el trader: ${direction || 'No especificada'}

Proporciona un análisis SMC/ICT completo en formato JSON.`
      }
    ];

    // Agregar imágenes subidas via multer
    for (const image of images) {
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

    console.log(`Analizando ${images.length + base64Images.length} imagen(es) para ${asset || 'activo'}...`);

    // Llamar a OpenAI GPT-4 Vision
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // GPT-4 con visión
      messages: [
        { role: 'system', content: SMC_SYSTEM_PROMPT },
        { role: 'user', content: content }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });

    const analysisText = response.choices[0]?.message?.content || '';
    
    // Intentar parsear como JSON
    let analysisData;
    try {
      // Buscar JSON en la respuesta
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[0]);
      } else {
        analysisData = { 
          analysis: analysisText,
          direction: 'NEUTRAL',
          confidence: 'LOW'
        };
      }
    } catch {
      analysisData = { 
        analysis: analysisText,
        direction: 'NEUTRAL',
        confidence: 'LOW'
      };
    }

    // Guardar en base de datos (si Supabase está configurado)
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        await supabase.from('analyses').insert({
          user_id: req.user.id,
          asset: asset || 'Unknown',
          timeframe: timeframe || 'Unknown',
          direction: analysisData.direction,
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
      tokensUsed: response.usage?.total_tokens || 0
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

    const stats = {
      totalTrades: trades?.length || 0,
      wins: trades?.filter(t => t.result === 'win').length || 0,
      losses: trades?.filter(t => t.result === 'loss').length || 0,
      breakeven: trades?.filter(t => t.result === 'be').length || 0,
      totalProfit: trades?.reduce((sum, t) => sum + (t.profit || 0), 0) || 0,
      winRate: 0,
      avgRR: 0
    };

    if (stats.wins + stats.losses > 0) {
      stats.winRate = ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1);
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
║         TRADING MASTER PRO - API SERVER                   ║
║═══════════════════════════════════════════════════════════║
║  🚀 Server running on port ${PORT}                           ║
║  🤖 AI Provider: OpenAI GPT-4 Vision                      ║
║  📊 Database: Supabase                                    ║
║  💳 Payments: ${stripe ? 'Stripe Enabled' : 'Stripe Disabled'}                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
