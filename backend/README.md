# Backend - Trading Master Pro

## 🚀 Deploy en Railway

### 1. Variables de Entorno
```
PORT=3000
SUPABASE_URL=https://mtzycmqtxdvoazomipye.supabase.co
SUPABASE_KEY=tu_service_role_key
DERIV_API_KEY=tu_api_key (opcional)
```

### 2. Configuración Railway
El archivo `railway.json` ya está configurado:
```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": { "startCommand": "node index.js", "restartPolicyType": "ON_FAILURE" }
}
```

## 📡 Endpoints API

### Señales
- `GET /api/signals` - Obtener señales activas
- `POST /api/signals/:id/update` - Actualizar estado de señal

### Reportes
- `GET /api/reports/:userId` - Obtener reporte por período
- `GET /api/reports/summary/:userId` - Resumen general
- `GET /api/reports/equity/:userId` - Curva de equity

### Sistema
- `GET /health` - Health check
- `GET /api/status` - Estado del sistema
- `GET /api/assets` - Lista de activos

## 🗄️ Base de Datos (Supabase)

Ejecutar `supabase-schema.sql` en el SQL Editor de Supabase para crear:
- Tabla `users` - Usuarios y suscripciones
- Tabla `signals` - Historial de señales
- Tabla `daily_snapshots` - Snapshots diarios para reportes
- Funciones RPC para estadísticas

## 📊 Modelos SMC Incluidos

El archivo contiene los 12 modelos SMC:
1. MTF_CONFLUENCE
2. CHOCH_PULLBACK
3. BOS_CONTINUATION
4. BREAKER_BLOCK
5. INDUCEMENT
6. LIQUIDITY_GRAB
7. SMART_MONEY_TRAP
8. FVG_ENTRY
9. OB_ENTRY
10. OTE_ENTRY
11. BOOM_SPIKE
12. CRASH_SPIKE
