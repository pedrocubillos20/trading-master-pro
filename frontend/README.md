# Frontend - Trading Master Pro

## 🚀 Deploy en Vercel

### 1. Variables de Entorno
```
VITE_API_URL=https://trading-master-pro-production.up.railway.app
VITE_SUPABASE_URL=https://mtzycmqtxdvoazomipye.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
```

### 2. Build Command
```
npm run build
```

### 3. Output Directory
```
dist
```

## 📁 Estructura

```
frontend/
├── src/
│   ├── App.jsx            # Router principal
│   ├── Dashboard.jsx      # Dashboard con señales y ELISA
│   ├── ReportsSection.jsx # Reportes y estadísticas
│   ├── Login.jsx          # Autenticación
│   ├── AdminPanel.jsx     # Panel admin
│   ├── Pricing.jsx        # Planes y precios
│   └── config/plans.js    # Config de planes
│
├── public/
│   ├── Modelosmc/         # Tutorial modelos SMC
│   ├── ElisaIAPro/        # Landing ELISA
│   └── ofertaelisaIA/     # Página oferta
│
└── vercel.json            # Rewrites para subpáginas
```

## 🔧 Desarrollo Local

```bash
npm install
npm run dev
```

## 📱 Rutas

| Ruta | Descripción |
|------|-------------|
| `/` | Dashboard principal |
| `/admin` | Panel de administración |
| `/modelosmc` | Tutorial modelos SMC |
| `/elisaiapro` | Landing ELISA IA Pro |
| `/ofertaelisaia` | Página de oferta |

## 🎨 Tecnologías

- React 18
- Vite
- Tailwind CSS
- Supabase Auth
