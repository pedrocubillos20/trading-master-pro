# Trading Master Pro v14.0 - Frontend

## 📦 Estructura del Proyecto

```
frontend/
├── src/
│   ├── App.jsx           # Componente principal (rutas y auth)
│   ├── Dashboard.jsx     # Dashboard principal (942 líneas)
│   ├── Login.jsx         # Pantalla de login
│   ├── Pricing.jsx       # Planes y precios
│   ├── AdminPanel.jsx    # Panel de administración
│   ├── config/
│   │   └── plans.js      # Configuración de planes
│   ├── public/
│   │   └── elisa.png     # Avatar de ELISA
│   ├── main.jsx          # Entry point
│   └── index.css         # Estilos Tailwind
├── index.html            # HTML principal
├── package.json          # Dependencias
├── vite.config.js        # Configuración Vite
├── tailwind.config.js    # Configuración Tailwind
├── postcss.config.js     # PostCSS
├── vercel.json           # Configuración Vercel
└── .env.example          # Variables de entorno ejemplo
```

## 🔧 Variables de Entorno

Crear archivo `.env` en la raíz del frontend:

```env
# URL del Backend (Railway)
VITE_API_URL=https://tu-backend.up.railway.app

# Supabase (Auth)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx
```

## 🚀 Desarrollo Local

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Build para producción
npm run build

# Preview del build
npm run preview
```

## 🌐 Desplegar en Vercel

### Opción 1: Vercel CLI
```bash
npm i -g vercel
vercel login
vercel --prod
```

### Opción 2: GitHub Integration
1. Conecta tu repo en vercel.com
2. Configura las variables de entorno en Vercel:
   - `VITE_API_URL`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy automático en cada push

## 📱 Características

### Dashboard
- 📊 Gráfico de velas en tiempo real
- 🎯 Señales SMC con Entry/SL/TP1/TP2/TP3
- 📈 Indicadores de estructura (M5/H1)
- 💰 Win/Loss tracking
- 🔔 Notificaciones de señales

### ELISA IA
- 💬 Chat con IA para análisis
- 📚 Mentor de trading (psicotrading, plan, simulador)
- 🧠 Explicación de patrones SMC
- ✅ Control de operaciones

### Panel Admin (/admin)
- 👥 Gestión de usuarios
- 📊 Estadísticas del sistema
- 💳 Control de suscripciones
- 🔧 Configuración

### Planes de Suscripción
| Plan | Precio | Activos |
|------|--------|---------|
| Free Trial | $0 (5 días) | Todos |
| Básico | $29,900 COP | Step, V75, XAU, BTC |
| Premium | $59,900 COP | + GBP |
| Elite | $99,900 COP | + Boom/Crash |

## 🎨 Stack Tecnológico

- **React 18** - UI Library
- **Vite 5** - Build tool
- **Tailwind CSS** - Styling
- **Supabase** - Auth & Database
- **Vercel** - Hosting

## 📋 Rutas

| Ruta | Componente | Descripción |
|------|------------|-------------|
| `/` | Dashboard | Panel principal |
| `/admin` | AdminPanel | Administración |

## 🔌 Conexión con Backend

El frontend se conecta al backend en Railway mediante:

```javascript
const API_URL = import.meta.env.VITE_API_URL || 'https://trading-master-pro-production.up.railway.app';

// Endpoints principales
fetch(`${API_URL}/api/data`)           // Datos de mercado
fetch(`${API_URL}/api/signals`)        // Señales activas
fetch(`${API_URL}/api/ai/chat`)        // Chat con ELISA
fetch(`${API_URL}/api/subscription`)   // Suscripciones
```

## 🆘 Troubleshooting

### "CORS Error"
- Verificar que el backend tenga CORS habilitado
- El backend ya incluye `cors()` middleware

### "No se conecta al backend"
- Verificar VITE_API_URL en variables de entorno
- Verificar que el backend esté corriendo

### "Auth no funciona"
- Verificar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
- Verificar configuración de Auth en Supabase

### "Estilos no cargan"
- Ejecutar `npm install` nuevamente
- Verificar que Tailwind esté configurado

## 📄 Licencia

Propiedad de Trading Master Pro © 2024-2026
