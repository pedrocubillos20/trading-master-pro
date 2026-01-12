# Trading Master Pro v20 - Dashboard Personalizado por Usuario

## 🎯 Resumen de Cambios

El sistema ahora ofrece estadísticas y datos personalizados por usuario según su plan.

---

## 📊 Nuevo Endpoint: `/api/dashboard/:userId`

```javascript
GET /api/dashboard/usuario@email.com

Response:
{
  "connected": true,
  "timestamp": 1736560000000,
  "userId": "usuario@email.com",
  "userPlan": "basico",
  "planName": "Básico",
  "assets": [...], // Solo los activos del plan del usuario
  "recentSignals": [...], // Solo señales de sus activos
  "stats": {
    "total": 15,      // Operaciones en SUS activos
    "wins": 10,       // Wins en SUS activos
    "losses": 5,      // Losses en SUS activos
    "pending": 2,     // Señales activas en SUS activos
    "winRate": 67,    // Win rate PERSONAL
    "tp1Hits": 5,
    "tp2Hits": 3,
    "tp3Hits": 2
  },
  "subscription": {
    "plan": "basico",
    "planName": "Básico",
    "status": "active",
    "daysLeft": 25,
    "assetsCount": 6,
    "hasNightAccess": false
  }
}
```

---

## 👤 Diferencias por Plan

### Free Trial (5 días)
| Característica | Valor |
|---------------|-------|
| Activos | 3 (Step, EUR/USD, Oro) |
| Horario | 6AM-2PM Colombia |
| Estadísticas | Solo de sus 3 activos |

### Básico ($29.900/mes)
| Característica | Valor |
|---------------|-------|
| Activos | 6 (+V75, USD/JPY, Plata) |
| Horario | 6AM-2PM Colombia |
| Estadísticas | Solo de sus 6 activos |

### Premium ($59.900/mes)
| Característica | Valor |
|---------------|-------|
| Activos | 11 (+V100, Jump75, GBP/USD, BTC, ETH) |
| Horario | **24/7** (incluye nocturno) |
| Estadísticas | Solo de sus 11 activos |

### Elite ($99.900/mes)
| Característica | Valor |
|---------------|-------|
| Activos | 17 (+Boom/Crash completos) |
| Horario | **24/7** (incluye nocturno) |
| Estadísticas | De TODOS los activos |

---

## 🖥️ Cambios en Frontend

### 1. Dashboard personalizado
- Header con icono del plan (👑💎⭐🎯)
- Nombre de usuario y plan
- Número de activos disponibles
- Indicador de acceso 24/7

### 2. Estadísticas personales
- "Tu Win Rate" en lugar de win rate global
- "Tus Wins" / "Tus Loss"
- Solo cuenta operaciones de sus activos

### 3. StatsSection mejorado
- Info del usuario y plan
- Detalles de lo que incluye su plan
- Botón para mejorar plan (si no es Elite)

---

## 🔑 Identificación del Usuario

El usuario se identifica por su **email**:
```javascript
// Frontend envía:
const identifier = user.email || user.id;
fetch(`/api/dashboard/${encodeURIComponent(identifier)}`);

// Al marcar señales:
body: { userId: user.email || user.id, status: 'WIN', tpHit: 2 }
```

---

## 📈 Flujo de Datos

```
Usuario se loguea (email: juan@test.com)
         ↓
Frontend llama: /api/dashboard/juan@test.com
         ↓
Backend busca suscripción de juan@test.com
         ↓
Backend obtiene plan: "basico"
         ↓
Backend filtra activos según PLANS.basico.assets
         ↓
Backend filtra señales solo de esos activos
         ↓
Backend calcula estadísticas SOLO de esas señales
         ↓
Frontend muestra dashboard personalizado
```

---

## 💾 Persistencia de Estadísticas

Las estadísticas se guardan en la base de datos por usuario:
- Tabla `trading_reports` con `user_id`
- Cada operación marcada (WIN/LOSS) se guarda con el email del usuario
- Los reportes del módulo `ReportsSection` ya usan el userId

---

## 📱 Vista del Dashboard

```
┌─────────────────────────────────────────────┐
│  ⭐ Básico                                  │
│  juan · 6 activos · Horario diurno          │
├─────────────────────────────────────────────┤
│  Tu Win Rate   Activas   Tus Wins   Tus Loss │
│     67%           2         10         5    │
├─────────────────────────────────────────────┤
│  [Gráfico de velas - Solo activos del plan] │
├─────────────────────────────────────────────┤
│  Señales activas (solo de tus activos)      │
└─────────────────────────────────────────────┘
```

---

## ✅ Beneficios

1. **Cada usuario ve SUS resultados** - No se mezclan con otros
2. **Estadísticas relevantes** - Solo de activos que puede operar
3. **Privacidad** - Datos separados por usuario
4. **Motivación** - Ver progreso personal
5. **Claridad** - Sabe exactamente qué incluye su plan

---

## 🚀 Deployment

```bash
git add .
git commit -m "v20: Dashboard personalizado por usuario con estadísticas individuales"
git push origin main
```

Railway y Vercel se actualizarán automáticamente.
