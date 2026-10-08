# DUO BASTION — Game Design Document (v0.4 « Résonance »)

> **Deux joueurs, deux armées, un seul Bastion.**
> Nom de travail centralisé dans `src/config.ts`, `index.html`, `public/manifest.webmanifest`.

## 1. Pitch
Tower-defense / auto-battler **coopératif à deux** sur téléphone (paysage). Chaque joueur défend sa voie avec sa propre armée ; les deux partagent un **Bastion** (le Core). On construit entre les vagues, le combat est automatique — avec quelques décisions fortes pendant le combat (pouvoirs, ordres, Résonance DUO). Inspiré des *principes* du genre « Legion TD » — aucun nom, asset, texte, carte ou code repris.

Le mot **DUO** est une mécanique : la jauge de **Résonance** ne se remplit que lorsque les deux joueurs s'entraident, et elle libère une capacité propre à **leur paire d'armées**.

## 2. Univers
La **Faille** vomit les *Dissonants*. Six armées défendent les Bastions : **Ordre Astral**, **Concordat des Rouages**, **Les Ronces**, **Marée Abyssale**, **Brasier Solaire**, **Voile Nécrose**.

## 3. Boucle de jeu
Partie = 10 (courte) ou 21 vagues ; Survie infinie ; Duel 1 contre 1 ; Défi du jour (graine commune).
1. **Préparation** (60 s puis 43 → 54 s, +8 s avant un boss ; finit dès que tout le monde appuie sur LANCER) : acheter / placer / déplacer / vendre / améliorer / fusionner, ouvriers, envois, malédictions, **modules du Bastion**, **anomalie** (vagues clés), **affectation à la Faille secondaire**.
2. **Combat** (auto, max 80 s) : pouvoirs de commandant (3), **ordres tactiques** (2 charges), **Résonance DUO**.
3. **Résolution** (4 s) : revenu, bonus « voie tenue », régénération du Core, journal.

**Entraide** : tant que des ennemis sont dans ta voie, tes unités la défendent ; dès qu'elle est vide, elles aident la voie partenaire / le Core — et appliquent l'**effet d'entraide** de leur armée.

## 4. Les 6 armées (`src/data/units.ts`)
6 unités par armée (catégories : défense, lourde, longue portée, anti-blindage, zone, soutien, rapide, spéciale), niveaux 1 → 5, spécialisation A/B définitive au niveau 4, 3 pouvoirs de commandant (`src/data/powers.ts`).

| Armée | Philosophie | Doctrine (passif v0.4) | Entraide (aide au partenaire) |
|---|---|---|---|
| Ordre Astral | précision, contrôle, coordination | Coordination : les tirs marquent la cible (+10 % dégâts subis, 3 s) | Repérage : marque +20 % |
| Concordat des Rouages | machines, cadence, optimisation | Optimisation : améliorations -10 %, tours +10 % cadence | Réparation : chaque ennemi éliminé chez le partenaire / près du Core répare le Core (4 %/vague max) |
| Les Ronces | régénération, poison, croissance | Croissance : +3 % PV max par vague survécue (max +24 %) | Sève partagée : zone de soin autour de l'aidant |
| Marée Abyssale | tank, contrôle, puissance lente | Pression des fonds : ennemis de la voie -8 % vitesse ; +1 % dégâts / s de combat (max +25 %) | Courant : cible trempée (ralentie, +30 % des éclairs) |
| Brasier Solaire | explosions, risque, agressivité | Ferveur : +20 % dégâts sous 50 % PV ; un ennemi qui meurt en brûlant explose | Étincelle : embrase la cible |
| Voile Nécrose | invocations, exécution, sacrifice | Pacte & Moisson : chaque élimination +2 % dégâts (max +30 %, la vague) ; une unité tombée a 35 % de se relever en squelette | Âmes errantes : 30 % qu'un ennemi tué chez le partenaire se relève en squelette allié |

**Fusion** : 2 unités identiques (même niveau, même spécialisation) → 1 unité niveau +1, l'excédent d'or est remboursé, une case est libérée et l'unité gagne un **Éclat de fusion** (+10 % PV et dégâts, cumulable 3×). Visibilité : cartes ✨ (une 2e copie permet de fusionner), anneau violet pulsant sous les paires, pastille « Fusion ×N » → liste en un geste.

## 5. RÉSONANCE DUO (`src/data/resonance.ts`, `src/sim/resonance.ts`, `fireResonance` dans `src/sim/combat.ts`)
Jauge **commune à l'équipe**, 0 → 100. **Jamais de gain avec le temps.**

| Source | Charge |
|---|---|
| Une de tes unités élimine un ennemi de la voie partenaire | +1,4 (élite +6) |
| Dégâts infligés à un boss de la voie partenaire | +16 par 100 % de ses PV |
| Fuyard abattu avant le Core | +2 (+3,5 s'il venait de la voie partenaire) |
| Les deux voies tenues sans aucune fuite | +12 |
| Pouvoir lancé alors que ta voie est vide → il frappe la voie partenaire | +7 |
| Deux pouvoirs de l'équipe à moins de 4 s d'écart (1×/vague) | +6 |
| Combo d'entraide (éclair sur cible trempée…) | +0,8 (1×/2 s/unité) |
| Faille fermée grâce aux unités du partenaire | +8 |

**Déclenchement** (combat uniquement) : l'un des deux appuie sur DUO → canalisation de 2,2 s (étoile au-dessus du Bastion), la jauge est vidée. L'autre peut appuyer sur **SYNCHRO** pendant la canalisation : effet **+30 %**. Si la vague se termine avant l'impact, la jauge est rendue. Une IA partenaire synchronise ; une équipe 100 % IA déclenche en cas de boss, de fuites ou de Core en danger.

**21 capacités** (15 paires + 6 « échos » si les deux joueurs ont la même armée), composées de blocs d'effets data-driven (`stun`, `slow`, `push`, `mark`, `nova`, `burn`, `poison`, `execute`, `haste`, `dmg`, `heal`, `shield`, `coreHeal`, `raise`, `summon`, `revive`, `dark`). Puissance indexée sur la difficulté lissée de la vague (`waveToughness`) : forte, jamais une vague gagnée automatiquement (exécution limitée aux ennemis affaiblis, boss -5 à -8 %).
Exemples : Astral + Rouages **Matrice Stellaire** (gel 2 s + surcharge), Ronces + Abysses **Mangrove Primordiale**, Solaire + Nécrose **Éclipse Totale**, Astral + Solaire **Supernova**, Rouages + Nécrose **Machine Interdite** (les unités détruites de la vague reviennent en fantômes), Abysses + Rouages **Léviathan Mécanique**.

## 6. MODULES DU BASTION (`src/data/modules.ts`)
Le Core a **3 emplacements**. 13 modules, 4 familles, 3 niveaux, payés en Éther (35–50 puis 50–80 puis 80–120).
- **Défense** : Rempart (-12/20/28 % dégâts de fuite), Égide (bouclier rechargé chaque vague), Restauration (+PV par vague).
- **Artillerie** : Canon du Bastion (+40/80/130 % dégâts, portée), Rayon Prismatique (frappe l'ennemi le plus robuste), Chaîne d'Orage (rebonds), Onde Bastion (choc de zone).
- **Soutien** : Aura de Cadence (arrière-ligne +10/18/26 % cadence), Forge d'Éther (+Éther pour les deux), Trésor (+or par vague pour les deux).
- **Contrôle** : Champ de Givre (ralentit près du Core), Portail de Repli (renvoie les premiers fuyards au début de la voie), Entrave (étourdit / interrompt les boss).

**Décision commune** : un joueur **propose** (son Éther est mis en séquestre), le partenaire **valide** (et paie la moitié s'il le peut) ou **refuse** (remboursement). Sans réponse : **accord tacite après 15 s**. Un partenaire IA répond immédiatement. Démonter rend 50 % de l'Éther investi. Le Bastion affiche visuellement ses modules (une pièce par emplacement, plus grande avec le niveau ; dôme pour l'Égide).

## 7. ORDRES TACTIQUES (`src/data/tactics.ts`, `applyOrder`)
2 charges par vague (3 avec l'anomalie Veille), 4 s entre deux ordres. Bouton ORDRES → 5 icônes ; les ordres ciblés attendent un toucher sur le terrain pendant 2,5 s, sinon ils choisissent eux-mêmes la meilleure cible.
FOCUS (cible prioritaire, +15 % dégâts, 7 s) · RALLIEMENT (zone 3,5 m : -25 % dégâts subis, +15 % cadence, 6 s) · REPLI (unités mobiles reculent de 3 m, -30 % dégâts, 5 s — esquive des attaques télégraphiées) · INTERCEPTION (chasse aux fuyards, +30 % vitesse, 8 s) · PURGE (retire brouillard/brouillage et les effets négatifs, +10 % PV).

## 8. BOSS
Introduction courte (épithète, nom, mécanique, assombrissement, léger zoom), barre de boss. **Attaques télégraphiées** (`slam`) : une zone rouge se remplit sur le groupe d'unités le plus dense, l'impact tombe après 1,5–1,8 s ; **un étourdissement interrompt l'attaque** (Gel, IEM, Entrave, Résonance…). **Phases** (`phases` dans `src/data/enemies.ts`) : bouclier, invocations, accélération, attaques plus fréquentes (Colosse, Reine-Essaim, Primordial 3 phases, Alpha Runique, Ingénieur). Les brûlures / poisons **coupent la régénération** des ennemis (contre-jeu des boss régénérants).

## 9. FAILLES SECONDAIRES
32 % des vagues non-boss à partir de la vague 4 (3 en partie courte), même vague et même récompense pour toutes les voies. Une Faille s'ouvre au bord de chaque voie : **ignorée**, elle crache 6 ennemis ; **fermée** par 1–2 unités mobiles affectées pendant la préparation (les tours ne bougent pas) : or, Éther, +22 Résonance, rune de faille temporaire ou pouvoirs rechargés. Risque : ces unités quittent la défense.

## 10. ANOMALIES (vagues 4, 8, 12, 16, 20 ; 3, 6, 9 en partie courte)
3 anomalies proposées (mêmes pour tout le monde), effet pendant 3 vagues, **choix commun** (désaccord → le hasard tranche entre les deux votes). 10 anomalies : Pacte de la Faille, Tempête d'Éther, Rune Instable, Fortune du Bastion, Sacrifice du Core, Éclipse, Résonance Instable, Arsenal, Veille Tactique, Contrat de Faille.

## 11. Graines, journal, défi du jour
- Le **monde** (runes, événements, Failles, offres d'anomalies) est tiré par `worldRand(seed, …)` : il ne dépend **que** de la graine, jamais des actions des joueurs. `?seed=123` rejoue un monde en solo.
- **Journal déterministe** (`GameState.journal`) : achats, améliorations, fusions, ventes, envois majeurs, malédictions, modules, anomalies, Failles, Résonance, premières fuites, dégâts au Core par vague, défenses sauvées, résultat. Fin de partie : **timeline** + moments forts (MVP, dégâts, encaissé, soins, contrôle, meilleur investissement) + une piste bienveillante.
- **Défi du jour** : Survie, graine et armées du jour, record local. Classement en ligne prêt (`supabase/migrations/002_daily_challenge.sql`, non appliqué).

## 12. Économie (`src/data/economy.ts`)
Or (unités, ouvriers), Éther (ouvriers, Forge : envois, malédictions, modules, pouvoirs). Revenu par vague + primes + bonus voie tenue + Trésor. Envois : prix +30 % par copie, plafond par vague, recharges ; **v0.4 : leur puissance suit la courbe des vagues et ils marchent avec la vague**.

## 13. Réseau (hôte autoritaire)
L'invité envoie des **commandes** numérotées ; l'hôte **valide** (coûts, phases, recharges, propriétaire, cibles), **applique**, puis diffuse le méta-état (≤ 3 Hz) et les entités (≈ 8 Hz). v0.4 :
- toutes les nouvelles actions sont des commandes validées par `applyCommand` (`reso`, `order`, `module`, `moduleVote`, `anomaly`, `rift`) ;
- **anti-rejeu / double-clic** : numéro de commande croissant par joueur, l'hôte ignore tout numéro déjà vu ; **anti-spam** : 15 commandes/s max ;
- états de décision (proposition de module, votes, canalisation de Résonance) stockés dans l'état de jeu : une reconnexion retrouve la décision en cours ; accord tacite et résolution forcée au lancement de la vague évitent tout blocage ;
- la Résonance ne peut pas être déclenchée deux fois (la jauge est vidée au premier ordre ; un second appui du partenaire = synchronisation, au-delà : refus).

## 14. Équilibrage
`npx tsx scripts/balance-report.ts 300` → `BALANCE_REPORT.md` : efficacité analytique des unités, banc PvE par voie, budget minimum pour tenir chaque vague, ligue de duels IA instrumentée (économie, défense, envois, pouvoirs, progression, synergies, fusions, mécaniques v0.4, matchups, cause de victoire, combats bloqués, Résonance). Outils : `scripts/calibrate.ts` (biais du modèle par armée), `scripts/leaks-by-wave.ts`, `scripts/army-mix.ts`, `scripts/trace-stall.ts`.
Modèle : force ≈ √(ΣDPS × ΣPV effectifs), PV effectifs des tireurs ×1,6 (ils combattent derrière la ligne de front).

## 15. Confort et lisibilité
Options : graphismes ÉLEVÉ / MOYEN / BAS, secousses (normales / réduites / aucune), flashs, vibrations. Micro-ralentis visuels (jamais de la simulation) sur les gros impacts. Flèches de direction des ennemis en préparation, zones rouges télégraphiées, anneaux de couleur (cible FOCUS, unités affectées à la Faille, ralliement, paires fusionnables), cases dangereuses.

## 16. Architecture
```
src/data      données (unités, ennemis, vagues, économie, pouvoirs, résonance, modules, ordres/anomalies/failles, synergies)
src/sim       GameState, game (commandes, phases, modules, anomalies, journal), combat (combat, ciblage, capacités, Core, ordres, Résonance), ai, balance, resonance, synergy, rng
src/net       snapshot (vue + interpolation), transport (Supabase Realtime / BroadcastChannel), Session (lobby, synchro, anti-rejeu), backend
src/render    Renderer, environment, characters/shapes/towers (modèles procéduraux), fx (particules), numbers
src/ui        Hud, screens, Tutorial, icons, styles
src/audio     AudioSystem (sons procéduraux)
src/save      SaveSystem (profil, préférences, records, défi du jour)
```


## 17. Direction artistique (v0.5 « Crépuscule »)
- **Ambiance** : crépuscule → heure bleue → nuit magique selon la vague ; ombres bleu nuit, lumière chaude rasante, contre-jour froid ; tout ce qui est magique est émissif en HDR et fait briller l'image (halo lumineux).
- **Lisibilité** : champ de bataille plat et dégagé (dalles), décor sur les bords et au fond, côté caméra bas, liseré froid sur les unités, zones télégraphiées au-dessus de tout.
- **Bastion** (`src/render/bastion.ts`) : monument vertical ; ses 3 modules changent la silhouette (forme par famille, taille par niveau, bannière).
- **Factions** (`src/render/terrain.ts`, `characters.ts`) : décor de voie, particules ambiantes, signature sur chaque unité, palettes des tours.
- **Boss** : le Primordial évolue visuellement à 66 % et 33 % de PV ; les portails passent au rouge pendant les vagues de boss.
- **Qualité** : ULTRA (cartes dédiées : MSAA 4×, GTAO, rayons de lumière, ombres 4096, lanternes éclairantes, reflets partout), ÉLEVÉ (PBR, ombres, halo ½ rés., FXAA), MOYEN (PBR sur les héros, halo ⅓ rés.), BAS (Lambert, sans post-traitement). Résolution dynamique sur ÉLEVÉ / ULTRA (vise la fréquence de l'écran, 144 Hz compris). Test de performance : `?bench`.
