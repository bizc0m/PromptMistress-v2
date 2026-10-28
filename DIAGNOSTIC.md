# PromptMistress Diagnostic

**Problème: "Pourquoi tout les prompts ne sont pas importés?"**

## Checklist

### 1. Extension installed?
```
chrome://extensions
```
- Chercher "PromptMistress" 
- Status: **Enabled** (doit être allumé)
- Si absent: installer depuis le dossier `browser-extension/`

### 2. Onglets ouverts?
Deux sites DIFFÉRENTS ne peuvent pas partager une fenêtre:
- Tab 1: https://chatgpt.com (ouvert ET visible)
- Tab 2: https://perplexity.ai (ouvert ET visible)

### 3. Cliquer le bouton "Capturer"
Onglet PromptMistress → "Importer" tab:
1. Clique "PM Capturer →"
2. Status badge en bas à droite change:
   - "PM ..." = en cours de listing
   - "PM 42" = 42 conversations trouvées
   - "PM ↑10" = 10 envoyées au serveur

### 4. Vérifier les erreurs
Ouvre console (F12) sur l'onglet Importer:
```javascript
// Copie-colle dans console:
console.log(localStorage)
```

### 5. Vérifier le staging serveur
Terminal:
```bash
TOKEN=$(curl -s http://127.0.0.1:18431/api/capture-token | jq -r .token)
curl -s http://127.0.0.1:18431/api/stage \
  -H "X-Capture-Token: $TOKEN" \
  -H "Origin: chrome-extension://abc..." | jq .
```

## Limites connues
- Max 20,000 rows en staging
- Max 10,000 à la fois en import
- Si déjà importés = skipped (pas importés 2x)

## Logs
```bash
tail -f ~/.promptmistress-v2/logs/PromptMistress.log
```

## Contacter support
Messages d'erreur spécifiques?
Combien de prompts attendus vs reçus?
