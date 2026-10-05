# PROJECT_STATUS — DUO BASTION

**VERSION ACTUELLE :** 0.1.0-alpha (local)
**DERNIER TEST :** 2026-10-05 — `vitest` 9/9 OK (dont test multijoueur hôte+invité complet), typecheck OK, build OK (~175 Ko gzip), partie solo testée dans le navigateur (placement, PRÊT, combat, vague 2).

## TERMINÉ
- Architecture Web (TypeScript + Three.js + Vite), PWA (manifest, service worker, icônes originales).
- Données data-driven : 8 unités + 8 évolutions, 11 ennemis + 4 corps de Raiders, 21 vagues + infini, économie, Core, 12 pouvoirs, matrice ATT/DEF.
- Simulation : phases, combat auto (provocation, auras, ondes, zone, rebonds, exécution, vol de vie, boucliers, saut d'assassin), fuites, Core partagé, entraide entre voies.
- Économie : or, Éther, ouvriers, revenu, Raiders (éco/puissance), investissement (Survie), améliorations du Core.
- Draft 6 unités + relance. Pouvoirs à la vague 11 (6 en courte).
- IA : 5 difficultés × 4 personnalités, sans triche. Équilibrage validé par simulations headless.
- Modes : Duo vs 2 IA (10/21 vagues), Survie duo (infini), Solo + IA alliée, Tutoriel 7 étapes.
- Réseau hôte autoritaire (validation anti-triche), snapshots compacts + interpolation, pause/reprise si le partenaire se déconnecte, reprise IA après 45 s, reconnexion invité/hôte, sauvegarde par vague.
- UI mobile paysage : HUD, cartes, glisser-déposer, tap-pour-placer, appui long (fiche), pinch-zoom, pan, panneaux Raiders/Core/Stats/Pings/Menu, valeur conseillée colorée, prochaine vague, partenaire, toasts, bannières, vibration, écran de fin + titres + record du duo.
- Audio procédural (SFX + musique adaptative).
- Schéma Supabase + RLS + RPC (`supabase/migrations/001_init.sql`).

## EN COURS
- Mise en ligne (Supabase Free + Cloudflare Pages Free) — nécessite tes connexions aux comptes.

## À FAIRE
- Déploiement + test public sur 2 sessions.
- APK Android (Capacitor/TWA) après la version Web.
- 30 unités / 10 Raiders, mode Duel 1v1, progression cosmétique.

## BUGS
- (aucun bloquant connu) Le serveur de dev ne fonctionne pas depuis le dossier scratch AppData (virtualisation MSIX) → projet déplacé dans `C:\Users\bruno\DuoBastion`.

## PROCHAINE ÉTAPE
Créer le projet Supabase, appliquer la migration, déployer sur Cloudflare Pages, tester avec 2 navigateurs.
