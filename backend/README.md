# Trading Master Pro v14.0 - Backend

## 📦 Contenido del ZIP

```
backend/
├── index.js          # Servidor principal (3500+ líneas)
├── package.json      # Dependencias
├── .env.example      # Variables de entorno ejemplo
├── railway.json      # Configuración Railway
├── data/
│   └── smc-models.json  # Modelos SMC para ELISA
├── elisa-ai.js       # Módulo ELISA IA
└── elisa-integration.js # Integración ELISA
```

## 🔧 Variables de Entorno Requeridas en Railway

| Variable | Descripción | Dónde obtenerla |
|----------|-------------|-----------------|
| `PORT` | Puerto del servidor | Railway lo asigna automático |
| `DERIV_APP_ID` | App ID de Deriv | https://app.deriv.com/account/api-token |
| `OPENAI_API_KEY` | API Key OpenAI | https://platform.openai.com/api-keys |
| `SUPABASE_URL` | URL proyecto | https://app.supabase.com |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key | Supabase → Settings → API |
| `TELEGRAM_BOT_TOKEN` | Token del bot | @BotFather en Telegram |
| `TELEGRAM_CHAT_ID` | ID del chat | Usar @userinfobot |

## 🚀 Cómo Desplegar en Railway

### Opción 1: Git Push (Recomendado)
```bash
cd ~/Desktop/new\ flim/trading-platform

# Extraer el ZIP y reemplazar backend/
# Luego:
git add .
git commit -m "v14.0 - Trading Master Pro"
git push origin main
```

### Opción 2: Railway CLI
```bash
railway login
railway link
railway up
```

## ✅ Verificar que funciona

Después del deploy, en los logs de Railway debes ver:

```
╔═══════════════════════════════════════════════════════╗
║   🤖 TRADING MASTER PRO v14.0 - ELISA AI              ║
╠═══════════════════════════════════════════════════════╣
║  Puerto: 3001                                         ║
║  OpenAI: ✅ Conectado                                 ║
║  Supabase: ✅ Conectado                               ║
║  Telegram: ✅ Configurado                             ║
║  Modelos SMC: 6 cargados                              ║
║  Aprendizaje: ✅ Activo                               ║
╚═══════════════════════════════════════════════════════╝

🔌 Conectando a Deriv WebSocket...
   App ID: 1089
   URL: wss://ws.derivws.com/websockets/v3
✅ Conectado a Deriv WebSocket

📊 Suscribiendo a activos:
   → Step (stpRNG)
   → V75 (R_75)
   → XAU (frxXAUUSD)
   → GBP (frxGBPUSD)
   → BTC (cryBTCUSD)
   → Boom1K (BOOM1000)
   → Boom500 (BOOM500)
   → Crash1K (CRASH1000)
   → Crash500 (CRASH500)

✅ Suscripciones enviadas - Esperando datos...

📊 [Step] M5: 100 velas cargadas
📊 [V75] M5: 100 velas cargadas
...
```

## 📋 Modelos SMC Incluidos

| Modelo | Score | Requisitos |
|--------|-------|------------|
| MTF_CONFLUENCE | 95-100 | M5=H1 + Pullback |
| CHOCH_PULLBACK | 85-90 | CHoCH + Pullback (NO MTF) |
| BOS_CONTINUATION | 80 | BOS + Pullback + MTF |
| ZONE_TOUCH | 78 | OB + Rechazo + MTF |
| BOOM_SPIKE | 70-95 | Estructura + Demanda (LONG) |
| CRASH_SPIKE | 70-95 | Estructura + Supply (SHORT) |

## 🆘 Troubleshooting

### "Supabase no configurado"
- Verifica que SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY estén correctas en Railway

### "No se conecta a Deriv"
- El App ID 1089 es el público de demo
- Verifica la conexión a internet del servidor

### "No llegan señales a Telegram"
- Verifica TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID
- El bot debe estar agregado al grupo/canal

### "ELISA no responde"
- Verifica OPENAI_API_KEY
- Si no hay API key, ELISA usa modo fallback local
