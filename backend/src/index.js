// =============================================
// TRADING MASTER PRO - BACKEND API
// =============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import Stripe from 'stripe';

dotenv.config();

// ============ INICIALIZACIÓN ============
const app = express();
const PORT = process.env.PORT || 3001;

// Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Anthropic Client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Stripe Client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ============ MIDDLEWARE ============
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por ventana
  message: { error: 'Demasiadas solicitudes, intenta más tarde' }
});
app.use('/api/', limiter);

// Rate limiting específico para análisis de IA (más estricto)
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20, // máximo 20 análisis por hora para plan gratuito
  message: { error: 'Límite de análisis alcanzado. Actualiza tu plan para más.' }
});

// ============ MIDDLEWARE DE AUTENTICACIÓN ============
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Obtener perfil del usuario
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    req.user = { ...user, profile };
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Error de autenticación' });
  }
};

// Verificar plan de suscripción
const checkPlan = (requiredPlans) => {
  return (req, res, next) => {
    const userPlan = req.user?.profile?.subscription_plan || 'free';
    if (!requiredPlans.includes(userPlan)) {
      return res.status(403).json({ 
        error: 'Plan insuficiente',
        required: requiredPlans,
        current: userPlan
      });
    }
    next();
  };
};

// ============ RUTAS DE SALUD ============
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Trading Master Pro API',
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ============ RUTAS DE ANÁLISIS SMC ============
const SMC_SYSTEM_PROMPT = `Eres un trader profesional de élite especializado en Smart Money Concepts (SMC) e Inner Circle Trader (ICT) concepts. Analiza los gráficos proporcionados con precisión institucional.

METODOLOGÍA SMC/ICT A APLICAR:
1. ESTRUCTURA DEL MERCADO
   - Higher Highs (HH), Higher Lows (HL) = Tendencia alcista
   - Lower Highs (LH), Lower Lows (LL) = Tendencia bajista
   - Break of Structure (BOS) - continuación de tendencia
   - Change of Character (CHoCH) - posible cambio de tendencia

2. ZONAS DE INTERÉS INSTITUCIONAL
   - Order Blocks (OB): Última vela contraria antes del impulso
   - Fair Value Gaps (FVG): Imbalances/vacíos de precio
   - Breaker Blocks: OB que falló y ahora es zona contraria
   - Mitigation Blocks: Zonas de mitigación de órdenes

3. LIQUIDEZ
   - Buy-side Liquidity (BSL): Stops sobre máximos iguales
   - Sell-side Liquidity (SSL): Stops bajo mínimos iguales
   - Liquidity Sweeps/Grabs: Barrido de liquidez

4. CONCEPTOS AVANZADOS
   - Optimal Trade Entry (OTE): Zona Fib 62%-79%
   - Premium Zone: Por encima del 50% (zona de venta)
   - Discount Zone: Por debajo del 50% (zona de compra)

RESPONDE SIEMPRE EN FORMATO JSON con esta estructura:
{
  "asset": "nombre del activo",
  "timeframes": ["H1", "M15", etc],
  "trend": {
    "htf": "ALCISTA|BAJISTA|RANGO",
    "ltf": "ALCISTA|BAJISTA|RANGO",
    "description": "descripción breve"
  },
  "structure": {
    "last_bos": {"level": 0.0, "type": "alcista|bajista"},
    "last_choch": {"level": 0.0, "description": "si existe"}
  },
  "key_levels": {
    "resistance": 0.0,
    "support": 0.0,
    "order_block": {"level": 0.0, "type": "bullish|bearish", "valid": true},
    "fvg": {"level": 0.0, "filled": false},
    "liquidity": {"bsl": 0.0, "ssl": 0.0}
  },
  "setup": {
    "direction": "BUY|SELL|NO_SETUP",
    "entry_type": "OB|FVG|OTE|BREAKER",
    "entry_price": 0.0,
    "stop_loss": 0.0,
    "take_profit_1": 0.0,
    "take_profit_2": 0.0,
    "take_profit_3": 0.0,
    "risk_reward": 0.0
  },
  "confirmations": {
    "trend_clear": true,
    "bos_confirmed": true,
    "in_discount_premium": true,
    "valid_poi": true,
    "liquidity_swept": true,
    "multi_tf_aligned": true,
    "total": 6
  },
  "probability": "HIGH|MEDIUM|LOW",
  "action": "descripción clara de qué hacer",
  "invalidation": "qué invalida el setup",
  "educational_note": "nota educativa breve"
}`;

app.post('/api/analyze', authenticate, aiLimiter, async (req, res) => {
  try {
    const { images, asset, category } = req.body;
    const userId = req.user.id;
    const userPlan = req.user.profile?.subscription_plan || 'free';

    // Verificar límites según plan
    const { count } = await supabase
      .from('analyses')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const limits = { free: 5, pro: 50, elite: 200, institutional: 1000 };
    if (count >= limits[userPlan]) {
      return res.status(429).json({ 
        error: 'Límite de análisis diarios alcanzado',
        limit: limits[userPlan],
        used: count
      });
    }

    // Preparar contenido para Claude
    const content = [
      ...images.map(img => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.type || 'image/png',
          data: img.data,
        },
      })),
      {
        type: 'text',
        text: `Analiza estos gráficos del activo: ${asset} (${category}). Responde SOLO con el JSON, sin texto adicional.`,
      },
    ];

    // Llamar a Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: SMC_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    const analysisText = message.content[0].text;
    
    // Intentar parsear JSON
    let analysisJson;
    try {
      // Limpiar el texto por si tiene markdown
      const cleanJson = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysisJson = JSON.parse(cleanJson);
    } catch (e) {
      // Si no es JSON válido, devolver como texto
      analysisJson = { raw_analysis: analysisText };
    }

    // Guardar análisis en base de datos
    const { data: savedAnalysis, error: saveError } = await supabase
      .from('analyses')
      .insert({
        user_id: userId,
        asset,
        category,
        analysis_result: analysisText,
        direction_suggested: analysisJson.setup?.direction,
        entry_price_suggested: analysisJson.setup?.entry_price,
        sl_suggested: analysisJson.setup?.stop_loss,
        tp_suggested: analysisJson.setup?.take_profit_1,
        confidence: analysisJson.probability?.toLowerCase(),
        tokens_used: message.usage?.input_tokens + message.usage?.output_tokens,
      })
      .select()
      .single();

    // Registrar uso de API
    await supabase.from('api_usage').insert({
      user_id: userId,
      endpoint: 'analyze',
      tokens_input: message.usage?.input_tokens || 0,
      tokens_output: message.usage?.output_tokens || 0,
      cost_usd: ((message.usage?.input_tokens || 0) * 0.003 + (message.usage?.output_tokens || 0) * 0.015) / 1000,
    });

    res.json({
      success: true,
      analysis: analysisJson,
      raw: analysisText,
      id: savedAnalysis?.id,
      usage: {
        daily_count: count + 1,
        daily_limit: limits[userPlan],
      },
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Error al realizar el análisis', details: error.message });
  }
});

// ============ RUTAS DE TRADES ============
app.get('/api/trades', authenticate, async (req, res) => {
  try {
    const { limit = 50, offset = 0, result } = req.query;
    
    let query = supabase
      .from('trades')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (result) {
      query = query.eq('result', result);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({ trades: data, total: count });
  } catch (error) {
    console.error('Get trades error:', error);
    res.status(500).json({ error: 'Error al obtener trades' });
  }
});

app.post('/api/trades', authenticate, async (req, res) => {
  try {
    const trade = {
      user_id: req.user.id,
      ...req.body,
    };

    const { data, error } = await supabase
      .from('trades')
      .insert(trade)
      .select()
      .single();

    if (error) throw error;

    // Crear notificación
    await supabase.from('notifications').insert({
      user_id: req.user.id,
      type: 'trade',
      title: trade.result === 'win' ? '✅ Trade Ganador' : '❌ Trade Perdedor',
      message: `${trade.asset}: ${trade.profit >= 0 ? '+' : ''}$${trade.profit}`,
    });

    res.json({ success: true, trade: data });
  } catch (error) {
    console.error('Create trade error:', error);
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

    res.json({ success: true, trade: data });
  } catch (error) {
    console.error('Update trade error:', error);
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
    console.error('Delete trade error:', error);
    res.status(500).json({ error: 'Error al eliminar trade' });
  }
});

// ============ RUTAS DE ESTADÍSTICAS ============
app.get('/api/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener estadísticas del view
    const { data: stats } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Obtener rendimiento diario (últimos 30 días)
    const { data: dailyPerformance } = await supabase
      .from('daily_performance')
      .select('*')
      .eq('user_id', userId)
      .gte('trade_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('trade_date', { ascending: false });

    // Calcular racha actual
    const { data: recentTrades } = await supabase
      .from('trades')
      .select('result')
      .eq('user_id', userId)
      .in('result', ['win', 'loss'])
      .order('created_at', { ascending: false })
      .limit(20);

    let streak = 0;
    let streakType = null;
    if (recentTrades?.length > 0) {
      streakType = recentTrades[0].result;
      for (const trade of recentTrades) {
        if (trade.result === streakType) streak++;
        else break;
      }
    }

    res.json({
      ...stats,
      streak: { count: streak, type: streakType },
      daily_performance: dailyPerformance,
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ============ RUTAS DE ALERTAS ============
app.get('/api/alerts', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ alerts: data });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Error al obtener alertas' });
  }
});

app.post('/api/alerts', authenticate, async (req, res) => {
  try {
    const userPlan = req.user.profile?.subscription_plan || 'free';
    
    // Verificar límite de alertas según plan
    const { count } = await supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('triggered', false);

    const limits = { free: 3, pro: 20, elite: 100, institutional: 500 };
    if (count >= limits[userPlan]) {
      return res.status(429).json({ 
        error: 'Límite de alertas alcanzado',
        limit: limits[userPlan]
      });
    }

    const { data, error } = await supabase
      .from('alerts')
      .insert({
        user_id: req.user.id,
        ...req.body,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, alert: data });
  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ error: 'Error al crear alerta' });
  }
});

app.delete('/api/alerts/:id', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('alerts')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Delete alert error:', error);
    res.status(500).json({ error: 'Error al eliminar alerta' });
  }
});

// ============ RUTAS DE COMUNIDAD ============
app.get('/api/community/posts', authenticate, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('community_posts')
      .select(`
        *,
        profiles:user_id (full_name, avatar_url, subscription_plan)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({ posts: data });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Error al obtener posts' });
  }
});

app.post('/api/community/posts', authenticate, checkPlan(['pro', 'elite', 'institutional']), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('community_posts')
      .insert({
        user_id: req.user.id,
        ...req.body,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, post: data });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Error al crear post' });
  }
});

app.post('/api/community/posts/:id/like', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si ya dio like
    const { data: existing } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', id)
      .eq('user_id', req.user.id)
      .single();

    if (existing) {
      // Quitar like
      await supabase
        .from('post_likes')
        .delete()
        .eq('id', existing.id);
      
      res.json({ liked: false });
    } else {
      // Dar like
      await supabase
        .from('post_likes')
        .insert({ post_id: id, user_id: req.user.id });
      
      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Error al procesar like' });
  }
});

// ============ RUTAS DE STRIPE (PAGOS) ============
app.post('/api/stripe/create-checkout', authenticate, async (req, res) => {
  try {
    const { priceId, planId } = req.body;
    const userId = req.user.id;
    const email = req.user.email;

    // Crear o obtener customer de Stripe
    let customerId = req.user.profile?.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      customerId = customer.id;

      // Guardar customer ID en perfil
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    // Crear sesión de checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription/cancel`,
      metadata: {
        userId,
        planId,
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: 'Error al crear sesión de pago' });
  }
});

app.post('/api/stripe/portal', authenticate, async (req, res) => {
  try {
    const customerId = req.user.profile?.stripe_customer_id;
    
    if (!customerId) {
      return res.status(400).json({ error: 'No tienes suscripción activa' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_URL}/settings`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe portal error:', error);
    res.status(500).json({ error: 'Error al acceder al portal' });
  }
});

// Webhook de Stripe (sin autenticación, usa firma de Stripe)
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Manejar eventos
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { userId, planId } = session.metadata;

      await supabase
        .from('profiles')
        .update({
          subscription_plan: planId,
          subscription_status: 'active',
          stripe_subscription_id: session.subscription,
        })
        .eq('id', userId);

      // Notificar al usuario
      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'subscription',
        title: '🎉 ¡Suscripción activada!',
        message: `Tu plan ${planId} está activo. ¡Gracias por confiar en nosotros!`,
      });
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const customer = await stripe.customers.retrieve(subscription.customer);
      const userId = customer.metadata?.userId;

      if (userId) {
        await supabase
          .from('profiles')
          .update({
            subscription_status: subscription.status === 'active' ? 'active' : 'past_due',
          })
          .eq('id', userId);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customer = await stripe.customers.retrieve(subscription.customer);
      const userId = customer.metadata?.userId;

      if (userId) {
        await supabase
          .from('profiles')
          .update({
            subscription_plan: 'free',
            subscription_status: 'cancelled',
            stripe_subscription_id: null,
          })
          .eq('id', userId);

        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'subscription',
          title: '📢 Suscripción cancelada',
          message: 'Tu suscripción ha sido cancelada. Puedes renovar en cualquier momento.',
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const customer = await stripe.customers.retrieve(invoice.customer);
      const userId = customer.metadata?.userId;

      if (userId) {
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'subscription',
          title: '⚠️ Pago fallido',
          message: 'No pudimos procesar tu pago. Por favor, actualiza tu método de pago.',
        });
      }
      break;
    }
  }

  res.json({ received: true });
});

// ============ RUTAS DE PERFIL ============
app.get('/api/profile', authenticate, async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    const { data: tradingPlan } = await supabase
      .from('trading_plans')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    res.json({ profile, trading_plan: tradingPlan });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

app.put('/api/profile', authenticate, async (req, res) => {
  try {
    const { profile, trading_plan } = req.body;

    if (profile) {
      await supabase
        .from('profiles')
        .update(profile)
        .eq('id', req.user.id);
    }

    if (trading_plan) {
      await supabase
        .from('trading_plans')
        .update(trading_plan)
        .eq('user_id', req.user.id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// ============ RUTAS DE NOTIFICACIONES ============
app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({ notifications: data });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

app.put('/api/notifications/read', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', req.user.id)
      .in('id', ids);

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Error al marcar notificaciones' });
  }
});

// ============ INICIAR SERVIDOR ============
app.listen(PORT, () => {
  console.log(`🚀 Trading Master Pro API corriendo en puerto ${PORT}`);
  console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
