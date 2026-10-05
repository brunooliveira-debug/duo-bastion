# DUO BASTION — Game Design Document technique (v0.1)

> Nom de travail, centralisé dans `src/config.ts`, `index.html`, `public/manifest.webmanifest`.

## 1. Pitch
Tower-defense / auto-battler **coopératif à deux** sur téléphone. Chaque joueur défend sa voie ; les deux partagent un **Core**. On construit entre les vagues, le combat est automatique. Dilemme central : **économie (ouvriers, Raiders → revenu) vs défense immédiate**. Inspiré des *principes* du genre « Legion TD » — aucun nom, asset, texte, carte ou code repris.

## 2. Univers (original)
Science-fantasy : la **Faille** vomit les *Dissonants* (créatures fêlées). Six factions défendent les Bastions : **Astréens** (chevaliers stellaires), **Concordat des Rouages** (machines conscientes), **Les Ronces** (forêt-qui-marche), **Marée Abyssale** (colosses des fosses), **Ordre Solaire** (mages à soleils captifs), **Voile Nécrose** (ombres liées par serment).

## 3. Boucle de jeu
Partie = 10 (courte) ou 21 vagues (+ infini en Survie). Chaque round :
1. **Préparation** (45 s puis 35 s, finit plus tôt si tout le monde est PRÊT) : acheter / placer / déplacer / vendre / faire évoluer des unités, ouvriers, Raiders, Core, pings.
2. **Combat** (auto, max 80 s) : unités à partir de leur case, ciblage, capacités. Ennemis qui franchissent la ligne de fuite → zone du Core ; un ennemi qui atteint le Core explose (dégâts de fuite).
3. **Résolution** (3 s) : revenu + bonus « voie tenue » (+10), régénération du Core, statistiques.

**Entraide** : tant que des ennemis sont dans ta voie, tes unités la défendent ; dès qu'elle est vide, elles sont **libres** et traversent vers la voie du partenaire / le Core.

## 4. Ressources & économie (`src/data/economy.ts`)
| | Valeur |
|---|---|
| Or de départ | 250 |
| Revenu de départ | 30 / vague |
| Ouvrier | 50 or (+10 par ouvrier possédé), 1 Éther / 10 s, max 20 |
| Vente | 100 % si posée cette vague, sinon 50 % |
| Raiders | Éther → +revenu permanent + pression sur la voie adverse |
| Investir (Survie) | 20 Éther → +4 revenu |

## 5. Combat
- Attaques : Physique, Perforant, Énergétique, Arcanique. Défenses : Légère, Organique, Blindée, Mystique.
- Matrice 80–120 % (chaque attaque : un ↑ 120 %, un ↑ 110 %, un ↓ 90 %, un ↓ 80 %) — pas de hard-counter.
- Armure = réduction plate en %. Provocation (tanks), ralentissements, auras, zone, rebonds, exécution, vol de vie, boucliers.

## 6. Unités MVP (8 + 8 évolutions)
| Unité | Rôle | T | Coût | Évolution |
|---|---|---|---|---|
| Sentinelle Ferraille | Tank éco (provocation) | 1 | 60 | Bastion Ferraille (épines) |
| Lame-Ronce | DPS mêlée (frénésie) | 1 | 75 | Faucheuse-Ronce (vol de vie) |
| Tireuse d'Étoiles | Distance (+25 % vs ralentis) | 2 | 95 | Chasseresse Nova |
| Carapace des Abysses | Tank lourd (onde ralentissante) | 3 | 150 | Léviathan des Fosses |
| Oracle de Braise | Mage zone | 3 | 145 | Gardienne du Soleil Captif |
| Harmoniste Astral | Soutien (aura vitesse + soin) | 2 | 100 | Grand Harmoniste (boucliers) |
| Spectre Vif | Assassin (saut + exécution) | 2 | 85 | Voile Écarlate |
| Exarque Prisme | Carry (éclairs en chaîne) | 5 | 300 | Exarque Ascendant (T6) |

Synergies émergentes : Carapace (ralentit) → Tireuse (+dégâts vs ralentis) ; Harmoniste (aura) → Lame-Ronce (frénésie).

## 7. Draft
6 unités / joueur / partie (≥1 tank, ≥1 DPS, ≥2 unités ≤100 or), 1 relance avant la première construction.

## 8. Vagues
21 vagues data-driven (`src/data/waves.ts`) + générateur infini (Survie). Boss : V5 Brute, V10 Colosse Fêlé, V14 double Brute, V15 Reine-Essaim, V19 quatre Brutes, V21 Dissonant Primordial.

## 9. Raiders (4 MVP)
Grignoteur (10 ✨, +3), Griffe-Zéphyr (20 ✨, +5, rapide), Mur-Coquille (40 ✨, +6, tank), Béhémoth Fendeur (80 ✨, +6, zone). Envoyés à la voie adverse correspondante à la vague suivante.

## 10. Core
2500 PV, 70 dégâts Arcanique, portée 8, +40 PV/vague. Améliorations communes en Éther : Attaque, Régénération, Défense, Puissance (Onde Bastion).

## 11. Pouvoirs
Offerts à la vague 11 (6 en partie courte) : 3 au choix parmi 12 (Surcharge, Investissement, Bouclier du Core, Résonance, Mutation, Fureur, Régénération, Fortune, Contremaître, Rempart, Précision, Éclat).

## 12. Modèle d'équilibrage (`src/sim/balance.ts`)
- DPS effectif = dégâts × vitesse × bonus capacités ; PV effectifs = PV/(1-armure) + soins/boucliers.
- Force d'un groupe (Lanchester) = √(ΣDPS × ΣPVeff), corrigée par la matrice ATT/DEF.
- **Valeur conseillée** = valeur armée × 1,25 / ratio de combat → vert ≥ 100 %, orange ≥ 80 %, rouge sinon.
- Validation : `npx tsx scripts/simulate.ts vsai 21 normal 3` (parties 100 % IA headless).

## 13. IA (`src/sim/ai.ts`)
Mêmes commandes et mêmes informations que les humains (pas de triche). 5 difficultés (Initiation→Maître : ratio cible, placement, délai, usage Core) × 4 personnalités (Défensive, Économique, Agressive, Équilibrée).

## 14. Architecture
```
src/data      données (unités, ennemis, vagues, économie, Raiders, Core, pouvoirs, matrice)
src/sim       GameState, combat (Combat/Targeting/Ability), game (Wave/Economy/Draft/Raider/Core + commandes), ai, balance, rng
src/net       snapshot (état de vue + interpolation), transport (Supabase Realtime / BroadcastChannel), Session (Lobby + sync), backend (Supabase)
src/render    Renderer (Three.js), models (silhouettes procédurales)
src/ui        Hud (HUD, gestes tactiles, panneaux), screens (menus, lobby, options), Tutorial
src/audio     AudioSystem (sons + musique procéduraux WebAudio)
src/save      SaveSystem (profil, préférences, records, reprise de partie)
```
**Réseau** : hôte autoritaire. L'invité envoie des commandes ; l'hôte valide (anti-triche : or, Éther, draft, cases, phases) et diffuse : méta-état (≤3 Hz, si changé), entités compactées (8 entiers/entité, ~8 Hz en combat), événements. L'invité interpole avec ~230 ms de tampon. Aucune écriture SQL temps réel : 1 sauvegarde Postgres par vague (reprise).
