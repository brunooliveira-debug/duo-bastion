# PROJECT_STATUS — DUO BASTION

**VERSION ACTUELLE :** 0.7.2-alpha (or de départ 450 = +200 de bonus, revenu +5 or / vague, primes +3 % / vague ; interface qui s'adapte à l'écran — téléphone, portable, moniteur 1440p/4K — et économie de fin de vague : primes ×1,35 + bonus de rapidité + récapitulatif ; v0.7 « Siège » : bénédictions, Brécheurs / Invocateurs, Sceaux jumeaux, HUD avec mini-carte, auras, îles — rapport : `docs/RAPPORT_v0.7.md`)
**URL PUBLIQUE (GitHub Pages) :** https://brunooliveira-debug.github.io/duo-bastion/
**DERNIER TEST :** 2026-10-08
- v0.7.1 : `vitest` 75/75 (+2 tests économie : primes, bonus de rapidité, récapitulatif, pas de bonus en cas de fuite). Interface vérifiée en 800×360, 1000×450, 1280×720, 1366×768, 1920×1080, 2560×1440 et 375×812 portrait.
- v0.7 : `vitest` 73/73 (65 + 8 tests v0.7 : draft de bénédictions, tour de rôle, tirage forcé, IA, rares, effets en combat, brécheurs, invocateurs, sceaux ×3 ; test réseau étendu au tour de rôle). `tsc` + `npm run build` OK. Navigateur : PC 1280×720, téléphone paysage 812×375 (émulé) — bénédictions, barre de siège, mini-carte, boss scellé, bris par l'IA partenaire, auras, îles. Équilibrage : `scripts/leaks-by-wave.ts 30` avant / après (voir le rapport §4).
- v0.5 : `vitest` 55/55 (48 + 7 tests v0.5 : modèles, Primordial 3 phases, signatures de faction, branches A/B, champ de bataille plat, décor hors voie, rendu sans effet sur la simulation). `npm run build` OK. Navigateur : PC 1280×720 en ÉLEVÉ / MOYEN / BAS, téléphone paysage 812×375 et portrait 375×812 (émulés), 6 factions, Résonance, vague du Primordial. Performances mesurées au chronomètre GPU (voir le rapport, section 11).
- `vitest` 48/48 OK : les 22 tests v0.3 + 26 tests v0.4 (Résonance : charge, plafond, jamais avec le temps, déclenchement, double déclenchement, synchronisation, remboursement, pouvoir d'assistance ; modules : séquestre, validation, cofinancement, refus, accord tacite, 3 emplacements, amélioration, démontage, effets ; ordres : charges, recharge, phase, cible, repli, purge ; failles : affectation, tours refusées, récompense, nombre d'ennemis limité ; anomalies : vote commun, effets, offre réelle ; boss : zone télégraphiée, impact, interruption par étourdissement ; graine : reproductibilité, monde indépendant des actions ; fusion : éclat ; réseau hôte/invité : module commun, vote d'anomalie, anti-rejeu, synchronisation de Résonance).
- Équilibrage : `npx tsx scripts/balance-report.ts 300` → `BALANCE_REPORT.md` (section 4 = avant/après). Ligue v0.4 : Ronces 54 %, Rouages 52 %, Brasier 52 %, Nécrose 49 %, Abysses 49 %, Astral 43 % (v0.3 : 42–61 %). Résonance : 2,8 déclenchements par équipe et par partie.
- Navigateur (dev) : PC 1280×720, téléphone paysage 844×390, portrait 390×844 : construction, fusion, faille, anomalie, Bastion (module installé), combat, ordres (FOCUS), introduction de boss, Résonance DUO synchronisée, écran de fin (timeline, moments forts).

## INFRA (0 €)
- Supabase Free : projet `duo-bastion` (Europe), migration `001_init.sql` appliquée, connexion anonyme activée. `002_daily_challenge.sql` **préparée, non appliquée** (classement du défi du jour).
- GitHub : https://github.com/brunooliveira-debug/duo-bastion (public, requis pour Pages gratuit) · GitHub Pages via Actions.
- Clé client : clé *publishable* Supabase (publique par conception, RLS). Aucune clé secrète dans le code.

## TERMINÉ
- v0.7.2 — **Or de départ 450** (+200) pour tout le monde, IA comprises ; **plus on monte, plus on gagne** : revenu de base +5 or par vague franchie (30 → 130 à la vague 21), primes d'élimination +3 % par vague (×1,6 à la vague 21), revenu affiché pour la vague en cours ; la courbe d'or attendue des outils d'équilibrage inclut les primes ×1,35.
- v0.7.1 — **Interface adaptative** : toutes les tailles (pastilles, cartes, boutons, barre de siège, mini-carte, menus) suivent la hauteur de l'écran (`clamp(min, vh, max)`), menus jamais coupés (`safe center`), HUD compact sur téléphone paysage (une ligne d'indicateurs défilante, rien sous la barre de siège), menu d'accueil en deux colonnes sur téléphone, plafonds relevés pour 1440p / 4K. **Économie** : primes d'élimination ×1,35, **bonus de rapidité** par voie tenue sans fuite (max 10 + 4 × vague, décroissant jusqu'à 40 s), récapitulatif de fin de vague (revenu, éliminations, rapidité, voie tenue), temps de combat affiché. Tests 75/75.
- v0.7 — « Siège » : **bénédictions** (3 tirées avant presque chaque vague, une gardée, permanente et commune ; 16 dont 5 rares ; humains à tour de rôle, hasard si aucun choix, IA avec préférences) ; **Brécheur** (ignore les unités, fonce sur la porte) et **Invocateur** (en retrait, invoque) dans les vagues 6/9/13/16/18/20 et la Survie ; **Sceaux jumeaux** sur les 3 boss majeurs (bouclier 30 %, deux SCEAUX à moins de 3 s → bris, étourdissement, +12 Résonance ; IA partenaire qui répond) ; **HUD** : barre de siège (vague, Bastion, ennemis restants), cadre partenaire, mini-carte tactile ; **rendu** : auras d'élite niveaux 4–5, îles flottantes à cascades, effets sceaux / fantômes. Format de sauvegarde v4. Tests 73/73.
- v0.6.1 — **↶ Annuler** pendant la préparation (bouton + Ctrl+Z) : annule la dernière action (pose, déplacement, amélioration, vente, fusion) avec le remboursement exact ; jamais l'or dépensé ailleurs entre-temps ; verrouillé au lancement de la vague ; validé par l'hôte (marche en duo en ligne). Tests 65/65.
- v0.6 — « Ultra » : MSAA 4×, occlusion ambiante GTAO, rayons de lumière, finition cinéma, ombres 4096, lumières de lanternes dynamiques, reflets partout ; résolution dynamique (vise la fréquence de l'écran) ; détection des cartes dédiées ; test de performance intégré (`?bench`) ; image 4K rendue par le moteur pour l'écran titre ; correction du pont (z-fighting) ; commandes de debug refusées en réseau (anti-triche). Tests 60/60.
- v0.5 — « Crépuscule » (refonte graphique, moteur inchangé, 100 % procédural) :
  - Post-traitement HDR (halo lumineux, ACES, étalonnage, vignette, FXAA) ; 3 niveaux de matériaux (PBR / mixte / Lambert) ; reflets réservés aux héros.
  - **Bastion monumental** (paliers, tour gothique, cage dorée, réacteur, flèches, colonne de lumière) ; modules visibles par famille et niveau, avec bannières.
  - **Terrain** : dalles à bords organiques, murets en ruine, lanternes, arches, statues, ponts de pierre, grands portails de faille, abîme brumeux.
  - **Décor et particules par faction** sur chaque voie ; signature de faction sur chaque unité ; branches A et B distinctes ; palettes des tours refaites.
  - **Primordial** : modèle dédié en 3 phases visuelles, braises, fumée, arcs ; portails rouges en vague de boss.
  - **Résonance cinématique** : couleurs des deux armées qui convergent, embrasement du Bastion, étalonnage, flash, glyphe au sol.
  - Interface vitrée bleu nuit à liserés dorés ; compteur de performance de debug.
- v0.4 — « Deux joueurs, deux armées, un seul Bastion » (détails : `docs/GDD.md`) :
  - **Résonance DUO** : jauge commune chargée uniquement par la coopération ; 21 capacités de paire data-driven ; synchronisation +30 % ; IA partenaire qui synchronise.
  - **Modules du Bastion** : 3 emplacements, 13 modules / 4 familles / 3 niveaux, proposition → validation (cofinancement) / refus / accord tacite 15 s ; visibles sur le château.
  - **Ordres tactiques** : FOCUS, RALLIEMENT, REPLI, INTERCEPTION, PURGE (2 charges/vague, ciblage au doigt ou automatique).
  - **Boss** : introduction, attaques télégraphiées interrompables, phases ; brûlure/poison coupent la régénération.
  - **Failles secondaires** (risque/récompense) et **anomalies** (choix commun avant les vagues clés).
  - **Doctrines** et **entraide** propres à chaque armée ; **Éclat de fusion** et fusion visible en un geste.
  - **Journal déterministe**, timeline et moments forts en fin de partie ; **graines** (`?seed=`), **Défi du jour**.
  - Confort : secousses / flashs / vibrations réglables ; micro-ralentis visuels ; flèches de direction ; mise en page portrait.
  - Réseau : anti-rejeu (numéro de commande), anti-spam (15/s), décisions stockées dans l'état (reconnexion sûre).
  - Équilibrage instrumenté (économie, envois, pouvoirs, progression, fusions, matchups, cause de victoire, combats bloqués) ; corrections : envois indexés sur les vagues et qui marchent avec elles, pouvoirs non affaiblis aux vagues de boss, modèle d'évaluation des tireurs recalibré (l'IA les ignorait), IA attentive aux nuées / ennemis rapides, failles plafonnées, Pestiféré renforcé, coûts Brasier rétablis.
- v0.3 et avant : 6 armées × 6 unités, niveaux 1→5 + spécialisations, synergies, pouvoirs, envois, malédictions, duel, rendu 3D procédural (îles flottantes, tours, effets), multijoueur hôte autoritaire, PWA, tutoriel, survie.

## À FAIRE
- Jouabilité (suite v0.7) : pièges consommables posables pendant la préparation (Éther) ; modèle dédié au Brécheur (bélier) ; IA qui réserve ses intercepteurs pour les vagues à brécheurs.
- Graphismes (suite v0.5) : resculpter les maillages des unités, modèles dédiés pour les autres boss, effets d'impact par faction.
- Duels : la pression offensive reste faible (envois surtout économiques, 15 % des duels finis par destruction d'un Core) → aperçu des envois entrants + IA plus offensive.
- IA : certaines unités à distance coûteuses restent rarement choisies (Lancière, Astromancienne, Bombardière, Harponneuse, Méduse, Arbalétrière, Archère des Cendres).
- Classement en ligne du défi du jour (appliquer `002_daily_challenge.sql`), rejouer le journal côté serveur pour valider les scores.

## BUGS CONNUS / LIMITES
- Si l'hôte met le jeu en arrière-plan, la simulation se met en pause pour les deux.
- Les sauvegardes v0.3 en cours ne sont pas reprises (format changé, ignorées proprement).
- Combats encore bloqués jusqu'à 80 s dans 8–13 % des parties sur certaines vagues de boss (v0.3 : jusqu'à 41 %).
- Non testé : vraie partie en ligne entre deux téléphones sur la version publique.

## SÉCURITÉ — ACTION UTILISATEUR
- Une clé secrète Supabase (`sb_secret_…`) a été collée dans le chat : à **révoquer** dans Supabase → Project Settings → API Keys → Secret keys. Le jeu ne l'utilise pas.

## PROCHAINE ÉTAPE
Retour du joueur sur la v0.7 (bénédictions, sceaux, HUD) ; puis pièges consommables et test de performance sur la carte dédiée du joueur (`?bench`).
