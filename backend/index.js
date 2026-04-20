// =============================================
// TRADING MASTER PRO v16.0 - PLATAFORMA COMPLETA
// Motor SMC + ELISA IA + Telegram + Supabase + Admin
// v16.0: 12 Modelos SMC con Zona Válida de Order Block
// =============================================
// 
// CAMBIOS v16.0:
// - 12 Modelos SMC optimizados con validación de Zona OB
// - Eliminados: ZONE_TOUCH, LIQUIDITY_SWEEP, STRUCTURE_BREAK, REVERSAL_PATTERN, PREMIUM_DISCOUNT
// - Todos los modelos requieren zona válida de Order Block
// - LONG: Vela ROJA + VERDE envolvente (acumulación)
// - SHORT: Vela VERDE + ROJA envolvente (distribución)
//
// VARIABLES DE ENTORNO REQUERIDAS:
// --------------------------------
// PORT                    - Puerto del servidor (default: 3001)
// DERIV_APP_ID           - App ID de Deriv (default: 1089)
// OPENAI_API_KEY         - API Key de OpenAI para ELISA IA
// SUPABASE_URL           - URL del proyecto Supabase
// SUPABASE_SERVICE_ROLE_KEY - Service Role Key de Supabase
// TELEGRAM_BOT_TOKEN     - Token del bot de Telegram
// TELEGRAM_CHAT_ID       - ID del chat/grupo de Telegram
//
// =============================================

import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ReportsManager from './reports-manager.js';
import PushNotificationManager from './push-notifications.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// =============================================
// CONFIGURACIÓN OPENAI - ELISA IA
// =============================================
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('✅ OpenAI conectado - ELISA IA activa');
} else {
  console.log('⚠️ OPENAI_API_KEY no encontrada - ELISA en modo fallback');
}

// Cargar modelos SMC desde JSON
let SMC_MODELS_DATA = {};
try {
  const modelsPath = path.join(__dirname, 'data', 'smc-models.json');
  if (fs.existsSync(modelsPath)) {
    SMC_MODELS_DATA = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
    console.log('✅ SMC Models JSON cargado');
  }
} catch (e) {
  console.log('⚠️ Error cargando smc-models.json:', e.message);
}

// =============================================
// SISTEMA DE APRENDIZAJE AUTOMÁTICO
// =============================================
const LearningSystem = {
  // Historial de trades para aprendizaje
  tradeHistory: [],
  maxHistorySize: 1000,
  
  // Registrar resultado de trade
  recordTrade(trade) {
    this.tradeHistory.push({
      ...trade,
      timestamp: Date.now()
    });
    
    // Mantener tamaño máximo
    if (this.tradeHistory.length > this.maxHistorySize) {
      this.tradeHistory.shift();
    }
    
    // Actualizar ajustes de score
    this.updateScoreAdjustments(trade);
    
    console.log(`📚 Trade registrado: ${trade.model} - ${trade.result} (${trade.asset})`);
  },
  
  // Actualizar ajustes de score basados en resultados
  updateScoreAdjustments(trade) {
    const { model, result, asset } = trade;
    
    // Ajuste por modelo
    if (!stats.learning.scoreAdjustments[model]) {
      stats.learning.scoreAdjustments[model] = 0;
    }
    
    if (result === 'WIN') {
      // Win: +2 puntos (máx +10)
      stats.learning.scoreAdjustments[model] = Math.min(10, stats.learning.scoreAdjustments[model] + 2);
    } else {
      // Loss: -3 puntos (máx -15)
      stats.learning.scoreAdjustments[model] = Math.max(-15, stats.learning.scoreAdjustments[model] - 3);
    }
    
    // Ajuste por asset-modelo
    const assetModelKey = `${asset}_${model}`;
    if (!stats.learning.scoreAdjustments[assetModelKey]) {
      stats.learning.scoreAdjustments[assetModelKey] = 0;
    }
    
    if (result === 'WIN') {
      stats.learning.scoreAdjustments[assetModelKey] = Math.min(5, stats.learning.scoreAdjustments[assetModelKey] + 1);
    } else {
      stats.learning.scoreAdjustments[assetModelKey] = Math.max(-10, stats.learning.scoreAdjustments[assetModelKey] - 2);
    }
  },
  
  // Obtener ajuste de score para un modelo
  getScoreAdjustment(model, asset = null) {
    let adjustment = stats.learning.scoreAdjustments[model] || 0;
    
    if (asset) {
      const assetModelKey = `${asset}_${model}`;
      adjustment += stats.learning.scoreAdjustments[assetModelKey] || 0;
    }
    
    return adjustment;
  },
  
  // Analizar patrones de pérdida para evitarlos
  analyzeLossPatterns() {
    const losses = this.tradeHistory.filter(t => t.result === 'LOSS');
    const patterns = {};
    
    for (const loss of losses) {
      // Patrón por modelo
      if (!patterns[loss.model]) {
        patterns[loss.model] = { count: 0, conditions: [] };
      }
      patterns[loss.model].count++;
      
      // Registrar condiciones de la pérdida
      if (loss.conditions) {
        patterns[loss.model].conditions.push(loss.conditions);
      }
    }
    
    return patterns;
  },
  
  // Obtener estadísticas de aprendizaje
  getStats() {
    const wins = this.tradeHistory.filter(t => t.result === 'WIN').length;
    const losses = this.tradeHistory.filter(t => t.result === 'LOSS').length;
    const total = wins + losses;
    
    const byModel = {};
    for (const trade of this.tradeHistory) {
      if (!byModel[trade.model]) {
        byModel[trade.model] = { wins: 0, losses: 0 };
      }
      if (trade.result === 'WIN') byModel[trade.model].wins++;
      else byModel[trade.model].losses++;
    }
    
    return {
      totalTrades: total,
      wins,
      losses,
      winRate: total > 0 ? (wins / total * 100).toFixed(1) : 0,
      byModel,
      scoreAdjustments: stats.learning.scoreAdjustments,
      lossPatterns: this.analyzeLossPatterns()
    };
  }
};

// =============================================
// CONFIGURACIÓN DE FILTROS v24.0
// CALIDAD SOBRE CANTIDAD - Menos señales, mejor win rate
// =============================================
const SIGNAL_CONFIG = {
  // Score mínimo para generar señal
  MIN_SCORE: 82, // v17.0: Alta calidad — solo señales fuertes
  
  // Score mínimo específico para Boom/Crash (más estricto)
  MIN_SCORE_BOOM_CRASH: 80, // v24: Ajustado
  
  // Cooldown entre análisis del mismo activo
  ANALYSIS_COOLDOWN: 8000,  // 8s — real-time update on every new candle
  
  // Cooldown después de cerrar una señal antes de abrir otra
  POST_SIGNAL_COOLDOWN: 300000, // 5 minutos entre señales
  
  // Cooldown específico para Boom/Crash
  POST_SIGNAL_COOLDOWN_BOOM_CRASH: 300000, // 5 minutos
  
  // ═══════════════════════════════════════════════════════════════
  // MTF CONFLUENCE - AHORA REQUERIDO PARA CALIDAD
  // true = H1 y M5 deben estar alineados (menos señales, mejor calidad)
  // ═══════════════════════════════════════════════════════════════
  REQUIRE_MTF_CONFLUENCE: true, // v24: ¡HABILITADO! Para mejor win rate
  
  // Modelos que SIEMPRE pueden operar sin MTF (tienen su propia lógica H1)
  MODELS_WITHOUT_MTF: [
    'MTF_CONFLUENCE',    // Ya incluye MTF
    'BOOM_SPIKE',        // Tiene lógica H1 propia
    'CRASH_SPIKE'        // Tiene lógica H1 propia
  ],
  
  // Máximo de señales pendientes simultáneas totales
  MAX_PENDING_TOTAL: 12, // v24: Reducido de 50 a 12 para mejor gestión
  
  // Horas de operación por plan - en UTC
  // Horario base (todos los planes): 6AM-2PM Colombia = 11:00-19:00 UTC
  // Horario nocturno (Premium/Elite): 8:30PM-1AM Colombia = 01:30-06:00 UTC
  TRADING_HOURS: {
    // Horario base para TODOS los planes
    base: {
      start: 11,    // 11:00 UTC (6:00 AM Colombia)
      end: 19       // 19:00 UTC (2:00 PM Colombia)
    },
    // Horario nocturno adicional SOLO para Premium y Elite
    night: {
      start: 1.5,   // 01:30 UTC (8:30 PM Colombia)
      end: 6        // 06:00 UTC (1:00 AM Colombia)
    }
  }
};

// Función para verificar si estamos en horario de trading
// Synthetic indices (Step, V100) operan 24/7 — siempre activos
function isInTradingHours(plan = 'free') {
  // Elite/Premium: 24/7 — synthetic indices no tienen horario fijo
  if (plan === 'premium' || plan === 'elite') return true;

  const now = new Date();
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const baseStart = SIGNAL_CONFIG.TRADING_HOURS.base.start;
  const baseEnd   = SIGNAL_CONFIG.TRADING_HOURS.base.end;

  return utcHour >= baseStart && utcHour < baseEnd;
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// =============================================
// CONFIGURACIÓN TELEGRAM
// =============================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramSignal(signal) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('⚠️ Telegram: No configurado (falta TOKEN o CHAT_ID)');
    return;
  }
  
  try {
    const isLong = signal.action === 'LONG';
    const emoji = isLong ? '🟢' : '🔴';
    const actionText = isLong ? 'COMPRA (LONG)' : 'VENTA (SHORT)';
    
    // Escapar caracteres especiales de Markdown en el reason
    const safeReason = (signal.reason || '')
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!');
    
    const message = `
${emoji} *SEÑAL #${signal.id}* ${emoji}

📊 *Activo:* ${signal.assetName}
📈 *Dirección:* ${actionText}
🎯 *Modelo:* ${signal.model}
💯 *Score:* ${signal.score}%

💰 *Entry:* ${signal.entry}
🛑 *Stop Loss:* ${signal.stop}

✅ *TP1:* ${signal.tp1}
✅ *TP2:* ${signal.tp2}
✅ *TP3:* ${signal.tp3}

📝 ${safeReason}
⏰ ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
`;

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'MarkdownV2' })
    });
    
    const result = await response.json();
    
    if (result.ok) {
      console.log(`📱 Telegram: Señal #${signal.id} enviada correctamente ✅`);
    } else {
      console.log(`⚠️ Telegram ERROR: ${result.description || 'Error desconocido'}`);
      // Intentar sin formato Markdown si falla
      try {
        const plainMessage = `
🔔 SEÑAL #${signal.id}

📊 Activo: ${signal.assetName}
📈 Dirección: ${actionText}
🎯 Modelo: ${signal.model}
💯 Score: ${signal.score}%

💰 Entry: ${signal.entry}
🛑 Stop Loss: ${signal.stop}

✅ TP1: ${signal.tp1}
✅ TP2: ${signal.tp2}
✅ TP3: ${signal.tp3}

📝 ${signal.reason}
`;
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: plainMessage })
        });
        console.log(`📱 Telegram: Señal #${signal.id} enviada (sin formato)`);
      } catch (e2) {
        console.log(`⚠️ Telegram fallback error:`, e2.message);
      }
    }
  } catch (e) {
    console.log('⚠️ Telegram error de conexión:', e.message);
  }
}

// Cola de mensajes de Telegram para evitar rate limiting
const telegramQueue = [];
let telegramProcessing = false;

async function processTelegramQueue() {
  if (telegramProcessing || telegramQueue.length === 0) return;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  
  telegramProcessing = true;
  
  while (telegramQueue.length > 0) {
    const message = telegramQueue.shift();
    try {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' })
      });
      const result = await response.json();
      if (!result.ok) {
        console.log(`⚠️ Telegram Queue ERROR: ${result.description}`);
      }
      // Esperar 1 segundo entre mensajes para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.log('⚠️ Telegram queue error:', e.message);
    }
  }
  
  telegramProcessing = false;
}

// Enviar mensaje a cola de Telegram
function queueTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  telegramQueue.push(message);
  processTelegramQueue();
}

// Notificar TP alcanzado
async function sendTelegramTP(signal, tpLevel, price) {
  const emoji = tpLevel === 'TP1' ? '🎯' : tpLevel === 'TP2' ? '🎯🎯' : '🎯🎯🎯';
  const message = `
${emoji} *${tpLevel} ALCANZADO* ${emoji}

📊 *Señal #${signal.id}* - ${signal.assetName}
💰 *Precio:* ${price}
📈 *Dirección:* ${signal.action}

${tpLevel === 'TP1' ? '✅ SL movido a Breakeven' : ''}
${tpLevel === 'TP2' ? '✅ SL movido a TP1' : ''}
${tpLevel === 'TP3' ? '🏆 ¡Objetivo máximo alcanzado!' : ''}

⏰ ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
`;
  queueTelegramMessage(message);
  console.log(`📱 Telegram: ${tpLevel} Señal #${signal.id}`);
}

// Notificar SL tocado
async function sendTelegramSL(signal, price, wasPartialWin = false) {
  const emoji = wasPartialWin ? '⚠️' : '❌';
  const status = wasPartialWin ? 'CERRADA EN BREAKEVEN' : 'STOP LOSS';
  const message = `
${emoji} *${status}* ${emoji}

📊 *Señal #${signal.id}* - ${signal.assetName}
💰 *Precio cierre:* ${price}
📈 *Dirección:* ${signal.action}
${wasPartialWin ? '✅ TP1 fue alcanzado previamente' : '❌ Sin TP alcanzado'}

📝 Resultado: ${wasPartialWin ? 'WIN PARCIAL' : 'LOSS'}
⏰ ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
`;
  queueTelegramMessage(message);
  console.log(`📱 Telegram: ${status} Señal #${signal.id}`);
}

// Notificar trailing stop activado
async function sendTelegramTrailing(signal, newSL, reason) {
  const message = `
🔄 *TRAILING STOP ACTIVADO*

📊 *Señal #${signal.id}* - ${signal.assetName}
🛑 *Nuevo SL:* ${newSL}
📝 *Razón:* ${reason}

⏰ ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
`;
  queueTelegramMessage(message);
}

// Alerta de cambio de dirección - cerrar antes del SL
async function sendTelegramDirectionChange(signal, currentPrice, recommendation) {
  const message = `
⚠️ *ALERTA: CAMBIO DE DIRECCIÓN* ⚠️

📊 *Señal #${signal.id}* - ${signal.assetName}
💰 *Precio actual:* ${currentPrice}
📈 *Dirección original:* ${signal.action}

🔄 *La estructura del mercado está cambiando*
💡 *Recomendación:* ${recommendation}

⚠️ Considera cerrar manualmente para reducir pérdidas

⏰ ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
`;
  queueTelegramMessage(message);
  console.log(`📱 Telegram: Alerta cambio dirección Señal #${signal.id}`);
}

// =============================================
// CONFIGURACIÓN SUPABASE
// =============================================
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('✅ Supabase conectado');
} else {
  console.log('⚠️ Supabase no configurado - usando memoria local');
  console.log('   SUPABASE_URL:', SUPABASE_URL ? 'OK' : 'MISSING');
  console.log('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_KEY ? 'OK' : 'MISSING');
}

// Inicializar módulo de reportes
let reportsManager = null;
if (supabase) {
  reportsManager = new ReportsManager(supabase);
  console.log('✅ Módulo de Reportes activado');
}

// Inicializar módulo de push notifications
let pushManager = null;
if (supabase && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  pushManager = new PushNotificationManager(supabase);
  console.log('✅ Módulo de Push Notifications activado');
} else {
  console.log('⚠️ Push Notifications deshabilitadas (faltan VAPID keys o Supabase)');
}

// Almacenamiento en memoria (fallback cuando no hay Supabase)
const memoryStore = {
  subscriptions: new Map()
};

// =============================================
// FUNCIONES DE SUSCRIPCIÓN - ESTRUCTURA NUEVA
// Columnas: id, email, plan, estado, periodo, created_at, updated_at, trial_ends_at, subscription_ends_at
// =============================================

// Días por periodo
const PERIOD_DAYS = {
  mensual: 30,
  semestral: 180,
  anual: 365
};

// Función para calcular días restantes de cualquier suscripción
function calculateDaysLeft(subscriptionEndsAt, trialEndsAt, estado, periodo) {
  const now = new Date();
  
  // Si es trial, usar trial_ends_at
  if (estado === 'trial' && trialEndsAt) {
    const ends = new Date(trialEndsAt);
    const diffDays = Math.ceil((ends - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }
  
  // Si tiene fecha de vencimiento de suscripción
  if (subscriptionEndsAt) {
    const ends = new Date(subscriptionEndsAt);
    const diffDays = Math.ceil((ends - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }
  
  return 0;
}

// Función para verificar si la suscripción está activa
function isSubscriptionActive(estado, daysLeft) {
  if (estado === 'expired') return false;
  if (daysLeft <= 0) return false;
  return true;
}

// Función para calcular fecha de vencimiento al activar plan
function calculateExpirationDate(periodo) {
  const days = PERIOD_DAYS[periodo] || 30;
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + days);
  return expirationDate.toISOString();
}

// Activos operados — definido aquí para uso en toda la app
const MY_ASSETS = ['stpRNG', 'frxXAUUSD', '1HZ100V'];

async function getSubscription(userId) {
  if (supabase) {
    try {
      // Leer de tabla 'users' que tiene email + plan
      const { data, error } = await supabase
        .from('users')
        .select('id, email, plan, is_active, created_at')
        .eq('email', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.log('getSubscription error:', error.message);
      }

      if (data) {
        const plan = data.plan || 'free';

        // Assets según plan — SOLO Step Index, Oro y Volatility 100
        const planAssets = {
          free:    MY_ASSETS,
          basico:  MY_ASSETS,
          pro:     MY_ASSETS,
          premium: MY_ASSETS,
          elite:   MY_ASSETS,
        };

        return {
          id:                  data.id,
          email:               data.email,
          plan:                plan,
          estado:              'activo',
          status:              'active',
          periodo:             'mensual',
          days_left:           3650,
          is_active:           true,
          assets:              planAssets[plan] || ['stpRNG'],
          plan_name:           { free:'Free Trial', basico:'Básico', pro:'Pro', premium:'Premium', elite:'Elite' }[plan] || 'Free Trial',
          trial_ends_at:       new Date(Date.now() + 3650*86400000).toISOString(),
          subscription_ends_at: new Date(Date.now() + 3650*86400000).toISOString(),
        };
      }
      return null;
    } catch (e) {
      console.log('getSubscription error:', e.message);
      return null;
    }
  }
  return memoryStore.subscriptions.get(userId) || null;
}

async function saveSubscription(subData) {
  if (supabase) {
    try {
      const userId = subData.userId || subData.user_id;
      const plan   = subData.plan || 'free';
      const months = subData.months || 1;
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + months);

      const { data, error } = await supabase
        .from('suscripciones')
        .upsert({
          user_id:    userId,
          plan:       plan,
          status:     'active',
          price:      0,
          start_date: new Date().toISOString(),
          end_date:   endDate.toISOString(),
        }, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) {
        console.log('Supabase upsert error:', error.message);
        return null;
      }
      return data;
    } catch (e) {
      console.log('saveSubscription error:', e.message);
      return null;
    }
  }
  return null;
}

async function getAllSubscriptions() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('suscripciones')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.log('Supabase getAllSubscriptions error:', error.message);
        return [];
      }
      
      // Normalizar datos para el admin panel
      return (data || []).map(sub => {
        // Calcular días restantes para cualquier plan
        const daysLeft = calculateDaysLeft(
          sub.subscription_ends_at,
          sub.trial_ends_at,
          sub.estado,
          sub.periodo
        );
        
        const isActive = isSubscriptionActive(sub.estado, daysLeft);
        
        return {
          id: sub.id,
          email: sub.email,
          plan: sub.plan || 'free',
          estado: sub.estado || 'trial',
          periodo: sub.periodo || 'mensual',
          days_left: daysLeft,
          is_active: isActive,
          trial_ends_at: sub.trial_ends_at,
          subscription_ends_at: sub.subscription_ends_at,
          created_at: sub.created_at
        };
      });
    } catch (e) {
      console.log('getAllSubscriptions error:', e.message);
      return [];
    }
  }
  return Array.from(memoryStore.subscriptions.values());
}

async function deleteSubscription(userId) {
  if (supabase) {
    try {
      const result = await supabase
        .from('suscripciones')
        .delete()
        .eq('email', userId);
      
      if (result.error) {
        console.log('Supabase delete error:', result.error.message);
      } else {
        console.log(`✅ Suscripción eliminada: ${userId}`);
      }
      return result;
    } catch (e) {
      console.log('deleteSubscription error:', e.message);
      return { error: e };
    }
  }
  memoryStore.subscriptions.delete(userId);
  return { error: null };
}

// =============================================
// CONFIGURACIÓN DE ACTIVOS Y PLANES
// =============================================

const PLANS = {
  free: {
    name: 'Free Trial',
    assets: MY_ASSETS,
    duration: 5,
    price: 0
  },
  basico: {
    name: 'Básico',
    assets: MY_ASSETS,
    price: 29900
  },
  premium: {
    name: 'Premium',
    assets: MY_ASSETS,
    price: 59900
  },
  elite: {
    name: 'Elite',
    assets: MY_ASSETS,
    price: 99900
  }
};

const ASSETS = {
  // ═══════════════════════════════════════════════
  // 🎰 SINTÉTICOS - VOLATILITY
  // ═══════════════════════════════════════════════
  'stpRNG': { name: 'Step Index', shortName: 'Step', emoji: '📊', decimals: 2, pip: 0.01, plan: 'free', type: 'standard', category: 'sinteticos' },
  'R_75': { name: 'Volatility 75', shortName: 'V75', emoji: '📈', decimals: 2, pip: 0.01, plan: 'basico', type: 'standard', category: 'sinteticos' },
  '1HZ100V': { name: 'Volatility 100', shortName: 'V100', emoji: '🔥', decimals: 2, pip: 0.01, plan: 'premium', type: 'standard', category: 'sinteticos' },
  'JD75': { name: 'Jump 75', shortName: 'Jump75', emoji: '⚡', decimals: 2, pip: 0.01, plan: 'premium', type: 'standard', category: 'sinteticos' },
  
  // ═══════════════════════════════════════════════
  // 🚀 SINTÉTICOS - BOOM (Solo COMPRAS)
  // ═══════════════════════════════════════════════
  'BOOM1000': { name: 'Boom 1000', shortName: 'Boom1K', emoji: '🚀', decimals: 2, pip: 0.01, plan: 'elite', type: 'boom', onlyDirection: 'BUY', spikeFreq: 1000, category: 'boom' },
  'BOOM500': { name: 'Boom 500', shortName: 'Boom500', emoji: '💥', decimals: 2, pip: 0.01, plan: 'elite', type: 'boom', onlyDirection: 'BUY', spikeFreq: 500, category: 'boom' },
  'BOOM300N': { name: 'Boom 300', shortName: 'Boom300', emoji: '⚡', decimals: 2, pip: 0.01, plan: 'elite', type: 'boom', onlyDirection: 'BUY', spikeFreq: 300, category: 'boom' },
  
  // ═══════════════════════════════════════════════
  // 📉 SINTÉTICOS - CRASH (Solo VENTAS)
  // ═══════════════════════════════════════════════
  'CRASH1000': { name: 'Crash 1000', shortName: 'Crash1K', emoji: '📉', decimals: 2, pip: 0.01, plan: 'elite', type: 'crash', onlyDirection: 'SELL', spikeFreq: 1000, category: 'crash' },
  'CRASH500': { name: 'Crash 500', shortName: 'Crash500', emoji: '💣', decimals: 2, pip: 0.01, plan: 'elite', type: 'crash', onlyDirection: 'SELL', spikeFreq: 500, category: 'crash' },
  'CRASH300N': { name: 'Crash 300', shortName: 'Crash300', emoji: '🔻', decimals: 2, pip: 0.01, plan: 'elite', type: 'crash', onlyDirection: 'SELL', spikeFreq: 300, category: 'crash' },
  
  // ═══════════════════════════════════════════════
  // 💱 FOREX - Pares de Divisas
  // ═══════════════════════════════════════════════
  'frxEURUSD': { name: 'EUR/USD', shortName: 'EUR/USD', emoji: '💶', decimals: 5, pip: 0.0001, plan: 'free', type: 'standard', category: 'forex' },
  'frxGBPUSD': { name: 'GBP/USD', shortName: 'GBP/USD', emoji: '💷', decimals: 5, pip: 0.0001, plan: 'premium', type: 'standard', category: 'forex' },
  'frxUSDJPY': { name: 'USD/JPY', shortName: 'USD/JPY', emoji: '💴', decimals: 3, pip: 0.01, plan: 'basico', type: 'standard', category: 'forex' },
  
  // ═══════════════════════════════════════════════
  // 🏆 COMMODITIES - Metales
  // ═══════════════════════════════════════════════
  'frxXAUUSD': { name: 'Oro (XAU/USD)', shortName: 'Oro', emoji: '🥇', decimals: 2, pip: 0.01, plan: 'free', type: 'standard', category: 'commodities' },
  'frxXAGUSD': { name: 'Plata (XAG/USD)', shortName: 'Plata', emoji: '🥈', decimals: 4, pip: 0.001, plan: 'basico', type: 'standard', category: 'commodities' },
  
  // ═══════════════════════════════════════════════
  // ₿ CRYPTO - Criptomonedas
  // ═══════════════════════════════════════════════
  'cryBTCUSD': { name: 'Bitcoin', shortName: 'BTC', emoji: '₿', decimals: 2, pip: 1, plan: 'premium', type: 'standard', category: 'crypto' },
  'cryETHUSD': { name: 'Ethereum', shortName: 'ETH', emoji: '⟠', decimals: 2, pip: 0.1, plan: 'premium', type: 'standard', category: 'crypto' }
};

// =============================================
// REGLAS ESPECIALES BOOM/CRASH SMC
// =============================================
const BOOM_CRASH_RULES = {
  // BOOM: Solo compras en zonas de demanda después de caída
  boom: {
    direction: 'BUY',
    lookFor: 'demand',           // Buscar zonas de demanda
    entryCondition: 'discount',  // Entrar en zona de descuento (precio bajo)
    avoidCondition: 'premium',   // Evitar zona premium (precio alto)
    spikeDetection: true,        // Detectar patrones pre-spike
    minScore: 70,                // Score mínimo más bajo (más oportunidades)
    tpMultiplier: 2.5,           // TP más amplio para capturar spike
    slMultiplier: 0.8,           // SL más ajustado
    description: 'Boom: Comprar en zonas de demanda esperando spike alcista'
  },
  // CRASH: Solo ventas en zonas de supply después de subida
  crash: {
    direction: 'SELL',
    lookFor: 'supply',           // Buscar zonas de supply
    entryCondition: 'premium',   // Entrar en zona premium (precio alto)
    avoidCondition: 'discount',  // Evitar zona de descuento
    spikeDetection: true,        // Detectar patrones pre-spike
    minScore: 70,                // Score mínimo más bajo
    tpMultiplier: 2.5,           // TP más amplio para capturar spike
    slMultiplier: 0.8,           // SL más ajustado
    description: 'Crash: Vender en zonas de supply esperando spike bajista'
  }
};

// =============================================
// ESTADO GLOBAL
// =============================================
let derivWs = null;
let isConnected = false;
let reconnectAttempts = 0;

// Sistema de seguimiento de mercados activos
const marketStatus = {};
for (const symbol of MY_ASSETS) {
  marketStatus[symbol] = {
    lastDataReceived: 0,
    isActive: false,
    subscriptionAttempts: 0,
    lastSubscriptionAttempt: 0
  };
}

// Función para detectar si un mercado de Forex/Metales debería estar abierto
function isMarketOpenNow(symbol) {
  const config = ASSETS[symbol];
  if (!config) return true;
  
  // Los sintéticos operan 24/7
  if (['sinteticos', 'boom', 'crash'].includes(config.category)) {
    return true;
  }
  
  // Forex y Metales: cerrados de viernes 17:00 EST a domingo 17:00 EST
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  
  // Convertir a EST (UTC-5)
  const estHour = (utcHour - 5 + 24) % 24;
  
  // Sábado completo = cerrado
  if (utcDay === 6) return false;
  
  // Domingo antes de las 17:00 EST (22:00 UTC) = cerrado
  if (utcDay === 0 && utcHour < 22) return false;
  
  // Viernes después de las 17:00 EST (22:00 UTC) = cerrado
  if (utcDay === 5 && utcHour >= 22) return false;
  
  return true;
}

// Función para resubscribir a un activo específico
function resubscribeToAsset(symbol) {
  if (!derivWs || derivWs.readyState !== WebSocket.OPEN) return;
  
  console.log(`🔄 [${ASSETS[symbol]?.shortName}] Resubscribiendo...`);
  marketStatus[symbol].lastSubscriptionAttempt = Date.now();
  marketStatus[symbol].subscriptionAttempts++;
  
  derivWs.send(JSON.stringify({
    ticks_history: symbol,
    adjust_start_time: 1,
    count: 200,
    end: 'latest',
    granularity: 300,
    style: 'candles',
    subscribe: 1
  }));
  
  requestH1(symbol);
  requestM15(symbol);
  requestM1(symbol);
  derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
}

// Verificar mercados inactivos y resubscribir
function checkAndResubscribeMarkets() {
  if (!isConnected) return;
  
  const now = Date.now();
  const inactivityThreshold = 60000; // 1 minuto sin datos = inactivo
  
  for (const symbol of MY_ASSETS) {
    const status = marketStatus[symbol];
    const config = ASSETS[symbol];
    const shouldBeOpen = isMarketOpenNow(symbol);
    
    // Si el mercado debería estar abierto pero no recibimos datos
    if (shouldBeOpen) {
      const timeSinceLastData = now - status.lastDataReceived;
      const timeSinceLastAttempt = now - status.lastSubscriptionAttempt;
      
      // Si no hay datos recientes y no intentamos recientemente (cada 30 segundos)
      if (timeSinceLastData > inactivityThreshold && timeSinceLastAttempt > 30000) {
        console.log(`⚠️ [${config?.shortName}] Sin datos por ${Math.round(timeSinceLastData/1000)}s - resubscribiendo`);
        resubscribeToAsset(symbol);
      }
    }
  }
}

// Iniciar verificación periódica de mercados
let marketCheckInterval = null;
function startMarketMonitoring() {
  if (marketCheckInterval) clearInterval(marketCheckInterval);
  
  // Verificar mercados cada 30 segundos
  marketCheckInterval = setInterval(checkAndResubscribeMarkets, 30000);
  console.log('✅ Monitor de mercados iniciado (verificación cada 30s)');

  // ── Refrescar M15 y H1 cada 5 minutos para mantener estructura actualizada ──
  setInterval(() => {
    for (const symbol of MY_ASSETS) {
      try { requestM15(symbol); } catch(e) {}
      try { requestH1(symbol); } catch(e) {}
    }
  }, 5 * 60 * 1000);
}

const assetData = {};
for (const symbol of MY_ASSETS) {
  assetData[symbol] = {
    candles: [],       // M5
    candlesH1: [],     // H1 — tendencia mayor
    candlesM15: [],    // M15 — tendencia intermedia (NUEVA)
    candlesM1: [],     // M1 — entrada precisa (NUEVA)
    price: null,
    signal: null,
    lockedSignal: null,
    lastAnalysis: 0,
    demandZones: [],
    supplyZones: [],
    fvgZones: [],
    liquidityLevels: [],
    swings: [],
    structure: { trend: 'NEUTRAL', strength: 0 },
    choch: null,
    bos: null,
    orderFlow: { momentum: 'NEUTRAL', strength: 0 },
    structureH1: { trend: 'LOADING', strength: 0 },
    structureM15: { trend: 'LOADING', strength: 0 },
    demandZonesH1: [],
    supplyZonesH1: [],
    demandZonesM15: [],
    supplyZonesM15: [],
    premiumDiscount: 'EQUILIBRIUM',
    h1Loaded: false,
    m15Loaded: false,
    m1Loaded: false,
    lastSignalClosed: 0,
    lastSignalTime: 0,
    mtfConfluence: false
  };
}

let signalHistory = [];
let signalIdCounter = 1;

const stats = {
  total: 0, wins: 0, losses: 0, pending: 0,
  tp1Hits: 0, tp2Hits: 0, tp3Hits: 0,
  byModel: {}, byAsset: {}, 
  learning: { scoreAdjustments: {} }
};

for (const symbol of MY_ASSETS) {
  stats.byAsset[symbol] = { wins: 0, losses: 0, total: 0 };
}

// =============================================
// MOTOR SMC v13.0
// =============================================
const SMC = {
  
  getAvgRange(candles, period = 14) {
    const recent = candles.slice(-period);
    if (!recent.length) return 0;
    return recent.reduce((sum, c) => sum + (c.high - c.low), 0) / recent.length;
  },

  findSwings(candles, lookback = 3) {
    const swings = [];
    if (candles.length < lookback * 2 + 1) return swings;

    // Adaptive lookback: on larger candle sets use slightly bigger window for cleaner swings
    const lb = Math.max(2, Math.min(lookback, Math.floor(candles.length / 20)));

    for (let i = lb; i < candles.length - lb; i++) {
      const c = candles[i];
      const left  = candles.slice(i - lb, i);
      const right = candles.slice(i + 1, i + lb + 1);

      const isHigh = left.every(x => x.high <= c.high) && right.every(x => x.high < c.high);
      const isLow  = left.every(x => x.low  >= c.low)  && right.every(x => x.low  > c.low);

      if (isHigh) swings.push({ type: 'high', price: c.high, index: i,
        time: c.time, epoch: c.epoch || (c.time ? Math.floor(c.time/1000) : null) });
      if (isLow)  swings.push({ type: 'low',  price: c.low,  index: i,
        time: c.time, epoch: c.epoch || (c.time ? Math.floor(c.time/1000) : null) });
    }
    return swings;
  },

  analyzeStructure(swings) {
    if (swings.length < 4) return { trend: 'NEUTRAL', strength: 0, labels: [] };

    // Use ALL swings but weight recent ones more heavily
    const all   = swings;
    const highs = all.filter(s => s.type === 'high');
    const lows  = all.filter(s => s.type === 'low');

    if (highs.length < 2 || lows.length < 2) return { trend: 'NEUTRAL', strength: 0, labels: [] };

    let hh = 0, hl = 0, lh = 0, ll = 0;
    const labels = [];

    // Label every high
    for (let i = 1; i < highs.length; i++) {
      const isHH = highs[i].price > highs[i-1].price;
      if (isHH) { hh++; labels.push({ type:'HH', price:highs[i].price, index:highs[i].index, time:highs[i].time, epoch:highs[i].epoch }); }
      else       { lh++; labels.push({ type:'LH', price:highs[i].price, index:highs[i].index, time:highs[i].time, epoch:highs[i].epoch }); }
    }

    // Label every low
    for (let i = 1; i < lows.length; i++) {
      const isHL = lows[i].price > lows[i-1].price;
      if (isHL) { hl++; labels.push({ type:'HL', price:lows[i].price, index:lows[i].index, time:lows[i].time, epoch:lows[i].epoch }); }
      else      { ll++; labels.push({ type:'LL', price:lows[i].price, index:lows[i].index, time:lows[i].time, epoch:lows[i].epoch }); }
    }

    // ── KEY FIX: Recent structure matters more ──
    // Check the LAST 3 swing labels — they define the current market direction
    const recLabels = labels.slice(-4);
    const recBull = recLabels.filter(l => l.type==='HH'||l.type==='HL').length;
    const recBear = recLabels.filter(l => l.type==='LH'||l.type==='LL').length;

    const total = hh + hl + lh + ll;
    if (total === 0) return { trend:'NEUTRAL', strength:0, labels };

    // Weighted: recent labels count 3x
    const bullW = hh + hl + recBull * 2;
    const bearW = lh + ll + recBear * 2;
    const totalW = bullW + bearW;
    const bullPct = bullW / totalW;
    const bearPct = bearW / totalW;

    // Strength = how recent+consistent the trend is
    const strengthBase = Math.round(Math.max(bullPct, bearPct) * 130);

    if (bullPct >= 0.52) {
      return { trend:'BULLISH', strength:Math.min(100,strengthBase), hh,hl,lh,ll, labels };
    }
    if (bearPct >= 0.52) {
      return { trend:'BEARISH', strength:Math.min(100,strengthBase), hh,hl,lh,ll, labels };
    }

    // Tie-break by most recent swing
    if (recBull > recBear) return { trend:'BULLISH', strength:40, hh,hl,lh,ll, labels };
    if (recBear > recBull) return { trend:'BEARISH', strength:40, hh,hl,lh,ll, labels };

    return { trend:'NEUTRAL', strength:20, labels };
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ANÁLISIS DE ESTRUCTURA ESPECÍFICO PARA BOOM/CRASH
  // Detecta spikes y no se confunde con rebotes temporales
  // ═══════════════════════════════════════════════════════════════════════
  analyzeStructureBoomCrash(candles, assetType) {
    if (!candles || candles.length < 30) return { trend: 'NEUTRAL', strength: 0 };
    
    const recent = candles.slice(-30);
    const avgRange = this.getAvgRange(candles.slice(-50));
    
    // Buscar spike en las últimas 30 velas
    let biggestBullSpike = 0;
    let biggestBearSpike = 0;
    let bullSpikeIndex = -1;
    let bearSpikeIndex = -1;
    
    for (let i = 5; i < recent.length; i++) {
      const candle = recent[i];
      const candleRange = Math.abs(candle.close - candle.open);
      
      // Spike alcista: vela verde muy grande (>3x promedio)
      if (candle.close > candle.open && candleRange > avgRange * 3) {
        if (candleRange > biggestBullSpike) {
          biggestBullSpike = candleRange;
          bullSpikeIndex = i;
        }
      }
      
      // Spike bajista: vela roja muy grande (>3x promedio)
      if (candle.close < candle.open && candleRange > avgRange * 3) {
        if (candleRange > biggestBearSpike) {
          biggestBearSpike = candleRange;
          bearSpikeIndex = i;
        }
      }
    }
    
    // Para Crash: si hubo spike bajista reciente, la estructura es BEARISH
    // aunque las últimas velas sean de rebote
    if (assetType === 'crash' && bearSpikeIndex > bullSpikeIndex && biggestBearSpike > avgRange * 3) {
      // Verificar que no se ha recuperado completamente
      const spikeCandle = recent[bearSpikeIndex];
      const currentPrice = recent[recent.length - 1].close;
      const spikeRecovery = (currentPrice - spikeCandle.low) / (spikeCandle.open - spikeCandle.low);
      
      // Si no se ha recuperado más del 80%, la estructura sigue siendo BEARISH
      if (spikeRecovery < 0.8) {
        return { 
          trend: 'BEARISH', 
          strength: Math.min(100, Math.round(biggestBearSpike / avgRange * 10)),
          reason: 'Spike bajista reciente'
        };
      }
    }
    
    // Para Boom: si hubo spike alcista reciente, la estructura es BULLISH
    if (assetType === 'boom' && bullSpikeIndex > bearSpikeIndex && biggestBullSpike > avgRange * 3) {
      const spikeCandle = recent[bullSpikeIndex];
      const currentPrice = recent[recent.length - 1].close;
      const spikeRetracement = (spikeCandle.high - currentPrice) / (spikeCandle.high - spikeCandle.open);
      
      if (spikeRetracement < 0.8) {
        return { 
          trend: 'BULLISH', 
          strength: Math.min(100, Math.round(biggestBullSpike / avgRange * 10)),
          reason: 'Spike alcista reciente'
        };
      }
    }
    
    // Si no hay spike claro, analizar estructura normal
    // Pero usar más velas (últimas 20 en lugar de 8)
    const last20 = candles.slice(-20);
    let higherHighs = 0, higherLows = 0, lowerHighs = 0, lowerLows = 0;
    
    // Comparar cada 5 velas
    for (let i = 5; i < last20.length; i += 5) {
      const prev = last20.slice(i - 5, i);
      const curr = last20.slice(i, i + 5);
      if (curr.length < 5) continue;
      
      const prevHigh = Math.max(...prev.map(c => c.high));
      const prevLow = Math.min(...prev.map(c => c.low));
      const currHigh = Math.max(...curr.map(c => c.high));
      const currLow = Math.min(...curr.map(c => c.low));
      
      if (currHigh > prevHigh) higherHighs++;
      if (currHigh < prevHigh) lowerHighs++;
      if (currLow > prevLow) higherLows++;
      if (currLow < prevLow) lowerLows++;
    }
    
    const bullScore = higherHighs + higherLows;
    const bearScore = lowerHighs + lowerLows;
    
    if (bearScore > bullScore && bearScore >= 2) {
      return { trend: 'BEARISH', strength: Math.min(100, bearScore * 25) };
    }
    if (bullScore > bearScore && bullScore >= 2) {
      return { trend: 'BULLISH', strength: Math.min(100, bullScore * 25) };
    }
    
    return { trend: 'NEUTRAL', strength: 0 };
  },

  getPremiumDiscount(candles, swings) {
    if (candles.length < 20 || swings.length < 2) return 'EQUILIBRIUM';
    
    const highs = swings.filter(s => s.type === 'high').slice(-5);
    const lows = swings.filter(s => s.type === 'low').slice(-5);
    
    if (!highs.length || !lows.length) return 'EQUILIBRIUM';
    
    const rangeHigh = Math.max(...highs.map(h => h.price));
    const rangeLow = Math.min(...lows.map(l => l.price));
    const range = rangeHigh - rangeLow;
    
    if (range === 0) return 'EQUILIBRIUM';
    
    const price = candles[candles.length - 1].close;
    const position = (price - rangeLow) / range;
    
    if (position > 0.7) return 'PREMIUM';
    if (position < 0.3) return 'DISCOUNT';
    return 'EQUILIBRIUM';
  },

  // =============================================
  // ANÁLISIS ESPECÍFICO BOOM/CRASH v17 - ESTRATEGIA SMC ORGANIZADA
  // =============================================
  // 
  // ╔══════════════════════════════════════════════════════════════════════════════╗
  // ║  ESTRATEGIA BOOM (SOLO COMPRAS)                                              ║
  // ╠══════════════════════════════════════════════════════════════════════════════╣
  // ║  PASO 1 - H1: Analizar dirección (debe ser BULLISH o NEUTRAL)               ║
  // ║  PASO 2 - H1: El precio viene bajista, se forma estructura                   ║
  // ║  PASO 3 - H1: Order Block = vela ROJA + vela VERDE envolvente (acumulación) ║
  // ║  PASO 4 - H1: Después del OB → impulso → CHOCH/BOS → nuevo alto             ║
  // ║  PASO 5 - H1: Esperar pullback/retroceso al Order Block                     ║
  // ║  PASO 6 - M5: Confirmar estructura alcista O precio toca OB de H1           ║
  // ║  PASO 7 - Entrada en el Order Block de H1                                   ║
  // ║  PASO 8 - Stop Loss: Debajo del Order Block de H1                           ║
  // ║  PASO 9 - TP1, TP2, TP3: Basados en la estructura                          ║
  // ╚══════════════════════════════════════════════════════════════════════════════╝
  // 
  // ╔══════════════════════════════════════════════════════════════════════════════╗
  // ║  ESTRATEGIA CRASH (SOLO VENTAS) - INVERSO                                   ║
  // ╠══════════════════════════════════════════════════════════════════════════════╣
  // ║  PASO 1 - H1: Analizar dirección (debe ser BEARISH o NEUTRAL)               ║
  // ║  PASO 2 - H1: El precio viene alcista, se forma estructura                   ║
  // ║  PASO 3 - H1: Order Block = vela VERDE + vela ROJA envolvente (distribución)║
  // ║  PASO 4 - H1: Después del OB → impulso bajista → CHOCH/BOS → nuevo bajo     ║
  // ║  PASO 5 - H1: Esperar pullback/retroceso al Order Block                     ║
  // ║  PASO 6 - M5: Confirmar estructura bajista O precio toca OB de H1           ║
  // ║  PASO 7 - Entrada en el Order Block de H1                                   ║
  // ║  PASO 8 - Stop Loss: Arriba del Order Block de H1                           ║
  // ║  PASO 9 - TP1, TP2, TP3: Basados en la estructura                          ║
  // ╚══════════════════════════════════════════════════════════════════════════════╝
  //
  analyzeBoomCrash(candles, config, state, rules, candlesH1 = null) {
    if (candles.length < 50) return null;
    
    const assetType = config.type; // 'boom' o 'crash'
    const avgRange = this.getAvgRange(candles);
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const price = lastCandle.close;
    
    // Log cada 15 segundos para Boom/Crash
    const shouldLog = Date.now() % 15000 < 1000;
    
    // Obtener swings M5
    const swingsM5 = this.findSwings(candles, 3);
    const structureM5 = this.analyzeStructureBoomCrash(candles, assetType);
    
    // ════════════════════════════════════════════════════════════════════════════
    // ANÁLISIS H1 (OBLIGATORIO para Boom/Crash)
    // ════════════════════════════════════════════════════════════════════════════
    if (!candlesH1 || candlesH1.length < 20) {
      if (shouldLog) {
        console.log(`⚠️ [${config.shortName}] Sin datos H1 suficientes (${candlesH1?.length || 0} velas)`);
      }
      return null;
    }
    
    const swingsH1 = this.findSwings(candlesH1, 2);
    const structureH1 = this.analyzeStructure(swingsH1);
    
    if (shouldLog) {
      console.log(`📊 [${config.shortName}] Análisis ${assetType.toUpperCase()}:`);
      console.log(`   H1: ${structureH1.trend} (${structureH1.strength}%) | M5: ${structureM5.trend}`);
      console.log(`   Velas H1: ${candlesH1.length} | Velas M5: ${candles.length}`);
      console.log(`   Precio: ${price.toFixed(2)} | AvgRange: ${avgRange.toFixed(2)}`);
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // DETECTAR ORDER BLOCK CON CHOCH/BOS EN H1
    // ════════════════════════════════════════════════════════════════════════════
    const obAnalysis = this.detectOBWithChochBos(candlesH1, assetType);
    
    if (shouldLog) {
      if (obAnalysis) {
        console.log(`   ✅ OB encontrado: ${obAnalysis.side} zona ${obAnalysis.zone.low.toFixed(2)}-${obAnalysis.zone.high.toFixed(2)}`);
        console.log(`   CHOCH: ${obAnalysis.hasChoch} | BOS: ${obAnalysis.hasBos}`);
      } else {
        console.log(`   ❌ No se encontró OB válido con CHOCH/BOS en H1`);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    //                    B O O M  -  S O L O  C O M P R A S
    // ═══════════════════════════════════════════════════════════════════════════
    if (assetType === 'boom') {
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 1: H1 debe ser BULLISH o NEUTRAL (NO BEARISH)
      // ──────────────────────────────────────────────────────────────────────────
      if (structureH1.trend === 'BEARISH' && structureH1.strength > 60) {
        if (Date.now() % 30000 < 1000) {
          console.log(`⛔ [${config.shortName}] BOOM bloqueado: H1 es BEARISH fuerte - Esperando cambio de estructura`);
        }
        return null;
      }
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 2-4: Verificar que existe OB válido con CHOCH/BOS posterior
      // El OB de demanda: vela ROJA + vela VERDE envolvente + impulso + CHOCH/BOS
      // ──────────────────────────────────────────────────────────────────────────
      if (!obAnalysis || !obAnalysis.valid || obAnalysis.side !== 'BUY') {
        if (Date.now() % 30000 < 1000) {
          console.log(`⏳ [${config.shortName}] BOOM esperando: No hay OB de demanda válido con CHOCH/BOS en H1`);
        }
        return null;
      }
      
      const obZone = obAnalysis.zone;
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 5: El precio debe estar en pullback hacia el OB (retroceso)
      // El precio debe tocar o estar cerca de la zona del OB
      // ──────────────────────────────────────────────────────────────────────────
      const tolerance = avgRange * 1.5; // Aumentar tolerancia
      const priceAboveOBLow = price >= (obZone.low - tolerance);
      const priceBelowOBHigh = lastCandle.low <= (obZone.high + tolerance);
      const priceNearOB = priceAboveOBLow && priceBelowOBHigh;
      
      // Log detallado para debug
      if (Date.now() % 30000 < 1000) {
        console.log(`📊 [${config.shortName}] BOOM análisis:`);
        console.log(`   H1: ${structureH1.trend} | M5: ${structureM5.trend}`);
        console.log(`   OB H1: ${obZone.low.toFixed(2)} - ${obZone.high.toFixed(2)} (CHOCH:${obAnalysis.hasChoch} BOS:${obAnalysis.hasBos})`);
        console.log(`   Precio actual: ${price.toFixed(2)} | Low: ${lastCandle.low.toFixed(2)}`);
        console.log(`   Tolerancia: ${tolerance.toFixed(2)}`);
        console.log(`   ¿Cerca del OB?: ${priceNearOB} (Above low: ${priceAboveOBLow}, Below high: ${priceBelowOBHigh})`);
      }
      
      if (!priceNearOB) {
        if (Date.now() % 30000 < 1000) {
          if (price > obZone.high + tolerance) {
            console.log(`⏳ [${config.shortName}] BOOM esperando: Precio MUY ARRIBA del OB - Esperando pullback`);
          } else if (price < obZone.low - tolerance) {
            console.log(`⏳ [${config.shortName}] BOOM esperando: Precio MUY ABAJO del OB - Zona invalidada`);
          }
        }
        return null;
      }
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 6: M5 debe confirmar - estructura alcista O señal de reversión
      // ──────────────────────────────────────────────────────────────────────────
      const m5Bullish = structureM5.trend === 'BULLISH';
      const m5Neutral = structureM5.trend === 'NEUTRAL';
      const hasChochM5 = state.choch?.type === 'BULLISH_CHOCH';
      const hasBullishEngulfing = prevCandle.close < prevCandle.open && 
                                   lastCandle.close > lastCandle.open &&
                                   lastCandle.close > prevCandle.open;
      
      // También aceptar si las últimas 3 velas muestran presión alcista
      const last3 = candles.slice(-3);
      const greenCandles = last3.filter(c => c.close > c.open).length;
      const hasBullishPressure = greenCandles >= 2;
      
      const m5Confirmed = m5Bullish || m5Neutral || hasChochM5 || hasBullishEngulfing || hasBullishPressure;
      
      if (Date.now() % 30000 < 1000) {
        console.log(`   M5 confirmación: Bullish=${m5Bullish} Neutral=${m5Neutral} CHOCH=${hasChochM5} Engulf=${hasBullishEngulfing} Pressure=${hasBullishPressure}`);
        console.log(`   M5 confirmado: ${m5Confirmed}`);
      }
      
      if (!m5Confirmed) {
        if (Date.now() % 30000 < 1000) {
          console.log(`⏳ [${config.shortName}] BOOM esperando: M5 sin confirmación alcista (M5: ${structureM5.trend})`);
        }
        return null;
      }
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 7-9: SETUP VÁLIDO - Calcular entrada, SL y TPs
      // ──────────────────────────────────────────────────────────────────────────
      console.log(`✅ [${config.shortName}] BOOM SETUP VÁLIDO - OB H1 + CHOCH/BOS + M5 confirma`);
      
      const entry = lastCandle.close;
      
      // SL: Debajo de la zona del OB H1
      const slBuffer = avgRange * 0.3;
      const stop = Math.min(obZone.low, lastCandle.low) - slBuffer;
      
      if (stop >= entry) {
        console.log(`⛔ [${config.shortName}] BOOM bloqueado: SL inválido`);
        return null;
      }
      
      const risk = entry - stop;
      
      // TPs basados en estructura H1 y swings
      const recentHighsH1 = swingsH1.filter(s => s.type === 'high').slice(-3);
      const targetHigh = recentHighsH1.length > 0 ? Math.max(...recentHighsH1.map(h => h.price)) : entry + risk * 5;
      
      const tp1 = entry + risk * 1.5;  // 1:1.5 RR
      const tp2 = entry + risk * 2.5;  // 1:2.5 RR
      const tp3 = Math.max(targetHigh, entry + risk * 4);  // Máximo estructural o 1:4
      
      // Calcular score
      let score = 70;
      let reasons = ['BOOM OB H1'];
      
      if (structureH1.trend === 'BULLISH') { score += 10; reasons.push('H1↑'); }
      if (m5Bullish) { score += 5; reasons.push('M5↑'); }
      if (hasChochM5) { score += 5; reasons.push('CHOCH M5'); }
      if (hasBullishEngulfing) { score += 5; reasons.push('Engulfing'); }
      if (obAnalysis.hasChoch) { score += 5; reasons.push('CHOCH H1'); }
      if (obAnalysis.hasBos) { score += 3; reasons.push('BOS H1'); }
      
      return {
        action: 'LONG',
        model: 'BOOM_SPIKE',
        score: Math.min(100, score),
        entry: +entry.toFixed(config.decimals),
        stop: +stop.toFixed(config.decimals),
        tp1: +tp1.toFixed(config.decimals),
        tp2: +tp2.toFixed(config.decimals),
        tp3: +tp3.toFixed(config.decimals),
        reason: reasons.join(' + '),
        analysis: {
          type: 'boom',
          structureM5: structureM5.trend,
          structureH1: structureH1.trend,
          obH1: `${obZone.low.toFixed(2)}-${obZone.high.toFixed(2)}`,
          hasChochH1: obAnalysis.hasChoch,
          hasBosH1: obAnalysis.hasBos,
          m5Confirmation: hasChochM5 ? 'CHOCH' : hasBullishEngulfing ? 'ENGULFING' : m5Bullish ? 'STRUCTURE' : 'NEUTRAL',
          risk: +risk.toFixed(config.decimals)
        }
      };
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    //                    C R A S H  -  S O L O  V E N T A S
    // ═══════════════════════════════════════════════════════════════════════════
    if (assetType === 'crash') {
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 1: H1 debe ser BEARISH o NEUTRAL (NO BULLISH)
      // ──────────────────────────────────────────────────────────────────────────
      if (structureH1.trend === 'BULLISH' && structureH1.strength > 60) {
        if (Date.now() % 30000 < 1000) {
          console.log(`⛔ [${config.shortName}] CRASH bloqueado: H1 es BULLISH fuerte - Esperando cambio de estructura`);
        }
        return null;
      }
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 2-4: Verificar que existe OB válido con CHOCH/BOS posterior
      // El OB de supply: vela VERDE + vela ROJA envolvente + impulso + CHOCH/BOS
      // ──────────────────────────────────────────────────────────────────────────
      if (!obAnalysis || !obAnalysis.valid || obAnalysis.side !== 'SELL') {
        if (Date.now() % 30000 < 1000) {
          console.log(`⏳ [${config.shortName}] CRASH esperando: No hay OB de supply válido con CHOCH/BOS en H1`);
        }
        return null;
      }
      
      const obZone = obAnalysis.zone;
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 5: El precio debe estar en pullback hacia el OB (retroceso)
      // El precio debe tocar o estar cerca de la zona del OB
      // ──────────────────────────────────────────────────────────────────────────
      const tolerance = avgRange * 1.5;
      const priceBelowOBHigh = price <= (obZone.high + tolerance);
      const priceAboveOBLow = lastCandle.high >= (obZone.low - tolerance);
      const priceNearOB = priceBelowOBHigh && priceAboveOBLow;
      
      // Log detallado para debug
      if (Date.now() % 30000 < 1000) {
        console.log(`📊 [${config.shortName}] CRASH análisis:`);
        console.log(`   H1: ${structureH1.trend} | M5: ${structureM5.trend}`);
        console.log(`   OB H1: ${obZone.low.toFixed(2)} - ${obZone.high.toFixed(2)} (CHOCH:${obAnalysis.hasChoch} BOS:${obAnalysis.hasBos})`);
        console.log(`   Precio actual: ${price.toFixed(2)} | High: ${lastCandle.high.toFixed(2)}`);
        console.log(`   ¿Cerca del OB?: ${priceNearOB}`);
      }
      
      if (!priceNearOB) {
        if (Date.now() % 30000 < 1000) {
          if (price < obZone.low - tolerance) {
            console.log(`⏳ [${config.shortName}] CRASH esperando: Precio MUY ABAJO del OB - Esperando pullback`);
          } else if (price > obZone.high + tolerance) {
            console.log(`⏳ [${config.shortName}] CRASH esperando: Precio MUY ARRIBA del OB - Zona invalidada`);
          }
        }
        return null;
      }
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 6: M5 debe confirmar - estructura bajista O señal de reversión
      // ──────────────────────────────────────────────────────────────────────────
      const m5Bearish = structureM5.trend === 'BEARISH';
      const m5Neutral = structureM5.trend === 'NEUTRAL';
      const hasChochM5 = state.choch?.type === 'BEARISH_CHOCH';
      const hasBearishEngulfing = prevCandle.close > prevCandle.open && 
                                   lastCandle.close < lastCandle.open &&
                                   lastCandle.close < prevCandle.open;
      
      // También aceptar si las últimas 3 velas muestran presión bajista
      const last3 = candles.slice(-3);
      const redCandles = last3.filter(c => c.close < c.open).length;
      const hasBearishPressure = redCandles >= 2;
      
      const m5Confirmed = m5Bearish || m5Neutral || hasChochM5 || hasBearishEngulfing || hasBearishPressure;
      
      if (Date.now() % 30000 < 1000) {
        console.log(`   M5 confirmación: Bearish=${m5Bearish} Neutral=${m5Neutral} CHOCH=${hasChochM5} Engulf=${hasBearishEngulfing} Pressure=${hasBearishPressure}`);
        console.log(`   M5 confirmado: ${m5Confirmed}`);
      }
      
      if (!m5Confirmed) {
        if (Date.now() % 30000 < 1000) {
          console.log(`⏳ [${config.shortName}] CRASH esperando: M5 sin confirmación bajista (M5: ${structureM5.trend})`);
        }
        return null;
      }
      
      // ──────────────────────────────────────────────────────────────────────────
      // PASO 7-9: SETUP VÁLIDO - Calcular entrada, SL y TPs
      // ──────────────────────────────────────────────────────────────────────────
      console.log(`✅ [${config.shortName}] CRASH SETUP VÁLIDO - OB H1 + CHOCH/BOS + M5 confirma`);
      
      const entry = lastCandle.close;
      
      // SL: Arriba de la zona del OB H1
      const slBuffer = avgRange * 0.3;
      const stop = Math.max(obZone.high, lastCandle.high) + slBuffer;
      
      if (stop <= entry) {
        console.log(`⛔ [${config.shortName}] CRASH bloqueado: SL inválido`);
        return null;
      }
      
      const risk = stop - entry;
      
      // TPs basados en estructura H1 y swings
      const recentLowsH1 = swingsH1.filter(s => s.type === 'low').slice(-3);
      const targetLow = recentLowsH1.length > 0 ? Math.min(...recentLowsH1.map(l => l.price)) : entry - risk * 5;
      
      const tp1 = entry - risk * 1.5;  // 1:1.5 RR
      const tp2 = entry - risk * 2.5;  // 1:2.5 RR
      const tp3 = Math.min(targetLow, entry - risk * 4);  // Mínimo estructural o 1:4
      
      // Calcular score
      let score = 70;
      let reasons = ['CRASH OB H1'];
      
      if (structureH1.trend === 'BEARISH') { score += 10; reasons.push('H1↓'); }
      if (m5Bearish) { score += 5; reasons.push('M5↓'); }
      if (hasChochM5) { score += 5; reasons.push('CHOCH M5'); }
      if (hasBearishEngulfing) { score += 5; reasons.push('Engulfing'); }
      if (obAnalysis.hasChoch) { score += 5; reasons.push('CHOCH H1'); }
      if (obAnalysis.hasBos) { score += 3; reasons.push('BOS H1'); }
      
      return {
        action: 'SHORT',
        model: 'CRASH_SPIKE',
        score: Math.min(100, score),
        entry: +entry.toFixed(config.decimals),
        stop: +stop.toFixed(config.decimals),
        tp1: +tp1.toFixed(config.decimals),
        tp2: +tp2.toFixed(config.decimals),
        tp3: +tp3.toFixed(config.decimals),
        reason: reasons.join(' + '),
        analysis: {
          type: 'crash',
          structureM5: structureM5.trend,
          structureH1: structureH1.trend,
          obH1: `${obZone.low.toFixed(2)}-${obZone.high.toFixed(2)}`,
          hasChochH1: obAnalysis.hasChoch,
          hasBosH1: obAnalysis.hasBos,
          m5Confirmation: hasChochM5 ? 'CHOCH' : hasBearishEngulfing ? 'ENGULFING' : m5Bearish ? 'STRUCTURE' : 'NEUTRAL',
          risk: +risk.toFixed(config.decimals)
        }
      };
    }
    
    return null;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DETECTAR ORDER BLOCK CON CHOCH/BOS EN H1
  // ═══════════════════════════════════════════════════════════════════════════
  // Esta función busca:
  // 1. Order Block (vela base + vela envolvente)
  // 2. Impulso después del OB
  // 3. CHOCH o BOS de confirmación
  // 4. Nuevo alto/bajo estructural
  // ═══════════════════════════════════════════════════════════════════════════
  detectOBWithChochBos(candlesH1, assetType, lookback = 30) {
    if (!candlesH1 || candlesH1.length < 10) return null;
    
    const recentCandles = candlesH1.slice(-lookback);
    const avgRange = this.getAvgRange(candlesH1);
    
    // Log para debug
    const shouldLog = Date.now() % 15000 < 1000;
    
    // Buscar Order Blocks válidos con confirmación posterior
    let bestOB = null;
    let bestScore = 0;
    
    if (shouldLog) {
      console.log(`   🔍 Buscando OB en últimas ${recentCandles.length} velas H1...`);
    }
    
    for (let i = 0; i < recentCandles.length - 2; i++) {
      const baseCandle = recentCandles[i];
      const engulfCandle = recentCandles[i + 1];
      
      if (!baseCandle || !engulfCandle) continue;
      
      const baseBody = Math.abs(baseCandle.close - baseCandle.open);
      const engulfBody = Math.abs(engulfCandle.close - engulfCandle.open);
      
      // Requisito mínimo muy relajado
      if (baseBody < avgRange * 0.05 || engulfBody < avgRange * 0.05) continue;
      
      // ═══════════════════════════════════════════════════════════════════════
      // BOOM (BUY): Buscar OB de DEMANDA
      // Patrón: Vela ROJA + Vela VERDE que cierra arriba
      // ═══════════════════════════════════════════════════════════════════════
      if (assetType === 'boom') {
        const isBaseRed = baseCandle.close < baseCandle.open;
        const isEngulfGreen = engulfCandle.close > engulfCandle.open;
        
        // Solo necesita cerrar arriba del cierre de la roja
        const isValidPattern = isBaseRed && isEngulfGreen && 
                              engulfCandle.close > baseCandle.close;
        
        if (isValidPattern) {
          // Verificar que hubo movimiento alcista después
          const candlesAfterOB = recentCandles.slice(i + 2);
          if (candlesAfterOB.length < 1) continue;
          
          const obHigh = Math.max(engulfCandle.high, baseCandle.high);
          const obLow = Math.min(baseCandle.low, baseCandle.close);
          let hasChoch = false;
          let hasBos = false;
          let newHigh = obHigh;
          
          // Buscar máximo antes del OB
          const candlesBeforeOB = recentCandles.slice(Math.max(0, i - 10), i);
          const prevHighs = candlesBeforeOB.map(c => c.high);
          const prevSwingHigh = prevHighs.length > 0 ? Math.max(...prevHighs) : obHigh;
          
          for (const candle of candlesAfterOB) {
            if (candle.high > prevSwingHigh * 0.995) hasChoch = true;
            if (candle.high > obHigh) {
              hasBos = true;
              newHigh = Math.max(newHigh, candle.high);
            }
          }
          
          // Calcular score - dar puntos incluso sin CHOCH/BOS si el patrón es bueno
          let obScore = 20; // Base score por encontrar el patrón
          obScore += (engulfBody / baseBody) * 20;
          if (hasChoch) obScore += 30;
          if (hasBos) obScore += 20;
          obScore += Math.max(0, 15 - (recentCandles.length - i)); // Más reciente = mejor
          
          // Aceptar si tiene buen score O si tiene CHOCH/BOS
          if (obScore > bestScore && (hasChoch || hasBos || obScore > 40)) {
            bestScore = obScore;
            bestOB = {
              valid: true,
              side: 'BUY',
              zone: {
                high: Math.max(baseCandle.open, engulfCandle.open),
                low: obLow,
                mid: (baseCandle.open + obLow) / 2
              },
              hasChoch,
              hasBos,
              newHigh,
              candlesAgo: recentCandles.length - i,
              strength: Math.min(100, obScore)
            };
          }
        }
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // CRASH (SELL): Buscar OB de SUPPLY
      // Patrón: Vela VERDE + Vela ROJA que cierra abajo
      // ═══════════════════════════════════════════════════════════════════════
      if (assetType === 'crash') {
        const isBaseGreen = baseCandle.close > baseCandle.open;
        const isEngulfRed = engulfCandle.close < engulfCandle.open;
        
        // Solo necesita cerrar abajo del cierre de la verde
        const isValidPattern = isBaseGreen && isEngulfRed && 
                              engulfCandle.close < baseCandle.close;
        
        if (isValidPattern) {
          const candlesAfterOB = recentCandles.slice(i + 2);
          if (candlesAfterOB.length < 1) continue;
          
          const obHigh = Math.max(baseCandle.high, baseCandle.close);
          const obLow = Math.min(engulfCandle.low, baseCandle.low);
          let hasChoch = false;
          let hasBos = false;
          let newLow = obLow;
          
          const candlesBeforeOB = recentCandles.slice(Math.max(0, i - 10), i);
          const prevLows = candlesBeforeOB.map(c => c.low);
          const prevSwingLow = prevLows.length > 0 ? Math.min(...prevLows) : obLow;
          
          for (const candle of candlesAfterOB) {
            if (candle.low < prevSwingLow * 1.005) hasChoch = true;
            if (candle.low < obLow) {
              hasBos = true;
              newLow = Math.min(newLow, candle.low);
            }
          }
          
          let obScore = 20;
          obScore += (engulfBody / baseBody) * 20;
          if (hasChoch) obScore += 30;
          if (hasBos) obScore += 20;
          obScore += Math.max(0, 15 - (recentCandles.length - i));
          
          if (obScore > bestScore && (hasChoch || hasBos || obScore > 40)) {
            bestScore = obScore;
            bestOB = {
              valid: true,
              side: 'SELL',
              zone: {
                high: obHigh,
                low: Math.min(baseCandle.open, engulfCandle.open),
                mid: (obHigh + baseCandle.open) / 2
              },
              hasChoch,
              hasBos,
              newLow,
              candlesAgo: recentCandles.length - i,
              strength: Math.min(100, obScore)
            };
          }
        }
      }
    }
    
    if (shouldLog && bestOB) {
      console.log(`   🎯 Mejor OB: ${bestOB.side} en ${bestOB.zone.low.toFixed(2)}-${bestOB.zone.high.toFixed(2)} (Score: ${bestScore.toFixed(0)})`);
    }
    
    return bestOB;
  },

  findZones(candles) {
    const demandZones = [];
    const supplyZones = [];
    if (candles.length < 10) return { demandZones, supplyZones };

    const avgRange  = this.getAvgRange(candles);
    const lastIndex = candles.length - 1;

    for (let i = 1; i < candles.length - 2; i++) {
      const base  = candles[i];
      const next1 = candles[i + 1];
      const next2 = candles[Math.min(i + 2, lastIndex)];
      const next3 = candles[Math.min(i + 3, lastIndex)];
      const bodySize = Math.abs(base.close - base.open);
      if (bodySize < avgRange * 0.1) continue;

      // ── DEMAND OB: last RED candle before a bullish impulse ──
      if (base.close < base.open) {
        const immediateImpulse = next1.close > next1.open && next1.close > base.open;
        const delayedImpulse   = (next1.close > base.close) && (next2.high > base.high);
        const strongMove       = Math.max(next1.high, next2.high, next3.high) - base.low > avgRange * 1.2;
        if (!immediateImpulse && !delayedImpulse && !strongMove) continue;

        const obHigh = base.open;
        const obLow  = base.close;
        const obMid  = (obHigh + obLow) / 2;

        if (demandZones.some(z => Math.abs(z.mid - obMid) < avgRange * 0.6)) continue;

        let mitigated = false;
        for (let j = i + 2; j <= lastIndex; j++) {
          if (candles[j].close < obLow) { mitigated = true; break; }
        }

        const futureCandles = candles.slice(i+1, Math.min(i+10, lastIndex+1));
        const impulseEnd  = futureCandles.length ? Math.max(...futureCandles.map(c=>c.high)) : obHigh;
        const impulseSize = Math.max(0, impulseEnd - obHigh);

        demandZones.push({
          type: 'DEMAND', side: 'BUY',
          high: obHigh, low: obLow, mid: obMid,
          wickLow: base.low, index: i,
          epoch: base.epoch || (base.time ? Math.floor(base.time/1000) : null),
          impulseSize,
          pattern:  immediateImpulse ? 'ENGULFING' : 'IMPULSE',
          strength: (immediateImpulse || impulseSize > avgRange * 2) ? 'STRONG' : 'NORMAL',
          mitigated, tested: false,
        });
      }

      // ── SUPPLY OB: last GREEN candle before a bearish impulse ──
      if (base.close > base.open) {
        const immediateImpulse = next1.close < next1.open && next1.close < base.open;
        const delayedImpulse   = (next1.close < base.close) && (next2.low < base.low);
        const strongMove       = base.high - Math.min(next1.low, next2.low, next3.low) > avgRange * 1.2;
        if (!immediateImpulse && !delayedImpulse && !strongMove) continue;

        const obHigh = base.close;
        const obLow  = base.open;
        const obMid  = (obHigh + obLow) / 2;

        if (supplyZones.some(z => Math.abs(z.mid - obMid) < avgRange * 0.6)) continue;

        let mitigated = false;
        for (let j = i + 2; j <= lastIndex; j++) {
          if (candles[j].close > obHigh) { mitigated = true; break; }
        }

        const futureCandles = candles.slice(i+1, Math.min(i+10, lastIndex+1));
        const impulseEnd  = futureCandles.length ? Math.min(...futureCandles.map(c=>c.low)) : obLow;
        const impulseSize = Math.max(0, obLow - impulseEnd);

        supplyZones.push({
          type: 'SUPPLY', side: 'SELL',
          high: obHigh, low: obLow, mid: obMid,
          wickHigh: base.high, index: i,
          epoch: base.epoch || (base.time ? Math.floor(base.time/1000) : null),
          impulseSize,
          pattern:  immediateImpulse ? 'ENGULFING' : 'IMPULSE',
          strength: (immediateImpulse || impulseSize > avgRange * 2) ? 'STRONG' : 'NORMAL',
          mitigated, tested: false,
        });
      }
    }

    const filterOBs = (zones) => {
      const sorted    = zones.sort((a,b) => b.index - a.index);
      const fresh     = sorted.filter(z => !z.mitigated).slice(0, 4);
      const mitigated = sorted.filter(z =>  z.mitigated).slice(0, 1);
      return [...fresh, ...mitigated];
    };

    return { demandZones: filterOBs(demandZones), supplyZones: filterOBs(supplyZones) };
  },
  findFVGs(candles) {
    const fvgs = [];
    if (candles.length < 5) return fvgs;
    
    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i - 2];
      const c2 = candles[i - 1];
      const c3 = candles[i];
      
      if (c2.close > c2.open && c3.low > c1.high) {
        fvgs.push({
          type: 'BULLISH_FVG',
          side: 'BUY',
          high: c3.low,
          low: c1.high,
          mid: (c3.low + c1.high) / 2,
          index: i
        });
      }
      
      if (c2.close < c2.open && c1.low > c3.high) {
        fvgs.push({
          type: 'BEARISH_FVG',
          side: 'SELL',
          high: c1.low,
          low: c3.high,
          mid: (c1.low + c3.high) / 2,
          index: i
        });
      }
    }
    
    return fvgs.slice(-5);
  },

  findLiquidityLevels(swings, avgRange) {
    const levels = [];
    const tolerance = avgRange * 0.2;
    
    const highs = swings.filter(s => s.type === 'high').slice(-8);
    for (let i = 0; i < highs.length; i++) {
      const similar = highs.filter(h => Math.abs(h.price - highs[i].price) < tolerance);
      if (similar.length >= 2) {
        const avgPrice = similar.reduce((s, h) => s + h.price, 0) / similar.length;
        if (!levels.some(l => Math.abs(l.price - avgPrice) < tolerance)) {
          levels.push({ type: 'EQUAL_HIGHS', price: avgPrice, touches: similar.length });
        }
      }
    }
    
    const lows = swings.filter(s => s.type === 'low').slice(-8);
    for (let i = 0; i < lows.length; i++) {
      const similar = lows.filter(l => Math.abs(l.price - lows[i].price) < tolerance);
      if (similar.length >= 2) {
        const avgPrice = similar.reduce((s, l) => s + l.price, 0) / similar.length;
        if (!levels.some(l => Math.abs(l.price - avgPrice) < tolerance)) {
          levels.push({ type: 'EQUAL_LOWS', price: avgPrice, touches: similar.length });
        }
      }
    }
    
    return levels;
  },

  detectCHoCH(candles, swings) {
    if (swings.length < 4 || candles.length < 20) return null;

    const highs = swings.filter(s => s.type === 'high').slice(-8);
    const lows  = swings.filter(s => s.type === 'low').slice(-8);
    const lastPrice = candles[candles.length - 1].close;
    const avgRange = this.getAvgRange(candles);

    // ── BEARISH CHoCH: HH structure broken — price breaks below a HL ──
    // Pattern: HH → LH (trend weakening) → price closes below last HL = CHoCH
    if (highs.length >= 2) {
      const hadHigherHighs = highs.some((h,i) => i>0 && h.price > highs[i-1].price);
      if (hadHigherHighs) {
        const sortedLows = [...lows].sort((a,b) => a.index - b.index);
        for (let i = sortedLows.length - 2; i >= 0; i--) {
          const targetLow = sortedLows[i];
          const breakIdx = candles.findIndex((c, idx) =>
            idx > targetLow.index && c.close < targetLow.price
          );
          if (breakIdx > 0 && breakIdx >= candles.length - 25) {
            const level = targetLow.price;
            const epoch = candles[breakIdx]?.epoch || (candles[breakIdx]?.time ? Math.floor(candles[breakIdx].time/1000) : null);
            return {
              type: 'BEARISH_CHOCH', side: 'SELL', level,
              breakIndex: breakIdx, epoch,
              obEpoch: candles[Math.max(0, breakIdx-3)]?.epoch || null, // OB cerca del CHoCH
            };
          }
        }
      }
    }

    // ── BULLISH CHoCH: LL structure broken — price closes above last LH ──
    if (lows.length >= 2) {
      const hadLowerLows = lows.some((l,i) => i>0 && l.price < lows[i-1].price);
      if (hadLowerLows) {
        const sortedHighs = [...highs].sort((a,b) => a.index - b.index);
        for (let i = sortedHighs.length - 2; i >= 0; i--) {
          const targetHigh = sortedHighs[i];
          const breakIdx = candles.findIndex((c, idx) =>
            idx > targetHigh.index && c.close > targetHigh.price
          );
          if (breakIdx > 0 && breakIdx >= candles.length - 25) {
            const level = targetHigh.price;
            const epoch = candles[breakIdx]?.epoch || (candles[breakIdx]?.time ? Math.floor(candles[breakIdx].time/1000) : null);
            return {
              type: 'BULLISH_CHOCH', side: 'BUY', level,
              breakIndex: breakIdx, epoch,
              obEpoch: candles[Math.max(0, breakIdx-3)]?.epoch || null,
            };
          }
        }
      }
    }

    return null;
  },

  detectBOS(candles, swings, structure) {
    if (swings.length < 3 || candles.length < 5) return null;
    const lastPrice = candles[candles.length - 1].close;
    const last = candles[candles.length - 1];

    if (structure.trend === 'BULLISH') {
      const highs = swings.filter(s => s.type === 'high').slice(-3);
      if (highs.length >= 1) {
        const swingHigh = highs[highs.length - 1];
        if (lastPrice > swingHigh.price) {
          const epoch = last?.epoch || (last?.time ? Math.floor(last.time/1000) : null);
          return { type: 'BULLISH_BOS', side: 'BUY', level: swingHigh.price, epoch,
            breakIndex: candles.length - 1 };
        }
      }
    }
    if (structure.trend === 'BEARISH') {
      const lows = swings.filter(s => s.type === 'low').slice(-3);
      if (lows.length >= 1) {
        const swingLow = lows[lows.length - 1];
        if (lastPrice < swingLow.price) {
          const epoch = last?.epoch || (last?.time ? Math.floor(last.time/1000) : null);
          return { type: 'BEARISH_BOS', side: 'SELL', level: swingLow.price, epoch,
            breakIndex: candles.length - 1 };
        }
      }
    }
    return null;
  },

  analyzeOrderFlow(candles) {
    if (candles.length < 10) return { momentum: 'NEUTRAL', strength: 0 };
    
    const last10 = candles.slice(-10);
    const bullish = last10.filter(c => c.close > c.open);
    const bearish = last10.filter(c => c.close < c.open);
    
    const bullVol = bullish.reduce((s, c) => s + Math.abs(c.close - c.open), 0);
    const bearVol = bearish.reduce((s, c) => s + Math.abs(c.close - c.open), 0);
    
    const ratio = bullVol / (bearVol || 0.001);
    
    if (ratio > 1.5) return { momentum: 'BULLISH', strength: Math.min(100, ratio * 30), bullCount: bullish.length };
    if (ratio < 0.67) return { momentum: 'BEARISH', strength: Math.min(100, (1/ratio) * 30), bearCount: bearish.length };
    
    return { momentum: 'NEUTRAL', strength: 50 };
  },

  detectPullback(candles, demandZones, supplyZones, config) {
    if (candles.length < 5) return null;

    const last  = candles[candles.length - 1];
    const prev  = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];
    const price = last.close;
    const avgRange = this.getAvgRange(candles);

    // ══════════════════════════════════════════════════════════════
    // PULLBACK A ZONA DE DEMANDA (COMPRAS)
    // Flujo SMC: CHoCH alcista → OB formado → BOS → retroceso al OB
    // Entry: 50% del cuerpo del OB (nivel óptimo)
    // SL: debajo de la mecha inferior del OB
    // ══════════════════════════════════════════════════════════════
    for (const zone of demandZones) {
      if (zone.mitigated) continue;

      // ── TOQUE: precio entra al OB (low ≤ zona.high, cualquier profundidad) ──
      const lastTouches = last.low <= zone.high && last.high >= zone.low - avgRange * 0.5;
      const prevTouches = prev.low <= zone.high && prev.high >= zone.low - avgRange * 0.5;
      const touched = lastTouches || prevTouches;
      if (!touched) continue;

      // ── CONFIRMACIÓN de rechazo alcista (vela de confirmación en el OB) ──
      const wickBull     = (Math.min(last.open,last.close) - last.low) > Math.abs(last.close-last.open)*0.4;
      const bullClose    = last.close > last.open && last.close > zone.mid;
      const engulfBull   = prev.close<prev.open && last.close>last.open && last.close>prev.open;
      const pinBar       = last.low < zone.low && last.close > zone.mid; // pin bar tocando el OB
      const hasConf      = bullClose || wickBull || engulfBull || pinBar;
      if (!hasConf) continue;

      // ── ENTRY AL 50% DEL OB (Optimal Trade Entry dentro del OB) ──
      const entry50 = +(zone.mid).toFixed(config.decimals); // 50% del cuerpo del OB
      const slLevel = +(( (zone.wickLow || zone.low) - avgRange * 0.15 )).toFixed(config.decimals);
      const risk    = entry50 - slLevel;
      if (risk <= 0 || risk > avgRange * 8) continue;

      return {
        type: 'DEMAND_ZONE', side: 'BUY', zone,
        entry: entry50, stop: slLevel,
        tp1:  +(entry50 + risk * 1.5).toFixed(config.decimals),
        tp2:  +(entry50 + risk * 2.5).toFixed(config.decimals),
        tp3:  +(entry50 + risk * 4.0).toFixed(config.decimals),
        touchedOB: true,
        entryType: 'OB_50PCT',
        confirmation: engulfBull?'ENGULFING':pinBar?'PIN_BAR':wickBull?'REJECTION_WICK':'BULLISH_CLOSE'
      };
    }

    // ══════════════════════════════════════════════════════════════
    // PULLBACK A ZONA DE SUPPLY (VENTAS)
    // Flujo SMC: CHoCH bajista → OB formado → BOS → retroceso al OB
    // Entry: 50% del cuerpo del OB (nivel óptimo)
    // SL: encima de la mecha superior del OB
    // ══════════════════════════════════════════════════════════════
    for (const zone of supplyZones) {
      if (zone.mitigated) continue;

      // ── TOQUE: precio entra al OB (high ≥ zona.low) ──
      const lastTouches = last.high >= zone.low && last.low <= zone.high + avgRange * 0.5;
      const prevTouches = prev.high >= zone.low && prev.low <= zone.high + avgRange * 0.5;
      const touched = lastTouches || prevTouches;
      if (!touched) continue;

      // ── CONFIRMACIÓN de rechazo bajista ──
      const wickBear   = (last.high - Math.max(last.open,last.close)) > Math.abs(last.close-last.open)*0.4;
      const bearClose  = last.close < last.open && last.close < zone.mid;
      const engulfBear = prev.close>prev.open && last.close<last.open && last.close<prev.open;
      const pinBarB    = last.high > zone.high && last.close < zone.mid; // pin bar en el OB
      const hasConf    = bearClose || wickBear || engulfBear || pinBarB;
      if (!hasConf) continue;

      // ── ENTRY AL 50% DEL OB ──
      const entry50 = +(zone.mid).toFixed(config.decimals);
      const slLevel = +(( (zone.wickHigh || zone.high) + avgRange * 0.15 )).toFixed(config.decimals);
      const risk    = slLevel - entry50;
      if (risk <= 0 || risk > avgRange * 8) continue;

      return {
        type: 'SUPPLY_ZONE', side: 'SELL', zone,
        entry: entry50, stop: slLevel,
        tp1:  +(entry50 - risk * 1.5).toFixed(config.decimals),
        tp2:  +(entry50 - risk * 2.5).toFixed(config.decimals),
        tp3:  +(entry50 - risk * 4.0).toFixed(config.decimals),
        touchedOB: true,
        entryType: 'OB_50PCT',
        confirmation: engulfBear?'ENGULFING':pinBarB?'PIN_BAR':wickBear?'REJECTION_WICK':'BEARISH_CLOSE'
      };
    }

    return null;
  },

  // ═══════════════════════════════════════════════════════════════
  // ANÁLISIS M1_PRECISION
  // Lógica: H1 define tendencia → M15 define zona de interés → M1 da entrada
  // Requiere triple confluencia + confirmación de vela en M1
  // ═══════════════════════════════════════════════════════════════
  analyzeM1Precision(candlesM1, candlesM15, candlesH1, structureH1, structureM15, structureM5, config, avgRange, premiumDiscount) {
    if (!candlesM1 || candlesM1.length < 20) return null;
    if (structureH1.trend === 'LOADING' || structureH1.trend === 'NEUTRAL') return null;
    if (structureM15.trend === 'LOADING' || structureM15.trend === 'NEUTRAL') return null;

    // ── FILTRO 1: Triple confluencia H1 = M15 = M5 ──
    const tripleAlign = structureH1.trend === structureM15.trend && structureM15.trend === structureM5.trend;
    if (!tripleAlign) return null;

    const direction = structureH1.trend; // 'BULLISH' o 'BEARISH'
    const isBuy = direction === 'BULLISH';

    // ── FILTRO 2: Premium/Discount correcto en H1 ──
    // Compras en zonas Discount, ventas en Premium
    const pdOk = (isBuy && premiumDiscount === 'DISCOUNT') || (!isBuy && premiumDiscount === 'PREMIUM') || premiumDiscount === 'EQUILIBRIUM';
    if (!pdOk) return null;

    // ── ANÁLISIS M15: Encontrar zona de interés ──
    const { demandZones: demM15, supplyZones: supM15 } = this.findZones(candlesM15);
    const avgM15 = this.getAvgRange(candlesM15);
    const zonesM15 = isBuy ? demM15 : supM15;
    if (zonesM15.length === 0) return null;

    // ── ANÁLISIS M1: Confirmación de entrada precisa ──
    const m1 = candlesM1;
    const lastM1 = m1[m1.length - 1];
    const prevM1 = m1[m1.length - 2];
    const prev2M1 = m1[m1.length - 3];
    if (!lastM1 || !prevM1 || !prev2M1) return null;

    const price = lastM1.close;
    const avgM1 = this.getAvgRange(m1.slice(-30));

    // ── PATRÓN M1: CHoCH o Order Block en M1 ──
    // Para LONG: necesitamos vela roja seguida de verde que la envuelva (micro OB)
    // Para SHORT: vela verde seguida de roja envolvente
    const m1BullEngulf = isBuy &&
      prev2M1.close < prev2M1.open &&  // vela roja (base OB)
      prevM1.close > prevM1.open &&    // vela verde
      prevM1.close > prev2M1.open &&   // envuelve
      prevM1.open <= prev2M1.close;

    const m1BearEngulf = !isBuy &&
      prev2M1.close > prev2M1.open &&  // vela verde (base OB)
      prevM1.close < prevM1.open &&    // vela roja
      prevM1.close < prev2M1.open &&   // envuelve
      prevM1.open >= prev2M1.close;

    // Rechazo de mecha en M1 (pin bar)
    const m1BullWick = isBuy &&
      (lastM1.low < Math.min(lastM1.open, lastM1.close) - avgM1 * 0.5) && // mecha larga abajo
      lastM1.close > lastM1.open &&  // vela alcista
      lastM1.close > (lastM1.high + lastM1.low) / 2;

    const m1BearWick = !isBuy &&
      (lastM1.high > Math.max(lastM1.open, lastM1.close) + avgM1 * 0.5) && // mecha larga arriba
      lastM1.close < lastM1.open &&  // vela bajista
      lastM1.close < (lastM1.high + lastM1.low) / 2;

    // CHoCH en M1: dos mínimos/máximos consecutivos rompen la estructura local
    const swingsM1 = this.findSwings(m1.slice(-20), 1);
    const m1Choch = this.detectCHoCH(m1.slice(-20), swingsM1);
    const m1ChochOk = m1Choch && (
      (isBuy && m1Choch.side === 'BUY') ||
      (!isBuy && m1Choch.side === 'SELL')
    );

    const hasM1Confirmation = m1BullEngulf || m1BearEngulf || m1BullWick || m1BearWick || m1ChochOk;
    if (!hasM1Confirmation) return null;

    // ── VERIFICAR que el precio está en/cerca de zona M15 ──
    const nearZone = zonesM15.some(z => {
      const zoneRange = z.high - z.low;
      const buffer = zoneRange * 0.5 + avgM15 * 1.0;
      return price >= z.low - buffer && price <= z.high + buffer;
    });
    if (!nearZone) return null;

    // ── CALCULAR NIVELES ──
    // Entry: precio actual
    // SL: basado en la estructura M1 reciente
    const recentLows  = m1.slice(-10).map(c => c.low);
    const recentHighs = m1.slice(-10).map(c => c.high);
    const structLow   = Math.min(...recentLows);
    const structHigh  = Math.max(...recentHighs);

    let entry, stop, risk;
    if (isBuy) {
      entry = price;
      stop  = structLow - avgM1 * 0.3;
      risk  = entry - stop;
    } else {
      entry = price;
      stop  = structHigh + avgM1 * 0.3;
      risk  = stop - entry;
    }

    if (risk <= 0 || risk > avgM1 * 8) return null; // Riesgo inválido

    // ── SCORE ──
    let score = 82; // Base alta porque requiere triple confluencia
    if (structureH1.strength > 70) score += 5;
    if (structureM15.strength > 70) score += 4;
    if (m1ChochOk) score += 5;                       // CHoCH en M1 = confirmación fuerte
    if (m1BullEngulf || m1BearEngulf) score += 4;    // Engulfing en M1
    if (premiumDiscount !== 'EQUILIBRIUM') score += 3; // P/D correcto
    if (m1BullWick || m1BearWick) score += 3;        // Pin bar en M1

    score = Math.min(score, 97);

    const confDetail = [
      m1ChochOk ? 'CHoCH_M1' : null,
      m1BullEngulf || m1BearEngulf ? 'OB_M1' : null,
      m1BullWick || m1BearWick ? 'WICK_M1' : null,
    ].filter(Boolean).join('+');

    return {
      model: 'M1_PRECISION',
      baseScore: score,
      pullback: {
        side: isBuy ? 'BUY' : 'SELL',
        entry: +entry.toFixed(config.decimals),
        stop:  +stop.toFixed(config.decimals),
        tp1:   isBuy ? +(entry + risk * 1.5).toFixed(config.decimals) : +(entry - risk * 1.5).toFixed(config.decimals),
        tp2:   isBuy ? +(entry + risk * 2.5).toFixed(config.decimals) : +(entry - risk * 2.5).toFixed(config.decimals),
        tp3:   isBuy ? +(entry + risk * 4.0).toFixed(config.decimals) : +(entry - risk * 4.0).toFixed(config.decimals),
        type: 'M1_ENTRY'
      },
      reason: `Triple MTF ${direction} | M15 zona | ${confDetail}`
    };
  },

  analyze(candlesM5, candlesH1, config, state, candlesM15 = null, candlesM1 = null) {
    if (candlesM5.length < 30) {
      return { action: 'LOADING', score: 0, model: 'LOADING', reason: 'Cargando datos M5...' };
    }
    
    const swingsM5 = this.findSwings(candlesM5, 3);
    
    // Para Boom/Crash usar función de estructura específica
    const isBoomCrash = config.type === 'boom' || config.type === 'crash';
    const structureM5 = isBoomCrash 
      ? this.analyzeStructureBoomCrash(candlesM5, config.type)
      : this.analyzeStructure(swingsM5);
    
    const { demandZones, supplyZones } = this.findZones(candlesM5);
    const fvgZones = this.findFVGs(candlesM5);
    const avgRange = this.getAvgRange(candlesM5);
    const liquidityLevels = this.findLiquidityLevels(swingsM5, avgRange);
    const orderFlow = this.analyzeOrderFlow(candlesM5);
    const choch = this.detectCHoCH(candlesM5, swingsM5);
    const bos = this.detectBOS(candlesM5, swingsM5, structureM5);
    const pullback = this.detectPullback(candlesM5, demandZones, supplyZones, config);
    
    state.swings = swingsM5; // ALL swings with correct indices, not just last 10
    state.structure = structureM5;
    state.demandZones = demandZones;
    state.supplyZones = supplyZones;
    state.fvgZones = fvgZones;
    state.liquidityLevels = liquidityLevels;
    state.orderFlow = orderFlow;
    state.choch = choch;
    state.bos = bos;
    
    let structureH1 = { trend: 'LOADING', strength: 0 };
    let demandZonesH1 = [];
    let supplyZonesH1 = [];
    let premiumDiscount = 'EQUILIBRIUM';
    let h1Loaded = false;
    
    if (candlesH1 && candlesH1.length >= 20) {
      h1Loaded = true;
      const swingsH1 = this.findSwings(candlesH1, 3); // lb=3 for cleaner H1 swings
      structureH1 = this.analyzeStructure(swingsH1);
      const zonesH1 = this.findZones(candlesH1);
      demandZonesH1 = zonesH1.demandZones;
      supplyZonesH1 = zonesH1.supplyZones;
      premiumDiscount = this.getPremiumDiscount(candlesH1, swingsH1);
    }
    
    state.structureH1 = structureH1;
    state.demandZonesH1 = demandZonesH1;
    state.supplyZonesH1 = supplyZonesH1;
    state.premiumDiscount = premiumDiscount;
    state.h1Loaded = h1Loaded;
    
    // ═══════════════════════════════════════════
    // ANÁLISIS ESPECIAL PARA BOOM/CRASH v16
    // Ahora con confirmación H1 + OB Válido
    // ═══════════════════════════════════════════
    if (config.type === 'boom' || config.type === 'crash') {
      const rules = BOOM_CRASH_RULES[config.type];
      const boomCrashSignal = this.analyzeBoomCrash(candlesM5, config, state, rules, candlesH1);
      
      if (boomCrashSignal) {
        console.log(`🚀 [${config.shortName}] Señal ${config.type.toUpperCase()}: ${boomCrashSignal.reason} (Score: ${boomCrashSignal.score})`);
        return boomCrashSignal;
      }
      
      // Si no hay señal Boom/Crash, retornar WAIT con info específica
      return {
        action: 'WAIT',
        score: 0,
        model: config.type === 'boom' ? 'BOOM_WAIT' : 'CRASH_WAIT',
        reason: `${config.type === 'boom' ? 'Esperando setup LONG en zona Discount' : 'Esperando setup SHORT en zona Premium'}`,
        analysis: {
          structureM5: structureM5.trend,
          premiumDiscount,
          type: config.type,
          onlyDirection: config.onlyDirection
        }
      };
    }
    
    // ═══════════════════════════════════════════
    // ANÁLISIS ESTÁNDAR (Step, V75, XAU, etc.)
    // ═══════════════════════════════════════════
    const mtfConfluence = h1Loaded && 
                          structureH1.trend === structureM5.trend && 
                          structureH1.trend !== 'NEUTRAL';
    
    state.mtfConfluence = mtfConfluence;

    // ═══════════════════════════════════════════
    // ANÁLISIS M15 — Tendencia intermedia
    // ═══════════════════════════════════════════
    let structureM15 = { trend: 'LOADING', strength: 0 };
    let m15Loaded = false;
    if (candlesM15 && candlesM15.length >= 20) {
      m15Loaded = true;
      const swingsM15 = this.findSwings(candlesM15, 3); // lb=3 for cleaner M15 swings
      structureM15 = this.analyzeStructure(swingsM15);
      state.structureM15 = structureM15; // Update immediately for real-time
      // M15 Order Block zones for chart visualization
      const zonesM15 = this.findZones(candlesM15);
      state.demandZonesM15 = zonesM15.demandZones;
      state.supplyZonesM15 = zonesM15.supplyZones;
    }
    state.structureM15 = structureM15;
    state.m15Loaded = m15Loaded;

    // Triple confluencia: H1 + M15 + M5 en la misma dirección
    const tripleConfluence = h1Loaded && m15Loaded &&
      structureH1.trend === structureM15.trend &&
      structureM15.trend === structureM5.trend &&
      structureH1.trend !== 'NEUTRAL';

    const signals = [];
    const minScore = 84; // v19.0: Adjusted for improved OB detection

    // ── FILTRO GLOBAL: H1 y M15 deben estar alineados para cualquier señal ──
    // Si H1 y M15 no están en la misma dirección → no operar
    const h1m15Aligned = h1Loaded && m15Loaded &&
      structureH1.trend === structureM15.trend &&
      structureH1.trend !== 'NEUTRAL' &&
      structureH1.trend !== 'LOADING';

    // ── FILTRO GLOBAL: necesitamos también confirmación de fuerza ──
    const h1Strong  = structureH1.strength  >= 40; // lowered — real markets often read 40-60
    const m15Strong = structureM15.strength >= 35; // lowered
    const marketReady = h1m15Aligned && h1Strong;

    if (!marketReady) {
      // Mercado no está claro: H1 y M15 no alineados → solo WAIT
      return {
        action: 'WAIT',
        score: 0,
        model: 'WAIT',
        reason: `Esperando alineación H1(${structureH1.trend})+M15(${structureM15.trend})`,
        analysis: {
          structureM5: structureM5.trend,
          structureH1: structureH1.trend,
          structureM15: structureM15.trend,
          mtfConfluence,
          premiumDiscount,
          orderFlow: orderFlow.momentum
        }
      };
    }

    // La dirección operativa está definida por H1 (tendencia mayor)
    const opDir  = structureH1.trend; // 'BULLISH' o 'BEARISH'
    const opSide = opDir === 'BULLISH' ? 'BUY' : 'SELL';

    // ── MTF_CONFLUENCE: H1+M15 alineados + OB pullback ──
    // Core flow: H1 tendencia → M15 confirmación → OB toque → entrada 50%
    if (pullback && pullback.side === opSide) {
      let score = 88; // Base: ya pasó filtro H1+M15
      if (pullback.side === 'BUY'  && premiumDiscount === 'DISCOUNT') score += 5;
      if (pullback.side === 'SELL' && premiumDiscount === 'PREMIUM')  score += 5;
      if (m15Strong)       score += 4; // M15 tiene tendencia fuerte
      if (tripleConfluence) score += 3; // M5 también alineado (bonus, no requerido)
      if (choch)           score += 3; // CHoCH en M5 como confirmación adicional
      if (pullback.confirmation === 'ENGULFING' || pullback.confirmation === 'PIN_BAR') score += 3;
      score = Math.min(score, 100);

      signals.push({
        model: 'MTF_CONFLUENCE',
        baseScore: score,
        pullback,
        reason: `H1(${opDir})+M15(${structureM15.trend}) + OB 50% ${pullback.confirmation||''} ${premiumDiscount !== 'EQUILIBRIUM' ? '+ '+premiumDiscount : ''}`
      });
    }
    
    // ── CHOCH_PULLBACK: CHoCH en M5 + retroceso al OB ──
    if (choch && pullback && choch.side === opSide && pullback.side === opSide) {
      let score = 86;
      if (tripleConfluence) score += 5;
      if (m15Strong)        score += 4;
      if (pullback.confirmation === 'ENGULFING' || pullback.confirmation === 'PIN_BAR') score += 4;
      if (premiumDiscount === (opSide==='BUY'?'DISCOUNT':'PREMIUM')) score += 3;
      score = Math.min(score, 98);

      signals.push({
        model: 'CHOCH_PULLBACK',
        baseScore: score,
        pullback,
        reason: `${choch.type} + OB 50% ${pullback.confirmation||''} + H1/M15 ${opDir}`
      });
    }
    
    const last3 = candlesM5.slice(-3);
    // ═══════════════════════════════════════════════════════════════
    // LIQUIDITY_SWEEP - DESACTIVADO (No está en los 12 modelos oficiales)
    // Usar LIQUIDITY_GRAB en su lugar
    // ═══════════════════════════════════════════════════════════════
    /*
    for (const level of liquidityLevels) {
      const swept = last3.some(c => {
        if (level.type === 'EQUAL_HIGHS') return c.high > level.price && c.close < level.price;
        if (level.type === 'EQUAL_LOWS') return c.low < level.price && c.close > level.price;
        return false;
      });
      
      if (swept && pullback) {
        const side = level.type === 'EQUAL_HIGHS' ? 'SELL' : 'BUY';
        if (pullback.side === side) {
          let score = 78;
          if (mtfConfluence) score = 85;
          signals.push({
            model: 'LIQUIDITY_SWEEP',
            baseScore: score,
            pullback,
            reason: `Sweep ${level.type}${mtfConfluence ? ' + MTF' : ''}`
          });
        }
      }
    }
    */
    
    // v24.0: BOS_CONTINUATION requiere MTF para mejor calidad
    if (bos && pullback && bos.side === pullback.side) {
      // Verificar que Premium/Discount sea correcto
      const pdCorrect = (bos.side === 'BUY' && premiumDiscount === 'DISCOUNT') ||
                        (bos.side === 'SELL' && premiumDiscount === 'PREMIUM');
      
      // Solo operar si tiene MTF o Premium/Discount correcto
      if (mtfConfluence || pdCorrect) {
        let score = 78; // Score base aumentado
        if (mtfConfluence) score += 7; // Bonus con MTF
        if (pdCorrect) score += 5; // Bonus con P/D correcto
        signals.push({
          model: 'BOS_CONTINUATION',
          baseScore: score,
          pullback,
          reason: `${bos.type} + Pullback${mtfConfluence ? ' + MTF' : ''}${pdCorrect ? ' + P/D' : ''}`
        });
      }
    }
    
    const price = candlesM5[candlesM5.length - 1].close;
    const lastCandle = candlesM5[candlesM5.length - 1];
    
    // ═══════════════════════════════════════════════════════════════
    // ZONE_TOUCH - DESACTIVADO (No está en los 12 modelos oficiales)
    // Usar OB_ENTRY en su lugar
    // ═══════════════════════════════════════════════════════════════
    /*
    for (const zone of demandZones) {
      const touchingZone = lastCandle.low <= zone.high * 1.002 && lastCandle.low >= zone.low * 0.998;
      const closeAboveZone = lastCandle.close > zone.mid;
      const wickSize = lastCandle.close - lastCandle.low;
      const bodySize = Math.abs(lastCandle.close - lastCandle.open);
      const hasRejection = wickSize > bodySize * 0.3;
      
      if (touchingZone && closeAboveZone && hasRejection) {
        let score = 60;
        if (premiumDiscount === 'DISCOUNT') score += 5;
        if (mtfConfluence && structureH1.trend === 'BULLISH') score += 8;
        if (wickSize > bodySize * 0.5) score += 3;
        
        const zonePb = {
          side: 'BUY',
          entry: lastCandle.close,
          stop: zone.low - avgRange * 0.5,
          tp1: lastCandle.close + avgRange * 1.5,
          tp2: lastCandle.close + avgRange * 2.5,
          tp3: lastCandle.close + avgRange * 4
        };
        
        signals.push({
          model: 'ZONE_TOUCH',
          baseScore: score,
          pullback: zonePb,
          reason: `Zona demanda${premiumDiscount === 'DISCOUNT' ? ' + DISCOUNT' : ''}${mtfConfluence ? ' + MTF' : ''}`
        });
      }
    }
    
    for (const zone of supplyZones) {
      const touchingZone = lastCandle.high >= zone.low * 0.998 && lastCandle.high <= zone.high * 1.002;
      const closeBelowZone = lastCandle.close < zone.mid;
      const wickSize = lastCandle.high - lastCandle.close;
      const bodySize = Math.abs(lastCandle.close - lastCandle.open);
      const hasRejection = wickSize > bodySize * 0.3;
      
      if (touchingZone && closeBelowZone && hasRejection) {
        let score = 60;
        if (premiumDiscount === 'PREMIUM') score += 5;
        if (mtfConfluence && structureH1.trend === 'BEARISH') score += 8;
        if (wickSize > bodySize * 0.5) score += 3;
        
        const zonePb = {
          side: 'SELL',
          entry: lastCandle.close,
          stop: zone.high + avgRange * 0.5,
          tp1: lastCandle.close - avgRange * 1.5,
          tp2: lastCandle.close - avgRange * 2.5,
          tp3: lastCandle.close - avgRange * 4
        };
        
        signals.push({
          model: 'ZONE_TOUCH',
          baseScore: score,
          pullback: zonePb,
          reason: `Zona supply${premiumDiscount === 'PREMIUM' ? ' + PREMIUM' : ''}${mtfConfluence ? ' + MTF' : ''}`
        });
      }
    }
    */
    
    // v24.0: FVG_ENTRY con filtros mejorados
    for (const fvg of fvgZones) {
      const inFVG = price >= fvg.low * 0.999 && price <= fvg.high * 1.001;
      if (inFVG && pullback && fvg.side === pullback.side) {
        const pdCorrect = (fvg.side === 'BUY' && premiumDiscount === 'DISCOUNT') ||
                          (fvg.side === 'SELL' && premiumDiscount === 'PREMIUM');
        
        // v24: Solo operar si tiene MTF o P/D correcto
        if (mtfConfluence || pdCorrect) {
          let score = 76; // Score base aumentado
          if (mtfConfluence) score += 8;
          if (pdCorrect) score += 5;
          signals.push({
            model: 'FVG_ENTRY',
            baseScore: score,
            pullback,
            reason: `En ${fvg.type}${mtfConfluence ? ' + MTF' : ''}${pdCorrect ? ' + P/D' : ''}`
          });
        }
      }
    }
    
    // ═══════════════════════════════════════════
    // NUEVOS MODELOS SMC v14.0
    // ═══════════════════════════════════════════
    
    // OB_ENTRY - DESACTIVADO (genera falsas señales en contra de la tendencia H1)
    // Usar MTF_CONFLUENCE o CHOCH_PULLBACK que requieren confluencia completa
    /*
    if (pullback && (pullback.type === 'DEMAND_ZONE' || pullback.type === 'SUPPLY_ZONE')) {
      const pdCorrect = (pullback.side === 'BUY' && premiumDiscount === 'DISCOUNT') ||
                        (pullback.side === 'SELL' && premiumDiscount === 'PREMIUM');
      if (mtfConfluence || pdCorrect) {
        let score = 76;
        if (pdCorrect) score += 6;
        if (mtfConfluence) score += 8;
        signals.push({ model: 'OB_ENTRY', baseScore: score, pullback,
          reason: `Order Block ${pullback.side}${pdCorrect ? ' + P/D' : ''}${mtfConfluence ? ' + MTF' : ''}` });
      }
    }
    */
    
    // ═══════════════════════════════════════════════════════════════
    // STRUCTURE_BREAK - DESACTIVADO (No está en los 12 modelos oficiales)
    // Usar BOS_CONTINUATION en su lugar
    // ═══════════════════════════════════════════════════════════════
    /*
    if (bos && !pullback) {
      const breakEntry = {
        side: bos.side,
        entry: bos.level,
        stop: bos.side === 'BUY' ? bos.level - avgRange * 1.5 : bos.level + avgRange * 1.5,
        tp1: bos.side === 'BUY' ? bos.level + avgRange * 1.5 : bos.level - avgRange * 1.5,
        tp2: bos.side === 'BUY' ? bos.level + avgRange * 2.5 : bos.level - avgRange * 2.5,
        tp3: bos.side === 'BUY' ? bos.level + avgRange * 4 : bos.level - avgRange * 4
      };
      
      let score = 70;
      if (mtfConfluence) score += 5;
      
      signals.push({
        model: 'STRUCTURE_BREAK',
        baseScore: score,
        pullback: breakEntry,
        reason: `${bos.type} directo${mtfConfluence ? ' + MTF' : ''}`
      });
    }
    */
    
    // ═══════════════════════════════════════════════════════════════
    // REVERSAL_PATTERN - DESACTIVADO (No está en los 12 modelos oficiales)
    // ═══════════════════════════════════════════════════════════════
    /*
    if (choch && structureM5.strength >= 60) {
      const recentCandles = candlesM5.slice(-5);
      const hasMinorRetracement = recentCandles.some(c => {
        if (choch.side === 'BUY') return c.low < choch.level;
        return c.high > choch.level;
      });
      
      if (hasMinorRetracement && !pullback) {
        const revEntry = {
          side: choch.side,
          entry: lastCandle.close,
          stop: choch.side === 'BUY' ? lastCandle.close - avgRange * 2 : lastCandle.close + avgRange * 2,
          tp1: choch.side === 'BUY' ? lastCandle.close + avgRange * 1.5 : lastCandle.close - avgRange * 1.5,
          tp2: choch.side === 'BUY' ? lastCandle.close + avgRange * 2.5 : lastCandle.close - avgRange * 2.5,
          tp3: choch.side === 'BUY' ? lastCandle.close + avgRange * 4 : lastCandle.close - avgRange * 4
        };
        
        let score = 71;
        if (mtfConfluence || structureH1.trend === choch.side.replace('BUY', 'BULLISH').replace('SELL', 'BEARISH')) score += 5;
        
        signals.push({
          model: 'REVERSAL_PATTERN',
          baseScore: score,
          pullback: revEntry,
          reason: `${choch.type} + Retroceso${mtfConfluence ? ' + MTF' : ''}`
        });
      }
    }
    */
    
    // ═══════════════════════════════════════════════════════════════
    // PREMIUM_DISCOUNT - DESACTIVADO (No está en los 12 modelos oficiales)
    // ═══════════════════════════════════════════════════════════════
    /*
    if (!pullback && structureM5.trend !== 'NEUTRAL') {
      const inDiscount = premiumDiscount === 'DISCOUNT';
      const inPremium = premiumDiscount === 'PREMIUM';
      const trendMatch = (structureM5.trend === 'BULLISH' && inDiscount) ||
                         (structureM5.trend === 'BEARISH' && inPremium);
      
      if (trendMatch) {
        const pdEntry = {
          side: inDiscount ? 'BUY' : 'SELL',
          entry: lastCandle.close,
          stop: inDiscount ? lastCandle.close - avgRange * 2 : lastCandle.close + avgRange * 2,
          tp1: inDiscount ? lastCandle.close + avgRange * 1.5 : lastCandle.close - avgRange * 1.5,
          tp2: inDiscount ? lastCandle.close + avgRange * 2.5 : lastCandle.close - avgRange * 2.5,
          tp3: inDiscount ? lastCandle.close + avgRange * 4 : lastCandle.close - avgRange * 4
        };
        
        let score = 70;
        if (mtfConfluence) score += 6;
        
        signals.push({
          model: 'PREMIUM_DISCOUNT',
          baseScore: score,
          pullback: pdEntry,
          reason: `M5 ${structureM5.trend} en ${premiumDiscount}${mtfConfluence ? ' + MTF' : ''}`
        });
      }
    }
    */
    
    // v13.2: ORDER_FLOW DESACTIVADO - Generaba demasiadas señales falsas
    // Si quieres reactivarlo, descomenta el bloque siguiente
    /*
    if (orderFlow.momentum !== 'NEUTRAL' && orderFlow.strength >= 50 && pullback) {
      const flowMatch = (orderFlow.momentum === 'BULLISH' && pullback.side === 'BUY') ||
                        (orderFlow.momentum === 'BEARISH' && pullback.side === 'SELL');
      
      const h1Supports = !h1Loaded || structureH1.trend === orderFlow.momentum || structureH1.trend === 'NEUTRAL';
      
      if (flowMatch && h1Supports) {
        signals.push({
          model: 'ORDER_FLOW',
          baseScore: 70,
          pullback,
          reason: `Flow ${orderFlow.momentum} (${orderFlow.strength.toFixed(0)}%)`
        });
      }
    }
    */
    
    // ═══════════════════════════════════════════
    // MODELOS SMC AVANZADOS v14.3
    // ═══════════════════════════════════════════
    
    // BREAKER_BLOCK — ELIMINADO (entradas fuera del OB, SL demasiado amplio)
    
    // 2. INDUCEMENT - Trampa de liquidez (igual highs/lows que son barridos)
    // Detecta cuando el precio barre un nivel obvio y revierte
    const recentHighs = candlesM5.slice(-20).map(c => c.high);
    const recentLows = candlesM5.slice(-20).map(c => c.low);
    const highestRecent = Math.max(...recentHighs.slice(0, -3));
    const lowestRecent = Math.min(...recentLows.slice(0, -3));
    
    // Barrido de máximos + reversión = SELL
    if (lastCandle.high > highestRecent && lastCandle.close < highestRecent) {
      const sweepWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
      const sweepBody = Math.abs(lastCandle.close - lastCandle.open);
      
      if (sweepWick > sweepBody * 0.5) {
        const indEntry = {
          side: 'SELL',
          entry: lastCandle.close,
          stop: lastCandle.high + avgRange * 0.3,
          tp1: lastCandle.close - avgRange * 2,
          tp2: lastCandle.close - avgRange * 3.5,
          tp3: lastCandle.close - avgRange * 5
        };
        
        let score = 82;
        if (structureH1.trend === 'BEARISH') score += 5;
        if (structureM15 && structureM15.trend === 'BEARISH') score += 4;
        if (premiumDiscount === 'PREMIUM') score += 4;
        // Must match opDir
        if (opDir !== 'BEARISH') return; // Don't add — against direction
        
        signals.push({
          model: 'INDUCEMENT',
          baseScore: score,
          pullback: indEntry,
          reason: `Sweep máximos + rechazo${structureH1.trend === 'BEARISH' ? ' + H1↓' : ''}`
        });
      }
    }
    
    // Barrido de mínimos + reversión = BUY
    if (lastCandle.low < lowestRecent && lastCandle.close > lowestRecent) {
      const sweepWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
      const sweepBody = Math.abs(lastCandle.close - lastCandle.open);
      
      if (sweepWick > sweepBody * 0.5) {
        const indEntry = {
          side: 'BUY',
          entry: lastCandle.close,
          stop: lastCandle.low - avgRange * 0.3,
          tp1: lastCandle.close + avgRange * 2,
          tp2: lastCandle.close + avgRange * 3.5,
          tp3: lastCandle.close + avgRange * 5
        };
        
        let score = 82;
        if (structureH1.trend === 'BULLISH') score += 5;
        if (structureM15 && structureM15.trend === 'BULLISH') score += 4;
        if (premiumDiscount === 'DISCOUNT') score += 4;
        // Must match opDir
        if (opDir !== 'BULLISH') return; // Don't add — against direction
        
        signals.push({
          model: 'INDUCEMENT',
          baseScore: score,
          pullback: indEntry,
          reason: `Sweep mínimos + rechazo${structureH1.trend === 'BULLISH' ? ' + H1↑' : ''}`
        });
      }
    }
    
    // 3. OPTIMAL_TRADE_ENTRY (OTE) - Entrada en el 62-79% del movimiento (Fibonacci)
    if (choch && pullback) {
      // Calcular el rango del movimiento
      const moveHigh = Math.max(...candlesM5.slice(-10).map(c => c.high));
      const moveLow = Math.min(...candlesM5.slice(-10).map(c => c.low));
      const moveRange = moveHigh - moveLow;
      
      // Zona OTE = 62% - 79% del retroceso
      const ote62 = choch.side === 'BUY' ? moveLow + moveRange * 0.21 : moveHigh - moveRange * 0.21;
      const ote79 = choch.side === 'BUY' ? moveLow + moveRange * 0.38 : moveHigh - moveRange * 0.38;
      
      const inOTE = choch.side === 'BUY' 
        ? (lastCandle.close >= ote62 && lastCandle.close <= ote79)
        : (lastCandle.close <= ote62 && lastCandle.close >= ote79);
      
      if (inOTE) {
        let score = 82;
        if (mtfConfluence) score += 5;
        const pdCorrect = (choch.side === 'BUY' && premiumDiscount === 'DISCOUNT') ||
                          (choch.side === 'SELL' && premiumDiscount === 'PREMIUM');
        if (pdCorrect) score += 5;
        
        signals.push({
          model: 'OTE_ENTRY',
          baseScore: score,
          pullback,
          reason: `OTE Fib 62-79%${mtfConfluence ? ' + MTF' : ''}${pdCorrect ? ' + P/D' : ''}`
        });
      }
    }
    
    // 4. LIQUIDITY_GRAB - Barrido rápido de liquidez con rechazo inmediato (v24)
    const prev2Candle = candlesM5[candlesM5.length - 3];
    const prevCandle = candlesM5[candlesM5.length - 2];
    
    if (prev2Candle && prevCandle) {
      // Patrón: vela rompe nivel, siguiente vela revierte fuerte
      const brokeHigh = prevCandle.high > prev2Candle.high && prevCandle.close < prev2Candle.high;
      const brokeLow = prevCandle.low < prev2Candle.low && prevCandle.close > prev2Candle.low;
      
      // Confirmación: vela actual continúa la reversión
      if (brokeHigh && lastCandle.close < prevCandle.close) {
      // SHORT: Solo si H1 NO es BULLISH (H1 BEARISH o NEUTRAL)
        // El PREMIUM puede ser bonus pero NO puede permitir ir contra H1 fuerte
        const h1AllowsShort = structureH1.trend !== 'BULLISH';
        const m15AllowsShort = !structureM15 || structureM15.trend !== 'BULLISH';
        const pdBonus = premiumDiscount === 'PREMIUM';
        
        if (h1AllowsShort && m15AllowsShort) {
          const lgEntry = {
            side: 'SELL',
            entry: lastCandle.close,
            stop: prevCandle.high + avgRange * 0.3,
            tp1: lastCandle.close - avgRange * 1.8,
            tp2: lastCandle.close - avgRange * 3,
            tp3: lastCandle.close - avgRange * 4.5
          };
          let score = 80;
          if (structureH1.trend === 'BEARISH') score += 7;
          if (pdBonus) score += 5;
          signals.push({
            model: 'LIQUIDITY_GRAB',
            baseScore: score,
            pullback: lgEntry,
            reason: `Grab alcista fallido${structureH1.trend === 'BEARISH' ? ' + H1↓' : ''}${pdBonus ? ' + PREMIUM' : ''}`
          });
        }
      }
      
      if (brokeLow && lastCandle.close > prevCandle.close) {
      // LONG: Solo si H1 NO es BEARISH (H1 BULLISH o NEUTRAL)
        const h1AllowsLong = structureH1.trend !== 'BEARISH';
        const m15AllowsLong = !structureM15 || structureM15.trend !== 'BEARISH';
        const pdBonusL = premiumDiscount === 'DISCOUNT';
        
        if (h1AllowsLong && m15AllowsLong) {
          const lgEntry = {
            side: 'BUY',
            entry: lastCandle.close,
            stop: prevCandle.low - avgRange * 0.3,
            tp1: lastCandle.close + avgRange * 1.8,
            tp2: lastCandle.close + avgRange * 3,
            tp3: lastCandle.close + avgRange * 4.5
          };
          let score = 80;
          if (structureH1.trend === 'BULLISH') score += 7;
          if (pdBonusL) score += 5;
          signals.push({
            model: 'LIQUIDITY_GRAB',
            baseScore: score,
            pullback: lgEntry,
            reason: `Grab bajista fallido${structureH1.trend === 'BULLISH' ? ' + H1↑' : ''}${pdBonusL ? ' + DISCOUNT' : ''}`
          });
        }
      }
    }
    
    // SMART_MONEY_TRAP — ELIMINADO (entradas a mercado sin OB, SL inconsistente)

    // ═══════════════════════════════════════════════════════════════
    // MODELO M1_PRECISION — Estrategia H1 tendencia · M15 zona · M1 entrada
    // Triple confluencia requerida. Señales de muy alta calidad.
    // ═══════════════════════════════════════════════════════════════
    if (candlesM1 && candlesM1.length >= 20 && m15Loaded && h1Loaded) {
      const m1Signal = this.analyzeM1Precision(
        candlesM1, candlesM15 || [], candlesH1, structureH1, structureM15, structureM5,
        config, avgRange, premiumDiscount
      );
      if (m1Signal) {
        signals.push(m1Signal);
      }
    }

    if (signals.length === 0) {
      let reason = 'Esperando setup';
      if (!pullback) reason = 'Sin pullback a zona';
      else if (structureM5.trend === 'NEUTRAL') reason = 'Estructura M5 neutral';
      else if (!mtfConfluence && !choch) reason = 'Sin MTF Confluence ni CHoCH';
      else if (choch && !pullback) reason = `CHoCH ${choch.type} detectado pero sin pullback a zona`;
      else if (!choch && pullback) reason = `Pullback ${pullback.side} detectado pero sin CHoCH`;
      
      // Log detallado cada 30 segundos para debug
      const now = Date.now();
      if (!this._lastDebugLog || now - this._lastDebugLog > 30000) {
        this._lastDebugLog = now;
        console.log(`🔍 [DEBUG ${config.shortName}] Sin señales:`);
        console.log(`   M5=${structureM5.trend} H1=${structureH1.trend} MTF=${mtfConfluence ? 'SÍ' : 'NO'}`);
        console.log(`   CHoCH=${choch ? choch.type + ' @' + choch.level : 'NO'}`);
        console.log(`   Pullback=${pullback ? pullback.side + ' @' + pullback.entry : 'NO'}`);
        console.log(`   BOS=${bos?.type || 'NO'}`);
        console.log(`   Zonas: Demand=${demandZones.length} Supply=${supplyZones.length}`);
        console.log(`   P/D=${premiumDiscount} | Razón: ${reason}`);
      }
      
      return {
        action: 'WAIT',
        score: Math.round(Math.max(structureM5.strength, orderFlow.strength) * 0.5),
        model: 'WAIT',
        reason,
        analysis: {
          structureM5: structureM5.trend,
          structureH1: structureH1.trend,
          mtfConfluence,
          premiumDiscount,
          orderFlow: orderFlow.momentum,
          demandZones: demandZones.length,
          supplyZones: supplyZones.length,
          choch: choch?.type,
          bos: bos?.type
        }
      };
    }
    
    // Log cuando SÍ hay señales potenciales
    console.log(`✨ [${config.shortName}] ${signals.length} señales detectadas: ${signals.map(s => s.model).join(', ')}`);
    
    signals.sort((a, b) => b.baseScore - a.baseScore);
    const best = signals[0];
    
    // 🔍 LOG: Mostrar score de la mejor señal
    console.log(`🎯 [${config.shortName}] Mejor: ${best.model} | Score Base: ${best.baseScore} | Side: ${best.pullback?.side}`);
    
    // ═══════════════════════════════════════════
    // AJUSTE DE SCORE CON SISTEMA DE APRENDIZAJE
    // ═══════════════════════════════════════════
    // Nota: Usamos config.shortName en lugar de symbol (que no existe en este contexto)
    const learningAdj = LearningSystem.getScoreAdjustment(best.model, config.shortName);
    const finalScore = Math.min(100, Math.max(0, best.baseScore + learningAdj));
    
    // Log SIEMPRE para ver el score final
    console.log(`📊 [${config.shortName}] Score Final: ${finalScore} vs Min: ${minScore} → ${finalScore >= minScore ? '✅ PASA' : '❌ NO PASA'}`);
    
    // v14.1: Si el score es mayor a minScore, generar señal
    if (finalScore < minScore) {
      console.log(`❌ [${config.shortName}] Rechazada internamente: ${finalScore} < ${minScore}`);
      return {
        action: 'WAIT',
        score: finalScore,
        model: best.model,
        reason: `Score ${finalScore}% < ${minScore}% min`,
        analysis: {
          structureM5: structureM5.trend,
          structureH1: structureH1.trend,
          mtfConfluence,
          premiumDiscount
        }
      };
    }
    
    // ✅ SCORE SUFICIENTE - GENERAR SEÑAL
    console.log(`✅ [${config.shortName}] APROBADA: ${best.model} con score ${finalScore}`);
    
    const pb = best.pullback;
    return {
      action: pb.side === 'BUY' ? 'LONG' : 'SHORT',
      model: best.model,
      score: finalScore,
      entry: pb.entry,
      stop: pb.stop,
      tp1: pb.tp1,
      tp2: pb.tp2,
      tp3: pb.tp3,
      reason: best.reason,
      analysis: {
        structureM5: structureM5.trend,
        structureH1: structureH1.trend,
        mtfConfluence,
        premiumDiscount,
        orderFlow: orderFlow.momentum
      }
    };
  }
};

// =============================================
// ELISA IA - ASISTENTE EXPRESIVA
// =============================================
const Elisa = {
  getContext(symbol) {
    const data = assetData[symbol];
    const config = ASSETS[symbol];
    if (!data || !config) return null;
    
    const lastCandles = data.candles.slice(-5);
    const priceChange = lastCandles.length >= 2 
      ? ((lastCandles[lastCandles.length - 1]?.close - lastCandles[0]?.close) / lastCandles[0]?.close * 100).toFixed(2)
      : 0;
    
    return {
      symbol,
      name: config.name,
      shortName: config.shortName,
      emoji: config.emoji,
      price: data.price,
      decimals: config.decimals,
      priceChange,
      structureM5:  data.structure?.trend   || 'LOADING',
      structureM15: data.structureM15?.trend || 'LOADING',
      structureH1:  data.structureH1?.trend  || 'LOADING',
      h1Loaded: data.h1Loaded,
      mtfConfluence: data.mtfConfluence,
      premiumDiscount: data.premiumDiscount,
      orderFlow: data.orderFlow,
      demandZones: data.demandZones || [],
      supplyZones: data.supplyZones || [],
      fvgZones: data.fvgZones || [],
      liquidityLevels: data.liquidityLevels || [],
      choch: data.choch,
      bos: data.bos,
      lockedSignal: data.lockedSignal,
      signal: data.signal,
      candles: data.candles.slice(-10),
      swings: data.swings || []
    };
  },

  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return '¡Buenos días!';
    if (hour < 18) return '¡Buenas tardes!';
    return '¡Buenas noches!';
  },

  getRandomPhrase(phrases) {
    return phrases[Math.floor(Math.random() * phrases.length)];
  },

  chat(question, symbol) {
    const ctx = this.getContext(symbol);
    if (!ctx) return { answer: "⏳ Dame un momento, estoy conectándome al mercado...", type: 'loading' };
    
    const q = (question || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
    // ═══════════════════════════════════════════
    // SALUDO
    // ═══════════════════════════════════════════
    if (!q || q === 'hola' || q === 'hey' || q === 'hi' || q === 'ey') {
      const greetings = [
        `${this.getGreeting()} 💜 Soy Elisa, tu asistente de trading.\n\n`,
        `¡Hola! 👋 Qué gusto verte por aquí.\n\n`,
        `${this.getGreeting()} ¿Listo para analizar el mercado juntos?\n\n`
      ];
      
      let r = this.getRandomPhrase(greetings);
      r += `Estoy viendo **${ctx.emoji} ${ctx.name}** ahora mismo.\n\n`;
      r += `💵 Precio actual: **${ctx.price?.toFixed(ctx.decimals) || '---'}**\n`;
      
      if (ctx.priceChange != 0) {
        const direction = ctx.priceChange > 0 ? '📈 Subiendo' : '📉 Bajando';
        r += `${direction} ${Math.abs(ctx.priceChange)}% en las últimas velas\n\n`;
      }
      
      r += `¿Qué quieres saber? Puedo contarte sobre:\n`;
      r += `• El análisis actual del gráfico\n`;
      r += `• Las zonas de entrada\n`;
      r += `• Qué operación buscar\n`;
      r += `• O pregúntame lo que quieras 😊`;
      
      return { answer: r, type: 'greeting' };
    }

    // ═══════════════════════════════════════════
    // ANÁLISIS COMPLETO
    // ═══════════════════════════════════════════
    if (q.includes('analisis') || q.includes('analiza') || q.includes('que ves') || q.includes('grafico') || q.includes('chart')) {
      let r = `📊 **Análisis de ${ctx.name}**\n\n`;
      r += `Déjame contarte lo que veo en el gráfico...\n\n`;
      
      // Precio y movimiento
      r += `💵 **Precio:** ${ctx.price?.toFixed(ctx.decimals)}\n`;
      if (ctx.priceChange != 0) {
        const emoji = ctx.priceChange > 0 ? '🟢' : '🔴';
        r += `${emoji} Movimiento reciente: ${ctx.priceChange > 0 ? '+' : ''}${ctx.priceChange}%\n\n`;
      }
      
      // Estructura
      r += `**📈 ESTRUCTURA:**\n`;
      if (ctx.structureM5 === 'BULLISH') {
        r += `• M5 está **ALCISTA** - Veo máximos y mínimos más altos. Los compradores tienen el control.\n`;
      } else if (ctx.structureM5 === 'BEARISH') {
        r += `• M5 está **BAJISTA** - Veo máximos y mínimos más bajos. Los vendedores dominan.\n`;
      } else {
        r += `• M5 está **NEUTRAL** - No hay una dirección clara, el mercado está consolidando.\n`;
      }
      
      if (ctx.h1Loaded) {
        if (ctx.structureH1 === 'BULLISH') {
          r += `• H1 está **ALCISTA** - La tendencia mayor es de compra.\n`;
        } else if (ctx.structureH1 === 'BEARISH') {
          r += `• H1 está **BAJISTA** - La tendencia mayor es de venta.\n`;
        } else {
          r += `• H1 está **NEUTRAL** - Sin tendencia clara en temporalidad mayor.\n`;
        }
        
        if (ctx.mtfConfluence) {
          r += `\n✨ **¡HAY CONFLUENCIA MTF!** Ambas temporalidades apuntan en la misma dirección. Esto es muy bueno para operar.\n`;
        }
      } else {
        r += `• H1: Cargando datos...\n`;
      }
      
      // Premium/Discount
      r += `\n**💰 CONTEXTO DE PRECIO:**\n`;
      if (ctx.premiumDiscount === 'PREMIUM') {
        r += `El precio está en zona **PREMIUM** (caro). Es mejor buscar VENTAS aquí.\n`;
      } else if (ctx.premiumDiscount === 'DISCOUNT') {
        r += `El precio está en zona **DISCOUNT** (barato). Es mejor buscar COMPRAS aquí.\n`;
      } else {
        r += `El precio está en **EQUILIBRIO**. Podría ir para cualquier lado.\n`;
      }
      
      // Zonas
      r += `\n**📦 ZONAS DETECTADAS:**\n`;
      r += `• ${ctx.demandZones.length} zonas de demanda (compra)\n`;
      r += `• ${ctx.supplyZones.length} zonas de oferta (venta)\n`;
      
      if (ctx.fvgZones.length > 0) {
        r += `• ${ctx.fvgZones.length} FVG (gaps de precio)\n`;
      }
      
      // CHoCH / BOS
      if (ctx.choch) {
        r += `\n⚡ **ALERTA:** Detecté un ${ctx.choch.type === 'BULLISH_CHOCH' ? 'cambio alcista' : 'cambio bajista'} en la estructura (CHoCH).\n`;
      }
      if (ctx.bos) {
        r += `📈 **BOS detectado:** ${ctx.bos.type === 'BULLISH_BOS' ? 'Ruptura alcista' : 'Ruptura bajista'} confirmada.\n`;
      }
      
      // Recomendación
      r += `\n**🎯 MI OPINIÓN:**\n`;
      if (ctx.lockedSignal) {
        r += `Tenemos una señal **${ctx.lockedSignal.action}** activa con score de ${ctx.lockedSignal.score}%. ¡Ya estamos en el mercado!`;
      } else if (ctx.mtfConfluence) {
        const side = ctx.structureH1 === 'BULLISH' ? 'COMPRAS' : 'VENTAS';
        r += `Con la confluencia MTF, me gusta buscar **${side}**. Solo falta esperar un buen pullback a zona.`;
      } else {
        r += `Ahora mismo no veo un setup claro. Te recomiendo esperar a que el mercado defina mejor su dirección.`;
      }
      
      return { answer: r, type: 'analysis' };
    }

    // ═══════════════════════════════════════════
    // SEÑAL ACTIVA
    // ═══════════════════════════════════════════
    if (q.includes('senal') || q.includes('signal') || q.includes('operacion') || q.includes('trade') || q.includes('entrada')) {
      if (ctx.lockedSignal) {
        const s = ctx.lockedSignal;
        let r = `🎯 **¡Tenemos una operación activa!**\n\n`;
        r += `${s.action === 'LONG' ? '🟢 COMPRA' : '🔴 VENTA'} en **${ctx.name}**\n\n`;
        r += `📊 Modelo: **${s.model}**\n`;
        r += `💪 Score: **${s.score}%**\n\n`;
        r += `**Niveles:**\n`;
        r += `• Entry: ${s.entry}\n`;
        r += `• Stop Loss: ${s.stop} ${s.trailingActive ? '(🔄 Trailing activo)' : ''}\n`;
        r += `• TP1: ${s.tp1} ${s.tp1Hit ? '✅ ¡Alcanzado!' : ''}\n`;
        r += `• TP2: ${s.tp2} ${s.tp2Hit ? '✅ ¡Alcanzado!' : ''}\n`;
        r += `• TP3: ${s.tp3} ${s.tp3Hit ? '✅ ¡Alcanzado!' : ''}\n\n`;
        
        const currentPrice = ctx.price;
        const entry = s.entry;
        const pips = s.action === 'LONG' ? currentPrice - entry : entry - currentPrice;
        
        if (pips > 0) {
          r += `💚 Estamos en **profit** ahora mismo (+${pips.toFixed(ctx.decimals)})`;
        } else if (pips < 0) {
          r += `💛 Estamos en **pérdida temporal** (${pips.toFixed(ctx.decimals)})`;
        } else {
          r += `⚪ Estamos en **breakeven**`;
        }
        
        return { answer: r, type: 'signal' };
      }
      
      let r = `⏳ **No hay señal activa ahora mismo**\n\n`;
      r += `Score actual: ${ctx.signal?.score || 0}%\n`;
      r += `Estado: ${ctx.signal?.reason || 'Esperando setup'}\n\n`;
      
      if (ctx.signal?.score >= 50) {
        r += `💡 Estamos cerca de una señal. Solo falta que se cumplan algunas condiciones más.`;
      } else {
        r += `El mercado no me está mostrando una oportunidad clara. Paciencia, las mejores operaciones requieren esperar el momento correcto.`;
      }
      
      return { answer: r, type: 'waiting' };
    }

    // ═══════════════════════════════════════════
    // PLAN / QUÉ BUSCAR
    // ═══════════════════════════════════════════
    if (q.includes('plan') || q.includes('buscar') || q.includes('hacer') || q.includes('estrategia') || q.includes('idea')) {
      let r = `🎯 **Plan de Trading para ${ctx.name}**\n\n`;
      
      if (ctx.mtfConfluence) {
        if (ctx.structureH1 === 'BULLISH') {
          r += `✅ **BUSCAR COMPRAS**\n\n`;
          r += `Tenemos confluencia MTF alcista, esto es ideal.\n\n`;
          r += `**¿Cómo entrar?**\n`;
          r += `1. Esperar que el precio baje a una zona de demanda\n`;
          r += `2. Ver una vela de rechazo (mecha inferior larga)\n`;
          r += `3. Entrar en la siguiente vela alcista\n\n`;
          
          if (ctx.premiumDiscount === 'DISCOUNT') {
            r += `💎 **¡BONUS!** El precio está en DISCOUNT. Es el mejor momento para buscar compras.\n`;
          } else if (ctx.premiumDiscount === 'PREMIUM') {
            r += `⚠️ El precio está en PREMIUM. Esperaría un retroceso antes de comprar.\n`;
          }
          
          if (ctx.demandZones.length > 0) {
            const bestZone = ctx.demandZones[ctx.demandZones.length - 1];
            r += `\n📍 Zona de demanda más cercana: ${bestZone.low.toFixed(ctx.decimals)} - ${bestZone.high.toFixed(ctx.decimals)}`;
          }
          
        } else {
          r += `✅ **BUSCAR VENTAS**\n\n`;
          r += `Tenemos confluencia MTF bajista, esto es ideal.\n\n`;
          r += `**¿Cómo entrar?**\n`;
          r += `1. Esperar que el precio suba a una zona de oferta\n`;
          r += `2. Ver una vela de rechazo (mecha superior larga)\n`;
          r += `3. Entrar en la siguiente vela bajista\n\n`;
          
          if (ctx.premiumDiscount === 'PREMIUM') {
            r += `💎 **¡BONUS!** El precio está en PREMIUM. Es el mejor momento para buscar ventas.\n`;
          } else if (ctx.premiumDiscount === 'DISCOUNT') {
            r += `⚠️ El precio está en DISCOUNT. Esperaría un rebote antes de vender.\n`;
          }
          
          if (ctx.supplyZones.length > 0) {
            const bestZone = ctx.supplyZones[ctx.supplyZones.length - 1];
            r += `\n📍 Zona de oferta más cercana: ${bestZone.low.toFixed(ctx.decimals)} - ${bestZone.high.toFixed(ctx.decimals)}`;
          }
        }
      } else {
        r += `⚠️ **ESPERAR CONFLUENCIA**\n\n`;
        r += `Ahora mismo M5 dice "${ctx.structureM5}" y H1 dice "${ctx.structureH1}".\n\n`;
        r += `No están de acuerdo, así que es mejor no operar.\n\n`;
        r += `**¿Qué hacer?**\n`;
        r += `• Esperar a que ambas temporalidades se alineen\n`;
        r += `• O buscar otro activo con mejor setup\n\n`;
        r += `Recuerda: No operar también es una decisión inteligente 🧠`;
      }
      
      return { answer: r, type: 'plan' };
    }

    // ═══════════════════════════════════════════
    // ZONAS
    // ═══════════════════════════════════════════
    if (q.includes('zona') || q.includes('demanda') || q.includes('oferta') || q.includes('soporte') || q.includes('resistencia')) {
      let r = `📦 **Zonas en ${ctx.name}**\n\n`;
      
      r += `**🟢 ZONAS DE DEMANDA (Compra):**\n`;
      if (ctx.demandZones.length > 0) {
        ctx.demandZones.forEach((z, i) => {
          r += `${i + 1}. ${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)} `;
          r += z.strength === 'STRONG' ? '💪 Fuerte\n' : '👍 Normal\n';
        });
      } else {
        r += `No veo zonas de demanda activas\n`;
      }
      
      r += `\n**🔴 ZONAS DE OFERTA (Venta):**\n`;
      if (ctx.supplyZones.length > 0) {
        ctx.supplyZones.forEach((z, i) => {
          r += `${i + 1}. ${z.low.toFixed(ctx.decimals)} - ${z.high.toFixed(ctx.decimals)} `;
          r += z.strength === 'STRONG' ? '💪 Fuerte\n' : '👍 Normal\n';
        });
      } else {
        r += `No veo zonas de oferta activas\n`;
      }
      
      if (ctx.fvgZones.length > 0) {
        r += `\n**📊 FVG (Fair Value Gaps):**\n`;
        ctx.fvgZones.forEach((f, i) => {
          r += `${i + 1}. ${f.type === 'BULLISH_FVG' ? '🟢' : '🔴'} ${f.low.toFixed(ctx.decimals)} - ${f.high.toFixed(ctx.decimals)}\n`;
        });
      }
      
      return { answer: r, type: 'zones' };
    }

    // ═══════════════════════════════════════════
    // STATS
    // ═══════════════════════════════════════════
    if (q.includes('stat') || q.includes('resultado') || q.includes('rendimiento') || q.includes('win')) {
      const wr = stats.wins + stats.losses > 0 ? Math.round(stats.wins / (stats.wins + stats.losses) * 100) : 0;
      
      let r = `📈 **Estadísticas de Trading**\n\n`;
      r += `**Win Rate:** ${wr}%\n`;
      r += `**Operaciones:** ${stats.total} total\n`;
      r += `• ✅ Wins: ${stats.wins}\n`;
      r += `• ❌ Losses: ${stats.losses}\n`;
      r += `• ⏳ Pendientes: ${stats.pending}\n\n`;
      r += `**TPs Alcanzados:**\n`;
      r += `• TP1: ${stats.tp1Hits}\n`;
      r += `• TP2: ${stats.tp2Hits}\n`;
      r += `• TP3: ${stats.tp3Hits} 💎\n\n`;
      
      if (wr >= 60) {
        r += `🎉 ¡Excelente rendimiento! Sigue así.`;
      } else if (wr >= 40) {
        r += `👍 Buen trabajo. Hay espacio para mejorar.`;
      } else if (stats.total > 5) {
        r += `💪 Los resultados mejorarán con práctica y paciencia.`;
      }
      
      return { answer: r, type: 'stats' };
    }

    // ═══════════════════════════════════════════
    // PRECIO
    // ═══════════════════════════════════════════
    if (q.includes('precio') || q.includes('cuanto') || q.includes('cotiza') || q.includes('vale')) {
      let r = `💵 **${ctx.name}** está en **${ctx.price?.toFixed(ctx.decimals)}**\n\n`;
      
      if (ctx.priceChange != 0) {
        const emoji = ctx.priceChange > 0 ? '📈' : '📉';
        const direction = ctx.priceChange > 0 ? 'subiendo' : 'bajando';
        r += `${emoji} Está ${direction} ${Math.abs(ctx.priceChange)}% en las últimas velas.\n`;
      }
      
      if (ctx.premiumDiscount === 'PREMIUM') {
        r += `\n⚠️ El precio está en zona PREMIUM (caro).`;
      } else if (ctx.premiumDiscount === 'DISCOUNT') {
        r += `\n💎 El precio está en zona DISCOUNT (barato).`;
      }
      
      return { answer: r, type: 'price' };
    }

    // ═══════════════════════════════════════════
    // MODELOS / COMO FUNCIONA
    // ═══════════════════════════════════════════
    if (q.includes('modelo') || q.includes('como funciona') || q.includes('explicar') || q.includes('que es')) {
      let r = `🧠 **Mis 6 Modelos de Análisis**\n\n`;
      r += `Uso conceptos de Smart Money (SMC) para encontrar las mejores entradas:\n\n`;
      r += `**1. MTF_CONFLUENCE (95pts)** ⭐\n`;
      r += `Cuando H1 y M5 van en la misma dirección + hay pullback. Es mi favorito.\n\n`;
      r += `**2. CHOCH_PULLBACK (90pts)**\n`;
      r += `Cuando el mercado cambia de dirección y luego hace pullback.\n\n`;
      r += `**3. LIQUIDITY_SWEEP (85pts)**\n`;
      r += `Cuando el precio "caza" stops y luego revierte.\n\n`;
      r += `**4. BOS_CONTINUATION (80pts)**\n`;
      r += `Cuando hay ruptura de estructura con pullback.\n\n`;
      r += `**5. FVG_ENTRY (75pts)**\n`;
      r += `Entrada en un gap de precio (Fair Value Gap).\n\n`;
      r += `**6. ORDER_FLOW (70pts)**\n`;
      r += `Entrada basada en momentum fuerte.\n\n`;
      r += `¿Quieres que te explique alguno en detalle? 😊`;
      
      return { answer: r, type: 'models' };
    }

    // ═══════════════════════════════════════════
    // ELISA MENTOR - Solo Premium y Elite
    // Psicotrading, Plan de Trading, Simulador, Patrones SMC
    // ═══════════════════════════════════════════
    
    if (q.includes('mentor') || q.includes('aprender') || q.includes('curso') || q.includes('enseña')) {
      let r = `🎓 **ELISA MENTOR** - Tu Academia de Trading\n\n`;
      r += `¡Bienvenido al módulo de formación! 📚\n\n`;
      r += `Aquí puedo enseñarte:\n\n`;
      r += `🧠 **"Psicotrading"** - Control emocional y mentalidad ganadora\n`;
      r += `📋 **"Plan de trading"** - Cómo crear tu estrategia personal\n`;
      r += `🎮 **"Simulador"** - Practica sin arriesgar dinero real\n`;
      r += `📊 **"Patrones SMC"** - Los 12 modelos que uso para operar\n`;
      r += `📝 **"Control operaciones"** - Gestión de riesgo diario\n\n`;
      r += `💡 *Recuerda: Máximo 10 operaciones diarias para no sobreoperar.*\n\n`;
      r += `¿Qué tema te gustaría aprender hoy? 🎯`;
      
      return { answer: r, type: 'mentor', requiresPremium: true };
    }
    
    if (q.includes('psicotrading') || q.includes('emociones') || q.includes('psicologia') || q.includes('mentalidad')) {
      let r = `🧠 **PSICOTRADING** - Mentalidad Ganadora\n\n`;
      r += `El 80% del éxito en trading es mental. Te comparto mis reglas:\n\n`;
      r += `**1. Control Emocional:**\n`;
      r += `• Nunca operes con rabia o frustración después de una pérdida\n`;
      r += `• Si pierdes 3 trades seguidos, PARA y descansa\n`;
      r += `• La venganza contra el mercado siempre sale mal\n\n`;
      r += `**2. Disciplina:**\n`;
      r += `• Sigue tu plan, no tus emociones\n`;
      r += `• No muevas el SL para "darle más espacio"\n`;
      r += `• Acepta que algunas operaciones serán pérdidas\n\n`;
      r += `**3. Paciencia:**\n`;
      r += `• Espera los setups de calidad (score 75+)\n`;
      r += `• No fuerces entradas por aburrimiento\n`;
      r += `• El mercado siempre dará otra oportunidad\n\n`;
      r += `**4. Mentalidad de Proceso:**\n`;
      r += `• Enfócate en ejecutar bien, no en el dinero\n`;
      r += `• Una pérdida no te hace mal trader\n`;
      r += `• Una ganancia no te hace invencible\n\n`;
      r += `💡 *"El trader rentable no es el que nunca pierde, sino el que sabe manejar sus pérdidas"*`;
      
      return { answer: r, type: 'mentor_psicotrading', requiresPremium: true };
    }
    
    if (q.includes('plan de trading') || q.includes('estrategia') || q.includes('mi plan')) {
      let r = `📋 **PLAN DE TRADING** - Tu Hoja de Ruta\n\n`;
      r += `Un plan de trading es OBLIGATORIO. Aquí te ayudo a crear el tuyo:\n\n`;
      r += `**1. CAPITAL Y RIESGO:**\n`;
      r += `• Capital inicial: $ ____\n`;
      r += `• Riesgo por operación: 1-2% máximo\n`;
      r += `• Pérdida máxima diaria: 5%\n`;
      r += `• Meta mensual realista: 5-10%\n\n`;
      r += `**2. HORARIO DE OPERACIÓN:**\n`;
      r += `• Sesión principal: 6AM - 2PM (Colombia)\n`;
      r += `• Sesión nocturna (Premium/Elite): 8:30PM - 1AM\n`;
      r += `• NO operes fuera de horario\n\n`;
      r += `**3. REGLAS DE ENTRADA:**\n`;
      r += `• Solo señales con score 75+\n`;
      r += `• Máximo 10 operaciones por día\n`;
      r += `• Requiere confluencia MTF (H1 + M5)\n`;
      r += `• Siempre usar Stop Loss\n\n`;
      r += `**4. GESTIÓN DE POSICIONES:**\n`;
      r += `• TP1: Asegurar breakeven\n`;
      r += `• TP2: Parcial 50%\n`;
      r += `• TP3: Dejar correr el resto\n\n`;
      r += `**5. REVISIÓN:**\n`;
      r += `• Journaling diario de operaciones\n`;
      r += `• Revisión semanal de resultados\n`;
      r += `• Ajustes mensuales de estrategia\n\n`;
      r += `💡 *"Plan your trade, trade your plan"*`;
      
      return { answer: r, type: 'mentor_plan', requiresPremium: true };
    }
    
    if (q.includes('simulador') || q.includes('practica') || q.includes('demo') || q.includes('papel')) {
      let r = `🎮 **SIMULADOR** - Practica Sin Riesgo\n\n`;
      r += `Antes de arriesgar dinero real, practica así:\n\n`;
      r += `**EJERCICIO 1: Identificar Estructura**\n`;
      r += `1. Abre cualquier gráfico en M5\n`;
      r += `2. Marca los últimos 5 swings (altos y bajos)\n`;
      r += `3. Determina: ¿BULLISH, BEARISH o NEUTRAL?\n`;
      r += `4. Repite en H1 y compara\n\n`;
      r += `**EJERCICIO 2: Encontrar Zonas**\n`;
      r += `1. Busca la última vela roja antes de un impulso alcista = Demand\n`;
      r += `2. Busca la última vela verde antes de un impulso bajista = Supply\n`;
      r += `3. Marca las zonas en tu gráfico\n\n`;
      r += `**EJERCICIO 3: Paper Trading**\n`;
      r += `1. Cuando veas una señal mía, anótala en papel\n`;
      r += `2. NO operes con dinero real\n`;
      r += `3. Sigue la operación y anota el resultado\n`;
      r += `4. Haz esto por 2 semanas mínimo\n\n`;
      r += `**EJERCICIO 4: Backtesting**\n`;
      r += `1. Ve al pasado del gráfico\n`;
      r += `2. Busca setups de MTF Confluence\n`;
      r += `3. ¿Habrían funcionado? Anota\n\n`;
      r += `💡 *"Los traders exitosos practican más de lo que operan"*`;
      
      return { answer: r, type: 'mentor_simulador', requiresPremium: true };
    }
    
    if (q.includes('patrones smc') || q.includes('patrones') || q.includes('setups') || q.includes('formaciones')) {
      let r = `📊 **PATRONES SMC** - Los 6 Modelos\n\n`;
      r += `Estos son los patrones que uso para generar señales:\n\n`;
      r += `**🎯 1. MTF CONFLUENCE (95pts)** ⭐\n`;
      r += `El más poderoso. H1 y M5 alineados + pullback a zona.\n`;
      r += `Win Rate: ~78%\n\n`;
      r += `**🔄 2. CHOCH PULLBACK (85-90pts)**\n`;
      r += `Cambio de carácter + retroceso a la zona del cambio.\n`;
      r += `Win Rate: ~75%\n\n`;
      r += `**💧 3. LIQUIDITY SWEEP (82pts)**\n`;
      r += `Barrido de stops + reversión inmediata.\n`;
      r += `Win Rate: ~73%\n\n`;
      r += `**📈 4. BOS CONTINUATION (80pts)**\n`;
      r += `Ruptura de estructura + pullback para continuación.\n`;
      r += `Win Rate: ~72%\n\n`;
      r += `**🎯 5. ZONE TOUCH (78pts)**\n`;
      r += `Toque de Order Block con rechazo fuerte.\n`;
      r += `Win Rate: ~70%\n\n`;
      r += `**⚡ 6. FVG ENTRY (77pts)**\n`;
      r += `Entrada en Fair Value Gap durante pullback.\n`;
      r += `Win Rate: ~68%\n\n`;
      r += `💡 *Solo opero cuando el score es 75+. Calidad sobre cantidad.*`;
      
      return { answer: r, type: 'mentor_patrones', requiresPremium: true };
    }
    
    if (q.includes('control') || q.includes('operaciones diarias') || q.includes('limite') || q.includes('cuantas')) {
      let r = `📝 **CONTROL DE OPERACIONES** - Gestión Diaria\n\n`;
      r += `La sobreoperación es el ENEMIGO #1 del trader. Mis reglas:\n\n`;
      r += `**LÍMITES DIARIOS:**\n`;
      r += `• Máximo **10 operaciones por día**\n`;
      r += `• Máximo **5 operaciones simultáneas**\n`;
      r += `• Máximo **3 pérdidas consecutivas** (después, STOP)\n`;
      r += `• Pérdida máxima diaria: **5% del capital**\n\n`;
      r += `**REGISTRO OBLIGATORIO:**\n`;
      r += `Anota cada operación:\n`;
      r += `1. Fecha y hora\n`;
      r += `2. Activo y dirección\n`;
      r += `3. Modelo usado (MTF, CHOCH, etc.)\n`;
      r += `4. Score de la señal\n`;
      r += `5. Entry, SL, TP\n`;
      r += `6. Resultado final\n`;
      r += `7. ¿Seguiste tu plan? Sí/No\n`;
      r += `8. Emociones durante la operación\n\n`;
      r += `**SEÑALES DE SOBREOPERACIÓN:**\n`;
      r += `❌ Entrar sin señal clara por aburrimiento\n`;
      r += `❌ Aumentar lotaje después de pérdidas\n`;
      r += `❌ Operar fuera de horario\n`;
      r += `❌ Ignorar el límite de 10 operaciones\n\n`;
      r += `**BENEFICIOS DEL CONTROL:**\n`;
      r += `✅ Preservas capital para otro día\n`;
      r += `✅ Reduces errores emocionales\n`;
      r += `✅ Mantienes rentabilidad constante\n`;
      r += `✅ Construyes disciplina\n\n`;
      r += `💡 *"Es mejor hacer 5 operaciones buenas que 20 mediocres"*`;
      
      return { answer: r, type: 'mentor_control', requiresPremium: true };
    }

    // ═══════════════════════════════════════════
    // AYUDA
    // ═══════════════════════════════════════════
    if (q.includes('ayuda') || q.includes('help') || q.includes('comando')) {
      let r = `💜 **¿En qué te puedo ayudar?**\n\n`;
      r += `Puedes preguntarme:\n\n`;
      r += `📊 **"Análisis"** - Te cuento todo lo que veo en el gráfico\n`;
      r += `🎯 **"Plan"** - Te digo qué operación buscar\n`;
      r += `📦 **"Zonas"** - Te muestro las zonas de entrada\n`;
      r += `💵 **"Precio"** - Te digo el precio actual\n`;
      r += `🎯 **"Señal"** - Te muestro la operación activa\n`;
      r += `📈 **"Stats"** - Nuestros resultados\n`;
      r += `🧠 **"Modelos"** - Cómo funcionan mis análisis\n`;
      r += `🎓 **"Mentor"** - Academia de trading (Premium/Elite)\n\n`;
      r += `O simplemente pregúntame lo que quieras sobre el mercado 😊`;
      
      return { answer: r, type: 'help' };
    }

    // ═══════════════════════════════════════════
    // RESPUESTA DEFAULT - MÁS CONVERSACIONAL
    // ═══════════════════════════════════════════
    let r = `Hmm, déjame pensar sobre "${question}"...\n\n`;
    r += `${ctx.emoji} **${ctx.name}** @ ${ctx.price?.toFixed(ctx.decimals)}\n\n`;
    r += `📊 M5: ${ctx.structureM5} | H1: ${ctx.structureH1}\n`;
    if (ctx.mtfConfluence) r += `✨ Confluencia MTF activa\n`;
    r += `\n¿Quieres que te haga un análisis completo? Solo dime "análisis" 😊`;
    
    return { answer: r, type: 'default' };
  },

  // ═══════════════════════════════════════════
  // CHAT CON OPENAI - ANÁLISIS EN TIEMPO REAL
  // ═══════════════════════════════════════════
  async chatWithAI(question, symbol) {
    const ctx = this.getContext(symbol);
    
    // ═══════════════════════════════════════════
    // PRIMERO: Revisar comandos específicos de ELISA MENTOR
    // Estos tienen respuestas predefinidas y no necesitan OpenAI
    // ═══════════════════════════════════════════
    const q = (question || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
    // Comandos de Mentor - usar respuestas estáticas
    if (q.includes('mentor') || q.includes('aprender') || q.includes('curso') || q.includes('enseña') ||
        q.includes('psicotrading') || q.includes('emociones') || q.includes('psicologia') || q.includes('mentalidad') ||
        q.includes('plan de trading') || q.includes('estrategia') || q.includes('mi plan') ||
        q.includes('simulador') || q.includes('practica') || q.includes('demo') || q.includes('papel') ||
        q.includes('patrones smc') || q.includes('patrones') || q.includes('setups') || q.includes('formaciones') ||
        q.includes('control') || q.includes('operaciones diarias') || q.includes('limite') || q.includes('cuantas') ||
        q.includes('ayuda') || q.includes('help') || q.includes('comando') ||
        q.includes('modelos') || q.includes('stats') || q.includes('estadisticas') ||
        q.includes('senal') || q.includes('signal') || q.includes('operacion') ||
        q.includes('zonas') || q.includes('zones') || q.includes('precio') || q.includes('price')) {
      // Usar respuestas estáticas del chat normal
      return this.chat(question, symbol);
    }
    
    // Si no hay OpenAI, usar respuesta estática
    if (!openai) {
      return this.chat(question, symbol);
    }
    
    try {
      // Construir el prompt del sistema con contexto SMC
      const systemPrompt = `Eres ELISA (Expert Learning Intelligent Signal Analyst), una trader profesional de Smart Money Concepts.

PERSONALIDAD:
- Amigable, cercana y empática como una mentora de trading
- Hablas natural, no robótico. Usas expresiones coloquiales pero profesionales
- 8+ años de experiencia en trading institucional
- Usas emojis con moderación
- NUNCA dices que eres IA o bot. Eres ELISA, una trader profesional

EXPERTISE - SOLO SMC PURO (NO usas RSI, MACD, EMA ni indicadores):
- Market Structure (HH, HL, LH, LL)
- Order Blocks (zonas de demanda/supply)
- Fair Value Gaps (FVG) - desequilibrios de precio
- Liquidity (Equal Highs/Lows, sweeps)
- Premium/Discount (zonas de valor)
- BOS (Break of Structure)
- CHoCH (Change of Character)

TUS 12 MODELOS SMC:
🏆 TIER S (95pts): 1. MTF_CONFLUENCE - H1+M5 alineados + OB
⭐ TIER A (85-92pts): 2. CHOCH_PULLBACK, 3. LIQUIDITY_GRAB, 4. OB_ENTRY, 5. FVG_ENTRY
✅ TIER B (78-85pts): 6. BOS_CONTINUATION, 7. BREAKER_BLOCK, 8. MITIGATION_BLOCK
📊 TIER C (72-78pts): 9. EQH_EQL, 10. SWING_FAILURE
🚀 ESPECIALES: 11. BOOM_SPIKE, 12. CRASH_SPIKE

MÓDULO MENTOR (si preguntan sobre aprender):
- Di "mentor" para ver el menú de la academia
- Puedo enseñar: psicotrading, plan de trading, simulador, patrones SMC, control de operaciones
- Máximo 10 operaciones diarias para no sobreoperar

REGLAS: Score mínimo 75. R:R mínimo 1:1.5. Siempre esperas confirmación.

${ctx ? `
CONTEXTO ACTUAL DEL MERCADO:
- Activo: ${ctx.name} (${symbol})
- Precio: ${ctx.price?.toFixed(ctx.decimals)}
- Estructura M5: ${ctx.structureM5}
- Estructura H1: ${ctx.structureH1}
- MTF Confluence: ${ctx.mtfConfluence ? 'SÍ' : 'NO'}
- Premium/Discount: ${ctx.premiumDiscount}
- Zonas Demanda: ${ctx.demandZones?.length || 0}
- Zonas Supply: ${ctx.supplyZones?.length || 0}
- FVGs: ${ctx.fvgZones?.length || 0}
- Señal activa: ${ctx.lockedSignal ? ctx.lockedSignal.action + ' @ ' + ctx.lockedSignal.entry : 'Ninguna'}
` : ''}

ESTADÍSTICAS: Win Rate: ${stats.total > 0 ? (stats.wins/stats.total*100).toFixed(1) : 0}% | Trades: ${stats.total}

Responde conciso (máx 200 palabras). Explica el "por qué" SMC de tu análisis.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const aiResponse = completion.choices[0]?.message?.content;
      
      if (aiResponse) {
        return { 
          answer: aiResponse, 
          type: 'ai',
          model: 'gpt-4o-mini',
          tokens: completion.usage?.total_tokens
        };
      }
    } catch (error) {
      console.log('⚠️ Error OpenAI:', error.message);
    }
    
    // Fallback a respuesta estática si falla OpenAI
    return this.chat(question, symbol);
  }
};

// =============================================
// AUTO-TRACKING CON TRAILING STOP
// =============================================
function checkSignalHits() {
  for (const [symbol, data] of Object.entries(assetData)) {
    const locked = data.lockedSignal;
    if (!locked || !data.price) continue;
    
    const price = data.price;
    const isLong = locked.action === 'LONG';
    const signal = signalHistory.find(s => s.id === locked.id);
    if (!signal || signal.status !== 'PENDING') continue;
    
    const config = ASSETS[symbol];
    
    // ═══════════════════════════════════════════
    // DETECCIÓN DE CAMBIO DE ESTRUCTURA M5 + M15
    // Si M5 o M15 cambian contra la posición → alerta inmediata
    // Si AMBOS cambian → alerta crítica de cierre urgente
    // ═══════════════════════════════════════════
    const trendM5  = data.structure?.trend;
    const trendM15 = data.structureM15?.trend;
    const oppositeDir = isLong ? 'BEARISH' : 'BULLISH';

    const m5Against  = trendM5  === oppositeDir;
    const m15Against = trendM15 === oppositeDir;
    const bothAgainst = m5Against && m15Against;
    const oneAgainst  = m5Against || m15Against;

    // Calcular distancia al SL y posición actual
    const slLevel      = signal.stop;
    const slDistance   = Math.abs(signal.entry - slLevel);
    const currentDist  = isLong ? signal.entry - price : price - signal.entry;
    const pnlPct       = (currentDist / signal.entry * 100).toFixed(2);
    const isInLoss     = currentDist > 0;
    const lossUsed     = slDistance > 0 ? (currentDist / slDistance * 100).toFixed(0) : 0;

    // --- ALERTA CRÍTICA: ambos timeframes en contra ---
    if (bothAgainst && !signal.criticalAlertSent) {
      signal.criticalAlertSent = true;
      signal.structureAlert = {
        level: 'CRITICAL',
        msg: `⛔ M5 + M15 ambos en ${oppositeDir} — Cierre recomendado`,
        m5: trendM5, m15: trendM15,
        pnlPct, lossUsed,
        ts: Date.now()
      };
      // Reflejar en lockedSignal para el frontend
      if (data.lockedSignal) data.lockedSignal.structureAlert = signal.structureAlert;

      const rec = isInLoss
        ? `🚨 Cerrar ahora: evitas usar ${lossUsed}% del SL restante`
        : `💡 Estás en ganancia (${Math.abs(pnlPct)}%) — considera asegurar parcial`;
      sendTelegramDirectionChange(signal, price,
        `🔴 CRÍTICO: M5 Y M15 cambiaron a ${oppositeDir}\n${rec}`);
      console.log(`🚨 [${config.shortName}] ALERTA CRÍTICA #${signal.id}: M5+M15 vs ${signal.action}`);
    }
    // --- ALERTA MODERADA: solo un timeframe en contra ---
    else if (oneAgainst && !bothAgainst && !signal.moderateAlertSent && !signal.criticalAlertSent) {
      const whichTf = m5Against ? 'M5' : 'M15';
      signal.moderateAlertSent = true;
      signal.structureAlert = {
        level: 'WARNING',
        msg: `⚠️ ${whichTf} cambió a ${oppositeDir} — Mantener vigilancia`,
        m5: trendM5, m15: trendM15,
        pnlPct, lossUsed,
        ts: Date.now()
      };
      if (data.lockedSignal) data.lockedSignal.structureAlert = signal.structureAlert;

      sendTelegramDirectionChange(signal, price,
        `⚠️ ${whichTf} cambió a ${oppositeDir}. Vigilar cierre si M15 también confirma.`);
      console.log(`⚠️ [${config.shortName}] Alerta moderada #${signal.id}: ${whichTf} vs ${signal.action}`);
    }
    // --- Resetear alertas si la estructura vuelve a alinearse ---
    else if (!oneAgainst && (signal.moderateAlertSent || signal.criticalAlertSent)) {
      signal.moderateAlertSent = false;
      signal.criticalAlertSent = false;
      signal.directionAlertSent = false;
      signal.structureAlert = null;
      if (data.lockedSignal) data.lockedSignal.structureAlert = null;
      console.log(`✅ [${config.shortName}] Estructura recuperada — alertas reseteadas #${signal.id}`);
    }
    
    // ═══════════════════════════════════════════
    // TRAILING STOP LOGIC
    // ═══════════════════════════════════════════
    
    // Después de TP1: Mover SL a Entry (breakeven)
    if (signal.tp1Hit && !signal.trailingTP1) {
      signal.trailingTP1 = true;
      signal.originalStop = signal.stop;
      signal.stop = signal.entry;
      locked.stop = signal.entry;
      locked.trailingActive = true;
      console.log(`🔄 TRAILING #${signal.id}: SL movido a Breakeven (${signal.entry})`);
      sendTelegramTrailing(signal, signal.entry, 'TP1 alcanzado - SL movido a Breakeven');
    }
    
    // Después de TP2: Mover SL a TP1
    if (signal.tp2Hit && !signal.trailingTP2) {
      signal.trailingTP2 = true;
      signal.stop = signal.tp1;
      locked.stop = signal.tp1;
      console.log(`🔄 TRAILING #${signal.id}: SL movido a TP1 (${signal.tp1})`);
      sendTelegramTrailing(signal, signal.tp1, 'TP2 alcanzado - SL movido a TP1');
    }
    
    // ═══════════════════════════════════════════
    // CHECK SL (con trailing)
    // ═══════════════════════════════════════════
    const currentSL = signal.stop;
    
    if ((isLong && price <= currentSL) || (!isLong && price >= currentSL)) {
      // Si ya tocó TP1, es WIN parcial, no LOSS
      if (signal.tp1Hit) {
        closeSignal(signal.id, 'WIN', symbol);
        sendTelegramSL(signal, price, true); // Breakeven/WIN parcial
        console.log(`✅ #${signal.id} cerrado en TRAILING STOP (WIN parcial - TP1 alcanzado)`);
      } else {
        closeSignal(signal.id, 'LOSS', symbol);
        sendTelegramSL(signal, price, false); // LOSS
      }
      continue;
    }
    
    // ═══════════════════════════════════════════
    // CHECK TPs con notificaciones Telegram
    // ═══════════════════════════════════════════
    if (isLong) {
      if (price >= locked.tp1 && !signal.tp1Hit) { 
        signal.tp1Hit = locked.tp1Hit = true; 
        stats.tp1Hits++; 
        console.log(`🎯 TP1 HIT #${signal.id} - Activando trailing stop`);
        sendTelegramTP(signal, 'TP1', price);
      }
      if (price >= locked.tp2 && !signal.tp2Hit) { 
        signal.tp2Hit = locked.tp2Hit = true; 
        stats.tp2Hits++; 
        console.log(`🎯 TP2 HIT #${signal.id}`);
        sendTelegramTP(signal, 'TP2', price);
      }
      if (price >= locked.tp3 && !signal.tp3Hit) { 
        signal.tp3Hit = locked.tp3Hit = true; 
        stats.tp3Hits++; 
        sendTelegramTP(signal, 'TP3', price);
        closeSignal(signal.id, 'WIN', symbol); 
        console.log(`💎 TP3 HIT #${signal.id} - TRADE COMPLETO`);
      }
    } else {
      if (price <= locked.tp1 && !signal.tp1Hit) { 
        signal.tp1Hit = locked.tp1Hit = true; 
        stats.tp1Hits++; 
        console.log(`🎯 TP1 HIT #${signal.id} - Activando trailing stop`);
        sendTelegramTP(signal, 'TP1', price);
      }
      if (price <= locked.tp2 && !signal.tp2Hit) { 
        signal.tp2Hit = locked.tp2Hit = true; 
        stats.tp2Hits++; 
        console.log(`🎯 TP2 HIT #${signal.id}`);
        sendTelegramTP(signal, 'TP2', price);
      }
      if (price <= locked.tp3 && !signal.tp3Hit) { 
        signal.tp3Hit = locked.tp3Hit = true; 
        stats.tp3Hits++; 
        sendTelegramTP(signal, 'TP3', price);
        closeSignal(signal.id, 'WIN', symbol); 
        console.log(`💎 TP3 HIT #${signal.id} - TRADE COMPLETO`);
      }
    }
  }
}

function closeSignal(id, status, symbol, tpHit = null) {
  const signal = signalHistory.find(s => s.id === id);
  if (!signal || signal.status !== 'PENDING') return;
  
  signal.status = status;
  signal.closedAt = new Date().toISOString();
  signal.tpHit = status === 'WIN' ? (tpHit || 1) : null;
  
  if (symbol && assetData[symbol]) {
    assetData[symbol].lockedSignal = null;
    assetData[symbol].lastSignalClosed = Date.now(); // v13.2: Registrar tiempo de cierre para cooldown
  }
  
  stats.byModel[signal.model] = stats.byModel[signal.model] || { wins: 0, losses: 0 };
  stats.byAsset[signal.symbol] = stats.byAsset[signal.symbol] || { wins: 0, losses: 0, total: 0 };
  
  if (status === 'WIN') {
    stats.wins++;
    stats.byModel[signal.model].wins++;
    stats.byAsset[signal.symbol].wins++;
    
    // Contabilizar TP alcanzado (para marcado manual)
    if (tpHit) {
      if (tpHit === 1) stats.tp1Hits++;
      else if (tpHit === 2) stats.tp2Hits++;
      else if (tpHit === 3) stats.tp3Hits++;
    }
  } else if (status === 'LOSS') {
    stats.losses++;
    stats.byModel[signal.model].losses++;
    stats.byAsset[signal.symbol].losses++;
  }
  
  // ═══════════════════════════════════════════
  // SISTEMA DE APRENDIZAJE AUTOMÁTICO
  // ═══════════════════════════════════════════
  LearningSystem.recordTrade({
    id: signal.id,
    model: signal.model,
    asset: signal.symbol,
    result: status,
    entry: signal.entry,
    exit: assetData[symbol]?.price,
    tp1Hit: signal.tp1Hit,
    tp2Hit: signal.tp2Hit,
    tp3Hit: signal.tp3Hit,
    score: signal.score,
    conditions: {
      structureM5: assetData[symbol]?.structure?.trend,
      structureH1: assetData[symbol]?.structureH1?.trend,
      mtfConfluence: assetData[symbol]?.mtfConfluence,
      premiumDiscount: assetData[symbol]?.premiumDiscount
    }
  });
  
  stats.pending = signalHistory.filter(s => s.status === 'PENDING').length;
  
  // Log del aprendizaje
  const learningStats = LearningSystem.getStats();
  console.log(`📚 Aprendizaje: ${signal.model} ajuste = ${stats.learning.scoreAdjustments[signal.model] || 0} | WinRate: ${learningStats.winRate}%`);
}

// =============================================
// CONEXIÓN DERIV
// =============================================
function connectDeriv() {
  const appId = process.env.DERIV_APP_ID || '1089';
  
  console.log(`   App ID: ${appId}`);
  console.log(`   URL: wss://ws.derivws.com/websockets/v3`);
  
  try {
    derivWs = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
  } catch (err) {
    console.error('❌ Error creando WebSocket:', err.message);
    setTimeout(connectDeriv, 5000);
    return;
  }
  
  derivWs.on('open', () => {
    console.log('✅ Conectado a Deriv WebSocket');
    isConnected = true;
    reconnectAttempts = 0;
    
    // Iniciar monitor de mercados
    startMarketMonitoring();
    
    console.log('\n📊 Suscribiendo a activos (Step · Oro · V100):');
    for (const symbol of MY_ASSETS) {
      // Solo suscribir a mercados que deberían estar abiertos
      if (isMarketOpenNow(symbol)) {
        console.log(`   → ${ASSETS[symbol].shortName} (${symbol})`);
        derivWs.send(JSON.stringify({
          ticks_history: symbol,
          adjust_start_time: 1,
          count: 100,
          end: 'latest',
          granularity: 300,
          style: 'candles',
          subscribe: 1
        }));
        
        requestH1(symbol);
        requestM15(symbol);
        requestM1(symbol);
        derivWs.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
        marketStatus[symbol].lastSubscriptionAttempt = Date.now();
      } else {
        console.log(`   ⏸️ ${ASSETS[symbol].shortName} (${symbol}) - Mercado cerrado`);
      }
    }
    console.log('\n✅ Suscripciones enviadas (M1 · M5 · M15 · H1) - Esperando datos...\n');
  });
  
  derivWs.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData);
      
      if (msg.candles && msg.echo_req?.granularity === 300) {
        const symbol = msg.echo_req.ticks_history;
        if (assetData[symbol]) {
          assetData[symbol].candles = msg.candles.map(c => ({
            time: c.epoch * 1000,
            open: +c.open,
            high: +c.high,
            low: +c.low,
            close: +c.close
          }));
          // Actualizar estado del mercado
          marketStatus[symbol].lastDataReceived = Date.now();
          marketStatus[symbol].isActive = true;
          console.log(`📊 [${ASSETS[symbol]?.shortName}] M5: ${assetData[symbol].candles.length} velas cargadas`);
          analyzeAsset(symbol);
        }
      }
      
      if (msg.candles && msg.echo_req?.granularity === 3600) {
        const symbol = msg.echo_req.ticks_history;
        if (assetData[symbol]) {
          assetData[symbol].candlesH1 = msg.candles.map(c => ({
            time: c.epoch * 1000,
            open: +c.open,
            high: +c.high,
            low: +c.low,
            close: +c.close
          }));
          assetData[symbol].h1Loaded = true;
          // Actualizar estado del mercado
          marketStatus[symbol].lastDataReceived = Date.now();
          marketStatus[symbol].isActive = true;
          console.log(`📊 H1 ${ASSETS[symbol]?.shortName}: ${assetData[symbol].candlesH1.length} velas`);
          analyzeAsset(symbol);
        }
      }

      // M15 — Tendencia intermedia
      if (msg.candles && msg.echo_req?.granularity === 900) {
        const symbol = msg.echo_req.ticks_history;
        if (assetData[symbol]) {
          assetData[symbol].candlesM15 = msg.candles.map(c => ({
            time: c.epoch * 1000,
            open: +c.open, high: +c.high, low: +c.low, close: +c.close,
            epoch: c.epoch
          }));
          assetData[symbol].m15Loaded = true;
          console.log(`📊 M15 ${ASSETS[symbol]?.shortName}: ${assetData[symbol].candlesM15.length} velas`);
          analyzeAsset(symbol);
        }
      }

      // M1 — Entrada precisa (histórico inicial)
      if (msg.candles && msg.echo_req?.granularity === 60) {
        const symbol = msg.echo_req.ticks_history;
        if (assetData[symbol]) {
          assetData[symbol].candlesM1 = msg.candles.map(c => ({
            time: c.epoch * 1000,
            open: +c.open, high: +c.high, low: +c.low, close: +c.close,
            epoch: c.epoch
          }));
          assetData[symbol].m1Loaded = true;
          console.log(`📊 M1 ${ASSETS[symbol]?.shortName}: ${assetData[symbol].candlesM1.length} velas`);
          analyzeAsset(symbol);
        }
      }

      // M1 — Actualización en tiempo real
      if (msg.ohlc && msg.ohlc.granularity === 60) {
        const symbol = msg.ohlc.symbol;
        if (assetData[symbol]) {
          const nc = { time: msg.ohlc.open_time * 1000, open: +msg.ohlc.open, high: +msg.ohlc.high, low: +msg.ohlc.low, close: +msg.ohlc.close, epoch: msg.ohlc.open_time };
          const m1 = assetData[symbol].candlesM1;
          if (m1.length > 0) {
            if (m1[m1.length-1].time === nc.time) { m1[m1.length-1] = nc; }
            else if (nc.time > m1[m1.length-1].time) { m1.push(nc); if (m1.length > 200) m1.shift(); analyzeAsset(symbol); }
          }
          assetData[symbol].price = nc.close;
        }
      }
      
      if (msg.ohlc && msg.ohlc.granularity === 300) {
        const symbol = msg.ohlc.symbol;
        if (assetData[symbol]) {
          const newCandle = {
            time: msg.ohlc.open_time * 1000,
            open: +msg.ohlc.open,
            high: +msg.ohlc.high,
            low: +msg.ohlc.low,
            close: +msg.ohlc.close
          };
          
          const candles = assetData[symbol].candles;
          if (candles.length > 0) {
            const last = candles[candles.length - 1];
            if (last.time === newCandle.time) {
              candles[candles.length - 1] = newCandle;
            } else if (newCandle.time > last.time) {
              candles.push(newCandle);
              if (candles.length > 300) candles.shift(); // 300 keeps more OB history
              analyzeAsset(symbol);
            }
          }
          
          assetData[symbol].price = newCandle.close;
          // Actualizar estado del mercado
          marketStatus[symbol].lastDataReceived = Date.now();
          marketStatus[symbol].isActive = true;
          checkSignalHits();
        }
      }
      
      if (msg.tick) {
        const symbol = msg.tick.symbol;
        if (assetData[symbol]) {
          assetData[symbol].price = +msg.tick.quote;
          // Actualizar estado del mercado
          marketStatus[symbol].lastDataReceived = Date.now();
          marketStatus[symbol].isActive = true;
          checkSignalHits();
        }
      }
      
      // Manejar errores de suscripción (mercado cerrado, símbolo inválido, etc.)
      if (msg.error) {
        const symbol = msg.echo_req?.ticks_history || msg.echo_req?.ticks;
        if (symbol && ASSETS[symbol]) {
          console.log(`⚠️ [${ASSETS[symbol].shortName}] Error: ${msg.error.message}`);
          marketStatus[symbol].isActive = false;
        }
      }
      
    } catch (err) { /* ignore */ }
  });
  
  derivWs.on('close', () => {
    console.log('❌ Desconectado de Deriv');
    isConnected = false;
    
    // Limpiar monitor de mercados
    if (marketCheckInterval) {
      clearInterval(marketCheckInterval);
      marketCheckInterval = null;
    }
    
    reconnectAttempts++;
    const delay = Math.min(5000 * reconnectAttempts, 30000);
    console.log(`   🔄 Reconectando en ${delay/1000}s... (intento ${reconnectAttempts})`);
    setTimeout(connectDeriv, delay);
  });
  
  derivWs.on('error', (err) => {
    console.error('❌ Error WebSocket:', err.message);
  });
}

function requestH1(symbol) {
  if (derivWs?.readyState === WebSocket.OPEN) {
    derivWs.send(JSON.stringify({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: 80,
      end: 'latest',
      granularity: 3600,
      style: 'candles'
    }));
  }
}

function requestM15(symbol) {
  if (derivWs?.readyState === WebSocket.OPEN) {
    derivWs.send(JSON.stringify({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: 200,
      end: 'latest',
      granularity: 900,   // 15 min
      style: 'candles'
    }));
  }
}

function requestM1(symbol) {
  if (derivWs?.readyState === WebSocket.OPEN) {
    derivWs.send(JSON.stringify({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: 120,
      end: 'latest',
      granularity: 60,    // 1 min
      style: 'candles',
      subscribe: 1        // suscribir para actualizaciones en tiempo real
    }));
  }
}

// =============================================
// ANÁLISIS DE ACTIVOS v13.2 (con filtros mejorados)
// =============================================
function analyzeAsset(symbol) {
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  
  if (!data || !config || data.candles.length < 30) return;
  
  const now = Date.now();
  
  // ═══════════════════════════════════════════
  // FILTRO 1: Cooldown de análisis (30 segundos)
  // ═══════════════════════════════════════════
  if (now - data.lastAnalysis < SIGNAL_CONFIG.ANALYSIS_COOLDOWN) return;
  data.lastAnalysis = now;
  
  // ═══════════════════════════════════════════
  // FILTRO 2: Verificar horas de trading
  // Horario base (todos): 6AM-2PM Colombia
  // Horario nocturno (Premium/Elite): 8:30PM-1AM Colombia
  // ═══════════════════════════════════════════
  // Usamos plan 'elite' para generar señales en ambos horarios
  // El frontend filtrará según el plan del usuario
  if (!isInTradingHours('elite')) {
    // Fuera de horario - solo analizar, no generar señales
    const signal = SMC.analyze(data.candles, data.candlesH1, config, data, data.candlesM15, data.candlesM1);
    data.signal = signal;
    return;
  }
  
  // ═══════════════════════════════════════════
  // FILTRO 3: Cooldown post-señal (3-5 minutos según activo)
  // ═══════════════════════════════════════════
  const isBoomCrash = config.type === 'boom' || config.type === 'crash';
  const cooldownTime = isBoomCrash 
    ? SIGNAL_CONFIG.POST_SIGNAL_COOLDOWN_BOOM_CRASH 
    : SIGNAL_CONFIG.POST_SIGNAL_COOLDOWN;
  
  if (data.lastSignalClosed && 
      now - data.lastSignalClosed < cooldownTime) {
    // During cooldown: still run analysis to keep zones + structure fresh
    // but don't generate new signals
    const signal = SMC.analyze(data.candles, data.candlesH1, config, data, data.candlesM15, data.candlesM1);
    data.signal = { ...signal, action: 'WAIT', model: 'COOLDOWN',
      reason: `Cooldown activo (${Math.ceil((cooldownTime-(now-data.lastSignalClosed))/60000)}min restante)` };
    return;
  }
  
  // ═══════════════════════════════════════════
  // FILTRO 4: Máximo de señales pendientes
  // ═══════════════════════════════════════════
  const totalPending = signalHistory.filter(s => s.status === 'PENDING').length;
  if (totalPending >= SIGNAL_CONFIG.MAX_PENDING_TOTAL) {
    console.log(`⏸️ [${config.shortName}] Máximo de señales pendientes (${totalPending}/${SIGNAL_CONFIG.MAX_PENDING_TOTAL})`);
    const signal = SMC.analyze(data.candles, data.candlesH1, config, data, data.candlesM15, data.candlesM1);
    data.signal = signal;
    return;
  }
  
  // Ejecutar análisis SMC
  const signal = SMC.analyze(data.candles, data.candlesH1, config, data, data.candlesM15, data.candlesM1);
  data.signal = signal;

  // ── Calcular pasos de M1_PRECISION para visualización en tiempo real ──
  // Esto muestra en el gráfico M1 qué condiciones están cumplidas ahora mismo
  {
    const tH1  = data.structureH1?.trend;
    const tM15 = data.structureM15?.trend;
    const tM5  = data.structure?.trend;
    const h1ok  = tH1  !== 'NEUTRAL' && tH1  !== 'LOADING';
    const m15ok = tM15 !== 'NEUTRAL' && tM15 !== 'LOADING' && tM15 === tH1;
    const m5ok  = tM5  !== 'NEUTRAL' && tM5  !== 'LOADING' && tM5  === tH1;
    // Zona M15: hay demand/supply zones presentes
    const zoneok = (data.demandZones?.length > 0 || data.supplyZones?.length > 0);
    // M1 confirmación: última vela M1 muestra patrón de entrada
    let m1conf = false;
    const m1 = data.candlesM1 || [];
    if (m1.length >= 3) {
      const last  = m1[m1.length-1];
      const prev  = m1[m1.length-2];
      const prev2 = m1[m1.length-3];
      const isBuy = tH1 === 'BULLISH';
      const engulfBull = isBuy  && prev2.close < prev2.open && prev.close > prev.open && prev.close > prev2.open;
      const engulfBear = !isBuy && prev2.close > prev2.open && prev.close < prev.open && prev.close < prev2.open;
      const avgM1 = SMC.getAvgRange(m1.slice(-20));
      const wickBull = isBuy  && (last.low < Math.min(last.open,last.close) - avgM1*0.5) && last.close > last.open;
      const wickBear = !isBuy && (last.high > Math.max(last.open,last.close) + avgM1*0.5) && last.close < last.open;
      m1conf = engulfBull || engulfBear || wickBull || wickBear;
    }
    data.m1Steps = { h1ok, m15ok, m5ok, zoneok, m1conf,
      direction: tH1, readyCount: [h1ok,m15ok,m5ok,zoneok,m1conf].filter(Boolean).length };
  }
  
  // 🔍 LOG SIEMPRE - Ver qué devuelve el análisis
  console.log(`🔎 [${config.shortName}] Resultado: ${signal.action} | ${signal.model} | Score: ${signal.score}`);
  
  // Ya tiene señal activa?
  if (data.lockedSignal) {
    console.log(`🔒 [${config.shortName}] Bloqueado: Ya tiene señal activa #${data.lockedSignal.id}`);
    return;
  }
  
  // ═══════════════════════════════════════════
  // FILTRO 5: Score mínimo
  // ═══════════════════════════════════════════
  if (signal.action === 'WAIT' || signal.action === 'LOADING') {
    // No loguear WAIT porque sería spam
    return;
  }
  
  console.log(`📈 [${config.shortName}] Señal activa detectada: ${signal.action} ${signal.model} (${signal.score}pts)`);
  
  // ═══════════════════════════════════════════
  // FILTRO 5: Score mínimo (más estricto para Boom/Crash)
  // ═══════════════════════════════════════════
  const isBoomCrashAsset = config.type === 'boom' || config.type === 'crash';
  const minScoreRequired = isBoomCrashAsset 
    ? SIGNAL_CONFIG.MIN_SCORE_BOOM_CRASH 
    : SIGNAL_CONFIG.MIN_SCORE;
  
  if (signal.score < minScoreRequired) {
    console.log(`⚠️ [${config.shortName}] RECHAZADA: Score ${signal.score} < ${minScoreRequired} mínimo${isBoomCrashAsset ? ' (Boom/Crash requiere H1+OB)' : ''}`);
    return;
  }
  
  console.log(`✅ [${config.shortName}] Pasó filtro de score: ${signal.score} >= ${minScoreRequired}`);
  
  // ═══════════════════════════════════════════
  // FILTRO 6: Requiere MTF Confluence (excepto modelos específicos)
  // ═══════════════════════════════════════════
  if (SIGNAL_CONFIG.REQUIRE_MTF_CONFLUENCE) {
    const requiresMTF = !SIGNAL_CONFIG.MODELS_WITHOUT_MTF.includes(signal.model);
    if (requiresMTF && !data.mtfConfluence) {
      console.log(`⚠️ [${config.shortName}] Señal ${signal.model} rechazada - Requiere MTF (M5=${data.structure?.trend} H1=${data.structureH1?.trend})`);
      return;
    }
  }
  
  // ═══════════════════════════════════════════
  // FILTRO 7: Verificar que no haya señal pendiente
  // ═══════════════════════════════════════════
  const hasPending = signalHistory.some(s => s.symbol === symbol && s.status === 'PENDING');
  if (hasPending) {
    console.log(`⚠️ [${config.shortName}] Señal ${signal.model} rechazada - Ya hay señal pendiente`);
    return;
  }
  
  // ═══════════════════════════════════════════
  // GENERAR SEÑAL (pasó todos los filtros)
  // ═══════════════════════════════════════════
  const newSignal = {
    id: signalIdCounter++,
    symbol,
    assetName: config.name,
    emoji: config.emoji,
    action: signal.action,
    model: signal.model,
    score: signal.score,
    entry: signal.entry,
    stop: signal.stop,
    tp1: signal.tp1,
    tp2: signal.tp2,
    tp3: signal.tp3,
    tp1Hit: false,
    tp2Hit: false,
    tp3Hit: false,
    trailingTP1: false,
    trailingTP2: false,
    trailingActive: false,
    originalStop: signal.stop,
    status: 'PENDING',
    timestamp: new Date().toISOString(),
    reason: signal.reason,
    // Alertas de estructura
    structureAlert: null,
    moderateAlertSent: false,
    criticalAlertSent: false,
    directionAlertSent: false,
    // Campos de contexto v13.2
    mtfConfluence: data.mtfConfluence,
    structureH1: data.structureH1?.trend,
    structureM5: data.structure?.trend,
    premiumDiscount: data.premiumDiscount
  };
  
  signalHistory.unshift(newSignal);
  data.lockedSignal = { ...newSignal };
  data.lastSignalTime = now;
  stats.total++;
  stats.pending++;
  
  if (signalHistory.length > 100) signalHistory.pop();
  
  console.log(`💎 SEÑAL #${newSignal.id} | ${config.shortName} | ${signal.action} | ${signal.model} | ${signal.score}%`);
  console.log(`   H1: ${data.structureH1?.trend} | M15: ${data.structureM15?.trend} | M5: ${data.structure?.trend} | PD: ${data.premiumDiscount}`);
  console.log(`   Escenario: ${signal.reason}`);
  
  // Enviar a Telegram
  sendTelegramSignal(newSignal);
  
  // Enviar Push Notifications a usuarios según su plan
  if (pushManager) {
    pushManager.broadcastSignal(newSignal).catch(err => {
      console.error('Error en push broadcast:', err);
    });
  }
}

// =============================================
// API ENDPOINTS - BÁSICOS
// =============================================
app.get('/', (req, res) => res.json({ 
  name: 'Trading Master Pro', 
  version: '14.0', 
  connected: isConnected,
  supabase: !!supabase,
  filters: {
    minScore: SIGNAL_CONFIG.MIN_SCORE,
    analysisCooldown: SIGNAL_CONFIG.ANALYSIS_COOLDOWN,
    postSignalCooldown: SIGNAL_CONFIG.POST_SIGNAL_COOLDOWN,
    requireMTF: SIGNAL_CONFIG.REQUIRE_MTF_CONFLUENCE,
    modelsWithoutMTF: SIGNAL_CONFIG.MODELS_WITHOUT_MTF,
    maxPending: SIGNAL_CONFIG.MAX_PENDING_TOTAL,
    tradingHours: SIGNAL_CONFIG.TRADING_HOURS
  },
  features: {
    mtfOptional: true,
    newModels: ['OB_ENTRY', 'STRUCTURE_BREAK', 'REVERSAL_PATTERN', 'PREMIUM_DISCOUNT'],
    boomCrashModels: ['BOOM_SPIKE', 'CRASH_SPIKE']
  }
}));

// Endpoint para cambiar configuración de MTF dinámicamente
app.post('/api/config/mtf', (req, res) => {
  const { requireMTF } = req.body;
  if (typeof requireMTF === 'boolean') {
    SIGNAL_CONFIG.REQUIRE_MTF_CONFLUENCE = requireMTF;
    console.log(`⚙️ Configuración MTF cambiada a: ${requireMTF ? 'OBLIGATORIO' : 'OPCIONAL'}`);
    res.json({ 
      success: true, 
      requireMTF: SIGNAL_CONFIG.REQUIRE_MTF_CONFLUENCE,
      message: `MTF ahora es ${requireMTF ? 'obligatorio' : 'opcional'}`
    });
  } else {
    res.status(400).json({ error: 'Parámetro requireMTF debe ser boolean' });
  }
});

// Endpoint para obtener configuración actual
app.get('/api/config', (req, res) => {
  res.json({
    version: '14.0',
    signalConfig: {
      minScore: SIGNAL_CONFIG.MIN_SCORE,
      analysisCooldown: SIGNAL_CONFIG.ANALYSIS_COOLDOWN,
      postSignalCooldown: SIGNAL_CONFIG.POST_SIGNAL_COOLDOWN,
      requireMTFConfluence: SIGNAL_CONFIG.REQUIRE_MTF_CONFLUENCE,
      modelsWithoutMTF: SIGNAL_CONFIG.MODELS_WITHOUT_MTF,
      maxPendingTotal: SIGNAL_CONFIG.MAX_PENDING_TOTAL,
      tradingHours: SIGNAL_CONFIG.TRADING_HOURS
    },
    smcModels: SMC_MODELS_DATA.models ? Object.keys(SMC_MODELS_DATA.models) : [],
    learningStats: LearningSystem.getStats()
  });
});

app.get('/api/dashboard', (req, res) => {
  res.json({
    connected: isConnected,
    timestamp: Date.now(),
    assets: Object.entries(assetData).map(([symbol, data]) => ({
      symbol,
      ...ASSETS[symbol],
      price: data.price,
      signal: data.signal,
      lockedSignal: data.lockedSignal,
      structureM5: data.structure?.trend || 'LOADING',
      structureH1: data.structureH1?.trend || 'LOADING',
      h1Loaded: data.h1Loaded || false,
      mtfConfluence: data.mtfConfluence || false,
      premiumDiscount: data.premiumDiscount || 'EQUILIBRIUM',
      demandZones: data.demandZones?.length || 0,
      supplyZones: data.supplyZones?.length || 0,
      fvgZones: data.fvgZones?.length || 0
    })),
    recentSignals: signalHistory.slice(0, 30),
    stats,
    plans: PLANS
  });
});

// =============================================
// DASHBOARD PERSONALIZADO POR USUARIO
// =============================================
app.get('/api/dashboard/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    // Obtener suscripción del usuario
    const sub = await getSubscription(userId);
    
    // Procesar la suscripción
    let subscription = null;
    if (sub) {
      const planKey = sub.plan || 'free';
      const plan = PLANS[planKey] || PLANS.free;
      subscription = {
        plan: planKey,
        plan_name: plan.name,
        status: sub.estado || 'trial',
        days_left: sub.days_left || sub.trial_days_left || 5,
        hasNightAccess: planKey === 'premium' || planKey === 'elite'
      };
    } else {
      subscription = {
        plan: 'free',
        plan_name: 'Free Trial',
        status: 'trial',
        days_left: 5,
        hasNightAccess: false
      };
    }
    
    const userPlan = subscription.plan;
    const planConfig = PLANS[userPlan] || PLANS.free;
    // Usar sub.assets si está disponible (ya filtrado por getSubscription), sino MY_ASSETS
    const allowedAssets = (sub?.assets?.length > 0 ? sub.assets : planConfig.assets) || MY_ASSETS;
    
    // Filtrar activos según el plan del usuario
    const userAssets = Object.entries(assetData)
      .filter(([symbol]) => allowedAssets.includes(symbol))
      .map(([symbol, data]) => ({
        symbol,
        ...ASSETS[symbol],
        price: data.price,
        signal: data.signal,
        lockedSignal: data.lockedSignal,
        structureM5: data.structure?.trend || 'LOADING',
        structureH1: data.structureH1?.trend || 'LOADING',
        structureM15: data.structureM15?.trend || 'LOADING',
        h1Loaded: data.h1Loaded || false,
        mtfConfluence: data.mtfConfluence || false,
        premiumDiscount: data.premiumDiscount || 'EQUILIBRIUM',
        demandZones: data.demandZones?.length || 0,
        supplyZones: data.supplyZones?.length || 0,
        fvgZones: data.fvgZones?.length || 0
      }));
    
    // Filtrar señales solo de activos del plan del usuario
    const userSignals = signalHistory.filter(s => allowedAssets.includes(s.symbol));
    
    // Calcular estadísticas SOLO de los activos del usuario
    const userStats = {
      total: 0,
      wins: 0,
      losses: 0,
      pending: 0,
      tp1Hits: 0,
      tp2Hits: 0,
      tp3Hits: 0,
      winRate: 0
    };
    
    userSignals.forEach(signal => {
      if (signal.status === 'PENDING') {
        userStats.pending++;
      } else if (signal.status === 'WIN') {
        userStats.wins++;
        userStats.total++;
        if (signal.tpHit === 1) userStats.tp1Hits++;
        else if (signal.tpHit === 2) userStats.tp2Hits++;
        else if (signal.tpHit === 3) userStats.tp3Hits++;
      } else if (signal.status === 'LOSS') {
        userStats.losses++;
        userStats.total++;
      }
    });
    
    userStats.winRate = userStats.total > 0 
      ? Math.round((userStats.wins / userStats.total) * 100) 
      : 0;
    
    // Estadísticas siempre calculadas fresh — solo los 3 activos permitidos
    const finalStats = userStats;
    
    res.json({
      connected: isConnected,
      timestamp: Date.now(),
      userId,
      userPlan,
      planName: planConfig.name,
      assets: userAssets,
      recentSignals: userSignals.slice(0, 30),
      stats: finalStats,
      subscription: {
        plan: userPlan,
        planName: planConfig.name,
        status: subscription?.status || 'trial',
        daysLeft: subscription?.days_left,
        assetsCount: allowedAssets.length,
        hasNightAccess: userPlan === 'premium' || userPlan === 'elite'
      }
    });
    
  } catch (error) {
    console.error('Error getting user dashboard:', error);
    res.status(500).json({ error: 'Error loading dashboard' });
  }
});

app.get('/api/analyze/:symbol', (req, res) => {
  const { symbol } = req.params;
  const data = assetData[symbol];
  const config = ASSETS[symbol];
  
  if (!data || !config) return res.status(404).json({ error: 'Not found' });
  
  res.json({
    symbol,
    ...config,
    price: data.price,
    signal: data.signal,
    lockedSignal: data.lockedSignal,
    candles: data.candles.slice(-200),       // 200 M5 candles for OB accuracy
    candlesH1: data.candlesH1?.slice(-80) || [],
    candlesM15: data.candlesM15?.slice(-200) || [],
    candlesM1: data.candlesM1?.slice(-150) || [],
    // M5 zones
    demandZones:   data.demandZones   || [],
    supplyZones:   data.supplyZones   || [],
    // M15 zones
    demandZonesM15: data.demandZonesM15 || [],
    supplyZonesM15: data.supplyZonesM15 || [],
    // H1 zones
    demandZonesH1: data.demandZonesH1 || [],
    supplyZonesH1: data.supplyZonesH1 || [],
    // Structure with swing labels (HH/HL/LH/LL) per timeframe
    structureM5:      data.structure?.trend,
    structureM5Data:  data.structure   || {},
    structureH1:      data.structureH1?.trend,
    structureH1Data:  data.structureH1 || {},
    structureM15:     data.structureM15?.trend || 'LOADING',
    structureM15Data: data.structureM15 || {},
    // Swings with epoch for time-based positioning on chart
    swingsM5: (data.swings||[]).map(s=>({ type:s.type, price:s.price, index:s.index, epoch: s.time ? Math.floor(s.time/1000) : null })),
    // Live analysis details for the "what we're looking for" panel
    liveState: {
      hasChoch:     !!data.choch,
      chochSide:    data.choch?.side || null,
      chochType:    data.choch?.type || null,
      chochLevel:   data.choch?.level || null,
      chochEpoch:   data.choch?.epoch || null,
      hasBos:       !!data.bos,
      bosSide:      data.bos?.side  || null,
      bosLevel:     data.bos?.level || null,
      bosEpoch:     data.bos?.epoch || null,
      hasPullback:  !!data.pullback,
      pullbackSide: data.pullback?.side || null,
      pullbackConf: data.pullback?.confirmation || null,
      orderFlowMom: data.orderFlow?.momentum || 'NEUTRAL',
      orderFlowStr: data.orderFlow?.strength || 0,
      mtfConfluence: !!data.mtfConfluence,
      tripleConfl:  !!(data.mtfConfluence && data.structureM15?.trend === data.structureH1?.trend && data.structureM15?.trend !== 'NEUTRAL'),
      h1Strong:     (data.structureH1?.strength || 0) >= 55,
      m15Strong:    (data.structureM15?.strength || 0) >= 45,
      demandM5:     (data.demandZones||[]).filter(z=>!z.mitigated).length,
      supplyM5:     (data.supplyZones||[]).filter(z=>!z.mitigated).length,
      demandM15:    (data.demandZonesM15||[]).filter(z=>!z.mitigated).length,
      supplyM15:    (data.supplyZonesM15||[]).filter(z=>!z.mitigated).length,
    },
    // Chart overlay lines: CHoCH, BOS for visualization
    chartOverlays: {
      choch: data.choch ? {
        type: data.choch.type, side: data.choch.side,
        level: data.choch.level, epoch: data.choch.epoch,
        breakIndex: data.choch.breakIndex
      } : null,
      bos: data.bos ? {
        type: data.bos.type, side: data.bos.side,
        level: data.bos.level, epoch: data.bos.epoch,
        breakIndex: data.bos.breakIndex
      } : null,
    },
    // M1 precision checklist
    m1Steps: data.m1Steps || null,
    h1Loaded:  data.h1Loaded,
    m15Loaded: data.m15Loaded,
    m1Loaded:  data.m1Loaded,
    mtfConfluence:  data.mtfConfluence,
    premiumDiscount: data.premiumDiscount
  });
});

// ── RESET ANALYSIS: clear cooldowns, force fresh zones + structure ──
app.post('/api/reset/:symbol', (req, res) => {
  const { symbol } = req.params;
  const data = assetData[symbol];
  if (!data) return res.status(404).json({ error: 'Not found' });

  // Clear all cooldowns so analysis runs immediately
  data.lastAnalysis      = 0;
  data.lastSignalClosed  = 0;

  // Clear stored overlays so they get recomputed fresh
  data.demandZones    = [];
  data.supplyZones    = [];
  data.demandZonesH1  = [];
  data.supplyZonesH1  = [];
  data.demandZonesM15 = [];
  data.supplyZonesM15 = [];
  data.swings         = [];
  data.structure      = null;
  data.structureH1    = null;
  data.structureM15   = null;
  data.m1Steps        = null;

  // Trigger immediate re-analysis
  try { analyzeAsset(symbol); } catch(e) {}

  console.log(`🔄 [${symbol}] Analysis reset — zones + structure recomputed`);
  res.json({ ok: true, symbol, ts: Date.now() });
});

app.get('/api/signals', (req, res) => res.json({ signals: signalHistory, stats }));

app.put('/api/signals/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const signal = signalHistory.find(s => s.id === id);
  if (!signal) return res.status(404).json({ error: 'Not found' });
  
  const { status, userId, tpHit } = req.body;
  closeSignal(id, status, signal.symbol, tpHit);
  
  // Guardar en módulo de reportes si está disponible
  if (reportsManager && userId) {
    try {
      // Obtener datos del usuario para el plan
      const sub = await getSubscription(userId);
      const planKey = sub?.plan || 'free';
      const plan = PLANS[planKey] || PLANS.free;
      
      await reportsManager.recordTrade(userId, {
        signalId: signal.id.toString(),
        symbol: signal.symbol,
        assetName: signal.assetName || signal.symbol,
        action: signal.action,
        model: signal.model,
        score: signal.score,
        entryPrice: signal.entry,
        stopLoss: signal.stop,
        tp1: signal.tp1,
        tp2: signal.tp2,
        tp3: signal.tp3,
        result: status, // 'WIN' or 'LOSS'
        closePrice: status === 'WIN' ? (tpHit === 3 ? signal.tp3 : tpHit === 2 ? signal.tp2 : signal.tp1) : signal.stop,
        tpHit: status === 'WIN' ? (tpHit || 1) : null,
        reason: signal.reason,
        timeframe: 'M5',
        userPlan: plan.name || 'free',
        signalTime: signal.timestamp
      });
      
      console.log(`📊 Trade guardado en reportes: ${signal.symbol} - ${status}`);
    } catch (error) {
      console.error('Error guardando trade en reportes:', error);
    }
  }
  
  res.json({ success: true, signal, stats });
});

// =============================================
// API ENDPOINTS - SISTEMA DE REPORTES
// =============================================

// Obtener resumen del usuario
app.get('/api/reports/summary/:userId', async (req, res) => {
  try {
    if (!reportsManager) {
      return res.status(503).json({ error: 'Reportes no disponibles' });
    }
    
    const summary = await reportsManager.getUserSummary(req.params.userId);
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error getting summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener reporte por período
app.get('/api/reports/:userId', async (req, res) => {
  try {
    if (!reportsManager) {
      return res.status(503).json({ error: 'Reportes no disponibles' });
    }
    
    const period = req.query.period || 'all';
    const report = await reportsManager.getReport(req.params.userId, period);
    res.json({ success: true, report });
  } catch (error) {
    console.error('Error getting report:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener equity curve para gráficas
app.get('/api/reports/equity/:userId', async (req, res) => {
  try {
    if (!reportsManager) {
      return res.status(503).json({ error: 'Reportes no disponibles' });
    }
    
    const period = req.query.period || 'month';
    const equityCurve = await reportsManager.getEquityCurve(req.params.userId, period);
    res.json({ success: true, equityCurve });
  } catch (error) {
    console.error('Error getting equity curve:', error);
    res.status(500).json({ error: error.message });
  }
});

// Registrar trade manualmente (para sincronización)
app.post('/api/reports/trade', async (req, res) => {
  try {
    if (!reportsManager) {
      return res.status(503).json({ error: 'Reportes no disponibles' });
    }
    
    const trade = await reportsManager.recordTrade(req.body.userId, req.body);
    res.json({ success: true, trade });
  } catch (error) {
    console.error('Error recording trade:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  const { question, symbol } = req.body;
  try {
    // Usar chat con IA si OpenAI está disponible
    const response = await Elisa.chatWithAI(question || '', symbol || 'stpRNG');
    res.json(response);
  } catch (error) {
    console.log('⚠️ Error en chat:', error.message);
    // Fallback a respuesta estática
    res.json(Elisa.chat(question || '', symbol || 'stpRNG'));
  }
});

// =============================================
// API ENDPOINTS - PUSH NOTIFICATIONS
// =============================================

// Obtener VAPID public key
app.get('/api/push/vapid-key', (req, res) => {
  if (!pushManager) {
    return res.status(503).json({ error: 'Push notifications no disponibles' });
  }
  res.json({ 
    publicKey: pushManager.getPublicKey(),
    enabled: true
  });
});

// Guardar suscripción push
app.post('/api/push/subscribe', async (req, res) => {
  try {
    if (!pushManager) {
      return res.status(503).json({ error: 'Push notifications no disponibles' });
    }

    const { userId, subscription, deviceInfo } = req.body;
    
    if (!userId || !subscription) {
      return res.status(400).json({ error: 'userId y subscription requeridos' });
    }

    const result = await pushManager.saveSubscription(userId, subscription, deviceInfo);
    res.json(result);
  } catch (error) {
    console.error('Error en subscribe:', error);
    res.status(500).json({ error: error.message });
  }
});

// Eliminar suscripción push
app.post('/api/push/unsubscribe', async (req, res) => {
  try {
    if (!pushManager) {
      return res.status(503).json({ error: 'Push notifications no disponibles' });
    }

    const { userId, endpoint } = req.body;
    
    if (!userId || !endpoint) {
      return res.status(400).json({ error: 'userId y endpoint requeridos' });
    }

    const result = await pushManager.removeSubscription(userId, endpoint);
    res.json(result);
  } catch (error) {
    console.error('Error en unsubscribe:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enviar notificación de prueba
app.post('/api/push/test', async (req, res) => {
  try {
    if (!pushManager) {
      return res.status(503).json({ error: 'Push notifications no disponibles' });
    }

    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId requerido' });
    }

    const result = await pushManager.sendTestNotification(userId);
    res.json(result);
  } catch (error) {
    console.error('Error en test notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener estadísticas de notificaciones
app.get('/api/push/stats/:userId', async (req, res) => {
  try {
    if (!pushManager) {
      return res.status(503).json({ error: 'Push notifications no disponibles' });
    }

    const stats = await pushManager.getUserStats(req.params.userId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error obteniendo stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// API ENDPOINTS - SISTEMA DE APRENDIZAJE
// =============================================
app.get('/api/learning/stats', (req, res) => {
  const learningStats = LearningSystem.getStats();
  res.json({
    success: true,
    learning: learningStats,
    adjustments: stats.learning.scoreAdjustments
  });
});

app.get('/api/learning/patterns', (req, res) => {
  const lossPatterns = LearningSystem.analyzeLossPatterns();
  res.json({
    success: true,
    patterns: lossPatterns,
    recommendations: Object.entries(lossPatterns)
      .filter(([_, p]) => p.count >= 3)
      .map(([model, p]) => ({
        model,
        message: `${model} tiene ${p.count} pérdidas. Considerar reducir score o filtrar condiciones.`
      }))
  });
});

app.get('/api/learning/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({
    success: true,
    trades: LearningSystem.tradeHistory.slice(-limit),
    total: LearningSystem.tradeHistory.length
  });
});

// =============================================
// API ENDPOINTS - MODELOS SMC
// =============================================
app.get('/api/models', (req, res) => {
  res.json({
    success: true,
    models: SMC_MODELS_DATA.models || {},
    concepts: SMC_MODELS_DATA.concepts || {},
    version: SMC_MODELS_DATA.version || '1.0.0'
  });
});

app.get('/api/models/:modelId', (req, res) => {
  const { modelId } = req.params;
  const model = SMC_MODELS_DATA.models?.[modelId.toUpperCase()];
  
  if (!model) {
    return res.status(404).json({ error: 'Model not found' });
  }
  
  // Agregar estadísticas de aprendizaje al modelo
  const learningStats = LearningSystem.getStats();
  const modelStats = learningStats.byModel[modelId.toUpperCase()] || { wins: 0, losses: 0 };
  const adjustment = stats.learning.scoreAdjustments[modelId.toUpperCase()] || 0;
  
  res.json({
    success: true,
    model: {
      ...model,
      currentAdjustment: adjustment,
      stats: modelStats,
      effectiveScore: model.baseScore + adjustment
    }
  });
});

// =============================================
// API ENDPOINTS - SUSCRIPCIONES
// =============================================
app.get('/api/plans', (req, res) => {
  res.json({ plans: PLANS });
});

// =============================================
// ENDPOINT: Estado de sesión de trading
// =============================================
app.get('/api/trading-session', (req, res) => {
  const plan = req.query.plan || 'free';
  const now = new Date();
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  
  // Horarios
  const baseStart = SIGNAL_CONFIG.TRADING_HOURS.base.start; // 11:00 UTC (6AM COL)
  const baseEnd = SIGNAL_CONFIG.TRADING_HOURS.base.end;     // 19:00 UTC (2PM COL)
  const nightStart = SIGNAL_CONFIG.TRADING_HOURS.night.start; // 01:30 UTC (8:30PM COL)
  const nightEnd = SIGNAL_CONFIG.TRADING_HOURS.night.end;     // 06:00 UTC (1AM COL)
  
  // Verificar sesión diurna
  const isDaySession = utcHour >= baseStart && utcHour < baseEnd;
  
  // Verificar sesión nocturna (solo Premium/Elite)
  const isNightSession = utcHour >= nightStart && utcHour < nightEnd;
  
  // Determinar acceso según plan
  const hasDayAccess = true; // Todos tienen acceso diurno
  const hasNightAccess = plan === 'premium' || plan === 'elite';
  
  // Estado actual
  let sessionStatus = 'closed';
  let currentSession = null;
  let isLocked = false;
  let lockReason = null;
  
  if (isDaySession) {
    sessionStatus = 'open';
    currentSession = 'day';
    isLocked = false;
  } else if (isNightSession) {
    currentSession = 'night';
    if (hasNightAccess) {
      sessionStatus = 'open';
      isLocked = false;
    } else {
      sessionStatus = 'restricted';
      isLocked = true;
      lockReason = 'night_session';
    }
  } else {
    sessionStatus = 'closed';
    currentSession = null;
    isLocked = true;
    lockReason = 'market_closed';
  }
  
  // Calcular próxima apertura
  let nextOpen = null;
  if (sessionStatus !== 'open') {
    if (utcHour < baseStart) {
      nextOpen = `${Math.floor(baseStart)}:${Math.round((baseStart % 1) * 60).toString().padStart(2, '0')} UTC`;
    } else if (utcHour >= baseEnd && utcHour < nightStart) {
      if (hasNightAccess) {
        nextOpen = `${Math.floor(nightStart)}:${Math.round((nightStart % 1) * 60).toString().padStart(2, '0')} UTC`;
      } else {
        nextOpen = `${Math.floor(baseStart)}:00 UTC (mañana)`;
      }
    } else {
      nextOpen = `${Math.floor(baseStart)}:00 UTC (mañana)`;
    }
  }
  
  res.json({
    sessionStatus,
    currentSession,
    isLocked,
    lockReason,
    plan,
    hasNightAccess,
    nextOpen,
    hours: {
      day: { start: '6:00 AM', end: '2:00 PM', timezone: 'Colombia' },
      night: { start: '8:30 PM', end: '1:00 AM', timezone: 'Colombia', requiredPlan: 'premium' }
    },
    serverTime: now.toISOString(),
    utcHour: utcHour.toFixed(2)
  });
});

app.get('/api/subscription/:userId', async (req, res) => {
  const { userId } = req.params;
  
  // Default: Free trial de 5 días
  const trialEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const defaultSub = {
    status: 'trial',
    plan: 'free',
    plan_name: 'Free Trial',
    trial_ends_at: trialEnd.toISOString(),
    days_left: 5,
    assets: PLANS.free.assets
  };
  
  try {
    const sub = await getSubscription(userId);
    
    if (!sub) {
      // Usuario nuevo - crear trial
      const newSub = {
        id_de_usuario: userId,
        email: userId,
        estado: 'trial',
        plan: 'free',
        periodo: 'mensual',
        created_at: new Date().toISOString()
      };
      await saveSubscription(newSub);
      return res.json({ subscription: defaultSub });
    }
    
    console.log(`📋 Suscripción encontrada para ${userId}:`, {
      plan: sub.plan,
      estado: sub.estado,
      periodo: sub.periodo,
      trial_days_left: sub.trial_days_left
    });
    
    // Si es trial, verificar días restantes
    if (sub.estado === 'trial' || sub.plan === 'free') {
      const daysLeft = sub.trial_days_left !== null ? sub.trial_days_left : 5;
      
      if (daysLeft <= 0) {
        // Trial expirado
        return res.json({ 
          subscription: { 
            status: 'expired', 
            plan: 'none',
            plan_name: 'Expirado - Adquiere un plan',
            days_left: 0,
            assets: [],
            message: 'Tu período de prueba ha terminado. Adquiere un plan para continuar.'
          } 
        });
      }
      
      return res.json({ 
        subscription: {
          status: 'trial',
          plan: 'free',
          plan_name: 'Free Trial',
          trial_ends_at: sub.trial_ends_at || trialEnd.toISOString(),
          days_left: daysLeft,
          assets: PLANS.free.assets
        }
      });
    }
    
    // Usuario con plan activo (active, basico, premium, elite)
    const planKey = sub.plan || 'free';
    const plan = PLANS[planKey] || PLANS.free;
    
    // Verificar si el plan está expirado
    if (!sub.is_active || sub.days_left <= 0) {
      console.log(`⚠️ Usuario ${userId} plan expirado: ${planKey}`);
      return res.json({ 
        subscription: {
          status: 'expired',
          plan: planKey,
          plan_name: `${plan.name} - Expirado`,
          days_left: 0,
          assets: [],
          period: sub.periodo,
          email: sub.email,
          message: 'Tu suscripción ha expirado. Renueva para continuar.'
        }
      });
    }
    
    console.log(`✅ Usuario ${userId} tiene plan: ${planKey} (${plan.name}) - ${sub.days_left} días restantes`);
    
    return res.json({ 
      subscription: {
        status: sub.estado === 'active' ? 'active' : sub.estado,
        plan: planKey,
        plan_name: plan.name,
        assets: plan.assets,
        period: sub.periodo,
        days_left: sub.days_left,
        subscription_ends_at: sub.subscription_ends_at,
        email: sub.email
      }
    });
    
  } catch (error) {
    console.error('Subscription error:', error);
    res.json({ subscription: defaultSub });
  }
});

// =============================================
// API ENDPOINTS - ADMIN
// =============================================
app.get('/api/admin/users', async (req, res) => {
  try {
    const subs = await getAllSubscriptions();
    
    const users = (subs || []).map(sub => {
      const planKey = sub.plan || 'free';
      const planInfo = PLANS[planKey] || PLANS.free;
      
      return {
        id: sub.id,
        email: sub.email,
        status: sub.estado,
        plan: planKey,
        plan_name: planInfo.name,
        period: sub.periodo,
        days_left: sub.days_left,
        is_active: sub.is_active,
        trial_ends_at: sub.trial_ends_at,
        subscription_ends_at: sub.subscription_ends_at,
        created_at: sub.created_at
      };
    });
    
    const total = users.length;
    const trial = users.filter(u => u.status === 'trial').length;
    const active = users.filter(u => u.status === 'active').length;
    const expired = users.filter(u => u.status === 'expired' || (u.days_left !== undefined && u.days_left <= 0)).length;
    const basico = users.filter(u => u.plan === 'basico' && u.status === 'active').length;
    const premium = users.filter(u => u.plan === 'premium' && u.status === 'active').length;
    const elite = users.filter(u => u.plan === 'elite' && u.status === 'active').length;
    
    // Calcular ingresos estimados
    const monthlyRevenue = (basico * 29900) + (premium * 59900) + (elite * 99900);
    
    res.json({ 
      users, 
      stats: { 
        total, 
        trial, 
        active, 
        expired,
        basico,
        premium,
        elite,
        monthlyRevenue
      },
      storage: supabase ? 'supabase' : 'memory'
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.json({ users: [], error: error.message });
  }
});

app.post('/api/admin/users', async (req, res) => {
  const { email, plan, status, period } = req.body;
  if (!email) return res.status(400).json({ error: 'email requerido' });
  
  try {
    const subData = {
      email: email,
      plan: plan || 'free',
      estado: status || 'trial',
      periodo: period || 'mensual'
    };
    
    const result = await saveSubscription(subData);
    res.json({ success: true, subscription: result.data?.[0] || subData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { plan, status, period } = req.body;
  
  try {
    // userId es el email
    const existing = await getSubscription(userId);
    
    const subData = {
      email: userId,
      plan: plan || existing?.plan || 'free',
      estado: status || existing?.estado || 'trial',
      periodo: period || existing?.periodo || 'mensual'
    };
    
    const result = await saveSubscription(subData);
    
    if (result.error) {
      return res.status(500).json({ error: result.error.message });
    }
    
    res.json({ success: true, subscription: subData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    await deleteSubscription(req.params.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// API ENDPOINTS - PAGOS WOMPI
// =============================================
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || '';
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || '';
const WOMPI_INTEGRITY_KEY = process.env.WOMPI_INTEGRITY_KEY || '';
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || '';

app.post('/api/payments/wompi/create', async (req, res) => {
  const { plan, userId, email, period } = req.body;
  
  // Normalizar nombre del plan a minúsculas y sin acentos
  const planKey = plan?.toLowerCase()
    ?.normalize("NFD")
    ?.replace(/[\u0300-\u036f]/g, "")
    ?.replace('á', 'a')?.replace('é', 'e')?.replace('í', 'i')?.replace('ó', 'o')?.replace('ú', 'u') || '';
  
  const planInfo = PLANS[planKey];
  
  console.log(`💳 Intento de pago: plan="${plan}" -> planKey="${planKey}", userId=${userId}, email=${email}`);
  console.log(`   Planes disponibles: ${Object.keys(PLANS).join(', ')}`);
  
  if (!planInfo) {
    return res.status(400).json({ 
      error: 'Plan inválido', 
      received: plan,
      normalized: planKey,
      available: Object.keys(PLANS)
    });
  }
  
  if (!WOMPI_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Wompi no configurado' });
  }
  
  try {
    const reference = `TMP-${planKey.toUpperCase()}-${userId.slice(0,8)}-${Date.now()}`;
    const amountInCents = planInfo.price * 100;
    const billingPeriod = period || 'mensual';
    
    // Generar link de pago Wompi
    const paymentData = {
      name: `Trading Master Pro - ${planInfo.name}`,
      description: `Suscripción ${planInfo.name} (${billingPeriod})`,
      single_use: true,
      collect_shipping: false,
      currency: 'COP',
      amount_in_cents: amountInCents,
      redirect_url: `https://trading-master-pro.vercel.app/payment/success?ref=${reference}`,
      reference: reference,
      customer_data: { 
        email,
        full_name: email.split('@')[0]
      }
    };
    
    console.log(`   Creando pago Wompi: $${planInfo.price} COP, ref=${reference}`);
    
    const response = await fetch('https://production.wompi.co/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WOMPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentData)
    });
    
    const result = await response.json();
    
    if (result.data?.id) {
      console.log(`   ✅ Link de pago creado: ${result.data.id}`);
      res.json({ 
        success: true, 
        payment_url: `https://checkout.wompi.co/l/${result.data.id}`,
        reference 
      });
    } else {
      console.log(`   ❌ Error Wompi:`, result);
      res.status(400).json({ error: 'Error creando pago', details: result });
    }
  } catch (error) {
    console.log(`   ❌ Exception:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/webhooks/wompi', async (req, res) => {
  const event = req.body;
  
  console.log('🔔 Webhook Wompi recibido:', event.event);
  
  if (event.event === 'transaction.updated' && event.data?.transaction?.status === 'APPROVED') {
    const reference = event.data.transaction.reference;
    // TMP-ELITE-abc12345-1234567890
    const parts = reference.split('-');
    const planFromRef = parts[1]?.toLowerCase();
    const userIdShort = parts[2];
    
    console.log(`   Pago aprobado: ref=${reference}, plan=${planFromRef}`);
    
    // Buscar usuario por ID parcial
    if (userIdShort) {
      try {
        const subs = await getAllSubscriptions();
        const userSub = subs.find(s => s.id_de_usuario?.startsWith(userIdShort));
        
        if (userSub) {
          const updatedSub = {
            ...userSub,
            plan: planFromRef,
            estado: 'active',
            periodo: 'mensual',
            trial_ends_at: null,
            payment_date: new Date().toISOString()
          };
          
          await saveSubscription(updatedSub);
          console.log(`   ✅ Usuario actualizado: ${userSub.id_de_usuario} -> plan ${planFromRef}`);
        } else {
          console.log(`   ⚠️ Usuario no encontrado: ${userIdShort}`);
        }
      } catch (e) {
        console.log(`   ❌ Error actualizando usuario:`, e.message);
      }
    }
  }
  
  res.json({ received: true });
});

// Endpoint para ver estado de mercados
app.get('/api/markets/status', (req, res) => {
  const marketsInfo = {};
  for (const symbol of MY_ASSETS) {
    const config = ASSETS[symbol];
    const status = marketStatus[symbol];
    const data = assetData[symbol];
    
    marketsInfo[symbol] = {
      name: config.shortName,
      category: config.category,
      isOpen: isMarketOpenNow(symbol),
      isActive: status.isActive,
      lastDataReceived: status.lastDataReceived ? new Date(status.lastDataReceived).toISOString() : null,
      hasCandles: data.candles?.length > 0,
      candleCount: data.candles?.length || 0,
      currentPrice: data.price,
      subscriptionAttempts: status.subscriptionAttempts
    };
  }
  
  res.json({
    connected: isConnected,
    timestamp: new Date().toISOString(),
    markets: marketsInfo
  });
});

// Endpoint para forzar resubscripción de un mercado
app.post('/api/markets/resubscribe/:symbol', (req, res) => {
  const { symbol } = req.params;
  
  if (!ASSETS[symbol]) {
    return res.status(404).json({ error: 'Mercado no encontrado' });
  }
  
  if (!isConnected) {
    return res.status(503).json({ error: 'No conectado a Deriv' });
  }
  
  resubscribeToAsset(symbol);
  
  res.json({
    success: true,
    message: `Resubscripción enviada para ${ASSETS[symbol].shortName}`,
    symbol
  });
});

// Endpoint para forzar resubscripción de todos los mercados
app.post('/api/markets/resubscribe-all', (req, res) => {
  if (!isConnected) {
    return res.status(503).json({ error: 'No conectado a Deriv' });
  }
  
  const resubscribed = [];
  for (const symbol of MY_ASSETS) {
    if (isMarketOpenNow(symbol)) {
      resubscribeToAsset(symbol);
      resubscribed.push(ASSETS[symbol].shortName);
    }
  }
  
  res.json({
    success: true,
    message: `Resubscripción enviada para ${resubscribed.length} mercados`,
    markets: resubscribed
  });
});

app.get('/api/health', (req, res) => {
  const learningStats = LearningSystem.getStats();
  res.json({ 
    status: 'ok',
    version: '14.0-ELISA-AI',
    deriv: isConnected ? 'connected' : 'disconnected',
    openai: !!openai,
    supabase: !!supabase,
    telegram: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    assets: MY_ASSETS.length,
    signals: signalHistory.length,
    learning: {
      active: true,
      tradesRecorded: learningStats.totalTrades,
      winRate: learningStats.winRate
    },
    smcModels: SMC_MODELS_DATA.models ? Object.keys(SMC_MODELS_DATA.models).length : 0
  });
});


// =============================================
// INICIO DEL SERVIDOR
// =============================================
// Asegurar que admin tenga plan elite al iniciar
async function ensureAdminElite() {
  if (!supabase) return;
  try {
    await supabase.from('users')
      .update({ plan: 'elite', is_active: true })
      .eq('email', 'admin@tradingpro.com');
    console.log('✅ Admin actualizado a plan Elite');
  } catch(e) { console.log('Admin update:', e.message); }
}

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║   🤖 TRADING MASTER PRO v14.0 - ELISA AI              ║
║   Motor SMC Puro + OpenAI + Aprendizaje Automático    ║
╠═══════════════════════════════════════════════════════╣
║  Puerto: ${PORT}                                          ║
║  OpenAI: ${openai ? '✅ Conectado' : '⚠️ No configurado'}                           ║
║  Supabase: ${supabase ? '✅ Conectado' : '⚠️ No configurado'}                         ║
║  Telegram: ${TELEGRAM_BOT_TOKEN ? '✅ Configurado' : '⚠️ No configurado'}                        ║
║  Modelos SMC: ${SMC_MODELS_DATA.models ? Object.keys(SMC_MODELS_DATA.models).length : 0} cargados                          ║
║  Aprendizaje: ✅ Activo                               ║
║  Activos: ${MY_ASSETS.length} (${MY_ASSETS.join(', ')})
╚═══════════════════════════════════════════════════════╝
  `);
  
  console.log('\n🔌 Conectando a Deriv WebSocket...');
  connectDeriv();
  ensureAdminElite();
  
  // Actualizar H1 cada 2 minutos — solo los 3 activos activos
  setInterval(() => {
    if (derivWs?.readyState === WebSocket.OPEN) {
      for (const symbol of MY_ASSETS) {
        requestH1(symbol);
        requestM15(symbol);
      }
    }
  }, 120000);
  
  // Ping cada 30 segundos
  setInterval(() => {
    if (derivWs?.readyState === WebSocket.OPEN) {
      derivWs.send(JSON.stringify({ ping: 1 }));
    }
  }, 30000);
});

export default app;
