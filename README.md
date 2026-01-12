# 📊 Trading Master Pro v24.2

Sistema de señales de trading SMC (Smart Money Concepts) con IA integrada (ELISA).

## 🚀 Características

- **12 Modelos SMC**: MTF_CONFLUENCE, CHOCH_PULLBACK, BOS_CONTINUATION, BREAKER_BLOCK, INDUCEMENT, LIQUIDITY_GRAB, SMART_MONEY_TRAP, FVG_ENTRY, OB_ENTRY, OTE_ENTRY, BOOM_SPIKE, CRASH_SPIKE
- **ELISA AI**: Asistente de trading con recomendaciones personalizadas
- **Multi-Timeframe**: Análisis H1 + M5 para mayor precisión
- **Reportes Avanzados**: Capital simulado editable, gráficos de rendimiento, estadísticas por modelo/activo
- **Sistema de Planes**: ELITE, PREMIUM, STARTER con diferentes características

## 📁 Estructura del Proyecto

```
trading-platform/
├── backend/
│   ├── index.js              # Servidor principal (Express + SMC Engine)
│   ├── package.json          # Dependencias Node.js
│   ├── railway.json          # Configuración Railway
│   ├── supabase-schema.sql   # Schema de base de datos
│   └── .env.example          # Variables de entorno ejemplo
│
└── frontend/
    ├── src/
    │   ├── App.jsx           # Componente principal
    │   ├── Dashboard.jsx     # Dashboard principal
    │   ├── ReportsSection.jsx # Sección de reportes
    │   ├── Login.jsx         # Página de login
    │   ├── AdminPanel.jsx    # Panel de administración
    │   ├── Pricing.jsx       # Página de precios
    │   ├── main.jsx          # Entry point
    │   ├── index.css         # Estilos globales
    │   └── config/
    │       └── plans.js      # Configuración de planes
    │
    ├── public/
    │   ├── Modelosmc/        # Tutorial modelos SMC
    │   ├── ElisaIAPro/       # Página ELISA IA Pro
    │   ├── ofertaelisaIA/    # Página oferta ELISA
    │   └── elisa.png         # Logo ELISA
    │
    ├── index.html            # HTML principal
    ├── package.json          # Dependencias frontend
    ├── vite.config.js        # Configuración Vite
    ├── tailwind.config.js    # Configuración Tailwind
    ├── postcss.config.js     # Configuración PostCSS
    └── vercel.json           # Configuración Vercel (rewrites)
```

## 🛠️ Instalación

### Backend (Railway)

1. Crear proyecto en Railway
2. Conectar repositorio GitHub
3. Configurar variables de entorno:
   ```
   SUPABASE_URL=tu_url
   SUPABASE_KEY=tu_key
   DERIV_API_KEY=tu_api_key (opcional)
   ```
4. Deploy automático

### Frontend (Vercel)

1. Crear proyecto en Vercel
2. Conectar repositorio GitHub
3. Configurar variables de entorno:
   ```
   VITE_API_URL=https://tu-backend.railway.app
   VITE_SUPABASE_URL=tu_url
   VITE_SUPABASE_ANON_KEY=tu_key
   ```
4. Deploy automático

### Base de Datos (Supabase)

1. Crear proyecto en Supabase
2. Ejecutar `supabase-schema.sql` en el SQL Editor
3. Configurar autenticación (Email/Password)

## 📊 Modelos SMC

| # | Modelo | Score | Tier | Descripción |
|---|--------|-------|------|-------------|
| 1 | MTF_CONFLUENCE | 95-100 | S | Multi-timeframe H1+M5 alineados |
| 2 | CHOCH_PULLBACK | 85-95 | A | Cambio de carácter + pullback |
| 3 | BOS_CONTINUATION | 78-90 | A | Break of Structure + continuación |
| 4 | BREAKER_BLOCK | 80-93 | A | OB que falla se convierte en opuesto |
| 5 | INDUCEMENT | 80-92 | A | Barrido de liquidez (equal H/L) |
| 6 | LIQUIDITY_GRAB | 80-92 | A | Captura de liquidez rápida |
| 7 | SMART_MONEY_TRAP | 75-88 | B | Falso breakout/trampa institucional |
| 8 | FVG_ENTRY | 76-89 | B | Fair Value Gap entry |
| 9 | OB_ENTRY | 76-90 | B | Order Block directo |
| 10 | OTE_ENTRY | 90-98 | S | Optimal Trade Entry (61.8%-78.6%) |
| 11 | BOOM_SPIKE | 80-95 | A | Solo LONG para índices Boom |
| 12 | CRASH_SPIKE | 80-95 | A | Solo SHORT para índices Crash |

## 🔧 Correcciones v24.1

- **OB = Solo cuerpo**: El Order Block ahora es solo el cuerpo de la vela (no incluye mechas)
- **Pullback TOCA OB**: El precio debe tocar el OB, no solo estar "cerca"
- **SL en mecha del OB**: Stop Loss colocado en la mecha del OB (no arbitrario)
- **Confirmación obligatoria**: Se requiere engulfing o mecha de rechazo > 50%

## 📱 URLs

- **App Principal**: https://trading-master-pro.vercel.app
- **Tutorial SMC**: https://trading-master-pro.vercel.app/modelosmc
- **ELISA IA Pro**: https://trading-master-pro.vercel.app/elisaiapro
- **Oferta**: https://trading-master-pro.vercel.app/ofertaelisaia
- **Admin**: https://trading-master-pro.vercel.app/admin

## 📄 Licencia

Proyecto privado - Todos los derechos reservados.

## 📞 Soporte

WhatsApp: +57 300 000 0000
