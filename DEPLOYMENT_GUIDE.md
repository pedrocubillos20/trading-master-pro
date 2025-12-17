# 🚀 TRADING MASTER PRO - GUÍA COMPLETA DE DEPLOYMENT

## 📁 ESTRUCTURA DEL PROYECTO

```
trading-master-pro/
├── frontend/                    # Aplicación React
│   ├── src/
│   │   ├── components/         # Componentes reutilizables
│   │   ├── pages/              # Páginas principales
│   │   ├── hooks/              # Custom hooks
│   │   ├── services/           # APIs y servicios
│   │   ├── store/              # Estado global (Zustand)
│   │   ├── utils/              # Utilidades
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
│
├── backend/                     # API con Node.js
│   ├── src/
│   │   ├── routes/             # Rutas de la API
│   │   ├── controllers/        # Lógica de negocio
│   │   ├── models/             # Modelos de base de datos
│   │   ├── middleware/         # Autenticación, validación
│   │   ├── services/           # Servicios externos (Stripe, AI)
│   │   └── index.js
│   ├── package.json
│   └── .env.example
│
├── database/                    # Scripts de base de datos
│   └── schema.sql
│
├── docker-compose.yml          # Para desarrollo local
├── README.md
└── .gitignore
```

---

## 🛠️ TECNOLOGÍAS A USAR

| Componente | Tecnología | Por qué |
|------------|------------|---------|
| Frontend | React + Vite | Rápido, moderno, fácil de desplegar |
| Estilos | Tailwind CSS | Diseño rápido y consistente |
| Estado | Zustand | Simple y potente |
| Backend | Node.js + Express | JavaScript fullstack |
| Base de datos | Supabase (PostgreSQL) | Gratis, fácil, incluye Auth |
| Autenticación | Supabase Auth | Integrado, seguro |
| Pagos | Stripe | Estándar de la industria |
| IA | Anthropic Claude API | Análisis SMC |
| Hosting Frontend | Vercel | Gratis, automático |
| Hosting Backend | Railway / Render | Fácil, económico |
| Dominio | Namecheap / GoDaddy | ~$10/año |

---

## 📋 PASO A PASO PARA SUBIR LA PLATAFORMA

### PASO 1: Crear cuentas (GRATIS)

1. **GitHub** - https://github.com (para el código)
2. **Supabase** - https://supabase.com (base de datos + auth)
3. **Vercel** - https://vercel.com (hosting frontend)
4. **Railway** - https://railway.app (hosting backend)
5. **Stripe** - https://stripe.com (pagos)
6. **Anthropic** - https://console.anthropic.com (API de IA)

### PASO 2: Configurar Supabase

1. Crear nuevo proyecto en Supabase
2. Ir a SQL Editor y ejecutar el schema (te lo creo abajo)
3. Copiar las credenciales:
   - Project URL
   - Anon Key
   - Service Role Key

### PASO 3: Configurar Stripe

1. Crear cuenta en Stripe
2. Crear productos y precios para cada plan
3. Copiar las API Keys (test y live)
4. Configurar webhook endpoint

### PASO 4: Obtener API Key de Claude

1. Ir a https://console.anthropic.com
2. Crear API Key
3. Guardar de forma segura

### PASO 5: Subir el código

```bash
# Clonar/crear el repositorio
git clone tu-repositorio
cd trading-master-pro

# Instalar dependencias
cd frontend && npm install
cd ../backend && npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Probar localmente
npm run dev
```

### PASO 6: Desplegar Frontend en Vercel

1. Conectar repositorio de GitHub a Vercel
2. Configurar variables de entorno
3. Deploy automático con cada push

### PASO 7: Desplegar Backend en Railway

1. Conectar repositorio de GitHub
2. Configurar variables de entorno
3. Railway te da una URL automática

---

## 💰 COSTOS ESTIMADOS

| Servicio | Plan Gratis | Plan Pagado |
|----------|-------------|-------------|
| Vercel | 100GB bandwidth | $20/mes Pro |
| Supabase | 500MB DB, 50K auth | $25/mes Pro |
| Railway | $5 crédito/mes | ~$10-20/mes |
| Stripe | 2.9% + $0.30 por transacción | Igual |
| Claude API | - | ~$0.01-0.03 por análisis |
| Dominio | - | ~$10/año |

**Total inicial:** $0 (con planes gratis)
**Total en producción:** ~$50-100/mes + costos de API

---

## 🔐 VARIABLES DE ENTORNO NECESARIAS

```env
# Supabase
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
VITE_STRIPE_PUBLIC_KEY=pk_live_...

# Claude AI
ANTHROPIC_API_KEY=sk-ant-...

# App
VITE_API_URL=https://tu-backend.railway.app
NODE_ENV=production
```

---

## 📱 PARA DESPUÉS (Mejoras futuras)

1. **App Móvil** - React Native o Flutter
2. **Bot de Telegram** - Node.js + Telegraf
3. **Conexión real a brokers** - APIs de MT4/MT5
4. **Precios en tiempo real** - WebSockets
5. **Sistema de afiliados** - Referral codes
6. **Multi-idioma** - i18n

---

¡Ahora te creo todos los archivos del proyecto!
