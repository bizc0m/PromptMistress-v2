# PromptMistress V2 — Régressions à surveiller

## R001 — Lancement de l'app macOS
- Description : L'app doit démarrer, lancer Node, puis afficher l'interface locale.
- Fichiers concernés : binaire Swift, `scripts/server.mjs`, `Runtime.plist`.
- Test : `open ~/.promptmistress-v2/PromptMistress.app && sleep 3 && curl -s http://127.0.0.1:18431/health`.
- Validé le : 2026-09-15

## R002 — Onglet Importer
- Description : Le bookmarklet, le drop JSON et l'import doivent fonctionner.
- Fichiers concernés : `capture.html`, `scripts/capture-ui.js`.
- Test : ouvrir `/capture`, charger un export JSON, vérifier que les lignes apparaissent et s'importent.
- Validé le : 2026-09-14

## R003 — Bibliothèque unifiée
- Description : La liste, les filtres, la fiche, les exports et les annotations doivent fonctionner.
- Fichiers concernés : `workspace.html`, `scripts/workspace-ui.js`, `styles/workspace.css`.
- Test : ouvrir `/workspace`, vérifier le chargement, la recherche simple/booléenne, l'ouverture d'une fiche, l'enregistrement d'un tag.
- Validé le : 2026-09-14

## R004 — Modules Node et Python
- Description : Les deux modules doivent démarrer et répondre.
- Fichiers concernés : `scripts/server.mjs`, `projects/project-a-chatvault/pv.js`, `projects/project-b-python-prompt-vault/src/prompt_vault/ui/server.py`.
- Test : `curl -s http://127.0.0.1:18431/health` retourne `ready:true` avec `node` et `python` non null.
- Validé le : 2026-09-15

## R005 — Build automatisé
- Description : Le script `scripts/build.sh` doit produire une app installable et les archives de distribution.
- Fichiers concernés : `scripts/build.sh`, `native/PromptMistress.swift`.
- Test : `./scripts/build.sh 0.2.0 && npm test`.
- Validé le : 2026-09-15

## R006 — Extension navigateur
- Description : L'extension doit exposer les fichiers requis et un manifeste V3 valide.
- Fichiers concernés : `browser-extension/manifest.json`, `browser-extension/content.js`.
- Test : vérifier le manifeste avec `node scripts/verify.mjs`.
- Validé le : 2026-09-15

## R007 — Recherche, préférences et Refresh (2026-09-20)
- Test Chrome réel sur le serveur du dépôt, port 18431 : « claude » saisi sans Entrée, 7 053 → 165 résultats.
- Préférences : Enregistrer affiche « Préférences enregistrées. » puis ferme le dialogue.
- Simple + Texte : « mirae », 37 résultats sans Texte → 422 avec Texte ; 14 106 versions chargées. Calcul momentanément bloquant.
- Trois clics Refresh terminés : 1 419 conversations et 5 634 prompts stables ; 9 218 fichiers inchangés (chemins, tailles, dates de modification).
- Limite : Refresh relit les sources ; un test isolé d’import a aussi conservé une seule conversation après trois versions successives d’une session.

## R008 — Titres générés (A)
- Rejeter les titres courts (< 10 caractères), JSON, lignes numérotées, code et questions vagues signalées ; chercher le prochain message utilisateur exploitable.
- À défaut : « Conversation — <identifiant source> ». Les messages et identifiants restent conservés.
- Test d’import isolé : dix entrées invalides suivies d’un message pertinent donnent ce dernier comme titre ; messages initiaux conservés ; repli sans titre testé.
- Le lecteur des prompts extraits applique le même filtre aux titres proposés.
- Application locale : seules les lignes de titre générées ont été remplacées, avec contrôle identique du reste de chaque fiche et relecture après écriture. Sauvegarde locale préalable du vault.
- Le premier redémarrage a lancé l’import automatique existant : trois identifiants supplémentaires, aucun identifiant antérieur supprimé. Import ensuite suspendu pour limiter les mises à jour aux titres.
- Redémarrages de test : processus `node scripts/server.mjs` ciblé (le motif large touche aussi Codex), `PROMPTMISTRESS_NO_AUTOIMPORT=1 npm start > /tmp/pm.log 2>&1`.
- Rejeu d’une vraie session Claude : « tu voios quoi ? » devient « pourquoi il manque tout les prompts ? » ; sorties de commandes et code Swift écartés.

## R009 — Sessions Claude datées (B, 2026-09-20)
- Titre généré : `[YYYY-MM-DD HH:mm:ss UTC] <titre>` ; début de session, jamais la date d’import ou la dernière mise à jour. Préfixe pour rester visible dans les colonnes étroites.
- Une date manquante ou invalide n’est pas inventée.
- Deux sessions au même intitulé et à des heures différentes restent distinctes. Trois réimports par session gardent titre, identifiant et nombre de conversations stables.
- Régression A rejouée avec les titres horodatés : JSON, titres courts, code et sorties terminal rejetés.
- 153 titres Claude existants mis à jour et relus ; aucun autre contenu de fiche modifié par cette migration.
- Les prompts extraits restent des entrées distinctes ; la date ne constitue pas une déduplication.
- Chrome : dates en tête visibles sur capture ; 153 conversations Claude, zéro groupe de titres identiques après migration. `node scripts/verify.mjs` : PASS, zéro échec.
