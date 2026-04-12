// =============================================
// TRADING MASTER PRO - PUSH NOTIFICATIONS MODULE
// Sistema de notificaciones push por plan
// =============================================

import webpush from 'web-push';

// Configuración de límites por plan
const PLAN_NOTIFICATION_LIMITS = {
  trial: {
    enabled: false,
    maxPerDay: 0,
    minScore: 100, // Nunca envía
    assets: []
  },
  basic: {
    enabled: true,
    maxPerDay: 10,
    minScore: 70,
    assets: ['stpRNG', 'frxXAUUSD', '1HZ75V']
  },
  premium: {
    enabled: true,
    maxPerDay: 25,
    minScore: 70,
    assets: ['stpRNG', 'frxXAUUSD', '1HZ75V', 'frxGBPUSD', 'cryBTCUSD']
  },
  elite: {
    enabled: true,
    maxPerDay: 999, // Sin límite
    minScore: 0, // Todas
    assets: [
      'stpRNG', 'frxXAUUSD', '1HZ75V', 'frxGBPUSD', 'cryBTCUSD',
      'BOOM500', 'BOOM1000', 'CRASH500', 'CRASH1000'
    ]
  }
};

// Info de activos para mostrar nombres bonitos
const ASSETS_INFO = {
  'stpRNG': { name: 'Step Index', emoji: '📊' },
  'frxXAUUSD': { name: 'Oro (XAU/USD)', emoji: '🥇' },
  '1HZ75V': { name: 'Volatility 75', emoji: '📈' },
  'frxGBPUSD': { name: 'GBP/USD', emoji: '💷' },
  'cryBTCUSD': { name: 'Bitcoin', emoji: '₿' },
  'BOOM500': { name: 'Boom 500', emoji: '🚀' },
  'BOOM1000': { name: 'Boom 1000', emoji: '🚀' },
  'CRASH500': { name: 'Crash 500', emoji: '💥' },
  'CRASH1000': { name: 'Crash 1000', emoji: '💥' }
};

class PushNotificationManager {
  constructor(supabase) {
    this.supabase = supabase;
    this.initialized = false;
    
    // Configurar VAPID
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        process.env.VAPID_EMAIL || 'mailto:admin@tradingmasterpro.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
      this.initialized = true;
      console.log('✅ Push Notifications configuradas');
    } else {
      console.log('⚠️ VAPID keys no encontradas - Push notifications deshabilitadas');
    }
  }

  /**
   * Obtener VAPID public key para el frontend
   */
  getPublicKey() {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  /**
   * Guardar suscripción de un usuario
   */
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
          user_agent: deviceInfo.userAgent || null,
          device_type: deviceInfo.deviceType || 'unknown',
          notifications_enabled: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'endpoint'
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Suscripción guardada para usuario ${userId}`);
      return { success: true, subscription: data };
    } catch (error) {
      console.error('Error guardando suscripción:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Eliminar suscripción
   */
  async removeSubscription(userId, endpoint) {
    try {
      const { error } = await this.supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', endpoint);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error eliminando suscripción:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener conteo de notificaciones del día para un usuario
   */
  async getDailyCount(userId) {
    try {
      const { data, error } = await this.supabase
        .rpc('get_daily_notification_count', { p_user_id: userId });
      
      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error obteniendo conteo diario:', error);
      return 0;
    }
  }

  /**
   * Incrementar conteo diario
   */
  async incrementDailyCount(userId) {
    try {
      const { data, error } = await this.supabase
        .rpc('increment_notification_count', { p_user_id: userId });
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error incrementando conteo:', error);
      return 0;
    }
  }

  /**
   * Verificar si el usuario puede recibir notificación
   */
  async canReceiveNotification(userId, userPlan, signal) {
    const planConfig = PLAN_NOTIFICATION_LIMITS[userPlan] || PLAN_NOTIFICATION_LIMITS.trial;
    
    // Plan no tiene notificaciones habilitadas
    if (!planConfig.enabled) {
      return { allowed: false, reason: 'Plan sin notificaciones' };
    }

    // Verificar si el activo está en el plan
    if (!planConfig.assets.includes(signal.symbol)) {
      return { allowed: false, reason: 'Activo no incluido en plan' };
    }

    // Verificar score mínimo
    if (signal.score < planConfig.minScore) {
      return { allowed: false, reason: 'Score bajo mínimo del plan' };
    }

    // Verificar límite diario
    const dailyCount = await this.getDailyCount(userId);
    if (dailyCount >= planConfig.maxPerDay) {
      return { allowed: false, reason: 'Límite diario alcanzado' };
    }

    return { allowed: true };
  }

  /**
   * Enviar notificación a un usuario específico
   */
  async sendToUser(userId, notification) {
    if (!this.initialized) {
      return { success: false, error: 'Push not initialized' };
    }

    try {
      // Obtener suscripciones activas del usuario
      const { data: subscriptions, error } = await this.supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('notifications_enabled', true);

      if (error) throw error;
      if (!subscriptions || subscriptions.length === 0) {
        return { success: false, error: 'No subscriptions found' };
      }

      const results = [];
      for (const sub of subscriptions) {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          };

          await webpush.sendNotification(
            pushSubscription,
            JSON.stringify(notification)
          );

          // Registrar en historial
          await this.supabase.from('notification_history').insert({
            user_id: userId,
            subscription_id: sub.id,
            signal_id: notification.data?.signalId || null,
            notification_type: notification.data?.type || 'signal',
            title: notification.title,
            body: notification.body,
            data: notification.data,
            status: 'sent'
          });

          results.push({ endpoint: sub.endpoint, success: true });
        } catch (pushError) {
          console.error(`Error enviando push a ${sub.endpoint}:`, pushError);
          
          // Si el endpoint ya no es válido, eliminarlo
          if (pushError.statusCode === 404 || pushError.statusCode === 410) {
            await this.supabase
              .from('push_subscriptions')
              .delete()
              .eq('id', sub.id);
          }

          results.push({ endpoint: sub.endpoint, success: false, error: pushError.message });
        }
      }

      return { success: true, results };
    } catch (error) {
      console.error('Error enviando notificación:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enviar notificación de señal a todos los usuarios elegibles
   */
  async broadcastSignal(signal) {
    if (!this.initialized) {
      console.log('⚠️ Push not initialized, skipping broadcast');
      return { sent: 0, skipped: 0 };
    }

    console.log(`📤 Broadcasting señal ${signal.symbol} (Score: ${signal.score})`);

    try {
      // Obtener todos los usuarios con suscripciones activas
      const { data: subscriptions, error } = await this.supabase
        .from('push_subscriptions')
        .select(`
          *,
          users:user_id (
            id,
            plan_slug
          )
        `)
        .eq('notifications_enabled', true);

      if (error) throw error;
      if (!subscriptions || subscriptions.length === 0) {
        console.log('No hay suscripciones activas');
        return { sent: 0, skipped: 0 };
      }

      // Agrupar por usuario (puede tener múltiples dispositivos)
      const userSubscriptions = {};
      for (const sub of subscriptions) {
        const userId = sub.user_id;
        if (!userSubscriptions[userId]) {
          userSubscriptions[userId] = {
            plan: sub.users?.plan_slug || 'trial',
            subscriptions: []
          };
        }
        userSubscriptions[userId].subscriptions.push(sub);
      }

      let sent = 0;
      let skipped = 0;

      // Procesar cada usuario
      for (const [userId, userData] of Object.entries(userSubscriptions)) {
        // Verificar si puede recibir
        const canReceive = await this.canReceiveNotification(userId, userData.plan, signal);
        
        if (!canReceive.allowed) {
          skipped++;
          continue;
        }

        // Construir notificación
        const assetInfo = ASSETS_INFO[signal.symbol] || { name: signal.symbol, emoji: '📊' };
        const actionEmoji = signal.action === 'BUY' ? '🟢' : '🔴';
        const actionText = signal.action === 'BUY' ? 'LONG' : 'SHORT';

        const notification = {
          title: `${actionEmoji} SEÑAL ${actionText} - ${assetInfo.name}`,
          body: `${assetInfo.emoji} Score: ${signal.score}/100 | Entry: ${signal.entry?.toFixed(signal.symbol.includes('JPY') ? 3 : 5)}`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          tag: `signal-${signal.id}`,
          renotify: true,
          requireInteraction: false,
          vibrate: [100, 50, 100],
          data: {
            type: 'signal',
            signalId: signal.id,
            symbol: signal.symbol,
            action: signal.action,
            score: signal.score,
            url: '/?signal=' + signal.id
          },
          actions: [
            { action: 'view', title: 'Ver Señal' },
            { action: 'dismiss', title: 'Ignorar' }
          ]
        };

        // Enviar a todos los dispositivos del usuario
        for (const sub of userData.subscriptions) {
          try {
            const pushSubscription = {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            };

            await webpush.sendNotification(pushSubscription, JSON.stringify(notification));
            
            // Registrar en historial
            await this.supabase.from('notification_history').insert({
              user_id: userId,
              subscription_id: sub.id,
              signal_id: signal.id,
              notification_type: 'signal',
              title: notification.title,
              body: notification.body,
              data: notification.data,
              status: 'sent'
            });

          } catch (pushError) {
            console.error(`Error enviando a ${sub.endpoint}:`, pushError.statusCode);
            
            // Limpiar endpoints inválidos
            if (pushError.statusCode === 404 || pushError.statusCode === 410) {
              await this.supabase
                .from('push_subscriptions')
                .delete()
                .eq('id', sub.id);
            }
          }
        }

        // Incrementar conteo diario
        await this.incrementDailyCount(userId);
        sent++;
      }

      console.log(`✅ Broadcast completado: ${sent} enviadas, ${skipped} omitidas`);
      return { sent, skipped };

    } catch (error) {
      console.error('Error en broadcast:', error);
      return { sent: 0, skipped: 0, error: error.message };
    }
  }

  /**
   * Enviar notificación de prueba
   */
  async sendTestNotification(userId) {
    const testNotification = {
      title: '🔔 Notificaciones Activadas',
      body: 'Recibirás alertas de señales según tu plan. ¡Trading Master Pro!',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'test-notification',
      data: {
        type: 'test',
        url: '/'
      }
    };

    return await this.sendToUser(userId, testNotification);
  }

  /**
   * Obtener estadísticas de notificaciones de un usuario
   */
  async getUserStats(userId) {
    try {
      // Conteo de hoy
      const dailyCount = await this.getDailyCount(userId);

      // Suscripciones activas
      const { data: subscriptions } = await this.supabase
        .from('push_subscriptions')
        .select('id, device_type, created_at')
        .eq('user_id', userId)
        .eq('notifications_enabled', true);

      // Últimas 10 notificaciones
      const { data: recentNotifications } = await this.supabase
        .from('notification_history')
        .select('title, body, sent_at, status')
        .eq('user_id', userId)
        .order('sent_at', { ascending: false })
        .limit(10);

      return {
        dailyCount,
        devicesCount: subscriptions?.length || 0,
        devices: subscriptions || [],
        recentNotifications: recentNotifications || []
      };
    } catch (error) {
      console.error('Error obteniendo stats:', error);
      return null;
    }
  }
}

export default PushNotificationManager;
