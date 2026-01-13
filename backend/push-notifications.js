// =============================================
// TRADING MASTER PRO - PUSH NOTIFICATIONS MODULE
// VERSIÓN ACTUALIZADA - Todos los activos por plan
// =============================================

import webpush from 'web-push';

// Configuración de límites por plan - ACTUALIZADO con todos los activos
const PLAN_NOTIFICATION_LIMITS = {
  free: { 
    enabled: false, 
    maxPerDay: 0, 
    minScore: 100, 
    assets: [] 
  },
  trial: { 
    enabled: false, 
    maxPerDay: 0, 
    minScore: 100, 
    assets: [] 
  },
  basico: {
    enabled: true,
    maxPerDay: 10,
    minScore: 70,
    assets: ['stpRNG', 'R_75', 'frxEURUSD', 'frxUSDJPY', 'frxXAUUSD', 'frxXAGUSD']
  },
  basic: {
    enabled: true,
    maxPerDay: 10,
    minScore: 70,
    assets: ['stpRNG', 'R_75', 'frxEURUSD', 'frxUSDJPY', 'frxXAUUSD', 'frxXAGUSD']
  },
  premium: {
    enabled: true,
    maxPerDay: 25,
    minScore: 70,
    assets: [
      'stpRNG', 'R_75', '1HZ100V', 'JD75',
      'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY',
      'frxXAUUSD', 'frxXAGUSD',
      'cryBTCUSD', 'cryETHUSD'
    ]
  },
  elite: {
    enabled: true,
    maxPerDay: 999,
    minScore: 0,
    assets: [
      // Sintéticos
      'stpRNG', 'R_75', '1HZ100V', 'JD75', 'JD100', 'JD150', 'JD200',
      // Forex
      'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD', 'frxUSDCAD', 'frxNZDUSD',
      // Metales
      'frxXAUUSD', 'frxXAGUSD',
      // Crypto
      'cryBTCUSD', 'cryETHUSD',
      // Boom/Crash
      'BOOM1000', 'BOOM500', 'BOOM300N', 'BOOM300',
      'CRASH1000', 'CRASH500', 'CRASH300N', 'CRASH300',
      // Volatility
      '1HZ75V', '1HZ150V', '1HZ200V', '1HZ250V',
      // Step
      'stpRNG'
    ]
  }
};

// Info de activos para notificaciones
const ASSETS_INFO = {
  // Sintéticos - Step
  'stpRNG': { name: 'Step Index', emoji: '📊' },
  
  // Sintéticos - Volatility
  'R_75': { name: 'Volatility 75', emoji: '📈' },
  '1HZ75V': { name: 'V75 (1s)', emoji: '📈' },
  '1HZ100V': { name: 'V100 (1s)', emoji: '📈' },
  '1HZ150V': { name: 'V150 (1s)', emoji: '📈' },
  '1HZ200V': { name: 'V200 (1s)', emoji: '📈' },
  '1HZ250V': { name: 'V250 (1s)', emoji: '📈' },
  
  // Sintéticos - Jump
  'JD75': { name: 'Jump 75', emoji: '⚡' },
  'JD100': { name: 'Jump 100', emoji: '⚡' },
  'JD150': { name: 'Jump 150', emoji: '⚡' },
  'JD200': { name: 'Jump 200', emoji: '⚡' },
  
  // Boom/Crash
  'BOOM1000': { name: 'Boom 1000', emoji: '🚀' },
  'BOOM500': { name: 'Boom 500', emoji: '🚀' },
  'BOOM300': { name: 'Boom 300', emoji: '🚀' },
  'BOOM300N': { name: 'Boom 300N', emoji: '🚀' },
  'CRASH1000': { name: 'Crash 1000', emoji: '💥' },
  'CRASH500': { name: 'Crash 500', emoji: '💥' },
  'CRASH300': { name: 'Crash 300', emoji: '💥' },
  'CRASH300N': { name: 'Crash 300N', emoji: '💥' },
  
  // Forex
  'frxEURUSD': { name: 'EUR/USD', emoji: '💶' },
  'frxGBPUSD': { name: 'GBP/USD', emoji: '💷' },
  'frxUSDJPY': { name: 'USD/JPY', emoji: '💴' },
  'frxAUDUSD': { name: 'AUD/USD', emoji: '🦘' },
  'frxUSDCAD': { name: 'USD/CAD', emoji: '🍁' },
  'frxNZDUSD': { name: 'NZD/USD', emoji: '🥝' },
  
  // Metales
  'frxXAUUSD': { name: 'Oro (XAU)', emoji: '🥇' },
  'frxXAGUSD': { name: 'Plata (XAG)', emoji: '🥈' },
  
  // Crypto
  'cryBTCUSD': { name: 'Bitcoin', emoji: '₿' },
  'cryETHUSD': { name: 'Ethereum', emoji: 'Ξ' }
};

class PushNotificationManager {
  constructor(supabase) {
    this.supabase = supabase;
    this.initialized = false;
    this.userPlanCache = new Map();
    
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        process.env.VAPID_EMAIL || 'mailto:admin@tradingmasterpro.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
      this.initialized = true;
      console.log('✅ Push Notifications configuradas');
    } else {
      console.log('⚠️ VAPID keys no encontradas - Push deshabilitadas');
    }
  }

  getPublicKey() {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  // Obtener plan de usuario (con cache de 5 min)
  async getUserPlan(userId) {
    const cached = this.userPlanCache.get(userId);
    if (cached && cached.timestamp > Date.now() - 300000) {
      return cached.plan;
    }

    try {
      const { data, error } = await this.supabase
        .from('suscripciones')
        .select('plan, estado')
        .or(`id_de_usuario.eq.${userId},email.eq.${userId}`)
        .eq('estado', 'active')
        .single();

      const plan = (error || !data) ? 'trial' : (data.plan || 'trial');
      this.userPlanCache.set(userId, { plan, timestamp: Date.now() });
      return plan;
    } catch (err) {
      return 'trial';
    }
  }

  // Guardar suscripción
  async saveSubscription(userId, subscription, deviceInfo = {}) {
    try {
      const { endpoint, keys } = subscription;
      
      const { data, error } = await this.supabase
        .from('push_subscriptions')
        .upsert({
          user_id: userId,
          endpoint: endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          device_type: deviceInfo.deviceType || 'unknown',
          notifications_enabled: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'endpoint' })
        .select()
        .single();

      if (error) throw error;
      console.log(`✅ Suscripción guardada para ${userId}`);
      return { success: true, subscription: data };
    } catch (error) {
      console.error('Error guardando suscripción:', error);
      return { success: false, error: error.message };
    }
  }

  // Eliminar suscripción
  async removeSubscription(userId, endpoint) {
    try {
      await this.supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', endpoint);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Conteo diario
  async getDailyCount(userId) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await this.supabase
        .from('daily_notification_counts')
        .select('count')
        .eq('user_id', userId)
        .eq('date', today)
        .single();
      return data?.count || 0;
    } catch {
      return 0;
    }
  }

  async incrementDailyCount(userId) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: existing } = await this.supabase
        .from('daily_notification_counts')
        .select('id, count')
        .eq('user_id', userId)
        .eq('date', today)
        .single();

      if (existing) {
        await this.supabase
          .from('daily_notification_counts')
          .update({ count: existing.count + 1 })
          .eq('id', existing.id);
        return existing.count + 1;
      } else {
        await this.supabase
          .from('daily_notification_counts')
          .insert({ user_id: userId, date: today, count: 1 });
        return 1;
      }
    } catch {
      return 0;
    }
  }

  // Verificar si puede recibir
  async canReceiveNotification(userId, userPlan, signal) {
    const planConfig = PLAN_NOTIFICATION_LIMITS[userPlan] || PLAN_NOTIFICATION_LIMITS.trial;
    
    if (!planConfig.enabled) {
      return { allowed: false, reason: 'Plan sin notificaciones' };
    }

    // Elite puede recibir TODO
    if (userPlan === 'elite') {
      return { allowed: true };
    }

    // Verificar si el activo está en el plan
    if (!planConfig.assets.includes(signal.symbol)) {
      return { allowed: false, reason: `Activo ${signal.symbol} no incluido en plan ${userPlan}` };
    }

    // Verificar score mínimo
    if (signal.score < planConfig.minScore) {
      return { allowed: false, reason: 'Score bajo' };
    }

    // Verificar límite diario
    const dailyCount = await this.getDailyCount(userId);
    if (dailyCount >= planConfig.maxPerDay) {
      return { allowed: false, reason: 'Límite diario alcanzado' };
    }

    return { allowed: true };
  }

  // Enviar notificación de prueba
  async sendTestNotification(userId) {
    if (!this.initialized) {
      return { success: false, error: 'Push not initialized' };
    }

    try {
      const { data: subscriptions, error } = await this.supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', userId)
        .eq('notifications_enabled', true);

      if (error) throw error;
      if (!subscriptions?.length) {
        return { success: false, error: 'No hay suscripciones' };
      }

      const notification = {
        title: '🔔 Notificaciones Activadas',
        body: 'Recibirás alertas de señales - Trading Master Pro',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: 'test',
        data: { type: 'test', url: '/' }
      };

      let sent = 0;
      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(notification)
          );
          sent++;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await this.supabase.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }

      return { success: true, sent };
    } catch (error) {
      console.error('Error test notification:', error);
      return { success: false, error: error.message };
    }
  }

  // BROADCAST DE SEÑAL
  async broadcastSignal(signal) {
    if (!this.initialized) {
      console.log('⚠️ Push not initialized');
      return { sent: 0, skipped: 0 };
    }

    console.log(`📤 Broadcasting señal ${signal.symbol} (Score: ${signal.score})`);

    try {
      // Consulta simple sin JOINs
      const { data: subscriptions, error } = await this.supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .eq('notifications_enabled', true);

      if (error) {
        console.error('Error obteniendo suscripciones:', error);
        return { sent: 0, skipped: 0 };
      }

      if (!subscriptions?.length) {
        console.log('📭 No hay suscripciones activas');
        return { sent: 0, skipped: 0 };
      }

      console.log(`📋 ${subscriptions.length} suscripciones encontradas`);

      // Agrupar por usuario
      const userSubs = {};
      for (const sub of subscriptions) {
        if (!userSubs[sub.user_id]) userSubs[sub.user_id] = [];
        userSubs[sub.user_id].push(sub);
      }

      let sent = 0, skipped = 0;

      for (const [userId, subs] of Object.entries(userSubs)) {
        try {
          const userPlan = await this.getUserPlan(userId);
          const canReceive = await this.canReceiveNotification(userId, userPlan, signal);
          
          if (!canReceive.allowed) {
            console.log(`⏭️ ${userId} (${userPlan}): ${canReceive.reason}`);
            skipped++;
            continue;
          }

          // Construir notificación
          const assetInfo = ASSETS_INFO[signal.symbol] || { name: signal.symbol, emoji: '📊' };
          const actionEmoji = signal.action === 'BUY' ? '🟢' : '🔴';
          const actionText = signal.action === 'BUY' ? 'LONG' : 'SHORT';

          const notification = {
            title: `${actionEmoji} ${actionText} - ${assetInfo.name}`,
            body: `${assetInfo.emoji} Score: ${signal.score}/100 | TF: ${signal.timeframe || 'H1'}`,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            tag: `signal-${signal.id}`,
            renotify: true,
            vibrate: [100, 50, 100],
            data: {
              type: 'signal',
              signalId: signal.id,
              symbol: signal.symbol,
              action: signal.action,
              score: signal.score,
              url: '/'
            }
          };

          // Enviar a todos los dispositivos del usuario
          let userSent = false;
          for (const sub of subs) {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                JSON.stringify(notification)
              );
              userSent = true;
              console.log(`✅ Push enviado a ${userId} (${userPlan})`);
            } catch (pushErr) {
              console.error(`❌ Push error ${userId}:`, pushErr.statusCode || pushErr.message);
              if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
                await this.supabase.from('push_subscriptions').delete().eq('id', sub.id);
              }
            }
          }

          if (userSent) {
            await this.incrementDailyCount(userId);
            sent++;
          }
        } catch (userErr) {
          console.error(`Error usuario ${userId}:`, userErr);
          skipped++;
        }
      }

      console.log(`✅ Broadcast completado: ${sent} enviadas, ${skipped} omitidas`);
      return { sent, skipped };

    } catch (error) {
      console.error('Error broadcast:', error);
      return { sent: 0, skipped: 0, error: error.message };
    }
  }

  // Stats del usuario
  async getUserStats(userId) {
    try {
      const dailyCount = await this.getDailyCount(userId);
      const userPlan = await this.getUserPlan(userId);
      const planConfig = PLAN_NOTIFICATION_LIMITS[userPlan] || PLAN_NOTIFICATION_LIMITS.trial;
      
      const { data: subs } = await this.supabase
        .from('push_subscriptions')
        .select('id, device_type')
        .eq('user_id', userId)
        .eq('notifications_enabled', true);

      return {
        dailyCount,
        maxPerDay: planConfig.maxPerDay,
        devicesCount: subs?.length || 0,
        plan: userPlan,
        assetsCount: planConfig.assets?.length || 0
      };
    } catch {
      return null;
    }
  }
}

export default PushNotificationManager;
