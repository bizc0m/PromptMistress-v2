#!/usr/bin/env bash
set -euo pipefail

# Signature développeur Apple + notarisation pour PromptMistress.app
# Prérequis : certificat "Developer ID Application" dans le Keychain,
#             App Store Connect API key avec droits "Developer".
#
# Variables d'environnement :
#   SIGN_IDENTITY            nom du certificat (ex: "Developer ID Application: Mon Nom (TEAM_ID)")
#   AC_USERNAME              Apple ID (deprecated, préférer API key)
#   AC_PASSWORD              mot de passe app-specific (deprecated)
#   AC_API_KEY_ID            App Store Connect API Key ID
#   AC_API_KEY_ISSUER_ID     App Store Connect API Key Issuer ID
#   AC_API_KEY_PATH          chemin vers le fichier .p8 de la clé
#   TEAM_ID                  équipe Apple (optionnel)
#   APP_PATH                 chemin vers PromptMistress.app (défaut: ~/.promptmistress-v2/PromptMistress.app)
#   ZIP_PATH                 chemin du zip à notariser (défaut: dist/PromptMistress-*.zip)

APP_PATH="${APP_PATH:-${HOME}/.promptmistress-v2/PromptMistress.app}"
SIGN_IDENTITY="${SIGN_IDENTITY:-}"
TEAM_ID="${TEAM_ID:-}"
ZIP_PATH="${ZIP_PATH:-}"

if [[ -z "$SIGN_IDENTITY" ]]; then
  echo "SIGN_IDENTITY requis." >&2
  exit 1
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "App introuvable : $APP_PATH" >&2
  exit 1
fi

echo "Signature de $APP_PATH avec '$SIGN_IDENTITY'..."
codesign --force --deep --sign "$SIGN_IDENTITY" \
  --options runtime \
  --entitlements native/entitlements.plist \
  --timestamp "$APP_PATH"

echo "Vérification de la signature..."
codesign --verify --verbose "$APP_PATH"

# Création d'un zip pour notarisation si non fourni
if [[ -z "$ZIP_PATH" || ! -f "$ZIP_PATH" ]]; then
  ZIP_PATH="/tmp/PromptMistress-notarize.zip"
  echo "Création du zip de notarisation : $ZIP_PATH"
  ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"
fi

# Notarisation
NOTARY_ARGS=(--file "$ZIP_PATH" --wait)
if [[ -n "$AC_API_KEY_ID" && -n "$AC_API_KEY_ISSUER_ID" && -n "$AC_API_KEY_PATH" ]]; then
  NOTARY_ARGS+=(--key "$AC_API_KEY_PATH" --key-id "$AC_API_KEY_ID" --issuer "$AC_API_KEY_ISSUER_ID")
elif [[ -n "$AC_USERNAME" && -n "$AC_PASSWORD" ]]; then
  NOTARY_ARGS+=(--apple-id "$AC_USERNAME" --password "$AC_PASSWORD")
  [[ -n "$TEAM_ID" ]] && NOTARY_ARGS+=(--team-id "$TEAM_ID")
else
  echo "Clés de notarisation manquantes. Fournir AC_API_KEY_ID/ISSUER_ID/PATH ou AC_USERNAME/PASSWORD." >&2
  exit 1
fi

echo "Soumission à la notarisation..."
xcrun notarytool submit "${NOTARY_ARGS[@]}"

echo "Application du ticket de notarisation..."
xcrun stapler staple "$APP_PATH"

echo "OK — $APP_PATH signé et notarisé."
