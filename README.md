# 🤖 Trading Master Pro v14.0

**Plataforma de Señales de Trading con Smart Money Concepts (SMC) + ELISA IA**

![Version](https://img.shields.io/badge/version-14.0-blue)
![React](https://img.shields.io/badge/React-18.2-61dafb)
![Node](https://img.shields.io/badge/Node-18+-green)

---

## 📋 Descripción

Trading Master Pro es una plataforma de análisis técnico basada en **Smart Money Concepts (SMC)** que proporciona señales de trading en tiempo real para diversos activos sintéticos y forex.

### ✨ Características Principales

- 🎯 **6 Modelos SMC** - MTF Confluence, CHoCH Pullback, BOS Continuation, Zone Touch, Boom Spike, Crash Spike
- 🤖 **ELISA IA** - Asistente inteligente con OpenAI para análisis y mentoría
- 📊 **9 Activos** - Step Index, V75, XAU, GBP, BTC, Boom 500/1000, Crash 500/1000
- 📱 **Telegram** - Notificaciones en tiempo real
- 📈 **Sistema de Aprendizaje** - Mejora automática basada en resultados
- 💳 **Suscripciones** - Planes Free, Básico, Premium y Elite

---

## 🏗️ Arquitectura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    FRONTEND     │────▶│     BACKEND     │────▶│   SERVICIOS     │
│    (Vercel)     │◀────│    (Railway)    │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
   React + Vite            Node.js               Deriv WebSocket
   Tailwind CSS            Express               OpenAI API
   Supabase Auth           WebSocket             Telegram Bot
                           SMC Engine            Supabase DB
```

---

## 📦 Estructura del Proyecto

```
trading-platform/
├── backend/                 # Servidor Node.js
│   ├── index.js            # Servidor principal (3500+ líneas)
│   ├── package.json        # Dependencias
│   ├── data/
│   │   └── smc-models.json # Modelos SMC
│   └── README.md           # Documentación backend
│
├── frontend/               # Aplicación React
│   ├── src/
│   │   ├── App.jsx        # Componente principal
│   │   ├── Dashboard.jsx  # Dashboard
│   │   ├── Login.jsx      # Login
│   │   ├── AdminPanel.jsx # Panel admin
│   │   └── Pricing.jsx    # Planes
│   ├── package.json       # Dependencias
│   └── README.md          # Documentación frontend
│
└── README.md              # Este archivo
```

---

## 🚀 Instalación Rápida

### 1. Clonar Repositorio
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
npm start
```

### 3. Configurar Frontend
```bash
cd frontend
npm install
cp .env.example .env
# Editar .env con tus credenciales
npm run dev
```

---

## 🔧 Variables de Entorno

### Backend (Railway)
| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto del servidor |
| `DERIV_APP_ID` | App ID de Deriv |
| `OPENAI_API_KEY` | API Key de OpenAI |
| `SUPABASE_URL` | URL de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key |
| `TELEGRAM_BOT_TOKEN` | Token del bot |
| `TELEGRAM_CHAT_ID` | ID del chat |

### Frontend (Vercel)
| Variable | Descripción |
|----------|-------------|
| `VITE_API_URL` | URL del backend |
| `VITE_SUPABASE_URL` | URL de Supabase |
| `VITE_SUPABASE_ANON_KEY` | Anon Key |

---

## 📊 Modelos SMC

| Modelo | Score | Dirección | Requisitos |
|--------|-------|-----------|------------|
| MTF_CONFLUENCE | 95-100 | Ambas | M5=H1 + Pullback |
| CHOCH_PULLBACK | 85-90 | Ambas | CHoCH + Pullback |
| BOS_CONTINUATION | 80 | Ambas | BOS + MTF |
| ZONE_TOUCH | 78 | Ambas | OB + Rechazo + MTF |
| BOOM_SPIKE | 70-95 | LONG | Estructura + Demanda |
| CRASH_SPIKE | 70-95 | SHORT | Estructura + Supply |

---

## 💳 Planes de Suscripción

| Plan | Precio COP | Precio USD | Activos |
|------|------------|------------|---------|
| Free Trial | $0 | $0 | Todos (5 días) |
| Básico | $29,900 | $9 | Step, V75, XAU, BTC |
| Premium | $59,900 | $19 | + GBP |
| Elite | $99,900 | $29 | + Boom/Crash |

---

## 🌐 Despliegue

### Backend → Railway
```bash
cd backend
railway login
railway link
railway up
```

### Frontend → Vercel
```bash
cd frontend
vercel --prod
```

---

## 📱 Funcionalidades

### Dashboard
- 📊 Gráfico de velas en tiempo real
- 🎯 Panel de señales activas con Entry/SL/TP
- 📈 Indicadores M5/H1 de estructura
- 💰 Estadísticas de Win/Loss
- ✅ Botones Win/Loss para registrar resultados

### ELISA IA Chat
- 💬 Asistente IA 24/7 powered by OpenAI
- 📚 Mentoría de trading (psicotrading, plan, simulador)
- 🧠 Explicación de patrones SMC
- ✅ Control de operaciones (máx 10/día)

### Admin Panel (/admin)
- 👥 Gestión de usuarios y suscripciones
- 📊 Estadísticas del sistema
- 🔧 Configuración de parámetros
- 📈 Métricas de rendimiento

---

## 🔌 APIs Externas

| Servicio | Uso |
|----------|-----|
| **Deriv** | WebSocket para datos de mercado en tiempo real |
| **OpenAI** | GPT-4 para ELISA IA |
| **Supabase** | Autenticación y base de datos |
| **Telegram** | Notificaciones de señales |

---

## 📞 Soporte

- 💬 Telegram: @TradingMasterProSupport
- 📧 Email: soporte@tradingmasterpro.com

---

## 📄 Licencia

Propiedad de Trading Master Pro © 2024-2026. Todos los derechos reservados.

---

**Desarrollado con ❤️ por el equipo de Trading Master Pro**
