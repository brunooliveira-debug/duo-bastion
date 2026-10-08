# DUO BASTION — Rapport de livraison v0.7 « Siège »

Version en ligne : https://brunooliveira-debug.github.io/duo-bastion/ (bundle `0.7.0-alpha`, service worker `duobastion-v8`).

## 1. Ce qui a été demandé

Un brief en deux parties : des idées de jouabilité (synergies coopératives, boucle roguelite, nouveaux types d'ennemis, boss à mécanique duo, game feel) et quatre concepts visuels 4K (vue isométrique, personnages et auras, décors avec îles flottantes, HUD moderne).

DUO BASTION est un auto-battler : il n'y a pas d'avatar de héros à déplacer. Les idées qui supposent un personnage contrôlé en temps réel (esquive/dash, réanimation d'un joueur tombé, barre de compétences Q/W/E/R) ont été traduites dans la grammaire du jeu plutôt que copiées ; la section 3 dit précisément ce qui a été retenu, adapté ou laissé de côté.

## 2. Livré dans la v0.7

### Bénédictions (draft roguelite entre les vagues)
- Avant presque chaque vague (de la vague 2, sauf les vagues d'anomalie pour garder une décision à la fois), **3 bénédictions** sont tirées ; l'équipe en garde **une**, permanente et commune aux deux joueurs.
- **Qui choisit** : les deux humains à tour de rôle (vague paire / impaire) ; un humain choisit toujours à la place d'un partenaire IA. L'autre joueur voit les cartes et le nom du décideur. Sans choix au lancement de la vague, le hasard tranche (tirage du monde : même graine ⇒ même résultat).
- **16 bénédictions**, 11 courantes et 5 rares (à partir de la vague 6), cumulables jusqu'à 1–3 niveaux : Cadence des tours, Trempe, Phalange, Égide mineure, Remparts, Primes de chasse, Intendance, Moisson d'Éther, Lames de givre, Venin, Chasse aux colosses ; rares : Projectiles rebondissants, Aura du Cœur, Harmonie (Résonance +25 %), Discipline (+1 ordre), Relève (une unité tombée revient en fantôme).
- Chaque bénédiction est une commande validée par l'hôte (`bless`) : fonctionne en duo en ligne. L'IA adverse a les siennes (préférences par personnalité).
- Interface : panneau de 3 cartes au-dessus des cartes d'unités (réductible en puce), puce **Bénédictions ×N** qui ouvre la liste de l'équipe avec la prochaine vague de tirage.

### Nouveaux ennemis
- **Brécheur** : ignore vos unités et fonce sur la porte du Bastion ; insensible à la provocation. Contre-jeu : portée, ralentissements, intercepteurs, ordre INTERCEPTION, tirs du Core. Présent aux vagues 6 (1), 9 (2), 16 (3), 20 (3) et dans le pool de la Survie. Anneau orange pulsant et traînée de poussière.
- **Invocateur Fêlé** : reste en retrait (recule quand une unité approche) et appelle des moucherons toutes les 7 s. Vagues 13 et 20. Contre-jeu : longue portée, assassins.
- **Chaman** (soigneur, jusqu'ici réservé aux envois) rejoint la vague 18.
- Les textes « danger » des vagues expliquent le contre-jeu ; l'IA préfère portée/ralentissements sur ces vagues.

### Sceaux jumeaux (mécanique de boss à deux)
- Les trois boss majeurs (Colosse, Reine-Essaim, Primordial) arrivent derrière un **bouclier de 30 % de leurs PV**.
- Chaque joueur a un bouton **SCEAU** en combat. Les deux sceaux activés **à moins de 3 s d'écart** brisent le bouclier, étourdissent le boss 2,5 s, retardent sa prochaine capacité et chargent la Résonance (+12).
- Lisibilité : bannière à l'arrivée du boss, « X active son sceau — appuie sur SCEAU ! » avec vibration quand le partenaire a appuyé (compte à rebours sur le bouton), bannière « SCEAUX BRISÉS ! », explosion et micro-ralenti.
- Un partenaire IA répond au sceau de l'humain ; une équipe 100 % IA brise les sceaux dès que le boss est engagé. Jamais bloquant : sans coordination, le bouclier absorbe simplement.

### HUD repensé (concept 4)
- **Barre de siège** en haut au centre : vague et nom, chrono de préparation, **PV du Bastion** (avec le bouclier d'Égide), barre de progression « N ennemis restants » en combat.
- **Cadre partenaire** : anneau à la couleur de son armée, valeur d'armée / conseillée en jauge, état (prêt, fuites…).
- **Mini-carte** (haut droite, 10 Hz) : voies, grilles, Bastion, portails ; unités (couleur du joueur), ennemis (rouge, brécheurs orange, fuyards rouge vif, boss, failles) ; cadre de la caméra ; **toucher = regarder là**.
- Barre de boss indiquant les sceaux ; ressources à gauche ; dispositions téléphone paysage / portrait ajustées.

### Graphismes (concepts 2 et 3)
- **Auras d'élite** : les unités de niveau 4 et 5 ont un cercle runique lumineux à la couleur de leur armée (plus grand et scintillant au niveau 5), visibles en préparation et en combat.
- **Îles flottantes avec cascades** derrière les arènes : 4 (5 en ULTRA) îles proches avec pins, tours et chute d'eau animée, qui oscillent lentement ; elles dépassent des ruines en jeu et se révèlent en dézoomant.
- Effets : fantômes de la Relève, sceaux (ouverture, activation, bris), brécheurs.

## 3. Ce qui a été adapté ou laissé de côté (et pourquoi)

| Idée du brief | Décision |
|---|---|
| Combinaisons élémentaires glace/huile + feu | Déjà présent sous la forme de l'**entraide** (ex. cible trempée + éclair) et de la **Résonance DUO** ; les bénédictions Lames de givre / Venin ajoutent des combinaisons avec les unités qui profitent des ralentis / poisons. |
| Rôles asymétriques tank / distance | Les 6 armées ont déjà des doctrines distinctes ; une partie se joue avec deux armées différentes. |
| Réanimation tactique d'un joueur | Pas d'avatar. Transposé en **Relève** (bénédiction rare : une unité tombée revient en fantôme). |
| Draft de 3 améliorations | **Fait** (bénédictions). |
| Sapeurs / invocateurs / boss duo | **Fait** (Brécheur, Invocateur, Sceaux jumeaux). |
| Récolte d'Éther et pièges consommables | Partiellement : **Moisson d'Éther** (Éther par élimination). Les pièges posables sont notés pour une prochaine version. |
| Screenshake et hitstop | Déjà présents (réglables) ; ajoutés sur le bris des sceaux. |
| Zones de danger télégraphiées | Déjà présentes (frappes de boss) ; brécheurs signalés par leur anneau. |
| Esquive active | Pas d'avatar ; l'ordre REPLI joue ce rôle. |
| HUD moderne, mini-carte, suivi des vagues | **Fait**. |
| Îles flottantes, rayons, auras | **Fait** (les rayons de lumière existaient en ULTRA). |

## 4. Équilibrage mesuré

`scripts/leaks-by-wave.ts 30` (duels IA, fuites moyennes par voie) :
- Vagues à brécheurs : 6 → 1,1–3,6 (v0.6 : 0,1–2,6), 9 → 1,5–2,7 (0,1–2,5), 16 → 0,9–3,3 (0–1,8). Première version (2/3/4 brécheurs, 240 PV) : 2,3–4,7 ; ramené à 1/2/3 brécheurs et 200 PV.
- Les autres vagues sont stables ou en baisse grâce aux bénédictions (11, 13, 19, 20).
- 30 parties complètes IA contre IA par mesure, résultat sans blocage.

## 5. Vérifications

- `vitest` : **73/73** (65 existants + 8 nouveaux : offre à la vague 2 et jamais sur une vague d'anomalie, tour de rôle, refus du non-décideur, tirage forcé au lancement, choix de l'IA, rares après la vague 6, plafond par bénédiction, effets réels en combat (dégâts, cadence, bouclier, PV du Core, revenu, Résonance, ordres), brécheurs qui ne ciblent jamais une unité, invocateurs qui invoquent, sceaux : bouclier, fenêtre de 3 s, bris, Résonance, refus hors combat, IA partenaire). Le test réseau vérifie le tour de rôle des bénédictions entre hôte et invité.
- `tsc` et `npm run build` sans erreur.
- Navigateur (1280×720 et 812×375 paysage) : panneau de bénédictions et choix, puce et liste, barre de siège en préparation / combat / résolution, mini-carte, vague de boss avec SCEAU, bris des sceaux par l'IA partenaire, auras niveau 4/5, îles flottantes. Captures : `docs/captures/v07_*.jpg`.
- Sauvegardes : format d'état passé en version 4 ; une partie v0.6 en cours n'est pas reprise (ignorée proprement, comme aux versions précédentes).

## 6. Rappel sécurité

La clé secrète Supabase collée dans le chat (`sb_secret_…`) doit être révoquée (Supabase → Project Settings → API Keys). Le jeu ne l'utilise pas.
