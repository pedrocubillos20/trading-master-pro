// =============================================
// TRADING MASTER PRO - PUSH NOTIFICATIONS
// VERSIÓN SINCRONIZADA - Usa LONG/SHORT correctamente
// =============================================

import webpush from 'web-push';

const PLAN_LIMITS = {
  free: { enabled: false, maxPerDay: 0, minScore: 100, assets: [] },
  trial: { enabled: false, maxPerDay: 0, minScore: 100, assets: [] },
  basico: {
    enabled: true, maxPerDay: 10, minScore: 70,
    assets: ['stpRNG', 'R_75', 'frxEURUSD', 'frxUSDJPY', 'frxXAUUSD', 'frxXAGUSD']
  },
  basic: {
    enabled: true, maxPerDay: 10, minScore: 70,
    assets: ['stpRNG', 'R_75', 'frxEURUSD', 'frxUSDJPY', 'frxXAUUSD', 'frxXAGUSD']
  },
  premium: {
    enabled: true, maxPerDay: 25, minScore: 70,
    assets: ['stpRNG', 'R_75', '1HZ100V', 'JD75', 'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxXAUUSD', 'frxXAGUSD', 'cryBTCUSD', 'cryETHUSD']
  },
  elite: {
    enabled: true, maxPerDay: 999, minScore: 0,
    assets: ['stpRNG', 'R_75', '1HZ100V', 'JD75', 'JD100', 'JD150', 'JD200', 'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD', 'frxUSDCAD', 'frxNZDUSD', 'frxXAUUSD', 'frxXAGUSD', 'cryBTCUSD', 'cryETHUSD', 'BOOM1000', 'BOOM500', 'BOOM300N', 'BOOM300', 'CRASH1000', 'CRASH500', 'CRASH300N', 'CRASH300', '1HZ75V', '1HZ150V', '1HZ200V', '1HZ250V']
  }
};

const ASSETS_INFO = {
  'stpRNG': { name: 'Step', emoji: '📊' },
  'R_75': { name: 'V75', emoji: '📈' },
  '1HZ100V': { name: 'V100', emoji: '📈' },
  'JD75': { name: 'Jump 75', emoji: '⚡' },
  'BOOM1000': { name: 'Boom 1K', emoji: '🚀' },
  'BOOM500': { name: 'Boom 500', emoji: '🚀' },
  'BOOM300': { name: 'Boom 300', emoji: '🚀' },
  'BOOM300N': { name: 'Boom 300', emoji: '🚀' },
  'CRASH1000': { name: 'Crash 1K', emoji: '💥' },
  'CRASH500': { name: 'Crash 500', emoji: '💥' },
  'CRASH300': { name: 'Crash 300', emoji: '💥' },
  'CRASH300N': { name: 'Crash 300', emoji: '💥' },
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
    this.planCache = new Map();
    
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        process.env.VAPID_EMAIL || 'mailto:admin@tradingmasterpro.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
      this.initialized = true;
      console.log('✅ Push Notifications OK');
    } else {
      console.log('⚠️ VAPID keys no configuradas');
    }
  }

  getPublicKey() {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  // Obtener plan por EMAIL
  async getUserPlan(email) {
    if (!email) return 'trial';
    
    const cached = this.planCache.get(email);
    if (cached && cached.ts > Date.now() - 300000) return cached.plan;

    try {
      const { data } = await this.supabase
        .from('suscripciones')
        .select('plan, estado')
        .eq('email', email)
        .eq('estado', 'active')
        .single();

      const plan = data?.plan || 'trial';
      this.planCache.set(email, { plan, ts: Date.now() });
      console.log(`📋 Plan de ${email}: ${plan}`);
      return plan;
    } catch (err) {
      console.log(`⚠️ Plan no encontrado para ${email}, usando trial`);
      return 'trial';
    }
  }

  // Guardar suscripción (user_id es TEXT/email)
  async saveSubscription(userId, subscription, deviceInfo = {}) {
    try {
      const { endpoint, keys } = subscription;
      
      const { data, error } = await this.supabase
        .from('push_subscriptions')
        .upsert({
          user_id: userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          device_type: deviceInfo.deviceType || 'web',
          notifications_enabled: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'endpoint' })
        .select()
        .single();

      if (error) throw error;
      console.log(`✅ Suscripción guardada: ${userId}`);
      return { success: true, data };
    } catch (err) {
      console.error('❌ Error guardando suscripción:', err.message);
      return { success: false, error: err.message };
    }
  }

  async removeSubscription(userId, endpoint) {
    try {
      await this.supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', endpoint);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

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
      
      // Intentar actualizar
      const { data: existing } = await this.supabase
        .from('daily_notification_counts')
        .select('id, count')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();

      if (existing) {
        await this.supabase
          .from('daily_notification_counts')
          .update({ count: existing.count + 1 })
          .eq('id', existing.id);
      } else {
        await this.supabase
          .from('daily_notification_counts')
          .insert({ user_id: userId, date: today, count: 1 });
      }
    } catch (err) {
      console.error('Error incrementando conteo:', err.message);
    }
  }

  // Verificar si puede recibir
  canReceive(userPlan, signal) {
    const config = PLAN_LIMITS[userPlan] || PLAN_LIMITS.trial;
    
    if (!config.enabled) return { ok: false, reason: 'Plan sin push' };
    if (userPlan === 'elite') return { ok: true };
    if (!config.assets.includes(signal.symbol)) return { ok: false, reason: 'Activo no incluido' };
    if (signal.score < config.minScore) return { ok: false, reason: 'Score bajo' };
    
    return { ok: true };
  }

  // ENVIAR NOTIFICACIÓN DE PRUEBA
  async sendTestNotification(userId) {
    if (!this.initialized) {
      return { success: false, error: 'VAPID no configurado' };
    }

    console.log(`🧪 Enviando prueba a: ${userId}`);

    try {
      // Buscar suscripciones del usuario
      const { data: subs, error } = await this.supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', userId)
        .eq('notifications_enabled', true);

      if (error) throw error;

      if (!subs || subs.length === 0) {
        console.log('⚠️ No hay suscripciones para este usuario');
        return { success: false, error: 'No hay dispositivos registrados' };
      }

      if (error) {
        console.error('❌ Error buscando suscripciones:', error);
        throw error;
      }

      if (!subs || subs.length === 0) {
        console.log('⚠️ No hay suscripciones para este usuario');
        return { success: false, error: 'No hay dispositivos registrados' };
      }

      console.log(`📱 ${subs.length} dispositivo(s) encontrado(s)`);

      const payload = JSON.stringify({
        title: '🔔 Trading Master Pro',
        body: '¡Notificaciones activadas correctamente!',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: 'test-' + Date.now(),
        data: { type: 'test', url: '/' }
      });

      let sent = 0;
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent++;
          console.log('✅ Push enviado correctamente');
        } catch (pushErr) {
          console.error('❌ Error webpush:', pushErr.statusCode || pushErr.message);
          // Eliminar suscripción inválida
          if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
            await this.supabase.from('push_subscriptions').delete().eq('id', sub.id);
            console.log('🗑️ Suscripción inválida eliminada');
          }
        }
      }

      return { success: sent > 0, sent, total: subs.length };
    } catch (err) {
      console.error('❌ Error en sendTestNotification:', err);
      return { success: false, error: err.message };
    }
  }

  // =============================================
  // BROADCAST - SINCRONIZADO CON TELEGRAM
  // Usa LONG/SHORT igual que el resto del sistema
  // =============================================
  async broadcastSignal(signal) {
    if (!this.initialized) {
      console.log('⚠️ Push no inicializado');
      return { sent: 0, skipped: 0 };
    }

    // Determinar dirección correctamente (igual que Telegram)
    // signal.action puede ser: 'LONG', 'SHORT', 'BUY', 'SELL'
    const isLong = signal.action === 'LONG' || signal.action === 'BUY';
    const directionEmoji = isLong ? '🟢' : '🔴';
    const directionText = isLong ? 'COMPRA (LONG)' : 'VENTA (SHORT)';

    console.log(`📤 Broadcast Push: ${signal.symbol} | ${signal.action} -> ${directionText} | Score: ${signal.score}`);
    console.log(`📤 Broadcast: ${signal.symbol} (Score: ${signal.score})`);

    try {
      const { data: subs, error } = await this.supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .eq('notifications_enabled', true);

      if (error || !subs?.length) {
        console.log('📭 Sin suscripciones activas');
        return { sent: 0, skipped: 0 };
      }

      console.log(`📋 ${subs.length} suscripciones`);

      // Agrupar por usuario
      const byUser = {};
      subs.forEach(s => {
        if (!byUser[s.user_id]) byUser[s.user_id] = [];
        byUser[s.user_id].push(s);
      });

      let sent = 0, skipped = 0;

      for (const [email, userSubs] of Object.entries(byUser)) {
        const plan = await this.getUserPlan(email);
        const check = this.canReceive(plan, signal);
        
        if (!check.ok) {
          console.log(`⏭️ ${email}: ${check.reason}`);
          skipped++;
          continue;
        }

        // Verificar límite diario
        const daily = await this.getDailyCount(email);
        const limit = PLAN_LIMITS[plan]?.maxPerDay || 0;
        if (daily >= limit && plan !== 'elite') {
          console.log(`⏭️ ${email}: Límite diario (${daily}/${limit})`);
          skipped++;
          continue;
        }

        const asset = ASSETS_INFO[signal.symbol] || { name: signal.symbol, emoji: '📊' };
        
        // Payload sincronizado con Telegram
        const payload = JSON.stringify({
          title: `${signal.action === 'BUY' ? '🟢 LONG' : '🔴 SHORT'} - ${asset.name}`,
          body: `${asset.emoji} Score: ${signal.score}/100`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          tag: `signal-${signal.id}`,
          renotify: true,
          vibrate: [100, 50, 100],
          data: { 
            type: 'signal', 
            url: '/',
            symbol: signal.symbol,
            action: signal.action,
            score: signal.score
          }
        });

        let userSent = false;
        for (const sub of userSubs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            );
            userSent = true;
          } catch (e) {
            if (e.statusCode === 404 || e.statusCode === 410) {
              await this.supabase.from('push_subscriptions').delete().eq('id', sub.id);
            }
          }
        }

        if (userSent) {
          await this.incrementDailyCount(email);
          sent++;
          console.log(`✅ Push a ${email} (${plan}) - ${directionText}`);
          console.log(`✅ Push a ${email} (${plan})`);
        }
      }

      console.log(`✅ Broadcast: ${sent} enviadas, ${skipped} omitidas`);
      return { sent, skipped };
    } catch (err) {
      console.error('❌ Error broadcast:', err);
      return { sent: 0, skipped: 0 };
    }
  }

  async getUserStats(userId) {
    const plan = await this.getUserPlan(userId);
    const daily = await this.getDailyCount(userId);
    const config = PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
    
    const { data: subs } = await this.supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('notifications_enabled', true);

    return {
      plan,
      dailyCount: daily,
      maxPerDay: config.maxPerDay,
      devices: subs?.length || 0
    };
  }
}

export default PushNotificationManager;
