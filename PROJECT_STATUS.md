# PROJECT_STATUS — DUO BASTION

**VERSION ACTUELLE :** 0.1.0-alpha
**URL PUBLIQUE (GitHub Pages) :** https://brunooliveira-debug.github.io/duo-bastion/
**DERNIER TEST :** 2026-10-05
- `vitest` 9/9 OK (simulation + multijoueur hôte/invité)
- e2e backend réel (`node scripts/e2e-backend.mjs`) : auth anonyme ×3, create/join lobby, erreurs « not_found » / « full », RLS (non-membre ne voit rien, invité ne modifie pas), Realtime présence + broadcast — OK
- Build de production + vrai Supabase, 2 navigateurs distincts (Chrome + navigateur intégré) : créer → code → rejoindre → les deux apparaissent → PRÊT ×2 → démarrer → constructions/ouvriers synchronisés → combat diffusé → fuites sur le Core commun → vague 2 — OK

## INFRA (0 €)
- Supabase Free : projet `duo-bastion` (réf `evadmavhnpabnckyddap`, Europe), migration `supabase/migrations/001_init.sql` appliquée, connexion anonyme activée.
- GitHub : https://github.com/brunooliveira-debug/duo-bastion (public, requis pour Pages gratuit)
- Hébergement : GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`). Cloudflare Pages écarté : nécessitait une connexion au compte.
- Clé client : clé *publishable* Supabase dans `.env.production` (publique par conception, protégée par RLS). Aucune clé secrète dans le code.

## TERMINÉ
- Gameplay complet MVP+ : 8 unités + 8 évolutions, 21 vagues + infini, 4 Raiders, 12 pouvoirs, ouvriers/Éther/revenu, Core partagé + améliorations, fuites, entraide entre voies, draft + relance, IA (5 difficultés × 4 personnalités).
- Modes : Duo vs 2 IA (10/21 vagues), Survie duo, Solo + IA alliée, Tutoriel.
- Multijoueur hôte autoritaire (anti-triche), reconnexion, pause, IA de relève si partenaire absent > 45 s.
- UI mobile paysage, PWA, audio procédural, statistiques de fin + titres + record du duo.

## EN COURS
- (rien) — en ligne et testé publiquement le 2026-10-05 : lobby HPEHY créé dans Chrome, rejoint depuis un 2e navigateur en format téléphone via le lien d'invitation, PRÊT ×2, partie démarrée des deux côtés.

## À FAIRE
- APK Android (Capacitor), 30 unités / 10 Raiders, mode Duel, cosmétiques.

## BUGS CONNUS
- Si l'hôte met le jeu en arrière-plan (autre appli / écran éteint), la simulation se met en pause pour les deux : l'hôte doit garder le jeu au premier plan.
- Menu principal légèrement trop haut sur les très petits écrans paysage (défilement nécessaire).
- Mineur : le service worker ne s'enregistre pas dans le navigateur intégré de l'app (sans impact sur Chrome/Safari).

## SÉCURITÉ — ACTION UTILISATEUR
- Une clé secrète Supabase (`sb_secret_…`) a été collée dans le chat : à **révoquer** dans Supabase → Project Settings → API Keys → Secret keys. Le jeu ne l'utilise pas.

## PROCHAINE ÉTAPE
Retours de vraies parties à deux → équilibrage ; puis APK Android (Capacitor) et contenu (30 unités, 10 Raiders).
