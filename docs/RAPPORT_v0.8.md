# Rapport v0.8 « Ensemble » — Partie rapide, classement validé, anglais

Date : 2026-10-09 · Version : 0.8.0-alpha · Tests : `vitest` 89/89 · `tsc` + `npm run build` OK · fonction Edge bundlée et testée (scripts/edge-smoke.mjs).

## 1. Ce que la v0.8 apporte

### Partie rapide (salons publics)
- **Bouton « ⚡ Partie rapide · trouver un partenaire »** dans « Jouer à deux » : rejoint automatiquement le premier joueur qui attend (même version du jeu, même mode de préférence) ; sinon ouvre une partie **publique** et attend. L'hôte peut toujours démarrer avec une IA partenaire.
- **Liste des parties publiques en attente** sur le même écran (pseudo de l'hôte, mode), rafraîchie toutes les 8 s, bouton « Rejoindre » par ligne.
- Dans le lobby, l'hôte bascule sa partie entre **« Visible par tous »** et **« Sur invitation »** ; une partie pleine disparaît de la liste, elle y revient si l'invité repart.
- Côté base : appariement atomique (`quick_join`, verrou de ligne : deux joueurs ne rejoignent jamais le même salon), battement de cœur de l'hôte toutes les 40 s (un salon silencieux 2 min disparaît), libération de la place quand l'invité quitte (`free_slot`, et l'invité efface sa propre ligne), une seule partie ouverte par hôte.

### Classement du défi du jour, validé par le serveur
- Le jeu enregistre chaque **commande acceptée avec son tick** (journal de rejeu). Les commandes de test sont refusées dans le défi.
- En fin de défi, le client envoie **le journal** (pas le score) à la fonction Edge `submit-daily`. Elle reconstruit la partie du jour (même graine, mêmes armées), **la rejoue avec exactement le même code de simulation** et enregistre le score qu'elle a calculé elle-même. Un score falsifié est impossible sans rejouer réellement la partie.
- Supabase limite une fonction à 2 s de CPU : les parties longues sont vérifiées **en plusieurs passes** (point de reprise JSON de l'état dans `daily_pending`, le client rappelle la fonction avec l'identifiant du rejeu). Mesure : une partie de 36 vagues se rejoue en 0,55 s sur PC ; le test de fumée valide 1 passe en mode normal et 35 passes avec un budget réduit à 4 ms, même résultat.
- Classement : vague atteinte puis temps (plus court = mieux), meilleur score par joueur et par jour, lecture par tous les joueurs connectés (anonymes compris), **aucune écriture possible depuis le client** (RLS sans politique d'écriture ; la fonction écrit avec la clé service_role injectée par Supabase, jamais exposée).
- Interface : tableau du jour dans l'écran du défi (top 20, ta ligne surlignée, rang stocké localement), statut en fin de partie (« ⏳ Le serveur rejoue ta partie… », « 🏆 Score validé : vague 23 · 2e sur 9 »), messages clairs quand le classement n'est pas disponible (hors-ligne, ancienne version, défi expiré, serveur pas encore activé).

### Anglais
- Couche de traduction `src/i18n` : le français reste la langue source, `tr()` cherche la traduction ; une entrée manquante retombe sur le français (jamais d'écran cassé). **1 665 clés**, dictionnaire anglais complet (`npm run i18n:check` → « EN covers every key »).
- Langue choisie automatiquement (navigateur), forcée par `?lang=en` / `?lang=fr`, changée dans **Options → Langue / Language** (recharge le jeu). `<html lang>` suit la langue.
- Textes des données (36 unités, ennemis, bénédictions, pouvoirs, modules, Résonance, anomalies, synergies, vagues, catégories) traduits au chargement ; textes produits par la simulation (erreurs, noms des IA, raisons de fin) traduits à l'affichage grâce à des **clés à motifs `{n}`** — ils voyagent en français canonique sur le réseau, chaque joueur les voit dans sa langue.
- Codemod `scripts/i18n-wrap.ts` (AST TypeScript) pour envelopper les textes et extraire les clés ; test unitaire de la traduction (exact, motifs, noms imbriqués, repli).

### Aussi
- Workflow GitHub **keepalive** (lundi et jeudi) : un projet Supabase Free s'endort après 7 jours sans requête, ce qui aurait coupé la partie rapide et le classement pendant une semaine calme. Clé publiable uniquement.
- Workflow **supabase-edge** : déploie la fonction à chaque modification de la simulation, si le secret `SUPABASE_ACCESS_TOKEN` existe (sinon il se saute proprement).

## 2. Fichiers
- Réseau : `src/net/backend.ts` (quickJoin, listPublicLobbies, setLobbyPublic, touchLobby, freeSlot, leaveLobbyRow, fetchDailyScores, submitDailyRun), `src/net/Session.ts` (isPublic, battement, guestLeft, journal `log`).
- Simulation : `src/sim/replay.ts` (replay, validateLog, dailyScore), `src/sim/daily.ts` (graine du jour, réglages, jours acceptés).
- Serveur : `edge/submit-daily.ts` (source) → `supabase/functions/submit-daily/index.ts` (bundle généré, `npm run build:edge`), `supabase/config.toml`, migrations `002_daily_challenge.sql` (révisée) et `003_quick_match.sql`.
- Interface : `src/ui/screens.ts` (duoScreen, dailyBoard, lobby public, langue), `src/ui/Hud.ts` (envoi du score), `src/ui/styles.css`.
- Traduction : `src/i18n/index.ts`, `en.ts`, `en-data.ts`, `en-hud.ts`, `en-menus.ts`, `en-sim.ts`, `scripts/i18n-wrap.ts`.
- Tests : `tests/v08.test.ts` (rejeu déterministe continu et par passes, journal, défi du jour, traduction, partie rapide hors-ligne, libération de place).

## 3. Vérification
- `vitest` 89/89 ; `tsc` ; `npm run build` ; bundle Edge 256 Ko sans dépendance navigateur ; `scripts/edge-smoke.mjs` (Node, Supabase simulée) : refus non authentifié / mauvais jour / mauvaise version / journal invalide, partie valide, meilleur score conservé, classement entre deux joueurs, en 1 passe et en 35 passes.
- Navigateur (version de production locale, Supabase réelle) : menu, écran « Jouer à deux », défi du jour et HUD en anglais ; écran d'erreur propre quand la base n'est pas encore migrée ; fin de défi avec message d'indisponibilité du classement tant que la fonction n'est pas déployée.

## 4. À faire côté Supabase (action utilisateur, 0 €)
Rien ne peut casser le jeu actuel : sans ces étapes, la partie rapide affiche une erreur et le classement reste local.
1. **SQL Editor** : exécuter `supabase/migrations/003_quick_match.sql` puis `002_daily_challenge.sql`.
2. **Fonction Edge** : soit ajouter un jeton d'accès Supabase comme secret GitHub `SUPABASE_ACCESS_TOKEN` (le workflow déploie tout seul), soit déployer `supabase/functions/submit-daily/index.ts` via Supabase → Edge Functions → « Deploy via editor » (désactiver « Verify JWT » : la fonction vérifie elle-même l'utilisateur).
3. Toujours en attente : révoquer la clé secrète `sb_secret_…` collée dans le chat (Project Settings → API Keys).

## 5. Limites connues
- La partie rapide apparie des joueurs de la **même version** du jeu : après une mise à jour, un joueur sur l'ancienne version (cache) ne voit pas les nouveaux salons tant qu'il n'a pas rechargé.
- Le classement n'accepte que les parties jouées avec la version déployée de la fonction (sinon « nouvelle version disponible »).
- Les parties du défi reprises après un rechargement n'ont pas de journal complet : non classées (le défi est solo, sans sauvegarde en cours de partie).
- Dans un duo en ligne où les deux joueurs n'ont pas la même langue, les noms d'unités insérés par l'hôte dans certains messages restent dans la langue de l'hôte.
