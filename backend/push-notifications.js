// =============================================
// TRADING MASTER PRO - PUSH NOTIFICATIONS MODULE
// VERSIÓN FINAL - Usa email como identificador
// =============================================

import webpush from 'web-push';

// Configuración de límites por plan
const PLAN_NOTIFICATION_LIMITS = {
  free: { enabled: false, maxPerDay: 0, minScore: 100, assets: [] },
  trial: { enabled: false, maxPerDay: 0, minScore: 100, assets: [] },
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
      'stpRNG', 'R_75', '1HZ100V', 
      'JD75', 'JD100', 'JD150', 'JD200',
      'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD', 'frxUSDCAD', 'frxNZDUSD',
      'frxXAUUSD', 'frxXAGUSD',
      'cryBTCUSD', 'cryETHUSD',
      'BOOM1000', 'BOOM500', 'BOOM300N', 'BOOM300',
      'CRASH1000', 'CRASH500', 'CRASH300N', 'CRASH300',
      '1HZ75V', '1HZ150V', '1HZ200V', '1HZ250V'
    ]
  }
};

// Info de activos
const ASSETS_INFO = {
  'stpRNG': { name: 'Step Index', emoji: '📊' },
  'R_75': { name: 'V75', emoji: '📈' },
  '1HZ75V': { name: 'V75 (1s)', emoji: '📈' },
  '1HZ100V': { name: 'V100', emoji: '📈' },
  'JD75': { name: 'Jump 75', emoji: '⚡' },
  'JD100': { name: 'Jump 100', emoji: '⚡' },
  'BOOM1000': { name: 'Boom 1K', emoji: '🚀' },
  'BOOM500': { name: 'Boom 500', emoji: '🚀' },
  'BOOM300': { name: 'Boom 300', emoji: '🚀' },
  'CRASH1000': { name: 'Crash 1K', emoji: '💥' },
  'CRASH500': { name: 'Crash 500', emoji: '💥' },
  'CRASH300': { name: 'Crash 300', emoji: '💥' },
  'frxEURUSD': { name: 'EUR/USD', emoji: '💶' },
  'frxGBPUSD': { name: 'GBP/USD', emoji: '💷' },
  'frxUSDJPY': { name: 'USD/JPY', emoji: '💴' },
  'frxXAUUSD': { name: 'Oro', emoji: '🥇' },
  'frxXAGUSD': { name: 'Plata', emoji: '🥈' },
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
      console.log('⚠️ VAPID keys no encontradas');
    }
  }

  getPublicKey() {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  // Obtener plan de usuario - BUSCA POR EMAIL
  async getUserPlan(userId) {
    const cached = this.userPlanCache.get(userId);
    if (cached && cached.timestamp > Date.now() - 300000) {
      return cached.plan;
    }

    try {
      // Buscar por email o id_de_usuario
      const { data, error } = await this.supabase
        .from('suscripciones')
        .select('plan, estado, email')
        .or(`email.eq.${userId},id_de_usuario.eq.${userId}`)
        .eq('estado', 'active')
        .single();

      if (error || !data) {
        console.log(`⚠️ No se encontró plan para ${userId}, usando trial`);
        this.userPlanCache.set(userId, { plan: 'trial', timestamp: Date.now() });
        return 'trial';
      }

      const plan = data.plan || 'trial';
      console.log(`✅ Plan encontrado para ${userId}: ${plan}`);
      this.userPlanCache.set(userId, { plan, timestamp: Date.now() });
      return plan;
    } catch (err) {
      console.error('Error obteniendo plan:', err);
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
          user_id: userId, // Ahora es el email
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

    if (userPlan === 'elite') {
      return { allowed: true };
    }

    if (!planConfig.assets.includes(signal.symbol)) {
      return { allowed: false, reason: `Activo ${signal.symbol} no en plan` };
    }

    if (signal.score < planConfig.minScore) {
      return { allowed: false, reason: 'Score bajo' };
    }

    const dailyCount = await this.getDailyCount(userId);
    if (dailyCount >= planConfig.maxPerDay) {
      return { allowed: false, reason: 'Límite diario' };
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
        title: '🔔 Trading Master Pro',
        body: '¡Notificaciones activadas! Recibirás alertas de señales.',
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
          console.error('Push error:', err.statusCode);
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
              url: '/'
            }
          };

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
              console.error(`❌ Push error:`, pushErr.statusCode);
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

      console.log(`✅ Broadcast: ${sent} enviadas, ${skipped} omitidas`);
      return { sent, skipped };

    } catch (error) {
      console.error('Error broadcast:', error);
      return { sent: 0, skipped: 0, error: error.message };
    }
  }

  // Stats
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
        plan: userPlan
      };
    } catch {
      return null;
    }
  }
}

export default PushNotificationManager;
