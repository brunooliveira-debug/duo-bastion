# DUO BASTION v0.6 « Ultra » : rendu pour cartes graphiques dédiées

Version 0.6.0-alpha. Objectif : un niveau **ULTRA** pour les cartes NVIDIA / AMD (référence : RTX 3060 Ti) avec un rendu amélioré, et une cible de **144 images/s**.

## Ce qui a été ajouté

### Niveau ULTRA (`src/render/look.ts`)

- **Anticrénelage MSAA 4×** sur le rendu HDR, à la place du FXAA.
- **Occlusion ambiante GTAO** : ombres de contact au pied des unités, des murets, des tours et dans les recoins.
  - Calculée à mi-résolution à partir de la profondeur du rendu principal, puis débruitée.
  - Le `GTAOPass` de Three r169 n'a pas été utilisé : il re-dessine toute la scène (deux fois plus d'appels de dessin, ce qui pèse sur le processeur à 144 i/s) et plante si on lui fournit une profondeur existante.
- **Rayons de lumière** qui partent du réacteur du Bastion, plus forts pendant une Résonance.
- **Finition cinéma** : netteté renforcée, légère aberration chromatique dans les coins, grain fin.
- **Reflets d'environnement sur toutes les surfaces** : sol, chemin, rochers.
- **Halo lumineux** plus fort et calculé à plus haute résolution.

### Environnement ULTRA (`environment.ts`)

- Ombres en 4096×4096, adoucies.
- Dalles en texture 1024 avec filtrage anisotrope 16×.
- **8 vraies lumières chaudes** qui suivent les lanternes et braseros les plus proches de la caméra. Leur nombre reste fixe, donc aucune recompilation de shaders.
- 2× plus de particules d'ambiance et +30 % d'effets.

### Résolution dynamique (`src/render/governor.ts`, ÉLEVÉ et ULTRA)

- Le jeu détecte la fréquence de l'écran (60, 120, 144, 165, 240 Hz…).
- Il baisse la résolution de rendu par paliers de 10 % quand les images ne suivent plus (jusqu'à 60 % en ULTRA), et la remonte doucement quand il reste de la marge.
- Désactivable dans les options.

### Détection de la carte graphique (`src/render/gpu.ts`)

- Une carte NVIDIA GeForce, RTX, GTX ou Quadro, AMD Radeon RX ou Pro, ou Intel Arc passe en ULTRA par défaut.
- Les joueurs déjà en ÉLEVÉ sur ce type de carte basculent une fois en ULTRA, et peuvent revenir en arrière dans les options.

### Test de performance intégré (`src/bench.ts`)

- Lancement : **Options → « Test de performance (20 s) »**, ou l'adresse `…/duo-bastion/?bench`.
- Scène fixe : graine 777, armée améliorée, vague de la Reine-Essaim.
- Un trajet de caméra de 20 s, puis un rapport à copier : FPS moyen, 1 % bas, temps d'image, temps GPU (si le navigateur le permet), temps processeur, résolution, échelle dynamique, fréquence de l'écran.

### Image 4K de l'écran titre

- Rendue **par le moteur du jeu lui-même**, en ULTRA, en 3840×2160 (`src/ui/art/menu-4k.webp`, 0,7 Mo).
- Version 1920×1080 pour les petits écrans (`menu-1080.webp`, 0,18 Mo).
- Cadrage : le Bastion à droite, l'armée et les ruines à gauche, le centre dégagé pour le menu. En portrait, le recadrage garde le Bastion dans l'image.
- Outil pour la régénérer : `scripts/capture-receiver.mjs`.

## Corrections

- **Pont (signalé)** : le tablier et le dallage étaient exactement à la même hauteur, ce qui produisait un clignotement en bandes (z-fighting).
  - Le tablier est désormais sous les dalles.
  - Les morceaux de chemin (côté Bastion, pont, voie) se suivent sans se chevaucher.
  - Les bords du dallage se replient sous le tablier au lieu de pendre dans le vide.
  - Test de non-régression ajouté.
- **Sécurité (triche en ligne)** : l'hôte appliquait les commandes de debug envoyées par l'invité (+500 or, tuer tout, etc.). Elles sont maintenant refusées. Le test multijoueur le vérifie.
- **Détection des cartes Intel Arc** : le « (TM) » du nom empêchait la reconnaissance. Bug trouvé par le nouveau test.

## Mesures (ce PC : Intel UHD intégré, 1280×720, test de performance intégré, résolution fixe)

| Qualité | FPS moyen | 1 % bas | GPU / image | Appels de dessin |
|---|---|---|---|---|
| ÉLEVÉ | 90 | 48 | 8,1 ms | 234 |
| ULTRA | 40 | 21 | 21,2 ms | 245 |

- **Coût de l'ULTRA** : environ 2,6× l'ÉLEVÉ sur ce GPU intégré, surtout à cause du MSAA 4×. C'est le poste le plus coûteux sur une puce intégrée, mais peu cher sur une carte dédiée.
- **Processeur** : environ 3,5 ms par image en combat, mesuré sur ce PC portable (rendu three.js 2,1 ms, logique 1 ms). C'est compatible avec le budget de 6,9 ms d'une image à 144 i/s.

**RTX 3060 Ti : non mesuré, je n'ai pas cette carte.**

- **Estimation** (écart de puissance ≈ ×8 à ×12 avec ce GPU intégré, à prendre comme un ordre de grandeur) :
  - environ 4 à 5 ms par image en 1080p, donc 144 i/s atteignable à pleine résolution ;
  - environ 7 à 9 ms en 1440p : la résolution dynamique descendrait vers 80-90 % pour tenir 144 i/s.
- **Vérification** : le **test de performance intégré** permet de mesurer les vrais chiffres en 20 s. Le rapport peut être copié et collé.

## Validation

- `npm test` : **60/60** (55 + 5 nouveaux) : résolution dynamique (apprentissage d'un écran 144 Hz, baisse puis remontée, coupures ignorées), détection de carte, pont, refus du debug réseau.
- `npm run build` : OK.
- **Navigateur** : ULTRA, ÉLEVÉ, MOYEN et BAS rendus sans erreur de shader ; test de performance de bout en bout ; écran titre avec l'image 4K.

## Captures (`docs/captures/`)

- `v06_eleve.jpg` / `v06_ultra.jpg` : même vue, ÉLEVÉ puis ULTRA. En ULTRA : lumières chaudes des lanternes, ombres de contact au pied des tours, reflets sur les dalles, bords plus nets.
- `v06_ultra_bastion.jpg`, `v06_menu.jpg`, `v06_pont_corrige.jpg`.
