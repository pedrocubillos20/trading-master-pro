# MIGRACIÓN ELISA v15 → v16
## Zona Válida de Order Block

---

## 🆕 ¿QUÉ CAMBIÓ EN v16?

### NUEVO REQUISITO UNIVERSAL
Todos los 12 modelos ahora **REQUIEREN** una zona válida de Order Block:

| Dirección | Formación Requerida |
|-----------|---------------------|
| **LONG (BUY)** | 🔴 Vela ROJA + 🟢 Vela VERDE envolvente |
| **SHORT (SELL)** | 🟢 Vela VERDE + 🔴 Vela ROJA envolvente |

### ¿Por qué este cambio?
Esta es la **VERDADERA** formación de Order Block según Smart Money Concepts:
- La vela base representa una **trampa** (distribución/acumulación falsa)
- La vela envolvente **confirma** la intención real del Smart Money
- Sin esta formación, **NO HAY** Order Block válido

---

## 📋 PASOS DE MIGRACIÓN

### Paso 1: Respaldar archivos actuales
```bash
cp backend/data/smc-models.json backend/data/smc-models-v15-backup.json
cp backend/signal-generator-v15.js backend/signal-generator-v15-backup.js
cp frontend/public/Modelosmc/index.html frontend/public/Modelosmc/index-v15-backup.html
```

### Paso 2: Copiar nuevos archivos v16
```bash
cp backend/data/smc-models-v16.json backend/data/smc-models.json
cp backend/signal-generator-v16.js backend/signal-generator.js
cp frontend/public/Modelosmc/index-v16.html frontend/public/Modelosmc/index.html
```

### Paso 3: Actualizar imports en index.js

Buscar:
```javascript
const { generateSignalsV15, ACTIVE_MODELS_V15 } = require('./signal-generator-v15');
```

Cambiar por:
```javascript
const { generateSignalsV16, detectValidOBZone, ACTIVE_MODELS_V16 } = require('./signal-generator-v16');
```

### Paso 4: Actualizar llamadas a generateSignals

Buscar todas las llamadas a `generateSignalsV15()` y cambiar a `generateSignalsV16()`

---

## 🔧 FUNCIÓN NUEVA: detectValidOBZone()

Esta función detecta la formación de Order Block válida:

```javascript
/**
 * @param {Array} candles - Array de velas
 * @param {string} side - 'BUY' o 'SELL'
 * @param {number} lookback - Cuántas velas revisar (default: 10)
 * @returns {Object|null} - Info de zona válida o null
 */
const zone = detectValidOBZone(candles, 'BUY', 15);

// Retorna:
{
  valid: true,
  side: 'BUY',
  baseCandle: {...},      // Vela base (roja para BUY)
  engulfCandle: {...},    // Vela envolvente (verde para BUY)
  zoneHigh: 1.2345,       // Límite superior de la zona
  zoneLow: 1.2340,        // Límite inferior de la zona
  strength: 75,           // Fuerza relativa (0-100)
  candlesAgo: 3           // Hace cuántas velas se formó
}
```

---

## 📊 CAMBIOS EN SCORES

| Modelo | v15 Score | v16 Score | Nota |
|--------|-----------|-----------|------|
| MTF_CONFLUENCE | 95-100 | 95-100 | +2 bonus por zona reciente |
| OTE_ENTRY | 82-92 | 82-95 | +3 bonus por zona fuerte |
| CHOCH_PULLBACK | 85-95 | 85-95 | +2 bonus por zona reciente |
| INDUCEMENT | 80-90 | 80-92 | +2 bonus por zona fuerte |
| BREAKER_BLOCK | 78-90 | 78-90 | Sin cambio |
| LIQUIDITY_GRAB | 78-88 | 78-90 | +2 bonus por zona reciente |
| BOS_CONTINUATION | 75-85 | 75-88 | +3 bonus por zona reciente |
| SMART_MONEY_TRAP | 75-85 | 75-87 | +2 bonus por zona fuerte |
| FVG_ENTRY | 72-80 | 72-85 | +3+2 bonuses |
| OB_ENTRY | 72-85 | 72-88 | +2+1 bonuses |

---

## ⚠️ IMPACTO ESPERADO

### Menos señales, pero más precisas
- Las señales ahora requieren confirmación de zona OB válida
- Esto **reduce** señales falsas significativamente
- Las señales que sí pasan tienen mayor probabilidad de éxito

### Cambios en la lógica
```
ANTES (v15):
if (mtfConfluence && pullback && sideMatch) → SEÑAL

AHORA (v16):
if (mtfConfluence && pullback && sideMatch && validOBZone) → SEÑAL
```

---

## 🧪 VALIDACIÓN POST-MIGRACIÓN

### Test 1: Verificar detección de zona
```javascript
const testCandles = [
  { open: 100, close: 98, high: 101, low: 97 },  // Roja
  { open: 97, close: 102, high: 103, low: 96 }   // Verde envolvente
];

const zone = detectValidOBZone(testCandles, 'BUY', 5);
console.log(zone); // Debe retornar objeto con valid: true
```

### Test 2: Verificar que señales requieren zona
```javascript
// Sin zona válida → No debe generar señal
const signalsNoZone = generateSignalsV16({
  candlesM5: candlesSinFormacionOB,
  // ... otros params
});
console.log(signalsNoZone.length); // Debe ser 0 o muy bajo
```

---

## 📁 ARCHIVOS v16

| Archivo | Ubicación |
|---------|-----------|
| Signal Generator | `backend/signal-generator-v16.js` |
| Modelos JSON | `backend/data/smc-models-v16.json` |
| Documentación HTML | `frontend/public/Modelosmc/index-v16.html` |
| Esta guía | `MIGRATION-v16.md` |

---

## 🔄 ROLLBACK (si es necesario)

```bash
# Restaurar v15
cp backend/data/smc-models-v15-backup.json backend/data/smc-models.json
cp backend/signal-generator-v15-backup.js backend/signal-generator.js
cp frontend/public/Modelosmc/index-v15-backup.html frontend/public/Modelosmc/index.html
```

---

**ELISA v16.0** - Zona Válida de Order Block
*Actualizado: 9 de Enero 2026*
