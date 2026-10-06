# PROJECT_STATUS — DUO BASTION

**VERSION ACTUELLE :** 0.3.0-alpha (« Archipel des Bastions » : armées, tours 3D, envois, pouvoirs, duel)
**URL PUBLIQUE (GitHub Pages) :** https://brunooliveira-debug.github.io/duo-bastion/
**DERNIER TEST :** 2026-10-06
- `vitest` 22/22 OK : armées, niveaux 1→5 + spécialisations, fusion, envois et malédictions (limites, prix progressifs, recharges), synergies, pouvoirs, « lancer la vague maintenant », séquence de fin, parties complètes coop et duel, multijoueur hôte/invité (coop + duel) via le vrai protocole réseau.
- Analyse d'équilibrage automatique : `npx tsx scripts/balance-report.ts 300` → `BALANCE_REPORT.md` (efficacité des 36 unités par niveau, budget minimum pour tenir chaque vague par armée, ligue de 300 duels IA). Dernière ligue : Rouages 61 %, Astral 54 %, Ronces 50 %, Nécrose 48 %, Brasier 46 %, Abysses 42 % ; 48 % des duels se terminent avant la vague 21.
- Navigateur (dev) : choix d'armée, construction, tours, combat, pouvoirs, panneau d'unité, menu d'attaque, fin de partie, au format PC et téléphone 844×390.

## INFRA (0 €)
- Supabase Free : projet `duo-bastion` (réf `evadmavhnpabnckyddap`, Europe), migration `supabase/migrations/001_init.sql` appliquée, connexion anonyme activée.
- GitHub : https://github.com/brunooliveira-debug/duo-bastion (public, requis pour Pages gratuit)
- Hébergement : GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`).
- Clé client : clé *publishable* Supabase dans `.env.production` (publique par conception, protégée par RLS). Aucune clé secrète dans le code.

## TERMINÉ
- v0.3 — gameplay :
  - 6 armées × 6 unités (Ordre Astral, Concordat des Rouages, Les Ronces, Marée Abyssale, Brasier Solaire, Voile Nécrose), chacune avec style, forces, faiblesses et 3 pouvoirs de commandant (recharge, améliorables en Éther). Choix avant la partie (solo et lobby), option Aléatoire (+40 or, +25 % XP).
  - Unités niveau 1 → 5, spécialisation définitive A/B au niveau 4, fusion de 2 unités identiques (rembourse l'excédent), catégories (défense, lourde, portée, anti-blindage, zone, soutien, rapide, spéciale).
  - Capacités : zone, ralentissement, brûlure, poison, étourdissement, boucliers, soins, accélération, camouflage, anti-blindage, anti-boss, invocations, rebonds, exécution, provocation, régénération…
  - Terrain stratégique : première ligne (+PV défenseurs), arrière (+portée), cases runiques, 11 synergies entre voisins, unités qui tiennent leur position (laisse) ; tours fixes pour les unités à distance / soutien.
  - Envois d'ennemis (11 paquets débloqués progressivement, ciblage de la voie adverse, plafond par vague, +30 % par copie, recharges pour les champions) + 5 malédictions courtes (PV, bouclier, hâte, brouillard, brouillage). Fiche adversaire (infos partielles).
  - Préparation plus longue (60 s puis 43 → 54 s, +8 s avant un boss), compte à rebours visible, bouton « LANCER la vague maintenant ».
  - Boss / mini-boss toutes les 2–5 vagues avec mécanique (vitesse, régénération, bouclier rechargeable, résistance physique / explosions, invocations, rage), alerte + barre de boss. Événements aléatoires annoncés (double récompense, invasion, élite, brouillard, surcharge, vent de faille).
  - Mode Duel 1 contre 1 (chaque joueur + un allié IA). Fin de partie : Core qui cède au ralenti puis écran avec durée, éliminations, dégâts, unités, meilleure unité, ennemis envoyés, améliorations.
- v0.3 — rendu (références « tower defense 30 angles ») : îles flottantes à falaises en colonnes, chemin de terre, herbe, clôtures, lanternes, ponts à torches, rivières et cascades, sapins animés par le vent, château protégeant le Core, oiseaux, cycle jour → coucher → nuit selon les vagues ; 9 types de tours procédurales (archers, canon orientable avec recul, cristal magique, glace, feu, poison, sanctuaire, flèche électrique, nécro) qui changent d'architecture à chaque niveau ; ennemis gobelins / orcs / ogres / squelettes / chauves-souris / loups / géant de lave ; projectiles 3D réels (flèches, carreaux, harpons, boulets, boules de feu, orbes, glace, poison, missiles), éclairs, explosions (flash, feu, fumée, débris, onde, brûlure au sol, lumière), arcs de frappe, critiques, chiffres de dégâts regroupés, animations de mort ; rendu instancié (≈ 100–130 appels de dessin en combat).
- v0.3 — interface : pastilles style réf. 29 (vies, or, Éther, vague), cartes avec portraits 3D et prix, barre de pouvoirs en combat, panneau d'unité latéral (stats, niveau, spécialisation, fusion, vente), menu Attaquer, synergies, pause, vitesse, rotation caméra (2 doigts / Maj+molette).
- Hérité de v0.1–0.2 : multijoueur hôte autoritaire (anti-triche), lobby avec code + lien, reconnexion, pause à deux, IA de relève, PWA, audio procédural, sauvegarde, tutoriel, survie.

## EN COURS
- (rien)

## À FAIRE
- Retours de vraies parties à deux → équilibrage fin (la ligue IA reste une estimation).
- APK Android (Capacitor), cosmétiques, biomes (hiver / désert) en option de carte.

## BUGS CONNUS
- Si l'hôte met le jeu en arrière-plan, la simulation se met en pause pour les deux : l'hôte doit garder le jeu au premier plan.
- Les sauvegardes de parties v0.2 en cours ne sont pas reprises en v0.3 (format changé) : elles sont ignorées proprement.
- Mineur : le service worker ne s'enregistre pas dans le navigateur intégré de l'app (sans impact sur Chrome/Safari).

## SÉCURITÉ — ACTION UTILISATEUR
- Une clé secrète Supabase (`sb_secret_…`) a été collée dans le chat : à **révoquer** dans Supabase → Project Settings → API Keys → Secret keys. Le jeu ne l'utilise pas.

## PROCHAINE ÉTAPE
Parties réelles à deux (coop et duel) sur téléphones → ajuster coûts / vagues avec `scripts/balance-report.ts`.
