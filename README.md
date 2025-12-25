# 🚀 Trading Master Pro v9.0

## SMC Institucional - Plataforma Completa

### 📊 Activos Soportados
- **Step Index** - Sintético
- **Volatility 75** - Sintético  
- **Volatility 100** - Sintético
- **Oro (XAU/USD)** - Commodity
- **GBP/USD** - Forex
- **Bitcoin (BTC/USD)** - Crypto

---

## ✨ Funcionalidades

### 🎯 Señales SMC
- Entry, Stop Loss, Take Profit claros
- Score de confianza (0-100)
- Modelos: REVERSAL, CONTINUATION
- Análisis: EQH/EQL, Sweep, Displacement, Order Block

### 🧠 Coach de Trading
- Checklist pre-operación
- Evaluación antes de operar
- Requisitos obligatorios marcados
- Recomendación automática

### 📋 Seguimiento de Operaciones
- Registro de trades activos
- PnL en tiempo real
- Historial de operaciones
- Cierre con TP/SL

### 💬 Chat en Vivo
- Comunicación entre traders
- Notas y observaciones

### 📈 Plan de Trading
- Riesgo máximo por operación
- Pérdida diaria máxima
- Ratio R:R objetivo
- Horarios de trading

---

## 📁 Estructura del Proyecto

```
trading-master-pro/
├── backend/
│   ├── index.js           ← Servidor principal
│   ├── package.json
│   ├── railway.json       ← Config Railway
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── Dashboard.jsx  ← Dashboard principal
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── .env.example
│
└── README.md
```

---

## 🔧 Instalación

### Backend (Railway)

1. Sube la carpeta `backend/` a GitHub
2. En Railway:
   - New Project → Deploy from GitHub
   - Selecciona el repo
   - **Root Directory:** `backend`
   - Variables de entorno:
     ```
     PORT=3001
     DERIV_APP_ID=117347
     ```

### Frontend (Vercel)

1. Sube la carpeta `frontend/` a GitHub
2. En Vercel:
   - New Project → Import from GitHub
   - **Root Directory:** `frontend`
   - Variables de entorno:
     ```
     VITE_API_URL=https://tu-backend.up.railway.app
     ```

---

## 🔌 API Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/dashboard` | GET | Dashboard completo |
| `/api/analyze/:symbol` | GET | Análisis de activo |
| `/api/signals` | GET | Señales recientes |
| `/api/operations` | GET/POST | Operaciones |
| `/api/operations/:id` | PUT | Actualizar operación |
| `/api/coach/checklist` | GET | Checklist trading |
| `/api/coach/evaluate` | POST | Evaluar checklist |
| `/api/trading-plan` | GET/PUT | Plan de trading |
| `/api/chat` | GET/POST | Mensajes chat |

---

## 📱 Uso

1. **Selecciona un activo** de la lista izquierda
2. **Revisa la señal** en el panel derecho
3. **Usa el Coach** (botón 🧠) antes de operar
4. **Abre la operación** con el botón
5. **Cierra** cuando alcance TP o SL

---

## ⚠️ Importante

- Este sistema es para **fines educativos**
- No es consejo financiero
- Opera con responsabilidad
- Usa gestión de riesgo adecuada

---

## 📞 Soporte

Creado con ❤️ para traders SMC

v9.0 - Diciembre 2025
