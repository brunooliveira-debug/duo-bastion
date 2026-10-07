# DUO BASTION v0.4 « Résonance » — rapport de livraison

En ligne : https://brunooliveira-debug.github.io/duo-bastion/ (v0.4.0-alpha, vérifiée le 2026-10-07).

## 1. Analyse de l'ancien jeu (v0.3)
Rapport v0.3 instrumenté (300 duels IA, mêmes outils) : `docs/BALANCE_REPORT_v03.md`.
- **Le DUO n'était qu'un mot** : la coopération se limitait à partager un Core ; rien ne récompensait l'entraide.
- **Les envois ne servaient à rien en PvP** : environ 320 Éther investis par joueur pour environ 17 dégâts au Core adverse (0,06 dégât par point investi). Aucune partie gagnée par les envois. Leur puissance (×2,7 en fin de partie) suivait bien moins vite que celle des vagues (×7 à ×11), et ils arrivaient 7 m derrière la vague, une fois le combat fini.
- **Nécrose et Brasier fuyaient énormément** : 27,7 et 22 fuites par partie, dès la vague 4 environ.
- **Fusions quasi inutilisées** (0 par partie pour 4 armées). Elles n'apportaient rien de plus qu'une amélioration et étaient invisibles.
- **L'IA n'utilisait que 2 ou 3 unités sur 6 par armée.** Le modèle d'évaluation sous-estimait tous les tireurs de 28 à 47 %. Les duels IA ne mesuraient donc que la moitié des armées, et l'indicateur « conseillé » pénalisait les joueurs qui construisent des tours.
- **Pouvoirs environ 8 fois plus faibles contre les boss** : ils étaient indexés sur le multiplicateur de vague, très bas aux vagues de boss.
- **Combats bloqués jusqu'à 80 s** : 41 % des parties à la vague 15, 24 % à la vague 10. En cause, des boss qui régénèrent ou invoquent plus vite qu'on ne les tue, ce qui fait perdre beaucoup de PV de Core.
- Écart des taux de victoire : 42 à 61 %.

## 2. Points faibles découverts pendant le développement
- Une Faille ignorée bloquait la vague (envoi d'ennemis sans fin) : désormais 6 ennemis maximum.
- **Panneaux reconstruits toutes les 100 ms** (défaut hérité de la v0.3) : sur téléphone, un bouton remplacé entre l'appui et le relâchement perdait le tap. Corrigé : le panneau n'est reconstruit que si son contenu change, et jamais sous le doigt.
- Panneau d'anomalie masquant la voie, et mise en page portrait cassée : corrigés.

## 3–5. Modifications et nouvelles mécaniques (détails : `docs/GDD.md`)
- **Résonance DUO** : jauge commune chargée uniquement par la coopération, jamais avec le temps. Sources : éliminations chez le partenaire, sauvetages, vagues propres, pouvoirs croisés, combos d'entraide, Failles. 21 capacités : 15 paires et 6 échos quand les deux joueurs ont la même armée. Canalisation de 2,2 s, synchronisation par le partenaire (+30 %), aucun double déclenchement possible, jauge rendue si la vague se termine avant l'impact.
- **Modules du Bastion** : 3 emplacements, 13 modules en 4 familles, 3 niveaux. Proposition par un joueur, validation par l'autre avec cofinancement de la moitié ; refus avec remboursement ; accord tacite au bout de 15 s. Les modules sont visibles sur le château.
- **Ordres tactiques** : FOCUS, RALLIEMENT, REPLI, INTERCEPTION, PURGE. 2 charges par vague, 4 s entre deux ordres, ciblage en touchant le terrain ou automatique.
- **Boss** : introduction courte, attaques annoncées par une zone rouge et interrompables par un étourdissement, phases. Brûlure et poison coupent la régénération des ennemis.
- **Failles secondaires** : environ un tiers des vagues non-boss, risque contre récompense.
- **Anomalies** : vote commun avant les vagues clés, effet sur 3 vagues, 10 anomalies.
- **Doctrines et entraide** : un passif et un effet d'aide au partenaire pour chaque armée.
- **Fusion** : Éclat de fusion (+10 % PV et dégâts, cumulable 3 fois), paires mises en évidence, fusion en un geste.
- **Journal déterministe** : chronologie et moments forts en fin de partie, et une piste bienveillante pour la suivante.
- **Graines** : `?seed=` rejoue un même monde, et un Défi du jour propose le même monde à tous. Classement en ligne préparé : `supabase/migrations/002_daily_challenge.sql`, non appliquée.
- **Confort** : secousses, flashs et vibrations réglables ; niveaux de graphismes ÉLEVÉ / MOYEN / BAS.
- **Lisibilité** : flèches de direction des ennemis, zones dangereuses, anneaux d'état.
- **Réseau** : anti-rejeu (numéro de commande), anti-spam (15 commandes/s), décisions stockées dans l'état de jeu, ce qui rend les reconnexions sûres.

## 4. Fichiers modifiés (principaux)

**Nouveaux fichiers**
- Données : `src/data/resonance.ts`, `src/data/modules.ts`, `src/data/tactics.ts`.
- Simulation : `src/sim/resonance.ts`.
- Scripts : `scripts/calibrate.ts`, `scripts/leaks-by-wave.ts`, `scripts/army-mix.ts`, `scripts/trace-stall.ts`, `scripts/compare-balance.ts`.
- Tests : `tests/v04.test.ts`.
- Base de données : `supabase/migrations/002_daily_challenge.sql`.

**Fichiers modifiés**
- Simulation : `src/sim/state.ts`, `game.ts`, `combat.ts`, `ai.ts`, `balance.ts`, `rng.ts`.
- Données : `src/data/units.ts`, `enemies.ts`, `economy.ts`, `waves.ts`, `synergies.ts`, `types.ts`.
- Réseau : `src/net/snapshot.ts`, `Session.ts`.
- Interface : `src/ui/Hud.ts`, `screens.ts`, `styles.css`, `icons.ts`, `Tutorial.ts`.
- Rendu et son : `src/render/Renderer.ts`, `shapes.ts`, `src/audio/AudioSystem.ts`.
- Reste : `src/save/SaveSystem.ts`, `src/main.ts`, `scripts/balance-report.ts`, `docs/GDD.md`, `PROJECT_STATUS.md`, `BALANCE_REPORT.md`.

## 6. Choix de game design
- La Résonance récompense uniquement la coopération, et le choix « maintenant ou pour le boss » est réel : la jauge plafonne et le surplus est perdu.
- Les décisions communes ne bloquent jamais la partie : accord tacite, résolution forcée au lancement, réponse immédiate d'une IA partenaire.
- Le combat reste automatique : les ordres sont limités (2 par vague) et facultatifs.
- Les effets restent sous contrôle : l'exécution ne touche que les ennemis affaiblis, et les boss ne perdent que 5 à 8 % de leurs PV.

## 7. Modifications d'équilibrage (toutes mesurées)
- **Envois** : puissance indexée sur la difficulté des vagues, et ils marchent avec la vague.
- **Pouvoirs et Résonance** : indexés sur une courbe lissée (`waveToughness`), donc aussi efficaces contre les boss.
- **Modèle d'évaluation** : les PV effectifs des tireurs sont multipliés par 1,6 (ils combattent derrière la ligne de front). L'IA utilise maintenant 4 à 5 unités sur 6 par armée.
- **IA** : elle lit la vague qui arrive (unités de zone contre les nuées, contrôle et portée contre les ennemis rapides) et vise une composition équilibrée.
- **Pestiféré** : rayon de 2,1 → 2,5 m, poison de 12 → 14/s.
- **Brasier** : coûts ramenés au niveau d'avant la hausse de 5 % de la v0.3.
- **Brute** : attaque annoncée adoucie.
- **Faille** : 6 ennemis maximum.

## 8. Résultats des tests
- `npm test` : 48/48 (22 tests existants et 26 nouveaux, dont un test hôte/invité via le vrai protocole réseau).
- `npm run build` : OK.

## 9. Équilibrage avant / après (300 duels IA chacun ; détail dans `BALANCE_REPORT.md`, section 4)

| | v0.3 | v0.4 |
|---|---|---|
| Écart des taux de victoire | 42–61 % | **43–54 %** |
| Fuites Nécrose / partie | 27,7 | **9,6** |
| Fusions / partie | 0–1,8 | 0,9–1,2 environ pour la plupart des armées |
| Pire combat bloqué (80 s) | V15 : 41 % | V14 / V15 : 13 % |
| Résonance DUO | — | 2,8 déclenchements / équipe / partie |
| Duels finis par destruction d'un Core | 50 % | **15 %** (régression assumée, voir 10) |

## 10. Problèmes restants
- **Pression PvP faible** : les envois restent surtout économiques et aucune partie n'est gagnée par les envois. Avec des défenses plus solides, 85 % des duels se jouent aux PV du Core à la vague finale.
- **Unités délaissées par l'IA** : Lancière, Astromancienne, Bombardière, Harponneuse, Méduse, Arbalétrière, Archère des Cendres.
- **Combats encore bloqués** : 8 à 13 % des parties sur certaines vagues de boss.
- **Non testé** : une vraie partie en ligne entre deux téléphones. Le protocole est couvert par les tests, pas par un essai réel.
- **Classement du défi du jour** : migration non appliquée, à exécuter dans Supabase.

## 11. Idées pour la v0.5
1. Aperçu des envois adverses pendant la préparation et IA offensive qui planifie un « gros coup » (Titan et Résonance au bon moment).
2. Refonte graphique (en cours, d'après tes planches de référence).
3. Rejouer le journal côté serveur pour valider les classements.
4. Défi hebdomadaire en duo, avec la graine partagée par lien.
5. Collection des 21 capacités DUO découvertes, avec un écran de découverte pour inciter à essayer d'autres combinaisons.
