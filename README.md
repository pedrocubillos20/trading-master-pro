# 🚀 Trading Master Pro

<div align="center">

![Trading Master Pro](https://img.shields.io/badge/Trading-Master%20Pro-22c55e?style=for-the-badge&logo=tradingview&logoColor=white)

**La plataforma definitiva para traders profesionales**

Análisis SMC con IA | Gestión de Riesgo | Psicotrading | Comunidad

[Demo](#) • [Documentación](#) • [Discord](#) • [Twitter](#)

</div>

---

## ✨ Características

### 📊 Análisis SMC con IA
- Análisis automático de gráficos con Claude AI
- Identificación de BOS, CHoCH, Order Blocks, FVG
- Zonas de liquidez y Optimal Trade Entry
- Múltiples timeframes

### 🧮 Gestión de Riesgo
- Calculadora de posición automática
- Ratio R:R en tiempo real
- Límites diarios configurables
- Proyección de ganancias

### 🧠 Psicotrading
- 12 estados emocionales
- Checklist de 14 puntos pre-trade
- Sistema GO/NO-GO inteligente
- Tracking de emociones por trade

### 📓 Diario de Trading
- Registro completo de operaciones
- Estadísticas automáticas
- Win rate, profit factor, rachas
- Gráficos de rendimiento

### 🔔 Sistema de Alertas
- Alertas de precio por activo
- Notificaciones en tiempo real
- Límites según plan

### 👥 Comunidad
- Compartir análisis
- Feed social
- Likes y comentarios
- Badges por plan

### 💎 Planes de Suscripción
- Free: 5 análisis/día
- Pro ($29/mes): Análisis ilimitados, alertas
- Elite ($79/mes): Todo + comunidad + broker
- Institucional ($299/mes): Multi-cuenta, API

---

## 🛠️ Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| Frontend | React 18 + Vite |
| Estilos | Tailwind CSS |
| Estado | Zustand |
| Backend | Node.js + Express |
| Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth |
| Pagos | Stripe |
| IA | Anthropic Claude API |
| Hosting | Vercel + Railway |

---

## 🚀 Instalación Rápida

### Prerrequisitos

- Node.js 18+
- npm o yarn
- Cuenta en Supabase
- Cuenta en Stripe
- API Key de Anthropic

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/trading-master-pro.git
cd trading-master-pro
```

### 2. Configurar Backend

```bash
cd backend
npm install
cp .env.example .env
# Editar .env con tus credenciales
```

### 3. Configurar Frontend

```bash
cd ../frontend
npm install
cp .env.example .env
# Editar .env con tus credenciales
```

### 4. Configurar Base de Datos

1. Crear proyecto en [Supabase](https://supabase.com)
2. Ir a SQL Editor
3. Ejecutar el contenido de `database/schema.sql`

### 5. Configurar Stripe

1. Crear cuenta en [Stripe](https://stripe.com)
2. Crear productos y precios para cada plan
3. Configurar webhook: `https://tu-api.com/api/stripe/webhook`

### 6. Ejecutar en Desarrollo

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Abrir http://localhost:5173

---

## 📁 Estructura del Proyecto

```
trading-master-pro/
├── frontend/
│   ├── src/
│   │   ├── components/     # Componentes React
│   │   ├── pages/          # Páginas
│   │   ├── services/       # APIs y Supabase
│   │   ├── store/          # Estado global (Zustand)
│   │   └── App.jsx
│   └── package.json
│
├── backend/
│   ├── src/
│   │   └── index.js        # API Express
│   └── package.json
│
├── database/
│   └── schema.sql          # Schema PostgreSQL
│
├── docker-compose.yml
└── README.md
```

---

## 🔐 Variables de Entorno

### Backend (.env)

```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### Frontend (.env)

```env
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_STRIPE_PUBLIC_KEY=pk_test_xxx
```

---

## 🌐 Deployment

### Frontend en Vercel

1. Conectar repositorio de GitHub
2. Configurar variables de entorno
3. Deploy automático

### Backend en Railway

1. Conectar repositorio
2. Configurar variables de entorno
3. Railway asigna URL automática

### Webhook de Stripe

Configurar endpoint: `https://tu-api.railway.app/api/stripe/webhook`

---

## 💰 Modelo de Negocio

| Plan | Precio | Margen Estimado |
|------|--------|-----------------|
| Free | $0 | Adquisición |
| Pro | $29/mes | ~$25/mes |
| Elite | $79/mes | ~$70/mes |
| Institucional | $299/mes | ~$280/mes |

**Costos estimados:**
- Hosting: ~$50/mes
- Claude API: ~$0.02/análisis
- Stripe: 2.9% + $0.30/transacción

---

## 🤝 Contribuir

1. Fork del repositorio
2. Crear rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit (`git commit -m 'Agregar nueva funcionalidad'`)
4. Push (`git push origin feature/nueva-funcionalidad`)
5. Abrir Pull Request

---

## 📄 Licencia

MIT License - ver [LICENSE](LICENSE)

---

## ⚠️ Disclaimer

Esta herramienta es solo para fines educativos y de apoyo al análisis. **No constituye asesoría financiera**. El trading conlleva riesgos significativos. Opera bajo tu propio riesgo.

---

<div align="center">

Hecho con ❤️ para traders que buscan mejorar

[⬆ Volver arriba](#-trading-master-pro)

</div>
