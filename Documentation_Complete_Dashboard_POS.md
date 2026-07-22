
---
title: "Dashboard POS — Documentation technique complète"
subtitle: "Vision, architecture, analyse de la base de données, plan officiel de développement et fiches pratiques"
date: "22 juillet 2026"
lang: fr
toc: true
toc-depth: 3
---

# Partie 1 -- Vision et objectifs du projet

```{=latex}
\begin{tldrbox}
\begin{itemize}
\item Ce document unique regroupe l'intégralité de la documentation technique produite pour le projet Dashboard POS : vision, architecture cible, analyse complète de la base de données, plan officiel de développement en 22 étapes, et toutes les fiches pratiques par écran et par rapport.
\item Deux fiches ont été mises à jour après une capture d'écran plus précise et une décision produit de simplification : l'écran \textbf{Règlement} et le \textbf{Tableau de bord du jour}. Leurs versions corrigées et définitives se trouvent en Partie 5 ; les entrées correspondantes en Partie 6 renvoient vers cette version à jour plutôt que de répéter une information dépassée.
\item Magasin unique dans le dump analysé (\texttt{num\_magasin = 1}), commerce de type institut de beauté / hammam-spa / salon de coiffure-barbier, 129 Bd Anfa, Casablanca. Logiciel de caisse : Clyo Systems, base MySQL / MyISAM \texttt{dbclyo}.
\end{itemize}
\end{tldrbox}
```

## 1.1 Objectif du projet

L'objectif de ce projet est de concevoir et développer une application de tableau de bord (Dashboard) moderne, destinée aux dirigeants, propriétaires et responsables d'entreprise. Cette application est connectée en temps réel ou de manière synchronisée à un logiciel de caisse (POS) installé sur ordinateur (Desktop).

Le rôle principal de cette application est de centraliser toutes les données provenant de la caisse afin de les présenter sous une forme claire, visuelle et exploitable pour la prise de décision.

## 1.2 Fonctionnalités principales

L'application récupère automatiquement les informations du logiciel de caisse, notamment : le chiffre d'affaires (journalier, hebdomadaire, mensuel et annuel), les ventes en temps réel, les statistiques de vente, les rapports détaillés, les produits les plus vendus, les catégories les plus performantes, les marges et bénéfices, les moyens de paiement, les remises accordées, les remboursements et annulations, les clients et leur historique d'achat, les performances des employés et des caissiers, les mouvements de stock, et les alertes (rupture de stock, anomalies, baisse des ventes, etc.).

## 1.3 Tableau de bord

Le Dashboard offre une interface moderne, intuitive et responsive, avec notamment : des graphiques interactifs, des indicateurs de performance (KPI), des cartes statistiques, des tableaux filtrables, des comparaisons entre différentes périodes, des rapports exportables (PDF, Excel, CSV), des filtres par magasin, utilisateur, période ou catégorie, et une actualisation automatique des données.

## 1.4 Architecture générale attendue

L'application Dashboard est totalement indépendante du logiciel de caisse tout en étant capable de communiquer avec celui-ci grâce à un système de synchronisation sécurisé (API, base de données ou autre mécanisme de communication). Elle doit pouvoir fonctionner avec un ou plusieurs points de vente et permettre la centralisation des données dans une seule interface. Le détail technique de cette architecture est développé en Partie 2.

## 1.5 Objectif final

Créer une solution de Business Intelligence dédiée aux logiciels de caisse, permettant aux propriétaires et gestionnaires de suivre en temps réel l'activité de leur entreprise, d'analyser leurs performances et de prendre des décisions rapides grâce à des tableaux de bord clairs, précis et interactifs.



# Partie 2 -- Architecture technique : de la base de données à l'application web

## 2.0 Schémas de référence

Les deux schémas ci-dessous sont la référence visuelle pour tout le reste de ce document.

![Schéma entités-relations complet de la base de données `dbclyo`](schema_diagram.png){width=95%}

![Schéma d'architecture applicative cible -- de la caisse à l'application web](schema_architecture_application.png){width=95%}


```{=latex}
\begin{tldrbox}
\begin{itemize}
\item Ce guide répond à une question précise : \textbf{comment passer des données brutes de la caisse (MySQL / MyISAM) à un tableau de bord affiché dans un navigateur ?} Il complète les fiches par rapport (qui donnent le \emph{quoi} : tables, colonnes, calculs) avec le \emph{comment} : la chaîne technique bout en bout.
\item Quatre maillons, dans l'ordre : (1) la base MySQL de la caisse, jamais modifiée ; (2) une couche de synchronisation en lecture seule vers une base de reporting ; (3) une API backend qui transforme les requêtes SQL déjà écrites en endpoints JSON ; (4) une application web frontend qui affiche des cartes KPI, tableaux et graphiques.
\item Règle d'or : \textbf{ne jamais faire lire ni écrire l'application web directement sur la base de production de la caisse}. Un dashboard mal optimisé pourrait ralentir l'encaissement en boutique -- un risque commercial inacceptable pour un institut qui encaisse des clients en continu.
\item Le schéma \texttt{schema\_architecture\_application.png} (fourni dans le dossier \texttt{00\_Schemas}) illustre visuellement les quatre maillons ci-dessus.
\end{itemize}
\end{tldrbox}
```

## 1. Pourquoi ne pas brancher l'application web directement sur la base de la caisse

La base `dbclyo` est en moteur **MyISAM** (pas InnoDB) : les verrous d'écriture y sont posés au niveau de la table entière, pas ligne par ligne. Une requête lourde lancée par le dashboard (par exemple l'agrégation d'un rapport sur 18 mois d'historique) peut donc **bloquer momentanément les écritures de la caisse** -- c'est-à-dire ralentir l'encaissement d'un client en boutique. C'est un risque à éliminer dès la conception, pas à corriger après coup.

```{=latex}
\begin{warnbox}
Ne jamais connecter le nouveau backend directement sur la base MySQL de production de la caisse avec un utilisateur ayant des droits d'écriture. Même en lecture seule, une requête mal indexée peut dégrader les performances de la caisse. La séparation décrite ci-dessous (base de reporting distincte) protège le cœur de métier de l'institut.
\end{warnbox}
```

## 2. Les quatre maillons de la chaîne

### 2.1 La base de la caisse (inchangée)

Le logiciel Clyo Systems continue de fonctionner exactement comme aujourd'hui, sur son poste Windows, avec sa base MySQL locale (`ne_fichier`, `nl_fichier`, `corres_des`, etc., déjà cartographiées dans les documents précédents). **Aucune modification n'est nécessaire ici.**

### 2.2 La couche de synchronisation (à construire)

Il s'agit de copier les données, en lecture seule, vers une base séparée dédiée au reporting. Deux approches possibles, par ordre de préférence :

- **Réplication MySQL native** (`master/replica`) : la base de la caisse déclare un utilisateur de réplication, et une seconde instance MySQL (locale au même réseau, ou dans le cloud si une liaison internet stable existe) se synchronise en continu. Avantage : données à jour en quelques secondes, sans impact mesurable sur la base source. C'est l'option recommandée si le magasin dispose d'une bonne connexion internet ou d'un réseau local stable.
- **Export planifié (ETL léger)** : un script (cron toutes les 1 à 5 minutes) exécute un `SELECT` sur les tables modifiées récemment (`updated_on`, disponible sur la quasi-totalité des tables du schéma) et les insère dans la base de reporting. Moins instantané, mais plus simple à mettre en place et suffisant pour un usage de pilotage (les KPI n'ont pas besoin d'une fraîcheur à la seconde près, sauf le tableau de bord du jour).

Dans les deux cas, créer les vues `vw_ne` et `vw_nl` (définies dans le document principal) **sur la base de reporting**, jamais sur la base de production.

### 2.3 L'API backend (à construire)

Un serveur applicatif (Node.js / Express, ou équivalent dans la stack de votre choix -- Python / FastAPI, PHP / Laravel, etc.) qui :

- se connecte uniquement à la base de reporting, avec un utilisateur MySQL **en lecture seule** ;
- expose un endpoint HTTP par rapport (repris un à un des fiches fournies dans ce pack : `GET /api/rapports/ventes-articles`, `GET /api/dashboard/jour`, `GET /api/rapports/ca-vendeur`, etc.) ;
- exécute les requêtes SQL déjà écrites dans chaque fiche, avec les filtres reçus en paramètres de requête (`date_debut`, `date_fin`, `vendeur`, `famille`, ...) ;
- gère le cache (voir 2.4) et l'authentification (voir 2.5) ;
- renvoie du JSON, jamais du HTML -- le rendu visuel est entièrement du côté du frontend.

```{=latex}
\begin{notebox}
Convention recommandée : un module backend par grande famille de rapports (ventes, paiements, employés, clients), chaque module exposant ses propres routes mais partageant les mêmes fonctions utilitaires de connexion et de cache. Cela reproduit la structure du menu « Rapports et analyses » du logiciel existant, ce qui facilite la correspondance pour toute l'équipe (développeurs et utilisateurs métier).
\end{notebox}
```

### 2.4 Le cache

Comme détaillé fiche par fiche, une période entièrement passée (avant la dernière clôture) ne change plus jamais : son résultat peut être mis en cache indéfiniment. Seule la journée en cours (ou la période si elle inclut aujourd'hui) doit être recalculée fréquemment. Concrètement :

- Utiliser une clé de cache = `(nom_du_rapport, tous_les_filtres_concaténés)`.
- Invalider uniquement les clés qui contiennent la date du jour, à chaque nouvelle synchronisation.
- Un cache mémoire simple suffit pour un seul magasin ; passer à Redis si plusieurs magasins ou plusieurs instances du backend doivent partager le même cache.

### 2.5 L'application web frontend (à construire)

Une application React (ou Vue / Angular selon les préférences de l'équipe) qui consomme les endpoints JSON de l'API et affiche :

- des cartes KPI (chiffre d'affaires, tickets, panier moyen...) ;
- des graphiques (bibliothèque type Recharts, Chart.js ou ECharts -- voir les recommandations spécifiques dans chaque fiche) ;
- des tableaux filtrables et exportables (TanStack Table ou AG Grid) ;
- une authentification (connexion par identifiant / mot de passe, jetons JWT), avec des rôles distincts (gérant : accès à tout, y compris la masse salariale ; employé : accès restreint à ses propres statistiques, par exemple).

```{=latex}
\begin{warnbox}
Les données de rémunération et de pointage (fiche « Rapport pointeuse ») sont sensibles : restreindre leur accès au seul rôle gérant / responsable RH dans l'application web, contrairement au reste des KPI commerciaux qui peuvent être plus largement partagés avec l'équipe.
\end{warnbox}
```

## 3. Ordre de développement conseillé

1. Mettre en place la synchronisation en lecture seule (2.2) et valider, sur quelques jours, que les chiffres de la base de reporting correspondent exactement à l'écran caisse (même méthode de validation croisée que celle utilisée dans l'analyse de ce dossier).
2. Développer l'API backend en commençant par les rapports du dossier `Rapports_Journaliers` (plus simples, un seul jour, déjà validés au centime près).
3. Étendre l'API aux rapports du dossier `Rapports_Par_Periode` (même logique, avec une plage de dates au lieu d'un jour unique).
4. Construire le frontend en commençant par la page d'accueil (KPI du jour), puis les pages détaillées (ventes, employés, paiements).
5. Ajouter le cache et l'authentification avant la mise en production.

## 4. Sécurité -- points à ne pas oublier

- Utilisateur MySQL de l'API en lecture seule (`GRANT SELECT`), jamais `INSERT` / `UPDATE` / `DELETE`, même sur la base de reporting.
- Base de reporting non exposée directement sur internet : seule l'API backend y accède, depuis un réseau interne ou via un tunnel sécurisé.
- Jetons d'authentification (JWT) avec expiration courte, et rôles applicatifs distincts (gérant / responsable / employé) comme évoqué en 2.5.
- Journalisation des accès à l'API (qui a consulté quel rapport, quand) -- utile en cas de litige sur des données commerciales sensibles (masse salariale, marges).

## 5. Ce que ce guide ne couvre pas

Ce document décrit l'architecture cible et la démarche de mise en œuvre ; il ne remplace pas les fiches détaillées par rapport (tables, colonnes, requêtes SQL exactes), fournies séparément dans les dossiers `Rapports_Journaliers` et `Rapports_Par_Periode` de ce même pack, ni le schéma entités-relations complet (`00_Schemas/schema_base_de_donnees.png`).


# Partie 3 -- Analyse complète de la base de données

Cette partie reproduit l'intégralité des deux documents d'analyse d'origine : l'analyse des rapports journaliers (section 3.1) et l'analyse des rapports par période, module Statistiques (section 3.2). Ce sont les documents de référence pour la compréhension globale du logiciel, la liste complète des tables, et la hiérarchisation des priorités.

## 3.1 Rapports journaliers -- analyse détaillée


**Fichier analysé :** `SQL25.sql` (105 581 lignes, export MySQL/MyISAM, base `dbclyo`)
**Date de l'analyse :** 21/07/2026

```{=latex}
\begin{tldrbox}
```

- **Logiciel identifié :** Clyo Systems (POS/caisse) — commerce réel : institut de beauté / hammam-spa mono-magasin à Casablanca.
- **Règle n°1 (la plus importante du document) :** utiliser `ne_fichier` / `ne_fichier_day` (+ `nl_fichier` / `nl_fichier_day` pour le détail article) comme **source de vérité** pour tous les KPI de vente et de paiement. `note_entete` / `note_detail` n'est qu'un brouillon de saisie, à ne pas utiliser seul.
- **Chiffres vérifiés au centime près** contre les captures d'écran : CA du jour 32 660,00 · 9 tickets · panier moyen 3 628,89 · répartition règlements Espèces 25 010 / Chèques 2 400 / Carte Bleue 4 500 / Compte Client 750.
- **À valider avec l'éditeur Clyo Systems avant de coder en dur :** la signification exacte des codes `chp_etatl` (N/O/P/R) et `type_ca`, qui distinguent "Vente générale" / "Offert" / "Retour".
- **Sections utiles en premier pour un développeur :** section 3 (schéma visuel), section 7 (requêtes SQL prêtes à l'emploi), section 9 (quelle table pour quel widget).

```{=latex}
\end{tldrbox}
```

---

### 0. Identification du logiciel et du commerce

Avant toute chose, un constat factuel qui conditionne toute l'analyse : cette base **n'est pas un logiciel générique**. Les noms de champs (`chp_des`, `des_coresp`, `chp_nposte`, `idClyo`, `id_clyo_web`), le nom de la base (`dbclyo`) et la structure des tables identifient sans ambiguïté le logiciel de caisse **Clyo Systems**, un éditeur très implanté au Maroc et en France dans la restauration, l'hôtellerie et les instituts de beauté/spa.

Les données réelles présentes dans le dump confirment et affinent ce constat :

- **Établissement** (`tbl_magasin`, magasin n°1) : adresse "129 Bd Anfa", **Casablanca, Maroc** — un point de vente unique (mono-magasin) à ce stade.
- **Familles d'articles** (`tbl_famille`) : *Coupe homme*, *Esthétique*, *Hammam Spa*, *Produits*, *Non classé* — il s'agit d'un **institut de beauté / salon de coiffure / hammam-spa**, et non d'un restaurant, même si le logiciel sous-jacent est conçu à l'origine pour la restauration (d'où la présence de tables "tables", "couverts", "cuisine", "livraison" qui restent inutilisées ici).
- **Personnel réel** (`tbl_users_fixe`) : des noms d'employés réels (1-SAID, 2-BRAHIM, 3-MOUNAIM, 5-YOUSSEF, 7-MARIA, 8-NARJISS, 9-AMAL, Z10-RAJAA, Z11-KHADIJA, Z12-SARA, Z13-SPA, Z99-Manager…) confirment un salon avec plusieurs praticien(ne)s.
- **Services vendus** (`note_detail` / `corres_des`) : "Manicure pédicure", "Demi jambe", "Forfait Spa manicure + Spa pédicure", "Forfait ozone cares", "Soin cheveux", "Protéine", "Barbe", "Coloration" — cohérent à 100 % avec les captures d'écran fournies.

Cette identification a une conséquence directe sur l'analyse : certains modules très développés dans le schéma (gestion de stock produits, cuisine, livraison Deliveroo/Uber Eats, réservations de table, menus composés) sont **structurellement présents mais vides ou quasi-inutilisés** dans ce commerce précis (`tbl_produits` : 0 ligne, `tbl_facture` fournisseur : 0 ligne, `tbl_table` : 0 ligne). Le Dashboard doit donc être conçu pour un logiciel multi-métiers, mais **calibré en priorité sur l'usage réel** : ventes de prestations/services, règlements, comptes clients, pointeuse employés, fidélité.

---

### 1. Compréhension globale

#### Type d'application
Un ERP de caisse (POS) tout-en-un orienté commerce de service/restauration, avec :

- module de vente en caisse (prise de commande, tickets, notes) ;
- module de règlement multi-moyens de paiement ;
- module clients (CRM, comptes courants, fidélité) ;
- module fournisseurs/stock/inventaire ;
- module RH simplifié (utilisateurs, profils, pointeuse) ;
- module fiscal de certification anti-fraude (signatures numériques, totaux cumulés perpétuels — équivalent marocain/français de la norme NF525) ;
- module multi-canal (bornes, application mobile "pocket", plateformes de livraison, menu électronique QR).

#### Architecture générale — le point le plus important de cette analyse

La base repose sur **un circuit de vente en deux temps**, qu'il est essentiel de comprendre avant d'écrire la moindre requête pour le Dashboard :

- **Étape 1 — Saisie / commande en cours** (tables `note_entete` en-tête + `note_detail` lignes) : table de travail où la caisse enregistre les articles au fur et à mesure de la vente, avec un mécanisme de révisions (champ `step`, plusieurs lignes pour un même ticket au fil des modifications).
- **Étape 2 — Encaissement / clôture fiscale** (tables `ne_fichier` + `nl_fichier` pour l'historique clos jusqu'à hier, et `ne_fichier_day` + `nl_fichier_day` pour la journée en cours non encore clôturée) : copie "certifiée" et **définitive** du ticket une fois réglé, avec ventilation du règlement sur 22 colonnes (`chp_reg1` à `chp_reg22`, une par moyen de paiement `tbl_les_reglement.num_regl`). À la clôture de caisse (`tbl_cloture`), le contenu de `*_day` est basculé dans la table permanente puis vidé.

```{=latex}
\begin{factbox}
```

**Preuve empirique** (vérifiée directement sur les dates du dump) :

- `ne_fichier` / `nl_fichier` : du 2025-10-28 au **2026-07-20** (hier)
- `ne_fichier_day` / `nl_fichier_day` : uniquement le **2026-07-21** (aujourd'hui)
- `note_entete` / `note_detail` : du 2025-10-28 au 2026-07-21 (aujourd'hui inclus)

**Constat, établi en croisant précisément les deux sources sur la journée du 21/07/2026** : c'est `ne_fichier_day` (et non `note_entete`) qui correspond **exactement** à ce que l'écran caisse affiche :

- `chp_primary` de `ne_fichier_day` = la colonne "Ticket" de la bande de contrôle ;
- `chp_ntik` = la colonne "Docu…" ;
- `chp_reg1` à `chp_reg22` reproduisent au centime près le détail par moyen de paiement.

En comparant les deux tables sur la même journée, deux écarts ont été identifiés côté `note_entete` / `note_detail` : un ticket réel (règlement "Livraison", 800 DH) n'y apparaît pas de la même façon, et un autre ticket y est dupliqué à cause du mécanisme de révision (`step`). Ces écarts n'existent pas dans `ne_fichier_day` / `nl_fichier_day`.

```{=latex}
\end{factbox}
```

```{=latex}
\begin{notebox}
```

**Conséquence pratique** : `ne_fichier` / `ne_fichier_day` (et `nl_fichier` / `nl_fichier_day` pour le détail article) doivent être la **source primaire** du Dashboard pour tous les KPI de vente et de règlement, malgré la nécessité de faire une `UNION` entre la table "clôturée" et la table "du jour". `note_entete` / `note_detail` reste utile comme vue "brouillon"/temps réel de la commande en cours de saisie, mais ne doit pas servir de source unique pour les KPI officiels sans dédoublonnage préalable sur `step`.

Concrètement : construire deux vues SQL (`vw_ne`, `vw_nl` — voir section 7) qui unifient `ne_fichier` + `ne_fichier_day` et `nl_fichier` + `nl_fichier_day`, à utiliser comme source principale de tous les rapports et KPI du Dashboard. Réserver `note_entete` / `note_detail` à un usage complémentaire (suivi des commandes en cours de saisie, non encore encaissées). Une réconciliation croisée entre les deux circuits est recommandée en phase de développement, avec l'éditeur Clyo Systems, pour comprendre précisément les cas où ils divergent.

```{=latex}
\end{notebox}
```

#### Validation concrète sur les captures d'écran fournies

En recoupant les captures avec les données brutes de `ne_fichier_day` (tickets `chp_primary` 3737 à 3746, tous du 21/07/2026, magasin 1), plusieurs faits sont **vérifiés au centime près, et non de simples hypothèses** :

```{=latex}
\begin{factbox}
```

- Le **Chiffre d'affaires** affiché (32 660,00) = somme exacte de `chp_mont` sur les 10 tickets de la "bande de contrôle" (8500+20000+800+400+750+510+300+800+600+**0**).
- Le compteur **"Tickets : 9"** du tableau de bord exclut le ticket `chp_primary`=3746 (`chp_mont` = 0,00, réglé "---", horodaté 22:04:53) : c'est un ticket **resté ouvert/non finalisé** en caisse au moment de l'export. Le Dashboard doit donc **exclure les tickets à 0 ou non réglés** du comptage (`nombre de tickets`, `ticket moyen`).
- **Ticket moyen = 3 628,89** = 32 660 / 9, confirmé au centime près.
- Le détail de règlement est vérifié **directement sur les colonnes `chp_reg1` à `chp_reg22`** de `ne_fichier_day` : `chp_reg1` (Espèces) = 25 010,00 ; `chp_reg2` (Chèques) = 2 400,00 ; `chp_reg4` (Carte Bleue) = 4 500,00 ; `chp_reg11` (Compte Client) = 750,00 — identiques à l'écran "RÈGLEMENT" fourni.
- Le solde du compte client "simohamed" (`tbl_clients.compte_cl = -750.0000`) correspond exactement au montant "Compte Client" du jour (750).
- La description des lignes vendues dans `nl_fichier_day` (`description_article` : "Soin cheveux", "Manicure pedicure", "Demi jambe", "Forfeit ozone cares", "Forfait Spa manicure + Spa pedicure"…) correspond mot pour mot au rapport "Ventes par articles" des captures.

```{=latex}
\end{factbox}
```

```{=latex}
\begin{warnbox}
```

Le filtre **"Type de vente : Vente générale / Offert"** des rapports est très probablement piloté par `note_detail.chp_etatl` (valeurs observées : `N`, `O`, `P`, `R`) et/ou par `tbl_les_reglement.type_ca` (0 = vente normale, 1 = compte/différé, 2 = offert/invitation-maison, 3 = remise). Ce point **mérite confirmation auprès de l'éditeur/intégrateur avant implémentation finale** : deux mécanismes de "gratuité" semblent coexister (ligne offerte au sein d'un ticket normal vs. paiement intégral par un mode "Invitation"/"Maison") — le dashboard affichait d'ailleurs "Offerts : 0" le même jour où le rapport "Offert" listait pourtant une ligne (Soin cheveux, remise 300). Ce sont deux mécanismes distincts à ne pas confondre lors du développement.

```{=latex}
\end{warnbox}
```

---

### 2. Analyse des tables

La base contient **184 tables**. Beaucoup sont des tables de test (`test`, `test0` à `test99`) ou strictement techniques (configuration écran, disposition des touches caisse). Ci-dessous, l'analyse détaillée porte sur les tables **indispensables et utiles** au Dashboard ; les tables secondaires et techniques sont listées en synthèse à la section 6.

#### 2.1 Module Ventes / Tickets (cœur du système)

**`ne_fichier` / `ne_fichier_day`** — En-tête des tickets encaissés et certifiés — **table pivot recommandée pour le Dashboard** (historique clos / jour en cours)
- Clé primaire : `chp_primary` + `num_magasin`. `chp_primary` correspond exactement au numéro affiché dans la colonne "Ticket" de la bande de contrôle à l'écran caisse ; `chp_ntik` correspond à la colonne "Docu…".
- Colonnes clés : ventilation du règlement sur `chp_reg1` à `chp_reg22` (une colonne par mode de paiement, indices correspondant à `tbl_les_reglement.num_regl`), `chp_mont_ht`, `chp_mont_tva`, `chp_mont` (TTC — vérifié identique au CA affiché à l'écran), `total_remises`, `chp_date`, `chp_ntik`, `chp_nposte`, `chp_ncaisse`, `compte_client`.
- Rôle : version "certifiée fiscalement" du ticket, une fois réglé — utilisée pour les documents légaux (Z de caisse, archive inaltérable) **et vérifiée comme étant la source la plus fidèle à l'écran caisse** (cf. section 0).

**`nl_fichier` / `nl_fichier_day`** — Lignes de vente certifiées correspondantes — **table pivot recommandée pour le détail article**
- Colonnes clés : `chp_ref_prim` (FK vers `ne_fichier(_day).chp_primary`), `des_coresp` (article), `description_article` (libellé, vérifié identique au rapport "Ventes par articles"), `chp_qt`, `chp_prix`, `chp_Tprix` (total ligne), `delta_remise`, `p_achat` / `pamp` (coût d'achat / prix moyen pondéré → **marge calculable ligne par ligne**), `tva_par_article`, `chp_etatligne`.

**`note_entete`** — En-tête de chaque ticket/note en cours de saisie (3 707 lignes)
- Clé primaire : `id_note`
- Colonnes clés : `num_auto` (n° séquentiel caisse), `ntik` (n° ticket imprimé), `step` (n° de révision — **une même vente peut apparaître sur plusieurs lignes si elle a été modifiée après ouverture, à dédupliquer sur le `step` maximum**), `total` (montant TTC du ticket), `num_table`, `negatif` (0/1 — ticket annulé/négatif), `couvert`, `numeroserveur` (identifiant texte du vendeur, lié à `tbl_users_fixe.log_user`), `chp_date`, `num_magasin`, `chp_nposte` (poste de caisse), `compte_client` (0 = pas de client, sinon FK vers `tbl_clients.num_cl`), `chp_tva`, `ClientName`.
- Relations : 1-N vers `note_detail` (via `id_note`) ; N-1 vers `tbl_clients` (via `compte_client`) ; N-1 vers `tbl_users_fixe` (via `numeroserveur` / `log_user`) ; N-1 vers `tbl_magasin` (via `num_magasin`).
- **Point de vigilance identifié pendant l'analyse** : en comparant `note_entete` à `ne_fichier_day` sur la même journée, un ticket réglé par le mode "Livraison" n'a pas été retrouvé dans `note_entete` sous la même forme, et un autre ticket y apparaît deux fois (deux `step` différents). Ne pas utiliser cette table seule comme source de vérité pour les KPI officiels sans dédoublonnage.

**`note_detail`** — Lignes de vente en cours de saisie (7 069 lignes)
- Clé primaire : `id_note_detail`
- Colonnes clés : `id_note` (FK), `num_des_coresp` (FK article/prestation vendu(e), vers `corres_des.des_coresp`), `chp_des` (libellé figé au moment de la vente), `chp_qt` (quantité), `chp_pv` (prix de vente unitaire réellement facturé), `chp_pv_orig` (prix catalogue avant remise), `tx_remise` (taux de remise), `tva_par_article`, `chp_etatl` (état de la ligne : normal/offert/retour…), `chp_hr`, `chp_date`, `client_id`.
- Utile en complément de `nl_fichier(_day)` pour le suivi des commandes en cours, mais soumise à la même réserve que `note_entete` ci-dessus.

**`tbl_caisse_detaille`** — Détail des règlements par ticket (3 872 lignes)
- Colonnes clés : `num_ticket`, `num_reglement` (FK vers `tbl_les_reglement.num_regl`), `montant`, `quantite`, `chp_date`, `etat_ticket`, `num_magasin`.
- C'est la table qui alimente directement l'écran "RÈGLEMENT" (camembert par moyen de paiement) montré en capture. Un ticket "Mixte" génère plusieurs lignes ici (une par mode de paiement).

**`tbl_les_reglement`** — Référentiel des moyens de paiement (22 lignes, réf.)
- Colonnes clés : `num_regl`, `chp_intitule` (Espèces, Chèques, Carte Bleue, Compte Client, Deliveroo, Uber Eats, Invitation, Maison, Avoir, Fidélité, Bon Cadeau…), `type_ca` (0=vente normale, 1=différé/compte, 2=offert, 3=remise), `chp_code_compta` (compte comptable associé — utile pour l'export comptable).

**`tbl_cloture`** — Clôtures de caisse journalières
- `journee_cloture`, `etat_cloture`, `num_magasin`, `export_compta`, `max_nl` / `max_ne` (bornes utilisées pour savoir jusqu'où basculer `*_day` vers l'historique).

**`grand_total_ticket` / `grand_total_periode` / `grand_total_mensuel` / `grand_total_annuel`**
- Totaux cumulés **pré-calculés et signés numériquement** (`signature`) par période. Extrêmement utile : le Dashboard peut lire directement le CA mensuel/annuel officiel ici sans recalculer, une fois la période clôturée (à ne pas utiliser pour le mois/l'année en cours, qui n'y figurent qu'après clôture complète).

**`signature_ticket` / `signature_note` / `signature_archive*` / `tva_par_ticket`**
- Preuves d'intégrité fiscale (norme anti-fraude) — non utiles pour les KPI eux-mêmes, mais indispensables si le Dashboard doit exposer un module "conformité/audit".

#### 2.2 Module Catalogue (articles/prestations vendus)

**`corres_des`** — Catalogue des articles/prestations vendables (table pivot centrale)
- Clé primaire : `des_coresp`
- Colonnes clés : `chp_des` (libellé), `chp_fam` / `chp_ss_fam` (FK famille/sous-famille), `prix_carte` (prix de vente), `tva`, `code_ean`, `etat_article` (actif/inactif), `chp_point_fidelite`.
- C'est le **produit/service** vendu (à ne pas confondre avec `tbl_produits`, qui gère le stock de matières premières).

**`tbl_famille`** (5 lignes réelles : Non classé, Coupe homme, Esthétique, Hammam Spa, Produits) et **`tbl_ss_famille`** (sous-catégories) — indispensables pour les KPI "catégories les plus performantes".

**`tbl_composition`** — Lien entre un article vendu (`num_art`) et les produits de stock consommés (`num_prod`) — recette/nomenclature, utile uniquement si le module stock est activé (ce qui n'est pas le cas ici actuellement).

#### 2.3 Module Clients / Fidélité

**`tbl_clients`** — Fiche client (CRM)
- Clé primaire : `num_cl`
- Colonnes clés : `nom_cl`, `prenom_cl`, `tel`, `email1`, `compte_cl` (solde du compte courant client — négatif = client débiteur), `chp_point_fidelite`, `chp_nbre_passage`, `chp_date_creation`, `chp_date_dernier_passage`, `chp_remise` (remise permanente accordée), `id_categories_fk`, `deleted`.
- Indispensable pour "nombre de clients", "nouveaux clients", "clients fidèles", "meilleurs clients", "historique d'achat" (jointure avec `note_entete.compte_client`).

**`tbl_fidelite`** (paramétrage du programme) et **`tbl_fidelite_point`** (points par client/magasin) — programme de fidélité.

**`tbl_clients_categories`** — Catégories tarifaires clients.

**`tbl_paym_cl`** / **`tbl_client_facture`** / **`tbl_note_client`** / **`ne_fichiercl`** / **`nl_fichiercl`** — Mouvements et factures liés aux comptes clients à terme (paiements différés, factures clients, historique des consommations sur compte).

**`planningprestation`** / **`prestationarcticles`** — Planning de rendez-vous par client/praticien (`idUser`, `idClient`, `DateFrom` / `DateTo`) : très pertinent pour un institut de beauté (taux de remplissage, no-shows), à ne pas négliger dans le Dashboard.

**`tbl_abonnement`** / **`tbl_abonnement_historique`** — Abonnements/forfaits prépayés (n passages restants) — pertinent pour les forfaits Spa constatés dans les ventes.

#### 2.4 Module Employés / Caissiers

**`tbl_users`** — Table historique/par défaut ("VENDEUR 1"…"VENDEUR 15"), **non utilisée en pratique** dans ce commerce (noms génériques, jamais renommés).

**`tbl_users_fixe`** — **Table réellement utilisée** pour les utilisateurs/caissiers (noms réels : 1-SAID, 2-BRAHIM, 3-MOUNAIM, Z99-Manager, etc.). C'est elle qu'il faut joindre à `note_entete.numeroserveur` (= `log_user`) pour tout KPI "CA par vendeur" / "performance employé".

**`tbl_profils`** — Profils de droits (permissions).

**`tbl_pointeuse`** — Pointage horaire des employés (`date_heure_demarre`, `date_heure_arret`, `cout_hr`) — utile pour croiser CA généré et heures travaillées (productivité par employé), et pour la masse salariale (déjà présente dans le tableau de bord, actuellement à 0).

#### 2.5 Module Stock / Achats (présent mais peu/pas utilisé ici)

**`tbl_produits`** (0 ligne dans ce dump), **`tbl_fournisseur`** (0 ligne), **`tbl_facture` / `tbl_fact_detail`** (factures fournisseurs, 0 ligne), **`tbl_inventaire_entete` / `tbl_inventaire_produit`** (inventaires physiques), **`tbl_entrepot`** (entrepôts), **`tbl_log_stock`**, **`tbl_mouvement_article`**, **`tbl_lst_prod`** (tarifs d'achat par fournisseur).
→ Le module de gestion de stock existe dans le schéma mais n'est **pas alimenté** dans ce commerce (une prestation de service ne "consomme" pas de stock au sens articles physiques, sauf pour la famille "Produits" éventuellement vendue en boutique). Le Dashboard doit prévoir ces widgets mais avec un état "non disponible / non configuré" plutôt que planter sur des données vides.

#### 2.6 Module Multi-canal / Divers

**`tbl_plateformes`** (Deliveroo, Uber Eats…), **`tbl_livraisons`**, **`tbl_commande` / `tbl_commande_borne` / `tbl_commande_pocket`** (bornes, app mobile), **`tbl_titre_restaurant`** (titres-restaurant), **`tbl_reservation` / `tbl_table`** (réservations de table, restauration) : présents dans le schéma pour un usage restauration, **non pertinents** pour ce salon (0 ligne de données).

**`tbl_promos` / `tbl_promos_detail`** — Moteur de promotions (offres du type "achetez X, obtenez Y offert").

**`log_des_actions`** — Journal d'audit des actions caisse (utile pour détecter des anomalies : annulations suspectes, réouvertures de ticket).

**`tbl_webhooks`** / **`exacttoken`** — Points d'intégration externes déjà prévus dans le logiciel : **pertinents pour l'architecture de synchronisation Dashboard ↔ Caisse** décrite dans le cahier des charges du projet (webhooks + tokens = mécanisme natif pour pousser les données vers une application tierce, à privilégier plutôt qu'un accès direct à la base de production).

---

### 3. Cartographie des relations

Le schéma ci-dessous regroupe les tables par module (couleur = module) et montre les clés étrangères principales. Le module **Ventes / caisse** (bleu, à gauche) est la partie à connaître en priorité : `ne_fichier` / `ne_fichier_day` en est le cœur, `note_entete` / `note_detail` (en gris, en pointillés) n'est qu'un brouillon en amont. Le module **Stock** (en gris pointillé, à droite) existe dans le logiciel mais n'est pas alimenté par ce commerce.

![Schéma relationnel simplifié — modules et clés étrangères principales](schema_diagram.png){width=100%}

**Tables pivots (hubs) :** `ne_fichier` / `ne_fichier_day`, `corres_des`, `tbl_clients`, `tbl_users_fixe`, `tbl_magasin`.
**Tables terminales (feuilles) :** la plupart des tables de configuration (`tbl_langue`, `tbl_devises`, `section`, `tbl_clavier*` ...) qui ne sont référencées que dans un sens.

---

### 4. Tables utiles par indicateur (KPI)

**Ventes (CA, nb ventes, ventes par jour/semaine/mois/année/heure)**
`ne_fichier` / `ne_fichier_day` (`chp_mont`, `chp_date`, `chp_reg1..22`) + `nl_fichier` / `nl_fichier_day` (`chp_qt`, `chp_prix`). L'heure est disponible via `chp_hr`.

**Produits (plus/moins vendus, quantités, catégories performantes)**
`nl_fichier` / `nl_fichier_day` (des_coresp, chp_qt, chp_Tprix) — jointure avec `corres_des` (chp_des) — jointure avec `tbl_famille` / `tbl_ss_famille`.

**Clients (nombre, nouveaux, fidèles, meilleurs clients)**
`tbl_clients` (chp_date_creation, chp_nbre_passage, chp_date_dernier_passage) — jointure avec `ne_fichier(_day).compte_client`.

**Stock (niveau, ruptures, valeur)**
`tbl_produits` (qt_stock, seuil_stock) — jointure avec `tbl_inventaire_produit` — **non alimenté actuellement**, prévoir un état "module non activé".

**Paiements (répartition, encaissements, remboursements, comptes)**
`ne_fichier` / `ne_fichier_day` (chp_reg1..22) et/ou `tbl_caisse_detaille` — jointure avec `tbl_les_reglement` ; comptes clients via `tbl_paym_cl` / `tbl_clients.compte_cl`.

**Employés/Caissiers (performance, nb ventes, CA)**
`note_entete.numeroserveur` (ou `nl_fichier.chp_serv`) — jointure avec `tbl_users_fixe.log_user` / `num_user` ; heures travaillées via `tbl_pointeuse`.

**Activité (heures de forte affluence, nb tickets, ticket moyen, panier moyen)**
`ne_fichier` / `ne_fichier_day` (`chp_date`, `chp_hr`, `chp_mont`) — en excluant les tickets à `chp_mont` = 0 / non réglés (cf. section 0).

---

### 5. Hiérarchisation des tables

**Indispensables (à requêter en continu par le Dashboard)**
`ne_fichier` / `ne_fichier_day`, `nl_fichier` / `nl_fichier_day`, `tbl_les_reglement`, `corres_des`, `tbl_famille`, `tbl_ss_famille`, `tbl_clients`, `tbl_users_fixe`, `tbl_magasin`, `tbl_cloture`.

**Utiles (rapports périodiques, modules secondaires actifs, ou complément du circuit principal)**
`note_entete` / `note_detail` (suivi des commandes en cours de saisie), `tbl_caisse_detaille`, `tbl_fidelite` / `tbl_fidelite_point`, `tbl_pointeuse`, `tbl_profils`, `planningprestation`, `tbl_abonnement`, `grand_total_periode/mensuel/annuel`, `log_des_actions`.

**Secondaires (modules présents mais peu/pas utilisés par ce commerce)**
`tbl_produits`, `tbl_fournisseur`, `tbl_facture` / `tbl_fact_detail`, `tbl_inventaire_*`, `tbl_entrepot`, `tbl_composition`, `tbl_promos` / `tbl_promos_detail`, `tbl_reservation`, `tbl_table`, `tbl_commande*`, `tbl_livraisons`, `tbl_plateformes`, `tbl_client_facture`, `tbl_paym_cl`.

**Techniques (configuration, paramétrage, logs, UI caisse — jamais interrogées par le Dashboard)**
`tbl_parameters`, `tbl_confsys`, `tbl_paragen`, `tbl_langue*`, `tbl_devises`, `section`, `tbl_clavier*`, `tbl_placement_bouton`, `tbl_imprimantes`, `tbl_postes`, `tbl_android_sn`, `exacttoken`, `tbl_webhooks`, `tbl_sauvegarde`, `tbl_job`, `signature_*`, `tva_par_ticket`, `tbl_affichage_cuisine_*`, `tbl_emenu_*`, ainsi que les tables de test à ignorer/supprimer (`test`, `test0` à `test99`, `test_0`, `test_1`, `tickets_cb_pax_a77`).

---

### 6. Recommandations techniques

```{=latex}
\begin{notebox}
```

- **Ne jamais connecter le Dashboard directement en écriture sur la base de production de la caisse.** Utiliser soit une base miroir en lecture seule synchronisée (réplication MySQL), soit le mécanisme `tbl_webhooks` / `exacttoken` déjà présent dans le schéma pour pousser les événements de vente vers l'application Dashboard — cette dernière option colle exactement à l'exigence du cahier des charges du projet ("système de synchronisation sécurisé").
- **Index à ajouter/vérifier** : `note_entete(chp_date, num_magasin)`, `note_detail(id_note)` (déjà PK mais pas d'index sur `chp_date` seul), `tbl_caisse_detaille(chp_date, num_reglement)`. Le schéma actuel utilise majoritairement MyISAM avec peu d'index composites adaptés au reporting.
- **Risque de performance** : les tables `ne_fichier` / `nl_fichier` grossissent indéfiniment (pas de purge visible) ; sur plusieurs années, les rapports annuels devront s'appuyer sur des tables pré-agrégées (`grand_total_mensuel` / `annuel`) plutôt que sur un `SUM()` brut ligne par ligne.
- **MyISAM** ne supporte pas les transactions ni les contraintes FK réelles (aucune contrainte `FOREIGN KEY` déclarée dans tout le dump). Le Dashboard doit donc **valider lui-même la cohérence des jointures** (ex. `note_entete.compte_client = 0` signifie "pas de client", pas une vraie FK).
- **Éviter de dupliquer la logique métier de calcul du CA** : partir des tickets réellement encaissés dans `ne_fichier` / `ne_fichier_day` (`chp_mont > 0`), et non de `note_entete.total`.
- **Multi-magasin dès la conception** : bien que ce commerce n'ait qu'un seul magasin aujourd'hui, la quasi-totalité des tables porte déjà `num_magasin` — concevoir le Dashboard nativement multi-magasin dès le départ.

```{=latex}
\end{notebox}
```

```{=latex}
\begin{warnbox}
```

**Codes `chp_etatl` et `type_ca`** : leur signification exacte (N/O/P/R) n'est pas documentée dans le schéma lui-même ; à faire valider avec l'éditeur Clyo Systems avant de coder les filtres "Vente générale / Offert / Retour" en dur.

```{=latex}
\end{warnbox}
```

---

### 7. Requêtes SQL prêtes à l'emploi

> Toutes les requêtes ci-dessous utilisent `ne_fichier` / `nl_fichier`, unifiées avec leur variante `_day` (journée en cours) via `UNION ALL` — c'est la source vérifiée comme correspondant exactement à l'écran caisse (section 0). `@magasin` = filtre magasin (ex. `1`). En pratique, matérialiser cette union dans deux vues (`vw_ne`, `vw_nl`) simplifiera nettement toutes les requêtes ci-dessous.

```sql
CREATE VIEW vw_ne AS
  SELECT * FROM ne_fichier
  UNION ALL
  SELECT * FROM ne_fichier_day;

CREATE VIEW vw_nl AS
  SELECT * FROM nl_fichier
  UNION ALL
  SELECT * FROM nl_fichier_day;
```

**Chiffre d'affaires du jour**
```sql
SELECT COALESCE(SUM(chp_mont), 0) AS ca_ttc_jour
FROM vw_ne
WHERE chp_date = CURDATE()
  AND num_magasin = @magasin
  AND chp_mont > 0;
```

**Chiffre d'affaires du mois en cours**
```sql
SELECT COALESCE(SUM(chp_mont), 0) AS ca_ttc_mois
FROM vw_ne
WHERE YEAR(chp_date) = YEAR(CURDATE())
  AND MONTH(chp_date) = MONTH(CURDATE())
  AND num_magasin = @magasin
  AND chp_mont > 0;
```

**Chiffre d'affaires de l'année (mois clos → table pré-agrégée conseillée)**
```sql
-- Mois clos : lecture directe de la table officielle et signée
SELECT SUM(Cumul_grand_total) AS ca_ttc_annee_close
FROM grand_total_mensuel
WHERE `year` = YEAR(CURDATE());

-- Mois en cours : à recalculer avec la requête "CA du mois" ci-dessus et
-- additionner
```

**Nombre de tickets et ticket moyen (jour)**
```sql
SELECT COUNT(*) AS nb_tickets,
       ROUND(SUM(chp_mont) / COUNT(*), 2) AS ticket_moyen
FROM vw_ne
WHERE chp_date = CURDATE()
  AND num_magasin = @magasin
  AND chp_mont > 0;
```

**Évolution des ventes (par jour, sur une période)**
```sql
SELECT chp_date, COUNT(*) AS nb_tickets, SUM(chp_mont) AS ca_ttc
FROM vw_ne
WHERE num_magasin = @magasin
  AND chp_mont > 0
  AND chp_date BETWEEN @date_debut AND @date_fin
GROUP BY chp_date
ORDER BY chp_date;
```

**Ventes par heure (activité)**
```sql
SELECT HOUR(nl.chp_hr) AS heure, COUNT(DISTINCT nl.chp_ref_prim) AS
  nb_tickets, SUM(nl.chp_Tprix) AS ca
FROM vw_nl nl
WHERE nl.chp_date = @date
  AND nl.num_magasin = @magasin
GROUP BY HOUR(nl.chp_hr)
ORDER BY heure;
```

**Produits/prestations les plus vendus**
```sql
SELECT COALESCE(c.chp_des, nl.description_article) AS designation,
       SUM(nl.chp_qt) AS quantite,
       SUM(nl.chp_Tprix) AS ca_ttc
FROM vw_nl nl
LEFT JOIN corres_des c ON c.des_coresp = nl.des_coresp
WHERE nl.chp_date BETWEEN @date_debut AND @date_fin
  AND nl.num_magasin = @magasin
GROUP BY designation
ORDER BY ca_ttc DESC
LIMIT 20;
```

**Catégories (familles) les plus performantes**
```sql
SELECT f.des AS famille, SUM(nl.chp_Tprix) AS ca_ttc, SUM(nl.chp_qt) AS quantite
FROM vw_nl nl
LEFT JOIN corres_des c ON c.des_coresp = nl.des_coresp
LEFT JOIN tbl_famille f ON f.num_fam = c.chp_fam
WHERE nl.chp_date BETWEEN @date_debut AND @date_fin
  AND nl.num_magasin = @magasin
GROUP BY f.des
ORDER BY ca_ttc DESC;
```

**Top clients**
```sql
SELECT cl.num_cl, cl.nom_cl, cl.prenom_cl,
       COUNT(ne.chp_primary) AS nb_visites,
       SUM(ne.chp_mont) AS ca_total
FROM vw_ne ne
JOIN tbl_clients cl ON cl.num_cl = ne.compte_client
WHERE ne.compte_client > 0
  AND ne.num_magasin = @magasin
GROUP BY cl.num_cl
ORDER BY ca_total DESC
LIMIT 20;
```

**Nouveaux clients (période)**
```sql
SELECT COUNT(*) AS nouveaux_clients
FROM tbl_clients
WHERE chp_date_creation BETWEEN @date_debut AND @date_fin
  AND num_magasin = @magasin
  AND deleted = 0;
```

**Répartition des règlements (moyens de paiement)**
```sql
-- Version directe via la ventilation ne_fichier (chp_reg1..chp_reg22)
SELECT r.num_regl, r.chp_intitule,
       SUM(CASE r.num_regl WHEN 1 THEN ne.chp_reg1 WHEN 2 THEN ne.chp_reg2
         WHEN 3 THEN ne.chp_reg3
                WHEN 4 THEN ne.chp_reg4 WHEN 5 THEN ne.chp_reg5 WHEN 6 THEN
                  ne.chp_reg6
                WHEN 7 THEN ne.chp_reg7 WHEN 8 THEN ne.chp_reg8 WHEN 9 THEN
                  ne.chp_reg9
                WHEN 10 THEN ne.chp_reg10 WHEN 11 THEN ne.chp_reg11 WHEN 12
                  THEN ne.chp_reg12
                WHEN 13 THEN ne.chp_reg13 WHEN 14 THEN ne.chp_reg14 WHEN 15
                  THEN ne.chp_reg15
                WHEN 16 THEN ne.chp_reg16 WHEN 17 THEN ne.chp_reg17 WHEN 18
                  THEN ne.chp_reg18
                WHEN 19 THEN ne.chp_reg19 WHEN 20 THEN ne.chp_reg20 WHEN 21
                  THEN ne.chp_reg21
                WHEN 22 THEN ne.chp_reg22 ELSE 0 END) AS total
FROM vw_ne ne
CROSS JOIN tbl_les_reglement r
WHERE ne.chp_date = @date
  AND ne.num_magasin = @magasin
GROUP BY r.num_regl, r.chp_intitule
HAVING total > 0
ORDER BY total DESC;

-- Alternative plus simple à maintenir : détail ligne par ligne dans
-- tbl_caisse_detaille
SELECT r.chp_intitule, SUM(cd.montant) AS total, COUNT(*) AS nb
FROM tbl_caisse_detaille cd
JOIN tbl_les_reglement r ON r.num_regl = cd.num_reglement
WHERE cd.chp_date = @date
  AND cd.num_magasin = @magasin
GROUP BY r.chp_intitule
ORDER BY total DESC;
```

**Remises accordées (période)**
```sql
SELECT SUM(nl.delta_remise) AS total_remises,
       COUNT(*) AS nb_lignes_remisees
FROM vw_nl nl
WHERE nl.chp_date BETWEEN @date_debut AND @date_fin
  AND nl.num_magasin = @magasin
  AND nl.tx_remise > 0;
```

**CA et performance par vendeur/employé**
```sql
SELECT u.nom_user, COUNT(DISTINCT ne.chp_primary) AS nb_tickets,
  SUM(ne.chp_mont) AS ca_ttc
FROM vw_ne ne
JOIN tbl_users_fixe u ON u.num_user = ne.chp_serv AND u.num_magasin =
  ne.num_magasin
WHERE ne.chp_date BETWEEN @date_debut AND @date_fin
  AND ne.num_magasin = @magasin
  AND ne.chp_mont > 0
GROUP BY u.nom_user
ORDER BY ca_ttc DESC;
```
*(`ne_fichier.chp_serv` est numérique ; vérifier lors de l'implémentation s'il correspond à `tbl_users_fixe.num_user` ou nécessite un passage par `note_entete.numeroserveur` / `log_user`, les deux conventions coexistant dans le schéma — point à valider en environnement de test.)*

**État du stock (si le module est activé)**
```sql
SELECT des AS produit, qt_stock, seuil_stock,
       CASE WHEN qt_stock <= 0 THEN 'Rupture'
            WHEN qt_stock <= seuil_stock THEN 'Stock faible'
            ELSE 'OK' END AS statut
FROM tbl_produits
WHERE num_magasin = @magasin
ORDER BY qt_stock ASC;
```

---

### 8. Conception du Dashboard

**Pages proposées**
1. **Vue d'ensemble (Accueil)** — KPI du jour (CA, tickets, ticket moyen, remises, offerts, annulations), comparaison vs veille/même jour semaine précédente, graphique CA sur 30 jours.
2. **Ventes** — évolution CA (jour/semaine/mois/année, courbe comparative multi-périodes), ventes par heure (courbe d'affluence), tableau filtrable des tickets.
3. **Produits & Catégories** — top/flop prestations, CA par famille/sous-famille, tableau filtrable exportable.
4. **Clients** — nombre de clients, nouveaux clients, top clients, historique par client, points de fidélité, comptes débiteurs.
5. **Paiements** — camembert par moyen de paiement (reprend l'écran "Règlement" existant), suivi des comptes clients, avoirs/remboursements.
6. **Employés** — CA par employé, nombre de tickets par employé, panier moyen par employé, pointage/heures travaillées.
7. **Stock** *(si activé)* — niveaux de stock, alertes de rupture, valorisation.
8. **Rapports & Exports** — générateur de rapports filtrables (période, magasin, famille, vendeur) avec export PDF/Excel/CSV, à l'image de l'écran "Rapports et analyses" déjà utilisé.
9. **Alertes** — ruptures de stock, baisse de CA anormale (vs moyenne mobile), tickets annulés/négatifs suspects (`log_des_actions`).

**Widgets/KPI principaux** : carte CA (jour/semaine/mois/année, avec % variation), carte nombre de tickets, carte ticket moyen, carte remises, carte offerts, carte annulations/retours, camembert moyens de paiement, classement top 10 prestations, classement top 10 clients, courbe d'affluence horaire, tableau CA par employé, jauge de remplissage planning (`planningprestation`).

**Filtres transverses** : période (jour/semaine/mois/année/personnalisée), magasin, employé/vendeur, famille/sous-famille de prestations, moyen de paiement.

**Exports** : PDF (mise en page façon rapport existant), Excel/CSV (données brutes filtrées) — cohérent avec les boutons déjà présents dans l'écran "Rapports et analyses" des captures.

**Rafraîchissement** : temps réel ou quasi temps réel pour la page "Vue d'ensemble" (ex. toutes les 60 secondes) via lecture de `ne_fichier_day` / `nl_fichier_day` / `tbl_caisse_detaille` du jour ; traitement différé (nocturne) pour les agrégats historiques lourds.

---

### 9. Priorité des données par widget

- **Carte CA jour/mois/année** — tables : `ne_fichier` / `ne_fichier_day`, `grand_total_mensuel/annuel`. Colonnes : `chp_mont`, `chp_date`, `Cumul_grand_total`. Relation : `num_magasin`. Calcul : `SUM(chp_mont)` filtré (`>0`), ou lecture directe des cumuls signés pour les périodes closes.
- **Carte tickets / ticket moyen** — tables : `ne_fichier` / `ne_fichier_day`. Colonnes : `chp_mont`, `chp_date`. Calcul : `COUNT()`, `SUM(chp_mont)/COUNT()`, en excluant `chp_mont=0`.
- **Camembert règlements** — tables : `ne_fichier(_day)` (`chp_reg1` à `chp_reg22`) ou `tbl_caisse_detaille` + `tbl_les_reglement`. Colonnes : `montant` / `chp_regN`, `num_reglement`. Relation : `num_reglement → num_regl`. Calcul : `SUM(montant) GROUP BY num_reglement`.
- **Top prestations** — tables : `nl_fichier` / `nl_fichier_day`, `corres_des`. Colonnes : `chp_qt`, `chp_Tprix`, `chp_des`. Relation : `des_coresp → des_coresp`. Calcul : `SUM(Tprix) GROUP BY produit`.
- **CA par famille** — tables : `nl_fichier` / `nl_fichier_day`, `corres_des`, `tbl_famille`. Colonne : `chp_fam`. Relation : `chp_fam → num_fam`. Calcul : idem, `GROUP BY famille`.
- **Top clients** — tables : `ne_fichier` / `ne_fichier_day`, `tbl_clients`. Colonnes : `compte_client`, `compte_cl`. Relation : `compte_client → num_cl`. Calcul : `SUM(chp_mont) GROUP BY client`.
- **CA par employé** — tables : `ne_fichier` / `ne_fichier_day`, `tbl_users_fixe`. Colonnes : `chp_serv`, `nom_user`. Relation : `chp_serv → num_user` (à valider). Calcul : `SUM(chp_mont) GROUP BY vendeur`.
- **Remises** — table : `nl_fichier` / `nl_fichier_day`. Colonnes : `delta_remise`, `tx_remise`. Calcul : `SUM(delta_remise)`.
- **Affluence horaire** — table : `nl_fichier` / `nl_fichier_day`. Colonne : `chp_hr`. Relation : `chp_ref_prim`. Calcul : `COUNT()/SUM() GROUP BY HOUR()`.
- **Planning/RDV** — tables : `planningprestation`, `tbl_clients`, `tbl_users_fixe`. Colonnes : `DateFrom`, `DateTo`, `idClient`, `idUser`. Relations : `idClient → num_cl`, `idUser → num_user`. Calcul : taux de remplissage = créneaux occupés / créneaux disponibles.
- **Alertes stock** — table : `tbl_produits`. Colonnes : `qt_stock`, `seuil_stock`. Calcul : `qt_stock <= seuil_stock` (module à activer).

---

### 10. Synthèse finale

**Résumé** : la base est celle du logiciel de caisse **Clyo Systems**, exploitée ici par un **institut de beauté / hammam-spa mono-magasin à Casablanca**. Sur 184 tables, une **quinzaine** portent l'essentiel de la valeur pour un Dashboard décisionnel ; le reste est soit du paramétrage caisse (claviers, imprimantes, écrans cuisine), soit des modules du logiciel non utilisés par ce type de commerce (stock, restauration, livraison).

```{=latex}
\begin{factbox}
```

**Point d'architecture le plus important** : coexistence de deux circuits de vente — `note_entete` / `note_detail` (commandes en cours de saisie, sujettes à révisions) et `ne_fichier` / `nl_fichier` (+ variantes `_day`, certifiées fiscalement). L'analyse a démontré, preuves à l'appui, que **`ne_fichier` / `nl_fichier` (+ `_day`) est la source la plus fidèle à l'écran caisse et doit être la source principale du Dashboard** ; `note_entete` / `note_detail` reste un complément utile mais moins fiable en l'état pour des KPI officiels.

**Données exploitables et vérifiées** : chiffre d'affaires, nombre de tickets, ticket moyen, répartition des moyens de paiement, ventes par prestation/famille, comptes clients, remises — toutes ont été **recoupées avec succès** contre les captures d'écran fournies (correspondance exacte des montants).

```{=latex}
\end{factbox}
```

```{=latex}
\begin{warnbox}
```

**Points à faire valider avant développement** : la signification exacte des codes d'état de ligne (`chp_etatl` : N/O/P/R) et du champ `type_ca`, qui pilotent la distinction "Vente générale" vs "Offert" vs "Retour" dans les rapports — actuellement déduite par recoupement des données, non documentée dans le schéma.

```{=latex}
\end{warnbox}
```

```{=latex}
\begin{notebox}
```

**Recommandation d'architecture globale** : synchronisation par API/webhooks (mécanisme déjà présent dans le schéma via `tbl_webhooks` / `exacttoken`) plutôt qu'un accès direct à la base de production, conception nativement multi-magasin dès le départ, et utilisation des tables `grand_total_*` pour les périodes déjà clôturées afin de garantir la cohérence avec les chiffres officiels/fiscaux de la caisse.

```{=latex}
\end{notebox}
```

---

### Annexe — Correspondance entre les captures d'écran fournies et les tables de la base

Les six captures d'écran envoyées représentent **une seule et même journée** (21/07/2026, magasin n°1) vue sous six angles différents du logiciel de caisse :

1. **"RÈGLEMENT" (camembert)** — écran caisse du jour → alimenté par `tbl_caisse_detaille` (jointure `tbl_les_reglement`), reconstituable aussi directement depuis les colonnes `chp_reg1` à `chp_reg22` de `ne_fichier_day`.
2. **Bande de contrôle / tickets encaissés** — journal des tickets de la journée → correspond exactement à `ne_fichier_day` (`chp_primary` = colonne "Ticket", `chp_ntik` = colonne "Docu…", `chp_mont` = colonne "Total").
3. **Journal des ventes, dans "Rapports et analyses", filtre "Vente générale"** → rapport `nl_fichier_day` / `corres_des`, agrégé par article, filtré sur les ventes payantes normales.
4. **Journal des ventes, dans "Rapports et analyses", filtre "Offert"** → même rapport, filtré sur les lignes à l'état "offert" (`nl_fichier_day.chp_etatligne` ou `note_detail.chp_etatl`, probablement `'O'`).
5. **"C.A. par vendeur", dans "Rapports et analyses"** → `ne_fichier_day` agrégé par vendeur (`chp_serv`), jointure `tbl_users_fixe` (1-SAID, Z99-Manager).
6. **Tableau de bord du jour** → synthèse combinant `ne_fichier_day` (CA, tickets, ticket moyen — cf. section 0) et `nl_fichier_day` (remises, offerts, retours, pertes).

Cette correspondance a permis de **valider empiriquement, au centime près**, l'essentiel des hypothèses de structure de cette analyse : chiffre d'affaires (32 660,00), nombre de tickets (9, en excluant le ticket ouvert n°3746), ticket moyen (3 628,89), et répartition exacte des quatre moyens de paiement (Espèces 25 010 / Chèques 2 400 / Carte Bleue 4 500 / Compte Client 750), tous retrouvés à l'identique dans les colonnes brutes `chp_reg1`, `chp_reg2`, `chp_reg4` et `chp_reg11` de `ne_fichier_day`.


## 3.2 Rapports par période (module Statistiques) -- analyse détaillée


```{=latex}
\begin{tldrbox}
\begin{itemize}
\item Ce document est le \textbf{complément} de \emph{« Analyse approfondie de la base de données -- Préparation du Dashboard POS »} (document 1, série 1 -- rapports d'une seule journée). Il couvre la \textbf{série 2} : le module \textbf{Statistiques}, qui fonctionne sur une \textbf{plage de dates} (Date Début / Date Fin) et non plus sur un jour unique.
\item Aucune nouvelle table de vente n'apparaît : tout repose sur les mêmes vues \texttt{vw\_ne} et \texttt{vw\_nl} déjà définies dans le document 1. Il suffit de remplacer le filtre \texttt{chp\_date = '...'} par \texttt{chp\_date BETWEEN '...' AND '...'}.
\item Règle d'aiguillage capitale : un rapport qui compte des \textbf{articles} (Ventes par articles, Meilleures ventes, Ventes par famille) s'appuie sur \texttt{nl\_fichier} / \texttt{vw\_nl} (niveau ligne de vente). Un rapport qui compte des \textbf{tickets ou des vendeurs} (Tableau de bord, C.A. par vendeur) s'appuie sur \texttt{ne\_fichier} / \texttt{vw\_ne} (niveau ticket). Les deux niveaux donnent des totaux légèrement différents (écart de 3,37 DH observé sur 1,27 million de DH, soit 0,0003 pourcent) -- c'est normal, ce n'est pas une anomalie à corriger.
\item Le coût d'achat (\texttt{p\_achat}) vaut 0 sur toutes les lignes de ce commerce : la colonne « C.A. marge HT » est donc partout identique à « Prix vente HT ». Le mécanisme de calcul de marge existe et fonctionne, il est simplement inactif faute de coûts saisis.
\item Le rapport « Rapport pointeuse » (masse salariale) est lui aussi structurellement inerte ici : \texttt{cout\_hr} vaut 0 dans \texttt{tbl\_pointeuse} et \texttt{tbl\_users\_fixe}, et les durées affichées (01:02 pour tous les employés) ressemblent à une valeur de test plutôt qu'à une réelle amplitude horaire. À valider avant de vendre ce widget comme fiable.
\item Deux preuves de cohérence fortes ont été trouvées en croisant les chiffres des captures d'écran entre elles (détaillées plus bas) : cela confirme que le modèle de calcul proposé dans ce document reproduit fidèlement le logiciel existant.
\end{itemize}
\end{tldrbox}
```

### 0. Cadrage et méthode

Les captures d'écran de cette deuxième série proviennent toutes du module **Statistiques** (menu de gauche : Tableau de bord, Rapports et analyses, Comparer plusieurs périodes, Analyse des ventes, Tickets encaissés, Titre CRT, Export vers comptabilité, Archives fiscales). Contrairement à la série 1, chaque écran expose un couple de champs **Date Début / Date Fin**, avec quatre raccourcis (« Auj. après clôture », « Hier », « Les 7 derniers jours », « Mois »).

Six captures ont été fournies. Deux d'entre elles sont des gros plans (le zoom sur le sélecteur de dates, et le zoom sur une partie du tableau « Ventes par articles ») qui n'ajoutent pas d'information nouvelle : elles ont été fusionnées avec l'écran complet correspondant. Il reste donc **six fiches** à documenter :

- Fiche 1 -- Tableau de bord (vue par période)
- Fiche 2 -- Rapports et analyses : Ventes par articles
- Fiche 3 -- Rapports et analyses : Meilleures ventes par article
- Fiche 4 -- Rapports et analyses : Ventes par famille
- Fiche 5 -- Rapports et analyses : C.A. par vendeur
- Fiche 6 -- Rapports et analyses : Rapport pointeuse

Chaque fiche suit les 9 points demandés : informations affichées, tables utilisées, colonnes, relations, calculs, requêtes SQL, implémentation développeur, architecture d'affichage, temps réel vs cache.

```{=latex}
\begin{factbox}
Rappel du schéma déjà validé dans le document 1 (le diagramme complet est reproduit en annexe de ce document) : \texttt{vw\_ne = ne\_fichier UNION ALL ne\_fichier\_day} (un ticket par ligne) et \texttt{vw\_nl = nl\_fichier UNION ALL nl\_fichier\_day} (une ligne de vente par article vendu), reliées par \texttt{chp\_ref\_prim}. Toutes les requêtes de ce document utilisent ces deux vues.
\end{factbox}
```

---

### 1. Fiche -- Tableau de bord (vue par période)

#### 1.1 Informations affichées

L'écran « Tableau de bord » du module Statistiques affiche, pour la plage Date Début / Date Fin choisie (ici 01 / 07 / 2026 au 21 / 07 / 2026, soit le mois en cours) :

- Un sélecteur de période avec quatre raccourcis rapides et une case « Afficher les légendes ».
- Un graphique **Evolution des ventes** : une aire (dégradée bleu-gris) représentant le chiffre d'affaires quotidien sur toute la plage, superposée à une **courbe orange** dont la signification exacte n'est pas certaine à la seule lecture de l'écran (voir point 1.5).
- Un histogramme **C.A. par jour** : le chiffre d'affaires est regroupé **par jour de la semaine** (les libellés affichés sont en anglais -- Tuesday, Monday, Saturday, Friday, Thursday, Wednesday -- alors que le reste de l'interface est en français, et l'ordre n'est ni alphabétique ni chronologique). Une courbe de tendance orange est superposée.
- Un donut « Direct » : un seul segment, valeur 185 410.
- Un second donut réparti par famille de produits : Coupe homme 85 880, Esthetique 61 050, Hammam Spa 31 400, Non classé 3 650, produits 3 430 (étiquettes se chevauchant sur la capture).

```{=latex}
\begin{factbox}
Preuve vérifiée sur les chiffres de la capture : 85\,880 + 61\,050 + 31\,400 + 3\,650 + 3\,430 = 185\,410, exactement le total du donut « Direct ». Les deux donuts représentent donc la \textbf{même somme totale} (le chiffre d'affaires de la période), simplement ventilée selon deux axes différents : le mode de vente (donut de gauche) et la famille de produits (donut de droite).
\end{factbox}
```

#### 1.2 -- 1.3 Tables et colonnes utilisées

- `ne_fichier` / `ne_fichier_day` (vue `vw_ne`) : `chp_date`, `chp_mont_ht`, `chp_mont_tva`, `chp_mont` (TTC), `chp_serv`, `chp_servenc`, `internet` (indicateur vente web/livraison), `num_magasin`, `chp_primary` / `chp_ref_prim`.
- `nl_fichier` / `nl_fichier_day` (vue `vw_nl`) : `chp_Tprix_ht`, `chp_Tprix` (TTC), `tva_par_article`, `des_coresp`, `chp_ref_prim`, `chp_date`.
- `corres_des` : `des_coresp` (clé), `chp_fam`.
- `tbl_famille` : `num_fam` (clé), `des` (libellé affiché dans le donut : Coupe homme, Esthetique, Hammam Spa, Non classé, produits).

#### 1.4 Relations entre tables

`vw_ne` (1 ticket) --- 1 : N --- `vw_nl` (N lignes) via `chp_ref_prim` = `chp_primary`. `vw_nl.des_coresp` --> `corres_des.des_coresp`. `corres_des.chp_fam` (varchar) --> `tbl_famille.num_fam` (int) : jointure à faire avec une conversion de type explicite (`CAST(chp_fam AS UNSIGNED)`), car aucune contrainte de clé étrangère n'existe dans ce schéma (comme déjà noté dans le document 1).

#### 1.5 Calculs nécessaires

- **Evolution des ventes (aire)** : `SUM(chp_mont)` (ou `chp_mont_ht`, à confirmer selon que le graphe est en TTC ou HT) groupé par `chp_date`, sur la plage sélectionnée.

```{=latex}
\begin{warnbox}
La courbe orange superposée à l'aire n'a pas de légende visible sur la capture (la case « Afficher les légendes » est décochée). Trois hypothèses raisonnables : (a) le chiffre d'affaires de la période de comparaison précédente (semaine ou mois n-1), (b) une moyenne mobile lissée sur quelques jours, (c) un objectif de vente configuré. Il faut cocher « Afficher les légendes » dans le logiciel existant (ou interroger l'éditeur Clyo Systems) avant de coder ce composant, sous peine de reproduire un graphique dont le sens réel est incertain.
\end{warnbox}
```

- **C.A. par jour (histogramme par jour de semaine)** : `SUM(chp_mont)` groupé par le nom du jour de semaine de `chp_date` (`DAYNAME(chp_date)` en SQL, ou `DAYOFWEEK` pour l'ordre). Cela agrège tous les mardis de la période ensemble, tous les mercredis ensemble, etc.

```{=latex}
\begin{warnbox}
Le logiciel actuel affiche les jours en anglais et dans un ordre qui n'est ni chronologique (lundi à dimanche) ni alphabétique ni décroissant par valeur stricte -- cela ressemble à un artefact technique de l'application existante (ordre d'itération d'une structure de données interne), pas à un choix volontaire. Le nouveau dashboard ne doit \textbf{pas} reproduire ce bug : afficher les jours en français, dans l'ordre lundi $\rightarrow$ dimanche (ou trié par valeur décroissante si l'objectif est un classement, mais alors le préciser visuellement).
\end{warnbox}
```

- **Donut « mode de vente »** : `SUM(chp_mont)` groupé par `CASE WHEN internet = 1 THEN 'Web / Livraison' ELSE 'Direct' END`. Ce commerce n'ayant aucune vente `internet = 1` sur la période, un seul segment apparaît -- le code doit néanmoins prévoir les autres cas (champs `livreur`, `idOrdersWeb`, `date_commande` existent dans `ne_fichier` et confirment que la fonctionnalité livraison / web existe dans le logiciel, simplement inutilisée par ce commerce).
- **Donut « par famille »** : jointure `vw_nl` → `corres_des` → `tbl_famille`, `SUM(chp_Tprix)` groupé par `tbl_famille.des`.

#### 1.6 Requêtes SQL

```sql
-- Evolution des ventes (CA quotidien, TTC)
SELECT chp_date, SUM(chp_mont) AS ca_ttc_jour
FROM vw_ne
WHERE num_magasin = 1
  AND chp_date BETWEEN :date_debut AND :date_fin
GROUP BY chp_date
ORDER BY chp_date;

-- C.A. par jour de semaine (à réordonner lundi -> dimanche côté application)
SELECT DAYOFWEEK(chp_date) AS jour_num, DAYNAME(chp_date) AS jour_nom,
       SUM(chp_mont) AS ca_ttc
FROM vw_ne
WHERE num_magasin = 1
  AND chp_date BETWEEN :date_debut AND :date_fin
GROUP BY jour_num, jour_nom
ORDER BY jour_num;

-- Répartition par mode de vente
SELECT CASE WHEN internet = 1 THEN 'Web / Livraison' ELSE 'Direct' END AS
  mode_vente,
       SUM(chp_mont) AS ca_ttc
FROM vw_ne
WHERE num_magasin = 1
  AND chp_date BETWEEN :date_debut AND :date_fin
GROUP BY mode_vente;

-- Répartition par famille
SELECT f.des AS famille, SUM(nl.chp_Tprix) AS ca_ttc
FROM vw_nl nl
JOIN corres_des cd ON cd.des_coresp = nl.des_coresp
JOIN tbl_famille f  ON f.num_fam = CAST(cd.chp_fam AS UNSIGNED)
WHERE nl.num_magasin = 1
  AND nl.chp_date BETWEEN :date_debut AND :date_fin
GROUP BY f.des
ORDER BY ca_ttc DESC;
```

#### 1.7 Implémentation développeur

Exposer un unique endpoint `GET /api/dashboard?start=...&end=...` qui exécute les quatre requêtes ci-dessus côté serveur et renvoie un JSON structuré (une clé par widget). Ne jamais laisser le front-end faire l'agrégation par jour ou par famille lui-même : cela doit rester en SQL pour rester correct quel que soit le volume de données. Prévoir un index composite `(num_magasin, chp_date)` sur `ne_fichier`, `ne_fichier_day`, `nl_fichier`, `nl_fichier_day` (déjà présent d'après le document 1) pour que ces requêtes restent rapides même sur plusieurs années d'historique.

#### 1.8 Architecture d'affichage recommandée

- Une rangée de cartes KPI en tête (C.A. TTC total, C.A. HT, nombre de tickets, panier moyen) calculée sur la même plage.
- Le graphique « Evolution des ventes » en aire + ligne (Chart.js, Recharts ou ECharts), avec légende toujours visible par défaut (contrairement au logiciel existant).
- L'histogramme « C.A. par jour » réordonné lundi → dimanche, en français.
- Remplacer les deux donuts côte à côte par un unique graphique avec un sélecteur d'axe (« Par mode de vente » / « Par famille »), plus lisible et plus évolutif si de nouvelles familles ou de nouveaux modes de vente apparaissent.

#### 1.9 Temps réel ou cache ?

Si la plage sélectionnée inclut la journée en cours (non encore clôturée), les données de `ne_fichier_day` / `nl_fichier_day` changent en continu : rafraîchir toutes les 30 à 60 secondes, ou après chaque nouvel encaissement si un mécanisme de notification existe. Si la plage est entièrement dans le passé (avant la dernière clôture confirmée dans `tbl_cloture`), les données sont figées : mettre en cache indéfiniment par clé `(start, end)`, en n'invalidant que le bucket du jour courant.

---

### 2. Fiche -- Rapports et analyses : Ventes par articles

#### 2.1 Informations affichées

Écran « Rapports Et Analyses », filtre `Rapport = Ventes par articles`. Filtres disponibles : Date Début (01 / 01 / 2025), Date Fin (21 / 07 / 2026), `Vente` (Vente générale), `Caisse` (_tout), `Vendeur` (_tout), `Famille` / `Sous-famille` (vides, avec bouton « CL » pour effacer), `Etablissement` (Tout). Tableau détaillé par article : Désignation, Quantité, P unit..., Prix ach..., Prix vente HT, C.A. marge HT, Tva, C.A. TTC, Remise, Ratio A. Ratio V. Ligne Total en bas (Quantité 6 727, Prix vente HT 1 268 898,29, C.A. marge HT 1 268 898,29, Tva 169 671,81, C.A. TTC 1 438 570,10, Remise 350,00).

```{=latex}
\begin{factbox}
Preuve vérifiée : 1\,268\,898,29 (HT) + 169\,671,81 (Tva) = 1\,438\,570,10 (TTC), exactement le total affiché. La colonne « C.A. marge HT » est partout identique à « Prix vente HT » et « Prix ach... » vaut 0,00 sur toutes les lignes visibles : confirme que \texttt{p\_achat} n'est jamais renseigné pour ce commerce, donc marge = prix de vente HT dans 100 pourcent des cas actuels.
\end{factbox}
```

#### 2.2 -- 2.3 Tables et colonnes

`nl_fichier` / `nl_fichier_day` (`vw_nl`) : `chp_qt` (quantité), `chp_prix` (prix unitaire), `p_achat` (coût d'achat unitaire), `chp_Tprix_ht` (total HT ligne), `chp_Tprix` (total TTC ligne), `tva_par_article`, `delta_remise` / `tx_remise` (remise), `chp_etatligne`, `chp_serv`, `chp_date`, `des_coresp`, `num_magasin`. `corres_des` : `des_coresp`, `chp_des` (désignation affichée), `chp_fam`, `chp_ss_fam`. `tbl_famille` / `tbl_ss_famille` pour les filtres Famille / Sous-famille. `ne_fichier` (`vw_ne`) via `chp_ref_prim` pour filtrer par Caisse (`chp_ncaisse`) et par Établissement (`num_magasin`) au niveau du ticket.

#### 2.4 Relations

`vw_nl.des_coresp` --> `corres_des.des_coresp` --> `corres_des.chp_fam` / `chp_ss_fam` --> `tbl_famille.num_fam` / `tbl_ss_famille.num_ss_fam`. `vw_nl.chp_ref_prim` --> `vw_ne.chp_primary` (pour les filtres Caisse et Vendeur, présents à la fois sur la ligne, via `nl_fichier.chp_serv`, et sur le ticket, via `ne_fichier.chp_serv` -- privilégier le champ ligne, plus précis en cas de ticket multi-vendeurs).

#### 2.5 Calculs

Pour chaque article (`des_coresp`) : Quantité = `SUM(chp_qt)` ; P unit. = `SUM(chp_Tprix_ht) / SUM(chp_qt)` (prix moyen) ; Prix ach. = `SUM(p_achat * chp_qt)` ; Prix vente HT = `SUM(chp_Tprix_ht)` ; C.A. marge HT = `SUM(chp_Tprix_ht - p_achat * chp_qt)` ; Tva = `SUM(tva_par_article)` ; C.A. TTC = `SUM(chp_Tprix)` ; Remise = `SUM(delta_remise)`.

```{=latex}
\begin{warnbox}
La colonne « Ratio A. Ratio V. » regroupe visiblement deux ratios sur la capture. Hypothèse la plus probable : Ratio Achat = P.achat / Prix vente HT $\times$ 100 (0 pourcent ici puisque P.achat = 0) et Ratio Vente = C.A. marge HT / Prix vente HT $\times$ 100 (100 pourcent ici). À confirmer en agrandissant la colonne dans le logiciel existant ou auprès de l'éditeur avant de la reproduire à l'identique.
\end{warnbox}
```

Le filtre `Vente = Vente générale` correspond très probablement au même mécanisme que dans la série 1 (exclusion des lignes « offertes » ou « remises », via `chp_etatligne` ou `tbl_les_reglement.type_ca`) : à revalider en essayant les autres valeurs de ce menu déroulant dans le logiciel existant.

#### 2.6 Requête SQL

```sql
SELECT cd.chp_des                                   AS designation,
       SUM(nl.chp_qt)                               AS quantite,
       SUM(nl.chp_Tprix_ht) / NULLIF(SUM(nl.chp_qt),0) AS prix_unitaire_moyen,
       SUM(nl.p_achat * nl.chp_qt)                  AS prix_achat_total,
       SUM(nl.chp_Tprix_ht)                         AS prix_vente_ht,
       SUM(nl.chp_Tprix_ht - nl.p_achat * nl.chp_qt) AS ca_marge_ht,
       SUM(nl.tva_par_article)                      AS tva,
       SUM(nl.chp_Tprix)                             AS ca_ttc,
       SUM(nl.delta_remise)                          AS remise
FROM vw_nl nl
JOIN corres_des cd ON cd.des_coresp = nl.des_coresp
WHERE nl.num_magasin = 1
  AND nl.chp_date BETWEEN :date_debut AND :date_fin
  -- AND cd.chp_fam = :famille           (si filtre Famille actif)
  -- AND nl.chp_serv = :vendeur          (si filtre Vendeur actif)
GROUP BY cd.des_coresp, cd.chp_des
ORDER BY cd.chp_des;
```

#### 2.7 Implémentation développeur

Endpoint paginé `GET /api/rapports/ventes-articles` acceptant tous les filtres en paramètres de requête (date_debut, date_fin, famille, sous_famille, caisse, vendeur, etablissement, type_vente). Calculer la ligne Total côté SQL (`SUM(...)` sans `GROUP BY`) en parallèle de la requête détaillée, plutôt que de la recalculer en JavaScript. Prévoir un bouton d'export Excel / CSV (déjà présent dans le logiciel existant, bouton vert visible en haut à droite de l'écran) via une bibliothèque type `exceljs`.

#### 2.8 Architecture d'affichage

Tableau de données filtrable et triable (TanStack Table, AG Grid), avec ligne de total figée en bas d'écran (« sticky footer »), sélecteurs de filtres en en-tête reproduisant Date Début / Fin, Famille, Sous-famille, Caisse, Vendeur, Établissement, et un bouton d'export.

#### 2.9 Temps réel ou cache ?

Le filtre par défaut couvre une très large plage (01 / 01 / 2025 à aujourd'hui) : mettre en cache le résultat par combinaison de filtres pendant plusieurs minutes (ou jusqu'au prochain encaissement si la plage inclut aujourd'hui), car recalculer cette agrégation sur 18 mois de lignes à chaque clic de filtre serait coûteux sans cache.

---

### 3. Fiche -- Rapports et analyses : Meilleures ventes par article

#### 3.1 Informations affichées

Même écran « Rapports Et Analyses », `Rapport = Meilleures ventes par article`, mêmes filtres (Date Début 01 / 01 / 2025, Date Fin 21 / 07 / 2026, Vente générale, tout Caisse / Vendeur / Établissement). Mêmes colonnes que la fiche 2, mais seulement les 10 premiers articles, classés par un critère de performance (l'ordre observé -- Coupe homme 2018, Barbe taille 713, Coupe jeune 524... -- correspond à un classement par quantité décroissante). Total affiché : 5 159 (quantité), 869 884,28 (HT), 990 180,10 (TTC), remise 50,00.

```{=latex}
\begin{factbox}
Ce total (5\,159) est \textbf{inférieur} au total de la fiche « Ventes par articles » (6\,727) sur la même période et les mêmes filtres. Ce n'est pas une incohérence : le rapport « Meilleures ventes » ne fait pas la somme de tous les articles, il fait la somme des 10 lignes affichées seulement (un Top 10). Le développeur doit reproduire ce comportement -- ou, mieux, l'expliciter clairement dans la nouvelle interface (« Total du Top 10 » plutôt que « Total »), car le libellé actuel du logiciel existant peut prêter à confusion.
\end{factbox}
```

#### 3.2 -- 3.6 Tables, colonnes, relations, calculs, requête SQL

Strictement identiques à la fiche 2 (même source `vw_nl` + `corres_des` + `tbl_famille` / `tbl_ss_famille`, mêmes colonnes, même logique de calcul par article). La seule différence est la clause finale de la requête :

```sql
-- Reprendre la requête de la fiche 2, puis :
ORDER BY quantite DESC
LIMIT 10;
```

```{=latex}
\begin{warnbox}
Le critère de tri exact (quantité vendue, ou C.A. TTC, ou C.A. marge) n'est pas certain à 100 pourcent depuis la capture seule -- l'ordre observé colle bien à un tri par quantité décroissante, mais il faudrait le confirmer en changeant les filtres dans le logiciel existant (par exemple restreindre à une famille et vérifier si l'ordre suit toujours la quantité).
\end{warnbox}
```

#### 3.7 Implémentation développeur

Réutiliser le même service que la fiche 2 en ajoutant un paramètre `top_n` (configurable, 5 / 10 / 20) et un paramètre `tri_par` (quantite / ca_ttc / ca_marge) exposé dans l'interface -- une amélioration naturelle par rapport au logiciel existant qui semble figer ce choix.

#### 3.8 Architecture d'affichage

Un classement visuel (barres horizontales triées, type « Top 10 des ventes ») plutôt qu'un simple tableau : c'est un rapport de classement, une représentation graphique le rend plus lisible qu'une table brute. Garder un lien « voir le détail complet » vers la fiche 2 (Ventes par articles) pour l'utilisateur qui veut aller plus loin que le Top 10.

#### 3.9 Temps réel ou cache ?

Identique à la fiche 2 : cache par combinaison de filtres, invalidation uniquement si la plage inclut la journée en cours.

---

### 4. Fiche -- Rapports et analyses : Ventes par famille

#### 4.1 Informations affichées

`Rapport = Ventes par famille`, mêmes filtres que les fiches précédentes. Tableau plus simple : Désignation (famille), Quantité, Prix HT, Tva, Prix (TTC), %. Cinq familles : Coupe homme (4 205 ; 650 891,21 ; 86 775,56 ; 737 666,77 ; 51,28 pourcent), Esthetique (1 789 ; 363 943,50 ; 48 319,83 ; 412 263,33 ; 28,66 pourcent), Hammam Spa (558 ; 223 723,72 ; 30 676,28 ; 254 400,00 ; 17,68 pourcent), Non classé (109 ; 17 147,46 ; 2 312,54 ; 19 460,00 ; 1,35 pourcent), produits (66 ; 13 188,98 ; 1 591,02 ; 14 780,00 ; 1,03 pourcent). Total général : Quantité 6 727 -- les colonnes monétaires du total affichent 0,00 dans le logiciel existant (Prix HT, Tva, Prix toutes à 0,00), ce qui est visiblement un défaut d'affichage du logiciel existant sur cette ligne précise.

```{=latex}
\begin{factbox}
Double preuve vérifiée sur cette capture :
\begin{enumerate}
\item La somme des 5 valeurs de la colonne « Prix » (737\,666,77 + 412\,263,33 + 254\,400,00 + 19\,460,00 + 14\,780,00) = 1\,438\,570,10, exactement le total C.A. TTC de la fiche « Ventes par articles » sur la même période -- confirme que les deux rapports partagent la même source de données, seulement agrégée à un niveau différent (famille contre article).
\item La colonne « pourcent » correspond bien à la part de chaque famille dans le total \textbf{TTC} (737\,666,77 / 1\,438\,570,10 = 51,28 pourcent) et non dans la quantité (4\,205 / 6\,727 = 62,5 pourcent, qui ne correspond pas à l'affichage). Le calcul du pourcentage doit donc se baser sur le chiffre d'affaires, pas sur les quantités.
\end{enumerate}
\end{factbox}
```

#### 4.2 -- 4.4 Tables, colonnes, relations

Identiques à la fiche 2, mais sans jointure à `corres_des` au niveau article : agrégation directe `vw_nl` --> `corres_des.chp_fam` --> `tbl_famille.des`, sans descendre au niveau `des_coresp` individuel.

#### 4.5 Calculs

Par famille : Quantité = `SUM(chp_qt)` ; Prix HT = `SUM(chp_Tprix_ht)` ; Tva = `SUM(tva_par_article)` ; Prix (TTC) = `SUM(chp_Tprix)` ; % = `Prix famille / SUM(Prix TTC toutes familles) * 100`.

#### 4.6 Requête SQL

```sql
SELECT f.des                            AS famille,
       SUM(nl.chp_qt)                   AS quantite,
       SUM(nl.chp_Tprix_ht)             AS prix_ht,
       SUM(nl.tva_par_article)          AS tva,
       SUM(nl.chp_Tprix)                AS prix_ttc,
       SUM(nl.chp_Tprix) / SUM(SUM(nl.chp_Tprix)) OVER () * 100 AS pourcentage
FROM vw_nl nl
JOIN corres_des cd ON cd.des_coresp = nl.des_coresp
JOIN tbl_famille f  ON f.num_fam = CAST(cd.chp_fam AS UNSIGNED)
WHERE nl.num_magasin = 1
  AND nl.chp_date BETWEEN :date_debut AND :date_fin
GROUP BY f.des
ORDER BY prix_ttc DESC;
```

#### 4.7 Implémentation développeur

Calculer réellement le total (au lieu de 0,00) : `SUM(prix_ttc)` sur l'ensemble du résultat, affiché explicitement dans la nouvelle interface. Ne pas reproduire le défaut d'affichage constaté dans le logiciel existant sur la ligne Total de cet écran précis.

#### 4.8 Architecture d'affichage

C'est exactement la donnée du donut « par famille » du Tableau de bord (fiche 1) : réutiliser le même composant graphique (camembert / donut), complété par un tableau détaillé en dessous pour les valeurs exactes -- combiner visualisation et précision plutôt que de choisir l'un ou l'autre.

#### 4.9 Temps réel ou cache ?

Identique aux fiches 2 et 3 : cacheable par combinaison de filtres, avec invalidation si la plage inclut aujourd'hui.

---

### 5. Fiche -- Rapports et analyses : C.A. par vendeur

#### 5.1 Informations affichées

`Rapport = C.A. par vendeur`, mêmes filtres. Tableau : Vendeur, Nombre tickets, Prix HT, Prix TTC, Moyenne par ticket. Onze vendeurs listés (1-SAID, 2-BRAHIM, 3-MOUNAIM, 5-YOUSSEF, 7-MARIA, 8-NARJISS, 9-AMAL, Z10-RAJAA, Z11-KHADIJA, Z12-SARA, Z13-SPA). Total : 6 949 tickets, 1 268 894,92 HT, 1 438 570,10 TTC.

```{=latex}
\begin{factbox}
Le total HT de cette fiche (1\,268\,894,92) est très proche -- mais pas rigoureusement identique -- au total HT de la fiche « Ventes par articles » (1\,268\,898,29), un écart de 3,37 DH sur 1,27 million (0,0003 pourcent). C'est la preuve que ce rapport est calculé à partir de \texttt{ne\_fichier} (montant global du ticket, champ \texttt{chp\_mont\_ht}) et non en resommant les lignes de \texttt{nl\_fichier} : deux chemins de calcul indépendants, avec un arrondi qui diffère de quelques centimes selon qu'on arrondit par ligne ou par ticket. Le C.A. TTC (1\,438\,570,10), lui, est rigoureusement identique dans les deux rapports.
\end{factbox}
```

#### 5.2 -- 5.3 Tables et colonnes

`ne_fichier` / `ne_fichier_day` (`vw_ne`) : `chp_serv` (vendeur), `chp_mont_ht`, `chp_mont` (TTC), `chp_primary` (compte des tickets). `tbl_users_fixe` : `num_user`, `nom_user` (le libellé « 1-SAID », « Z10-RAJAA », etc. correspond très probablement au champ `nom_user` directement, le préfixe numérique / « Z » faisant partie du texte saisi par l'exploitant plutôt qu'un code séparé).

#### 5.4 Relations

`vw_ne.chp_serv` --> `tbl_users_fixe.num_user` (jointure implicite, sans contrainte déclarée). Noter l'existence d'un second champ, `chp_servenc` (le « serveur encaisseur », potentiellement différent du serveur ayant réalisé la prestation) : à clarifier avec l'éditeur si le rapport doit s'appuyer sur celui qui a exécuté la prestation ou celui qui a encaissé -- pour un institut de beauté, la logique commerciale (commissionnement) pointe vers `chp_serv` (le prestataire), déjà retenu par défaut ici.

#### 5.5 Calculs

Par vendeur : Nombre tickets = `COUNT(chp_primary)` ; Prix HT = `SUM(chp_mont_ht)` ; Prix TTC = `SUM(chp_mont)` ; Moyenne par ticket = `SUM(chp_mont) / COUNT(chp_primary)`.

#### 5.6 Requête SQL

```sql
SELECT COALESCE(u.nom_user, CONCAT('Vendeur #', ne.chp_serv)) AS vendeur,
       COUNT(ne.chp_primary)                                  AS nb_tickets,
       SUM(ne.chp_mont_ht)                                    AS prix_ht,
       SUM(ne.chp_mont)                                        AS prix_ttc,
       SUM(ne.chp_mont) / NULLIF(COUNT(ne.chp_primary),0)      AS
         moyenne_par_ticket
FROM vw_ne ne
LEFT JOIN tbl_users_fixe u ON u.num_user = ne.chp_serv AND u.num_magasin =
  ne.num_magasin
WHERE ne.num_magasin = 1
  AND ne.chp_date BETWEEN :date_debut AND :date_fin
GROUP BY ne.chp_serv, u.nom_user
ORDER BY prix_ttc DESC;
```

#### 5.7 Implémentation développeur

Utiliser un `LEFT JOIN` (pas un `INNER JOIN`) vers `tbl_users_fixe`, car un ticket ancien peut référencer un vendeur depuis supprimé ou renommé -- prévoir un libellé de repli (« Vendeur #12 ») plutôt qu'une ligne manquante. C'est un cas classique du fait que le schéma n'a aucune contrainte de clé étrangère (comme établi dans le document 1) : l'intégrité doit être gérée côté application.

#### 5.8 Architecture d'affichage

Tableau trié par C.A. décroissant (classement implicite des performances commerciales), avec éventuellement une barre de progression horizontale par ligne pour visualiser rapidement les écarts entre vendeurs -- utile pour un usage managérial (suivi de performance individuelle), sensible en termes d'accès (à réserver aux profils gérants / responsables).

#### 5.9 Temps réel ou cache ?

Cacheable comme les fiches précédentes ; toutefois, si ce rapport est consulté en fin de journée pour un suivi de performance quotidien, prévoir un rafraîchissement plus fréquent (par exemple toutes les 5 minutes) lorsque la plage inclut aujourd'hui.

---

### 6. Fiche -- Rapports et analyses : Rapport pointeuse

#### 6.1 Informations affichées

`Rapport = Rapport pointeuse`, mêmes filtres de date. Tableau : Vendeur, Nb heures, Coût. Six employés, tous à 01:02 (heures) et 0,00 DH (coût). En bas : Coût total 0,00 DH, « Masse Salariale / CA HT » 0 pourcent, « Masse Salariale / CA TTC » 0 pourcent.

```{=latex}
\begin{warnbox}
Cette fiche est la seule des six où les données semblent \textbf{non représentatives de l'activité réelle} : une durée de 01:02 identique pour six employés différents ressemble à une valeur de test ou de démonstration, pas à un relevé de pointeuse réel. Avant de bâtir un widget de « masse salariale » dans le nouveau dashboard, il faut vérifier avec le client si la pointeuse est réellement utilisée au quotidien dans ce commerce, et si un coût horaire (\texttt{cout\_hr}) a un jour été renseigné pour au moins un employé.
\end{warnbox}
```

#### 6.2 -- 6.3 Tables et colonnes

`tbl_pointeuse` : `id_serveur`, `chp_date`, `date_heure_demarre`, `date_heure_arret`, `cout_hr` (taux horaire au moment du pointage). `tbl_users_fixe` : `num_user`, `nom_user`, `cout_hr` (taux horaire courant de l'employé -- un second champ du même nom existe sur cette table, potentiellement le taux par défaut si celui du pointage est absent).

#### 6.4 Relations

`tbl_pointeuse.id_serveur` --> `tbl_users_fixe.num_user`. Le rapport croise ensuite ce résultat avec le chiffre d'affaires de la période, calculé depuis `vw_ne` (indépendamment du vendeur, sur l'ensemble du magasin) pour les deux ratios du bas de tableau.

#### 6.5 Calculs

Nb heures (par employé) = `SUM(TIMESTAMPDIFF(SECOND, date_heure_demarre, date_heure_arret)) / 3600`. Coût (par employé) = `SUM(TIMESTAMPDIFF(SECOND, date_heure_demarre, date_heure_arret) / 3600 * COALESCE(NULLIF(cout_hr_pointage,0), cout_hr_employe))`. Masse Salariale / CA HT = `SUM(coût de tous les employés) / SUM(chp_mont_ht sur la période, tout le magasin) * 100`. Masse Salariale / CA TTC = idem avec `chp_mont`.

#### 6.6 Requête SQL

```sql
-- Heures et coût par employé
SELECT u.nom_user,
       SUM(TIMESTAMPDIFF(SECOND, p.date_heure_demarre, p.date_heure_arret))
         / 3600 AS nb_heures,
       SUM(TIMESTAMPDIFF(SECOND, p.date_heure_demarre, p.date_heure_arret) /
         3600
           * COALESCE(NULLIF(p.cout_hr, 0), u.cout_hr))
             AS cout
FROM tbl_pointeuse p
JOIN tbl_users_fixe u ON u.num_user = p.id_serveur AND u.num_magasin =
  p.num_magasin
WHERE p.num_magasin = 1
  AND p.chp_date BETWEEN :date_debut AND :date_fin
  AND p.date_heure_arret IS NOT NULL
GROUP BY u.num_user, u.nom_user;

-- Ratio masse salariale / CA (sur l'ensemble du magasin, même période)
SELECT
  (SELECT SUM(TIMESTAMPDIFF(SECOND, p.date_heure_demarre,
    p.date_heure_arret) / 3600
              * COALESCE(NULLIF(p.cout_hr, 0), u.cout_hr))
   FROM tbl_pointeuse p JOIN tbl_users_fixe u ON u.num_user = p.id_serveur
   WHERE p.num_magasin = 1 AND p.chp_date BETWEEN :date_debut AND :date_fin)
  / NULLIF((SELECT SUM(chp_mont_ht) FROM vw_ne
            WHERE num_magasin = 1 AND chp_date BETWEEN :date_debut AND
              :date_fin), 0)
  * 100 AS masse_salariale_sur_ca_ht;
```

#### 6.7 Implémentation développeur

Exclure les pointages en cours (`date_heure_arret IS NULL`, employé encore « pointé » au moment de la requête) du calcul de coût, mais les signaler séparément dans l'interface (« en cours de service »). Prévoir un écran de configuration du taux horaire par employé dans `tbl_users_fixe.cout_hr`, car sans cette donnée renseignée, ce rapport restera à 0 pourcent quel que soit le développement effectué.

#### 6.8 Architecture d'affichage

Deux indicateurs KPI en tête (Masse salariale / CA HT, Masse salariale / CA TTC) suivis d'un tableau détaillé par employé (heures, coût). Ce widget a plus de valeur pour un gérant que pour un usage quotidien : le placer dans un onglet ou une section « Ressources humaines » plutôt qu'au premier plan du tableau de bord principal.

#### 6.9 Temps réel ou cache ?

Peu volatile (les pointages sont saisis a posteriori) : cache de quelques minutes suffisant, même sur la journée en cours, sauf si l'entreprise utilise le pointage pour un suivi de présence en direct.

---

### 7. Synthèse transverse

```{=latex}
\begin{notebox}
Récapitulatif par fiche -- source de données, granularité, et fraîcheur recommandée :
\begin{itemize}
\item \textbf{Tableau de bord (période)} : \texttt{vw\_ne} + \texttt{vw\_nl} + \texttt{corres\_des} + \texttt{tbl\_famille}, granularité ticket et ligne mélangées, cache court si la plage inclut aujourd'hui.
\item \textbf{Ventes par articles} : \texttt{vw\_nl} + \texttt{corres\_des} + \texttt{tbl\_famille}/\texttt{tbl\_ss\_famille}, granularité ligne, cacheable par combinaison de filtres.
\item \textbf{Meilleures ventes par article} : identique, avec tri et \texttt{LIMIT}.
\item \textbf{Ventes par famille} : identique, agrégé un niveau plus haut (famille).
\item \textbf{C.A. par vendeur} : \texttt{vw\_ne} + \texttt{tbl\_users\_fixe}, granularité ticket, rafraîchissement plus fréquent si usage managérial quotidien.
\item \textbf{Rapport pointeuse} : \texttt{tbl\_pointeuse} + \texttt{tbl\_users\_fixe} + \texttt{vw\_ne} (pour le CA du ratio), fonctionnellement inerte tant que \texttt{cout\_hr} n'est pas configuré -- à valider avant de le prioriser en développement.
\end{itemize}
\end{notebox}
```

```{=latex}
\begin{warnbox}
Points restant à valider auprès de l'éditeur Clyo Systems ou par test direct dans le logiciel existant avant la mise en production du nouveau dashboard :
\begin{enumerate}
\item Signification exacte de la courbe orange du graphique « Evolution des ventes ».
\item Définition précise de « Ratio A. » et « Ratio V. » dans les rapports par article.
\item Comportement exact du raccourci « Auj. après clôture » vis-à-vis de \texttt{tbl\_cloture} (bascule-t-il vers \texttt{ne\_fichier} une fois la clôture faite, ou reste-t-il sur \texttt{ne\_fichier\_day} ?).
\item Liste complète des valeurs possibles du menu déroulant « Vente » (seule « Vente générale » a été observée dans ces captures).
\item Critère de tri exact du rapport « Meilleures ventes par article » (quantité, C.A. TTC, ou C.A. marge).
\item Caractère réel ou fictif des données de \texttt{tbl\_pointeuse} pour ce commerce (valeur 01:02 identique et suspecte pour six employés).
\end{enumerate}
\end{warnbox}
```

### Annexe -- correspondance captures d'écran / fiches (série 2)

- Capture « Tableau de bord » (graphique Evolution des ventes, C.A. par jour, deux donuts) + capture zoom du sélecteur de dates --> Fiche 1.
- Capture « Rapports Et Analyses -- Ventes par articles » (vue pleine page) + capture zoom des colonnes du tableau --> Fiche 2.
- Capture « Rapports Et Analyses -- Meilleures ventes par article » --> Fiche 3.
- Capture « Rapports Et Analyses -- Ventes par famille » --> Fiche 4.
- Capture « Rapports Et Analyses -- C.A. par vendeur » --> Fiche 5.
- Capture « Rapports Et Analyses -- Rapport pointeuse » --> Fiche 6.

Le schéma entités-relations complet (toutes tables, séries 1 et 2 confondues) reste celui produit dans le document 1 -- il est reproduit ci-dessous pour ne pas obliger le lecteur à ouvrir les deux documents en parallèle.

![Schéma entités-relations](schema_diagram.png)


# Partie 4 -- Plan officiel de développement (22 étapes)


```{=latex}
\begin{tldrbox}
\begin{itemize}
\item Ce document est la \textbf{feuille de route officielle} du projet : 22 étapes, dans l'ordre de réalisation, chacune découpée en sous-étapes avec objectif, prérequis, tables/colonnes/relations concernées, règles métier, calculs, API, backend, frontend, contrôles, optimisations, tests, et critères de sortie explicites (terminé / vérifié / validé / étape suivante).
\item Il s'appuie sur tout ce qui a déjà été validé dans les documents précédents : le schéma de base de données (\texttt{Analyse\_BDD\_Dashboard\_POS.pdf}), les fiches par rapport (\texttt{Dashboard\_POS\_Pack\_Developpeur.zip}) et le guide d'architecture (\texttt{Guide\_BDD\_Vers\_Application\_Web.pdf}). Ce plan ne répète pas chaque requête SQL en détail quand elle existe déjà ailleurs -- il y renvoie précisément, pour rester un document de \textbf{pilotage du processus}, pas un doublon.
\item Règle de lecture : chaque étape se termine par un encadré \textbf{« Sortie de l'étape »} qui répond explicitement à la question « quelle est la prochaine étape ? ». Un développeur qui suit ce document dans l'ordre ne devrait jamais avoir à deviner ce qui vient après.
\item Hypothèse de départ retenue pour ce plan : un seul magasin actif (\texttt{num\_magasin = 1}), architecture cible en 4 couches (base caisse -> synchronisation -> API backend -> application web), conforme au schéma \texttt{schema\_architecture\_application.png} déjà livré.
\end{itemize}
\end{tldrbox}
```

## Comment utiliser ce document

Ce plan est écrit pour être suivi **dans l'ordre**, étape par étape. Chaque étape (1 à 22) contient, quand c'est pertinent, les rubriques suivantes : Objectif, Prérequis, Dépendances, Tables concernées, Colonnes utilisées, Relations, Règles métier, Calculs, API à développer, Traitements Backend, Composants Frontend, Contrôles et validations, Optimisations recommandées, Tests à réaliser, Sortie de l'étape (definition of done).

Quand une rubrique n'a pas de sens pour une étape donnée (par exemple « Tables concernées » pour l'étape 1, qui est une étape d'organisation de projet), elle est marquée **Non applicable** plutôt que remplie artificiellement -- pour rester honnête sur ce qui compte vraiment à chaque étape.

```{=latex}
\begin{notebox}
Convention de nommage utilisée dans tout ce document : \texttt{@magasin} = identifiant du magasin (1 pour ce commerce) ; \texttt{vw\_ne} / \texttt{vw\_nl} = vues unifiant \texttt{ne\_fichier + ne\_fichier\_day} et \texttt{nl\_fichier + nl\_fichier\_day} (voir étape 2) ; \texttt{:date\_debut} / \texttt{:date\_fin} = paramètres de plage de dates transmis par le frontend à l'API.
\end{notebox}
```

---

## Étape 1 -- Préparation du projet

### Objectif

Poser les fondations organisationnelles et techniques du projet avant d'écrire la moindre ligne de code : environnements, outils, accès, planning, périmètre validé avec le client.

### Prérequis

- Ce plan de développement doit avoir été lu et approuvé par le développeur et le client (le gérant de l'institut).
- Accès à la base de données `dbclyo` (au moins un export / dump pour l'analyse, comme celui déjà fourni et analysé).
- Accès réseau au poste de caisse (pour la mise en place ultérieure de la synchronisation, étape 3).

### Dépendances

Aucune -- c'est la première étape du projet.

### Tables concernées / Colonnes / Relations / Calculs

Non applicable à cette étape.

### Sous-étapes détaillées

1. **Cadrage fonctionnel avec le client** : reconfirmer par écrit le périmètre exact du dashboard (KPI attendus, rapports à reproduire -- voir la liste des 12 rapports déjà documentés dans `Dashboard_POS_Pack_Developpeur.zip`), le nombre de magasins actuels et futurs, les rôles utilisateurs attendus (gérant, responsable, employé).
2. **Choix de la stack technique**, en cohérence avec le guide d'architecture déjà livré :
   - Backend : Node.js + Express (ou équivalent -- Python/FastAPI, PHP/Laravel -- selon les compétences de l'équipe).
   - Base de reporting : MySQL (même moteur que la source, pour simplifier la synchronisation).
   - Frontend : React (ou Vue/Angular), avec une bibliothèque de graphiques (Recharts, Chart.js ou ECharts) et une bibliothèque de tableaux (TanStack Table ou AG Grid).
   - Cache : mémoire applicative pour un seul magasin, Redis si plusieurs magasins ou plusieurs instances backend sont prévus.
3. **Mise en place des outils de travail** : dépôt de code (Git), gestion de tâches (backlog reprenant les 22 étapes de ce plan comme épopées), environnement de développement local, environnement de test, environnement de production (cible finale).
4. **Définition des environnements** : `dev` (poste du développeur, avec un jeu de données anonymisé ou une copie du dump déjà fourni), `staging` (test avec des données réelles en lecture seule), `production` (déploiement final, voir étape 21).
5. **Planning macro** : associer une durée estimée à chaque étape de ce document (à ajuster selon la taille de l'équipe), avec des jalons de validation client après les étapes 4, 11, 16 et 20.

### Contrôles et validations

- Le périmètre fonctionnel validé par le client est-il couché par écrit et signé/accepté (email ou document) ?
- La stack technique choisie est-elle documentée (fichier `README` technique du dépôt) ?

### Tests à réaliser avant de passer à l'étape suivante

- Vérifier que chaque membre de l'équipe peut cloner le dépôt, installer les dépendances et lancer un « hello world » basique dans le langage choisi.
- Vérifier l'accès effectif au dump / à la base de données d'analyse.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 1} -- Terminé : environnements et outils en place, stack choisie et documentée. Vérifié : accès à la base de données confirmé, périmètre fonctionnel écrit. Validé : le client a confirmé par écrit le périmètre et le planning macro. Étape suivante : Étape 2 -- Analyse de la base de données.
\end{factbox}
```

---

## Étape 2 -- Analyse de la base de données

### Objectif

Consolider, avant tout développement, une compréhension complète et vérifiée du schéma de données existant -- pour ne jamais avoir à « découvrir » une table ou une colonne en plein développement d'une fonctionnalité.

### Prérequis

Étape 1 terminée. Dump ou accès à `dbclyo` disponible.

### Dépendances

Cette étape conditionne toutes les suivantes : aucune requête ne doit être écrite avant que cette analyse soit validée.

### Tables concernées (rappel des tables déjà cartographiées)

- **Circuit de vente** : `note_entete` / `note_detail` (saisie brouillon, à ne pas utiliser comme source officielle) ; `ne_fichier` / `ne_fichier_day` et `nl_fichier` / `nl_fichier_day` (source certifiée, à unifier via les vues `vw_ne` / `vw_nl`).
- **Catalogue** : `corres_des`, `tbl_famille`, `tbl_ss_famille`.
- **Clients** : `tbl_clients`, `tbl_fidelite_point`, `planningprestation`.
- **Employés** : `tbl_users_fixe`, `tbl_pointeuse`.
- **Paiements** : `tbl_les_reglement`, `tbl_caisse_detaille`.
- **Clôture / fiscalité** : `tbl_cloture`, `grand_total_ticket` / `grand_total_periode` / `grand_total_mensuel` / `grand_total_annuel`.
- **Stock** (module présent mais non alimenté pour ce commerce) : `tbl_produits`, `tbl_stock`.

Le détail exhaustif colonne par colonne de chacune de ces tables est déjà produit dans `Analyse_BDD_Dashboard_POS.pdf` (section 2, « Analyse des tables ») -- ne pas le recopier ici, s'y référer directement.

### Colonnes utilisées / Relations

Voir le schéma entités-relations complet : `00_Schemas/schema_base_de_donnees.png` (déjà livré). Relations clé à retenir absolument avant de développer :

- `vw_ne` (1 ticket) --- 1 : N --- `vw_nl` (N lignes vendues) via `chp_ref_prim = chp_primary`.
- `vw_nl.des_coresp` --> `corres_des.des_coresp` --> `corres_des.chp_fam` --> `tbl_famille.num_fam` (jointure avec conversion de type, aucune contrainte de clé étrangère déclarée dans ce schéma).
- `vw_ne.chp_serv` --> `tbl_users_fixe.num_user` (vendeur / prestataire).
- `vw_ne.compte_client` --> `tbl_clients.num_cl`.
- `tbl_pointeuse.id_serveur` --> `tbl_users_fixe.num_user`.

### Règles métier déjà établies (à ne jamais recoder différemment)

```{=latex}
\begin{warnbox}
Trois règles métier capitales, déjà vérifiées au centime près sur les données réelles, à respecter dans tout le code du dashboard :
\begin{enumerate}
\item La source de vérité pour toute vente est \texttt{ne\_fichier} / \texttt{ne\_fichier\_day} + \texttt{nl\_fichier} / \texttt{nl\_fichier\_day}, jamais \texttt{note\_entete} / \texttt{note\_detail} (table de brouillon, sujette à doublons).
\item Un ticket à \texttt{chp\_mont = 0} est un ticket resté ouvert / non finalisé en caisse : il doit être exclu de tous les comptages (nombre de tickets, chiffre d'affaires, ticket moyen).
\item Le mécanisme exact de distinction « Vente générale » / « Offert » (\texttt{chp\_etatligne} et/ou \texttt{tbl\_les\_reglement.type\_ca}) reste à confirmer formellement avec l'éditeur Clyo Systems avant la mise en production -- deux mécanismes de gratuité semblent coexister (voir \texttt{Rapports\_Journaliers/04\_Ventes\_Offertes}).
\end{enumerate}
\end{warnbox}
```

### Sous-étapes détaillées

1. Relire intégralement `Analyse_BDD_Dashboard_POS.pdf` (sections 0 à 6) avec toute l'équipe de développement, pas seulement le lead technique.
2. Reproduire, en environnement de test, les requêtes de validation déjà utilisées (comparaison `ne_fichier_day` vs écran caisse réel) sur un jour d'activité réel, pour que chaque développeur voie de ses propres yeux que le modèle de données est fiable.
3. Lister, avec le client, toute évolution prévue du schéma côté éditeur Clyo Systems (nouvelles colonnes, nouvelles versions du logiciel de caisse) qui pourrait invalider cette analyse dans le futur.
4. Ouvrir un ticket de suivi (backlog) pour chaque point marqué « à valider avec l'éditeur » dans les documents déjà livrés (liste consolidée à l'étape 20).

### Tests à réaliser avant de passer à l'étape suivante

- Chaque développeur de l'équipe doit être capable d'expliquer, sans notes, la différence entre `note_entete` / `note_detail` et `ne_fichier` / `nl_fichier`, et pourquoi la seconde paire est la source officielle.
- Rejouer manuellement, en base de test, au moins une requête de chaque fiche de rapport déjà fournie et vérifier que le résultat est cohérent avec la capture d'écran d'origine.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 2} -- Terminé : schéma et règles métier relus et compris par toute l'équipe. Vérifié : requêtes de validation rejouées avec succès en environnement de test. Validé : le lead technique confirme qu'aucune ambiguïté de schéma ne subsiste pour démarrer la conception. Étape suivante : Étape 3 -- Conception de l'architecture.
\end{factbox}
```

---

## Étape 3 -- Conception de l'architecture

### Objectif

Figer l'architecture technique cible (les 4 couches déjà schématisées) avant de coder, pour que chaque développeur sache exactement où placer chaque nouvelle fonctionnalité.

### Prérequis

Étapes 1 et 2 terminées.

### Dépendances

Conditionne toutes les étapes de développement (5 à 18).

### Sous-étapes détaillées

#### 3.1 Validation du schéma d'architecture en 4 couches

Reprendre le schéma `schema_architecture_application.png` déjà livré :

1. **Base de la caisse** (`dbclyo`, MyISAM, sur le poste Windows) -- inchangée, jamais modifiée par le nouveau projet.
2. **Couche de synchronisation** -- réplication MySQL native (recommandée si réseau stable) ou export planifié toutes les 1 à 5 minutes (ETL léger, basé sur la colonne `updated_on` présente sur la quasi-totalité des tables).
3. **Base de reporting** -- copie ou réplica, sur laquelle sont créées les vues `vw_ne` / `vw_nl` (jamais sur la base de production).
4. **API backend** -- lecture seule sur la base de reporting, expose des endpoints REST JSON, gère cache et authentification.
5. **Application web frontend** -- consomme l'API, affiche cartes KPI / graphiques / tableaux.

```{=latex}
\begin{warnbox}
Décision d'architecture non négociable : le nouveau système ne doit \textbf{jamais} écrire dans la base de la caisse, et ne doit \textbf{jamais} interroger directement la base de production pour des requêtes lourdes (risque de ralentir l'encaissement en boutique, moteur MyISAM à verrous de table). Toute requête d'agrégation doit passer par la base de reporting.
\end{warnbox}
```

#### 3.2 Choix technique de la synchronisation

Décider, avec le client, entre réplication native et export planifié, selon la qualité du réseau disponible sur le site. Documenter la décision et sa justification (ADR -- Architecture Decision Record) dans le dépôt de code.

#### 3.3 Conception du découpage en modules backend

Un module par grande famille de rapports, reproduisant la structure du menu « Rapports et analyses » du logiciel existant : `ventes`, `paiements`, `employes`, `clients`, `stock` (si activé un jour). Chaque module expose ses propres routes mais partage les fonctions utilitaires de connexion et de cache.

#### 3.4 Conception du découpage frontend

Pages principales : Accueil (KPI du jour), Ventes, Produits & Catégories, Clients, Paiements, Employés, Rapports & Exports, Alertes. Cette proposition de découpage reprend celle déjà faite dans le document `Analyse_BDD_Dashboard_POS.pdf` (section 8).

#### 3.5 Diagramme de flux d'une requête type

Pour fixer les idées de toute l'équipe, documenter noir sur blanc le trajet d'une requête depuis le clic utilisateur jusqu'à l'affichage :

```
Utilisateur clique "Ventes par famille, du 01/07 au 21/07"
 -> Frontend appelle
    GET /api/rapports/ventes-famille
        ?date_debut=2026-07-01&date_fin=2026-07-21
 -> Backend vérifie le token JWT (authentification, étape 7)
 -> Backend vérifie le cache pour cette combinaison de filtres
     -> si oui : renvoie le résultat en cache immédiatement
     -> si non : exécute la requête SQL sur la base
                 de reporting (vw_nl + corres_des + tbl_famille),
                 met en cache si la période est close,
                 puis renvoie le résultat
 -> Frontend reçoit le JSON, le transforme en donut + tableau
```

### Contrôles et validations

- L'architecture retenue est-elle documentée (schéma + ADR) et validée par le client (au moins informé du principe de synchronisation en lecture seule) ?
- Chaque développeur sait-il, pour une nouvelle fonctionnalité demandée, dans quelle couche et quel module elle doit être développée ?

### Tests à réaliser avant de passer à l'étape suivante

- Faire valider par un développeur senior (ou un pair) le schéma d'architecture avant de commencer le développement.
- Simuler « à la main » (sur un tableau blanc ou un document) le trajet d'une requête pour 2 ou 3 rapports différents, afin de vérifier que le découpage en modules tient la route pour l'ensemble des 12 rapports déjà identifiés.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 3} -- Terminé : architecture en 4 couches documentée, découpage backend/frontend décidé. Vérifié : trajet d'une requête type validé sur plusieurs rapports. Validé : le client a confirmé le principe de synchronisation en lecture seule et l'absence d'impact sur la caisse. Étape suivante : Étape 4 -- Création de la base de données du Dashboard.
\end{factbox}
```

---

## Étape 4 -- Création de la base de données du Dashboard (si nécessaire)

### Objectif

Mettre en place concrètement la base de reporting et sa synchronisation avec la base de la caisse -- la toute première brique technique réellement codée du projet.

### Prérequis

Étape 3 validée. Accès réseau au poste de caisse confirmé (étape 1).

### Dépendances

Bloque toutes les étapes suivantes : aucun backend ne peut être développé sans une base de reporting fonctionnelle et à jour.

### Tables concernées

L'intégralité du schéma source doit être répliquée (structure identique), a minima les tables listées à l'étape 2. Les vues `vw_ne` et `vw_nl` sont créées uniquement sur la base de reporting.

### Sous-étapes détaillées

1. **Provisionner l'instance MySQL de reporting** (serveur dédié ou instance cloud), avec un utilisateur applicatif en lecture seule pour le futur backend, et un utilisateur dédié à la synchronisation avec des droits d'écriture limités à cette seule base.
2. **Mettre en place la réplication ou l'export planifié** décidé à l'étape 3.3 :
   - Réplication native : configurer le `binlog` sur la base source, créer l'utilisateur de réplication, démarrer le réplica, vérifier `SHOW SLAVE STATUS`.
   - Export planifié : écrire le script (cron) qui sélectionne les lignes modifiées depuis la dernière synchronisation (`WHERE updated_on > :derniere_sync`) et les insère/met à jour (`INSERT ... ON DUPLICATE KEY UPDATE`) dans la base de reporting.
3. **Créer les vues `vw_ne` et `vw_nl`** sur la base de reporting (script déjà fourni dans `Analyse_BDD_Dashboard_POS.pdf`, section 7).
4. **Créer les index recommandés** si absents : `(num_magasin, chp_date)` sur `ne_fichier(_day)` et `nl_fichier(_day)`, déjà signalés comme présents dans le dump analysé -- à vérifier sur l'instance de reporting après réplication.
5. **Mettre en place un job de contrôle de fraîcheur** : une requête planifiée qui compare le dernier `updated_on` de la base source et de la base de reporting, et alerte (email / log) si l'écart dépasse un seuil (ex. 10 minutes).

### Règles métier

La base de reporting ne doit jamais devenir elle-même une source d'écriture : aucune fonctionnalité du dashboard (aucun bouton, aucune action utilisateur) ne doit écrire dans cette base au niveau des tables répliquées. Seules des tables strictement propres au dashboard (préférences utilisateur, favoris, historique d'export) peuvent être ajoutées et gérées en écriture par le backend.

### Contrôles et validations

- Comparer, sur une journée réelle, les chiffres de la base de reporting avec l'écran caisse (même méthode de validation croisée qu'à l'étape 2), pour confirmer que la synchronisation ne dénature pas les données.
- Vérifier que l'utilisateur applicatif du futur backend n'a bien que des droits `SELECT`.

### Optimisations recommandées

Si l'export planifié est retenu plutôt que la réplication native, indexer la colonne `updated_on` sur toutes les tables sources pour que la sélection incrémentale reste rapide même quand l'historique grossit.

### Tests à réaliser avant de passer à l'étape suivante

- Test de bout en bout : créer une vente de test sur la caisse (environnement de test uniquement, jamais en production à ce stade), vérifier qu'elle apparaît dans la base de reporting dans le délai attendu.
- Test de résilience : couper la synchronisation quelques minutes, la relancer, vérifier qu'aucune donnée n'est perdue ni dupliquée.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 4} -- Terminé : base de reporting en place, synchronisée, vues \texttt{vw\_ne} / \texttt{vw\_nl} créées. Vérifié : chiffres de la base de reporting identiques à l'écran caisse sur une journée test. Validé : le job de contrôle de fraîcheur est actif et le client a été informé du délai de synchronisation choisi. Étape suivante : Étape 5 -- Développement du Backend.
\end{factbox}
```

---

## Étape 5 -- Développement du Backend

### Objectif

Mettre en place le squelette du serveur applicatif : connexion à la base de reporting, structure de modules, gestion des erreurs, journalisation -- avant d'écrire le premier endpoint métier.

### Prérequis

Étape 4 terminée (base de reporting disponible et à jour).

### Dépendances

Conditionne les étapes 6 à 17 (tout ce qui s'exécute côté serveur).

### Tables concernées

Aucune table métier spécifique à cette étape -- il s'agit d'infrastructure logicielle. La connexion établie ici pointera vers la base de reporting définie à l'étape 4.

### Sous-étapes détaillées

1. **Initialiser le projet backend** (`npm init` ou équivalent), structurer les dossiers par module (`ventes/`, `paiements/`, `employes/`, `clients/`, `auth/`, `commun/`).
2. **Configurer la connexion à la base de reporting** via un pool de connexions (jamais une connexion unique par requête -- pool avec un nombre de connexions maximum cohérent avec la capacité du serveur MySQL).
3. **Mettre en place la gestion centralisée des erreurs** : un middleware qui capture toute exception, la journalise, et renvoie une réponse JSON uniforme (`{ "error": "...", "code": "..." }`), sans jamais exposer un message d'erreur SQL brut au frontend (risque de fuite d'information sur le schéma).
4. **Mettre en place la journalisation (logs)** : chaque requête entrante (endpoint, filtres, durée d'exécution), pour faciliter le diagnostic de lenteur ou d'erreur en production.
5. **Définir la convention de réponse JSON** commune à tous les endpoints, par exemple :

```json
{
  "data": { },
  "meta": {
    "date_debut": "2026-07-01",
    "date_fin": "2026-07-21",
    "cache": "hit",
    "genere_le": "2026-07-21T22:00:00Z"
  }
}
```

6. **Mettre en place les variables d'environnement** (fichier `.env`, jamais commité dans le dépôt) : identifiants de connexion à la base de reporting, secret JWT (étape 7), configuration du cache.
7. **Écrire un endpoint de santé** (`GET /api/health`) qui vérifie la connexion à la base de reporting et renvoie un statut simple -- utile pour la supervision en production (étape 21).

### Contrôles et validations

- La connexion à la base de reporting échoue-t-elle proprement (message clair, pas de plantage du serveur) si la base est momentanément indisponible ?
- Les identifiants de connexion sont-ils bien hors du dépôt de code (fichier `.env` ignoré par Git) ?

### Optimisations recommandées

Dimensionner le pool de connexions en fonction du nombre d'utilisateurs simultanés attendus (pour un seul institut, quelques connexions suffisent très largement -- ne pas sur-dimensionner inutilement).

### Tests à réaliser avant de passer à l'étape suivante

- Lancer le serveur, appeler `GET /api/health`, vérifier une réponse `200 OK`.
- Couper volontairement l'accès à la base de reporting et vérifier que `GET /api/health` renvoie une erreur claire plutôt qu'un plantage du serveur.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 5} -- Terminé : squelette backend fonctionnel, connecté à la base de reporting, avec gestion d'erreurs et journalisation. Vérifié : endpoint de santé opérationnel, y compris en cas de panne de la base. Validé : convention de réponse JSON approuvée par toute l'équipe (backend et frontend). Étape suivante : Étape 6 -- Développement des API.
\end{factbox}
```

---

## Étape 6 -- Développement des API

### Objectif

Exposer, un par un, les endpoints REST correspondant aux 12 rapports déjà documentés (6 fiches « jour » + 6 fiches « période »), en réutilisant systématiquement les requêtes SQL déjà écrites et validées.

### Prérequis

Étape 5 terminée. Fiches de rapport disponibles (`Dashboard_POS_Pack_Developpeur.zip`).

### Dépendances

Dépend du module d'authentification (étape 7) pour la protection des routes sensibles (ex. masse salariale) -- ces deux étapes peuvent être menées en parallèle si l'équipe est suffisante, à condition de brancher l'authentification avant la mise en production.

### Tables concernées / Colonnes / Relations / Calculs

Repris intégralement des 12 fiches de rapport déjà livrées -- ne pas les réécrire ici. Rappel de la règle de mutualisation déjà notée dans le guide d'architecture : **un rapport « jour » et son équivalent « période » partagent presque toujours la même requête SQL**, seule la plage de dates change (`date_debut = date_fin = aujourd'hui` pour la version jour). Concrètement, cela réduit les 12 rapports à **6 requêtes réellement distinctes** côté backend :

1. Règlements (moyens de paiement)
2. Bande de contrôle / liste des tickets
3. Ventes par article (avec filtre vente générale / offert)
4. Ventes par famille
5. C.A. par vendeur
6. Rapport pointeuse (masse salariale)

### API à développer

Convention de routage proposée (à ajuster selon les préférences de l'équipe, mais à fixer une bonne fois pour toutes avant de commencer) :

```
GET /api/reglements
    ?date_debut=...&date_fin=...&caisse=...&etablissement=...

GET /api/tickets
    ?date_debut=...&date_fin=...

GET /api/ventes/articles
    ?date_debut=...&date_fin=...&type_vente=...&famille=...
    &sous_famille=...&vendeur=...&caisse=...&top=...

GET /api/ventes/familles
    ?date_debut=...&date_fin=...

GET /api/vendeurs/ca
    ?date_debut=...&date_fin=...

GET /api/employes/pointeuse
    ?date_debut=...&date_fin=...

GET /api/dashboard
    ?date_debut=...&date_fin=...
    (agrège plusieurs requêtes ci-dessus pour la page d'accueil)

GET /api/health
```

### Traitements Backend

1. Pour chaque endpoint : valider les paramètres reçus (dates au bon format, plage cohérente -- `date_debut <= date_fin`, filtres optionnels correctement neutralisés s'ils sont absents).
2. Construire la requête SQL paramétrée (jamais de concaténation de chaînes -- toujours des requêtes préparées, pour éviter toute injection SQL, voir étape 18).
3. Vérifier le cache avant d'exécuter la requête (voir étape 17 pour la stratégie complète).
4. Exécuter la requête sur la base de reporting, transformer le résultat en JSON selon la convention définie à l'étape 5.
5. Journaliser le temps d'exécution de chaque requête, pour identifier tôt les endpoints lents.

### Composants Frontend

Non applicable à cette étape (le frontend consomme ces API à partir de l'étape 13 -- mais un développeur backend peut tester chaque endpoint avec un simple client HTTP, ex. Postman ou `curl`, sans attendre le frontend).

### Contrôles et validations

- Chaque endpoint valide-t-il ses paramètres et renvoie-t-il une erreur `400` claire en cas de paramètre manquant ou incohérent (ex. `date_fin` antérieure à `date_debut`) ?
- Chaque endpoint exclut-il bien les tickets à `chp_mont = 0` là où c'est pertinent (règle métier de l'étape 2) ?

### Optimisations recommandées

Regrouper, quand c'est possible, plusieurs sous-requêtes indépendantes en une seule requête SQL (voir l'exemple du « Tableau de bord du jour », qui combine CA, tickets, remises et offerts en une seule requête à sous-requêtes) plutôt que de multiplier les allers-retours réseau vers la base de données.

### Tests à réaliser avant de passer à l'étape suivante

- Pour chacun des 6 endpoints principaux : rejouer la requête avec les mêmes filtres que la capture d'écran d'origine correspondante, et comparer chiffre par chiffre le résultat JSON avec les valeurs déjà vérifiées (ex. CA du jour 32 660,00, total « Ventes par articles » 1 268 898,29 HT).
- Tester les cas limites : plage de dates vide (aucune vente), filtre sur un vendeur ou une famille inexistante, dates inversées.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 6} -- Terminé : les 6 endpoints principaux (couvrant les 12 rapports) sont développés et documentés. Vérifié : chaque endpoint reproduit exactement, chiffre par chiffre, les valeurs déjà validées dans les fiches de rapport. Validé : le client (ou un référent métier) a comparé au moins un export de chaque rapport avec l'écran du logiciel existant. Étape suivante : Étape 7 -- Développement du système d'authentification.
\end{factbox}
```

---

## Étape 7 -- Développement du système d'authentification

### Objectif

Protéger l'accès à l'application et différencier les niveaux d'accès (gérant, responsable, employé), en particulier pour les données sensibles (masse salariale, marges).

### Prérequis

Étape 5 terminée (squelette backend en place).

### Dépendances

Doit être branché sur les endpoints de l'étape 6 avant toute mise en production (étape 21) -- peut être développé en parallèle de l'étape 6.

### Tables concernées

Nouvelle table propre au dashboard (n'existe pas dans le schéma de la caisse) : `dashboard_utilisateurs` (identifiant, nom, mot de passe haché, rôle, magasin(s) autorisé(s)). Ne pas réutiliser `tbl_users_fixe` de la caisse pour l'authentification web : ce sont deux systèmes différents (l'un pour la caisse, l'autre pour le dashboard), même si les mêmes personnes peuvent y figurer.

### Colonnes utilisées

`dashboard_utilisateurs` : `id`, `nom`, `email`, `mot_de_passe_hache`, `role` (`gerant` / `responsable` / `employe`), `num_magasin_autorises` (liste, pour une future extension multi-magasins), `actif`, `derniere_connexion`.

### Règles métier

```{=latex}
\begin{notebox}
Rôles proposés, cohérents avec la sensibilité des données déjà identifiée dans les fiches de rapport :
\begin{itemize}
\item \textbf{Gérant} : accès à tout, y compris masse salariale (\texttt{Rapport pointeuse}) et marges.
\item \textbf{Responsable} : accès aux rapports de vente, paiements, employés (hors masse salariale détaillée).
\item \textbf{Employé} : accès à ses propres statistiques uniquement (son C.A., son planning), pas aux données des autres employés ni à la masse salariale globale.
\end{itemize}
\end{notebox}
```

### API à développer

```
POST /api/auth/login
     { email, mot_de_passe } -> { token, role, expire_le }

POST /api/auth/logout

GET  /api/auth/me
     (retourne les infos du token courant)

POST /api/auth/changer-mot-de-passe
```

### Traitements Backend

1. Hachage des mots de passe (bcrypt ou argon2 -- jamais de mot de passe en clair, ni en base, ni dans les logs).
2. Génération d'un jeton JWT à la connexion, contenant l'identifiant utilisateur, le rôle, et une expiration courte (ex. 8 heures, renouvelable).
3. Middleware d'authentification appliqué à toutes les routes de l'étape 6 : vérifie la validité du jeton, rejette avec un `401` si absent ou expiré.
4. Middleware d'autorisation par rôle : certains endpoints (ex. `GET /api/employes/pointeuse`) doivent vérifier explicitement `role === 'gerant'` avant de renvoyer les données de masse salariale.

### Composants Frontend

Écran de connexion (email + mot de passe), stockage sécurisé du jeton côté client (mémoire ou stockage sécurisé du navigateur -- jamais dans une variable globale accessible par un script tiers), redirection automatique vers l'écran de connexion si le jeton est expiré, masquage des menus/pages non autorisés selon le rôle courant.

### Contrôles et validations

- Un utilisateur avec le rôle `employe` reçoit-il bien un `403 Forbidden` s'il tente d'appeler directement l'endpoint de masse salariale (même en contournant l'interface, via `curl`) ?
- Les mots de passe sont-ils bien hachés en base (vérifier qu'aucun mot de passe en clair n'apparaît jamais, y compris dans les logs applicatifs) ?

### Optimisations recommandées

Non prioritaire pour un seul magasin avec peu d'utilisateurs simultanés -- la priorité ici est la sécurité, pas la performance.

### Tests à réaliser avant de passer à l'étape suivante

- Test de connexion réussie et échouée (mauvais mot de passe).
- Test d'expiration de jeton (attendre ou forcer l'expiration, vérifier le rejet).
- Test d'autorisation croisée : un compte `employe` ne doit voir ni les données d'un autre employé, ni la masse salariale globale.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 7} -- Terminé : authentification et gestion des rôles opérationnelles, branchées sur tous les endpoints de l'étape 6. Vérifié : tests d'autorisation croisée passés avec succès pour les trois rôles. Validé : le client a validé la liste des comptes initiaux et leurs rôles respectifs. Étape suivante : Étape 8 -- Développement des services métier.
\end{factbox}
```

---

## Étape 8 -- Développement des services métier

### Objectif

Extraire, dans une couche de services réutilisable (indépendante des routes HTTP), toute la logique métier qui sera partagée par plusieurs rapports -- pour éviter la duplication de code entre les 6 requêtes principales de l'étape 6.

### Prérequis

Étape 6 en cours ou terminée (les endpoints existent, mais leur logique interne doit être factorisée proprement).

### Dépendances

Sert de fondation aux étapes 9 à 11 (calculs statistiques, rapports, KPI) : ces étapes doivent consommer ces services plutôt que réécrire des requêtes SQL directement dans les contrôleurs de routes.

### Tables concernées

Toutes les tables déjà identifiées à l'étape 2 -- cette étape ne rajoute pas de nouvelles tables, elle organise le code qui les interroge.

### Règles métier centralisées dans ces services

1. **Service `periode.js`** : validation et normalisation d'une plage de dates (`date_debut` / `date_fin`), calcul automatique des périodes de comparaison (veille, même jour semaine précédente, mois précédent).
2. **Service `filtreVente.js`** : traduction du filtre « Vente générale » / « Offert » en clause SQL (`chp_etatligne`), centralisé à un seul endroit pour que la correction du point encore ambigu (voir étape 2) ne soit à faire qu'une fois si l'éditeur confirme le mécanisme exact.
3. **Service `vendeur.js`** : résolution du nom d'un vendeur à partir de `chp_serv`, avec repli (`Vendeur #12`) si le vendeur n'existe plus dans `tbl_users_fixe` (voir la remarque déjà faite sur l'absence de contraintes de clé étrangère).
4. **Service `cloture.js`** : détermine si une date donnée est déjà clôturée (`tbl_cloture`), information utilisée par la stratégie de cache (étape 17) et par le raccourci « Auj. après clôture » du frontend.

### Calculs

Chaque service expose des fonctions pures et testables, par exemple :

```js
// periode.js
function estPeriodeCloturee(dateDebut, dateFin, magasin) { /* ... */ }
function periodeComparaisonPrecedente(dateDebut, dateFin) { /* ... */ }

// filtreVente.js
function clauseTypeVente(typeVente) {
  // typeVente: 'generale' | 'offert' | 'tout'
  // retourne la clause SQL correspondante,
  // à valider avec l'éditeur (voir étape 2)
}
```

### Traitements Backend

Refactoriser les 6 endpoints de l'étape 6 pour qu'ils appellent ces services plutôt que d'inclure la logique directement -- sans changer leur comportement observable (mêmes résultats, mêmes URLs).

### Contrôles et validations

Chaque service dispose-t-il de tests unitaires isolés (sans base de données, avec des dates et des valeurs fictives) ?

### Tests à réaliser avant de passer à l'étape suivante

- Tests unitaires sur `periode.js` : dates limites (changement de mois, changement d'année, plage d'un seul jour).
- Tests unitaires sur `cloture.js` : date d'aujourd'hui (non clôturée), date d'hier (clôturée), date future (cas limite à gérer proprement, ne doit pas planter).
- Vérifier, après refactorisation, que les endpoints de l'étape 6 renvoient exactement les mêmes résultats qu'avant (non-régression).

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 8} -- Terminé : couche de services métier extraite et utilisée par tous les endpoints existants. Vérifié : tests unitaires des services passés avec succès, aucune régression sur les endpoints existants. Validé : le lead technique confirme que toute nouvelle fonctionnalité pourra réutiliser ces services sans dupliquer de logique. Étape suivante : Étape 9 -- Développement des calculs statistiques.
\end{factbox}
```

---

## Étape 9 -- Développement des calculs statistiques

### Objectif

Implémenter, en s'appuyant sur les services de l'étape 8, l'ensemble des calculs statistiques transverses nécessaires à plusieurs rapports et KPI (moyennes, pourcentages, comparaisons de périodes, classements).

### Prérequis

Étape 8 terminée.

### Dépendances

Sert de fondation aux étapes 10 (rapports), 11 (KPI) et 12 (graphiques).

### Tables concernées

`vw_ne`, `vw_nl`, `corres_des`, `tbl_famille`, `tbl_users_fixe`, `tbl_pointeuse` -- déjà toutes documentées.

### Calculs à implémenter (catalogue consolidé, repris des fiches de rapport)

1. **Chiffre d'affaires** (HT, TTC, marge) : `SUM(chp_mont_ht)`, `SUM(chp_mont)`, sur `vw_ne`, en excluant `chp_mont = 0`.
2. **Nombre de tickets et panier moyen** : `COUNT(*)` et `SUM(chp_mont) / COUNT(*)`.
3. **Répartition en pourcentage** (ex. « Ventes par famille ») : chaque part divisée par le total du groupe -- attention, comme démontré dans la fiche correspondante, le pourcentage doit se baser sur le chiffre d'affaires, pas sur la quantité (les deux ne donnent pas le même résultat, vérifié par preuve croisée dans les documents précédents).
4. **Classement Top N** (ex. « Meilleures ventes par article ») : tri décroissant + `LIMIT N`, avec un total de sous-ensemble clairement libellé (« Total du Top 10 »), pas un total global qui prêterait à confusion.
5. **Comparaison de périodes** (ex. CA du jour vs veille, vs même jour la semaine précédente) : nouveau calcul, absent du logiciel existant sous cette forme, mais recommandé dans le document d'architecture pour enrichir les cartes KPI.
6. **Masse salariale / CA** : `SUM(heures * coût horaire) / SUM(chp_mont_ht ou chp_mont)`, avec repli sur le taux horaire de l'employé si celui du pointage est absent (voir fiche « Rapport pointeuse »).
7. **Marge** : `chp_Tprix_ht - p_achat * chp_qt`, actuellement toujours égale au prix de vente HT pour ce commerce (coût d'achat non renseigné) -- le calcul doit néanmoins être implémenté correctement pour rester valable le jour où l'institut commencera à saisir des coûts d'achat.

### Traitements Backend

Regrouper ces calculs dans un module `statistiques.js` de la couche de services (étape 8), en fonctions pures autant que possible (entrée : lignes de résultat SQL déjà récupérées ; sortie : valeurs calculées), pour permettre des tests unitaires sans base de données.

### Contrôles et validations

Chaque calcul reproduit-il, sur les données déjà vérifiées dans les documents précédents, exactement les mêmes valeurs (CA 32 660,00 pour le jour test, 1 438 570,10 TTC pour la période test, etc.) ?

### Tests à réaliser avant de passer à l'étape suivante

- Rejouer chaque calcul sur les jeux de données déjà validés dans les fiches de rapport et comparer chiffre par chiffre (tolérance zéro sur les montants).
- Tester les cas limites : période sans aucune vente (les calculs doivent renvoyer 0, pas une erreur de division par zéro), un seul ticket sur la période, un vendeur sans aucune vente.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 9} -- Terminé : module de calculs statistiques développé et testé unitairement. Vérifié : tous les calculs reproduisent exactement les valeurs déjà validées dans les documents précédents. Validé : le référent métier confirme qu'aucun calcul ne diverge du logiciel existant sur les cas testés. Étape suivante : Étape 10 -- Développement des rapports.
\end{factbox}
```

---

## Étape 10 -- Développement des rapports

### Objectif

Finaliser, côté backend, les 6 rapports détaillés (au sens tableau de données complet, exportable) en s'appuyant sur les services et calculs des étapes 8 et 9, puis commencer leur implémentation côté frontend sous forme de tableaux (préparation de l'étape 13).

### Prérequis

Étapes 6, 8 et 9 terminées.

### Dépendances

Dépend des filtres (étape 14) pour être pleinement fonctionnel -- peut être développé en parallèle, les filtres étant ajoutés progressivement.

### Tables concernées / Colonnes / Relations / Calculs

Rappel synthétique des 6 rapports (détail complet dans les fiches déjà livrées) :

1. **Règlements** -- `vw_ne.chp_reg1..22` + `tbl_les_reglement`.
2. **Bande de contrôle / tickets** -- `vw_ne` (lecture directe, sans agrégation).
3. **Ventes par article** -- `vw_nl` + `corres_des`, avec filtre Famille / Sous-famille / Vendeur / Type de vente.
4. **Ventes par famille** -- `vw_nl` + `corres_des` + `tbl_famille`.
5. **C.A. par vendeur** -- `vw_ne` + `tbl_users_fixe`.
6. **Rapport pointeuse** -- `tbl_pointeuse` + `tbl_users_fixe` + `vw_ne` (pour le ratio masse salariale).

### Règles métier

Chaque rapport doit accepter, a minima, les filtres `date_debut`, `date_fin`, `caisse`, `vendeur`, `etablissement`, et pour les rapports articles : `famille`, `sous_famille`, `type_vente`. Chaque rapport doit renvoyer une ligne de total calculée côté SQL (jamais recalculée en JavaScript à partir des lignes détaillées, pour éviter les écarts d'arrondi entre le total et le détail).

### API à développer

Voir étape 6 -- pas de nouveaux endpoints ici, cette étape consiste à durcir et compléter les 6 endpoints déjà exposés (pagination, tri, export -- l'export lui-même est traité à l'étape 15).

### Composants Frontend

1. Composant générique `TableauRapport` (colonnes configurables, tri, pagination, ligne de total figée en bas d'écran), réutilisé par les 6 rapports plutôt que 6 composants différents.
2. Barre de filtres commune (date, caisse, vendeur, établissement) au-dessus du tableau, avec les filtres spécifiques (famille / sous-famille / type de vente) qui n'apparaissent que pour les rapports concernés.
3. Bouton d'export (branché à l'étape 15).

### Contrôles et validations

- La ligne de total du tableau correspond-elle exactement à la somme des lignes détaillées affichées (hors cas du Top N, où le total ne porte que sur le sous-ensemble affiché -- à libeller clairement, voir fiche « Meilleures ventes par article ») ?
- Le tableau gère-t-il proprement le cas « aucune donnée sur la période » (message clair, pas de tableau vide sans explication) ?

### Optimisations recommandées

Paginer côté serveur (pas de chargement de milliers de lignes d'un coup côté frontend) dès que le rapport « Ventes par articles » est utilisé sur une longue période (l'exemple déjà documenté allait jusqu'à 6 727 lignes de quantité cumulée sur des dizaines d'articles -- gérable en un seul appel, mais à surveiller si le catalogue s'étoffe).

### Tests à réaliser avant de passer à l'étape suivante

- Pour chacun des 6 rapports : test avec filtres vides (tout), avec chaque filtre appliqué individuellement, avec une combinaison de plusieurs filtres.
- Test de tri sur chaque colonne triable.
- Test avec une plage de dates ne contenant aucune vente.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 10} -- Terminé : les 6 rapports sont utilisables de bout en bout (API + tableau frontend basique), avec tous leurs filtres. Vérifié : totaux exacts, comportement correct sur les cas limites. Validé : le référent métier a comparé au moins un export de chaque rapport avec le logiciel existant, filtres identiques. Étape suivante : Étape 11 -- Développement des KPI.
\end{factbox}
```

---

## Étape 11 -- Développement des KPI

### Objectif

Construire les indicateurs de synthèse (cartes KPI) qui donnent une vue d'ensemble en un coup d'œil, sur la page d'accueil du dashboard et en tête de chaque page thématique.

### Prérequis

Étape 9 terminée (calculs statistiques disponibles).

### Dépendances

Alimente directement l'étape 12 (graphiques) et la page d'accueil de l'étape 13.

### Tables concernées / Colonnes / Relations / Calculs

Repris de la section « Tables utiles par indicateur (KPI) » de `Analyse_BDD_Dashboard_POS.pdf` (section 4) et des fiches « Tableau de bord » (jour et période) : chiffre d'affaires, nombre de tickets, ticket moyen, remises, offerts, retours/annulations, masse salariale.

### Règles métier

Chaque carte KPI doit afficher, en plus de la valeur courante, une comparaison à la période précédente équivalente (voir service `periode.js` de l'étape 8) -- une amélioration déjà recommandée par rapport au logiciel existant qui n'affiche pas cette comparaison.

### API à développer

```
GET /api/kpi/synthese?date_debut=...&date_fin=...
```
qui renvoie en un seul appel l'ensemble des KPI de la page d'accueil (pour éviter de multiplier les appels réseau, voir optimisation ci-dessous).

### Traitements Backend

Agréger, en une seule requête SQL à sous-requêtes (sur le modèle déjà donné pour le « Tableau de bord du jour »), tous les KPI de synthèse plutôt que d'enchaîner plusieurs appels séparés.

### Composants Frontend

Composant `CarteKPI` réutilisable (titre, valeur, variation en pourcentage vs période précédente, couleur verte/rouge selon le sens de la variation, icône). Rangée de cartes en haut de chaque page.

### Contrôles et validations

Le calcul de variation gère-t-il proprement le cas où la période précédente n'a aucune donnée (éviter une division par zéro, afficher « non applicable » plutôt qu'une erreur ou un pourcentage absurde) ?

### Optimisations recommandées

Mettre en cache la carte KPI de la page d'accueil quelques dizaines de secondes même sur la journée en cours (un rafraîchissement à la seconde près n'apporte pas de valeur pour un gérant qui consulte son dashboard, et réduit la charge sur la base de reporting).

### Tests à réaliser avant de passer à l'étape suivante

- Vérifier chaque carte KPI avec les valeurs déjà validées (CA jour 32 660,00, ticket moyen 3 628,89).
- Tester le calcul de variation avec une période précédente vide, avec une période précédente à zéro puis une valeur positive (variation infinie à gérer proprement).

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 11} -- Terminé : cartes KPI développées, avec comparaison de périodes. Vérifié : valeurs exactes sur les jeux de test déjà validés, cas limites de variation gérés proprement. Validé : le client confirme que les KPI affichés correspondent à ce qu'il consulte aujourd'hui dans le logiciel existant, en mieux (avec comparaison). Étape suivante : Étape 12 -- Développement des graphiques.
\end{factbox}
```

---

## Étape 12 -- Développement des graphiques

### Objectif

Construire les composants graphiques (courbes, histogrammes, donuts) déjà identifiés dans l'analyse des captures d'écran, en corrigeant au passage les défauts constatés dans le logiciel existant (libellés en anglais, tri non chronologique).

### Prérequis

Étapes 9 et 11 terminées (les données à afficher existent déjà via l'API).

### Dépendances

Consomme les mêmes endpoints que les étapes 10 et 11 -- pas de nouvel endpoint dédié, sauf si un graphique nécessite un format de données spécifique (ex. série temporelle jour par jour).

### Tables concernées / Colonnes / Relations / Calculs

- **Évolution des ventes** (aire + courbe) : `vw_ne` groupé par `chp_date`.
- **C.A. par jour de semaine** (histogramme) : `vw_ne` groupé par `DAYOFWEEK(chp_date)`.
- **Répartition par mode de vente** (donut) : `vw_ne` groupé par `internet` (Direct vs Web/Livraison).
- **Répartition par famille** (donut) : `vw_nl` + `corres_des` + `tbl_famille`.

### Règles métier

```{=latex}
\begin{warnbox}
Deux corrections à apporter par rapport au logiciel existant, déjà signalées dans les fiches d'analyse : (1) le graphique « C.A. par jour » doit afficher les jours en français, dans l'ordre lundi $\rightarrow$ dimanche (le logiciel existant les affiche en anglais et dans un ordre qui ressemble à un bug d'itération interne) ; (2) la signification de la courbe orange superposée à « Evolution des ventes » doit être confirmée avec l'éditeur avant d'être reproduite -- ne pas deviner son sens.
\end{warnbox}
```

### API à développer

Réutilise `GET /api/dashboard` (étape 3.5) et les endpoints de l'étape 6 -- prévoir, si nécessaire, un paramètre `format=serie_temporelle` pour renvoyer les données déjà groupées par jour plutôt qu'une liste brute.

### Traitements Backend

S'assurer que le regroupement par jour de semaine est fait en SQL (`DAYOFWEEK`, `DAYNAME`) et non recalculé en JavaScript à partir de milliers de lignes individuelles.

### Composants Frontend

1. Graphique en aire + ligne (bibliothèque de graphiques choisie à l'étape 1), avec légende toujours visible par défaut.
2. Histogramme par jour de semaine, trié lundi -> dimanche, libellés en français.
3. Donut(s) de répartition, avec possibilité de bascule entre « par mode de vente » et « par famille » plutôt que deux graphiques séparés (amélioration déjà recommandée dans la fiche correspondante).

### Contrôles et validations

Les couleurs utilisées sont-elles cohérentes et accessibles (contraste suffisant, distinguables même pour un daltonien) sur l'ensemble des graphiques du dashboard ?

### Optimisations recommandées

Pré-agréger côté SQL (jamais côté frontend) toute série de plus de quelques dizaines de points -- un graphique n'a pas besoin de recevoir des milliers de lignes brutes pour afficher une courbe lissée sur un mois.

### Tests à réaliser avant de passer à l'étape suivante

- Vérifier que la somme des segments de chaque donut correspond exactement au total affiché ailleurs sur la même période (preuve de cohérence déjà utilisée dans l'analyse : 185 410 retrouvé identique sur les deux donuts du tableau de bord).
- Tester l'affichage avec une seule journée de données (graphique à un seul point) et avec une période sans aucune vente (graphique vide, message clair).

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 12} -- Terminé : graphiques développés, corrections apportées (français, tri chronologique). Vérifié : cohérence des totaux entre graphiques et cartes KPI sur les mêmes filtres. Validé : le client confirme que les graphiques sont au moins aussi lisibles que dans le logiciel existant, sans ses défauts connus. Étape suivante : Étape 13 -- Développement des tableaux de données.
\end{factbox}
```

---

## Étape 13 -- Développement des tableaux de données

### Objectif

Finaliser, côté frontend, l'expérience des tableaux détaillés (tri, recherche, pagination, colonnes configurables) pour les 6 rapports de l'étape 10, au niveau de qualité attendu d'une application web moderne.

### Prérequis

Étape 10 terminée (API et composant `TableauRapport` de base disponibles).

### Dépendances

Dépend des filtres (étape 14) pour être pleinement utilisable.

### Tables concernées / Colonnes / Relations / Calculs

Aucune nouvelle donnée -- cette étape porte sur l'expérience utilisateur du composant déjà alimenté par l'étape 10.

### Composants Frontend

1. Tri multi-colonnes (cliquer sur un en-tête de colonne trie, un second clic inverse l'ordre).
2. Recherche texte libre sur la colonne « Désignation » / « Vendeur » (filtre côté serveur si le volume de données est important, côté client si le jeu de résultats est déjà petit après filtrage).
3. Pagination (côté serveur au-delà d'un certain nombre de lignes, voir optimisation à l'étape 10).
4. Colonnes configurables (afficher/masquer certaines colonnes), avec une configuration par défaut sensée par rapport (ex. masquer « Ratio A. / Ratio V. » par défaut tant que sa définition exacte n'est pas confirmée avec l'éditeur, voir étape 2).
5. Ligne de total toujours visible (« sticky footer »), même après défilement.

### Contrôles et validations

Le tableau reste-t-il utilisable (pas de lenteur perceptible) avec plusieurs milliers de lignes (cas du catalogue d'articles sur une longue période) ?

### Optimisations recommandées

Virtualiser le rendu des lignes (n'afficher dans le DOM que les lignes visibles à l'écran) si un tableau doit un jour afficher plusieurs milliers de lignes sans pagination stricte.

### Tests à réaliser avant de passer à l'étape suivante

- Test de tri sur chaque colonne triable, dans les deux sens.
- Test de recherche texte avec des résultats, sans résultat, avec des caractères spéciaux (accents, apostrophes -- fréquents dans les noms de prestations en français).
- Test de performance avec un jeu de données volumineux (simuler plusieurs mois d'historique).

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 13} -- Terminé : tableaux de données finalisés (tri, recherche, pagination, colonnes configurables). Vérifié : performance acceptable sur un gros volume de données simulé. Validé : le client a testé lui-même au moins un tableau et confirme qu'il retrouve l'information aussi facilement que dans le logiciel existant. Étape suivante : Étape 14 -- Développement des filtres.
\end{factbox}
```

---

## Étape 14 -- Développement des filtres (date, vendeur, famille, magasin, etc.)

### Objectif

Finaliser un système de filtres cohérent et réutilisable sur l'ensemble du dashboard, reproduisant (et améliorant) les filtres déjà présents dans le logiciel existant (Date Début / Date Fin, Caisse, Vendeur, Famille, Sous-famille, Établissement, Type de vente).

### Prérequis

Étapes 6 et 10 terminées (les endpoints acceptent déjà ces filtres en paramètres).

### Dépendances

Transverse à toutes les pages du dashboard (rapports, KPI, graphiques) -- à concevoir une seule fois, sous forme de composant partagé, plutôt que de le redévelopper page par page.

### Tables concernées / Colonnes / Relations

- Date Début / Date Fin -> `chp_date` sur `vw_ne` / `vw_nl`.
- Caisse -> `chp_ncaisse` sur `vw_ne`.
- Vendeur -> `chp_serv` sur `vw_ne` / `vw_nl`, résolu en nom via `tbl_users_fixe` (service de l'étape 8).
- Famille / Sous-famille -> `corres_des.chp_fam` / `chp_ss_fam`, résolus via `tbl_famille` / `tbl_ss_famille`.
- Établissement -> `num_magasin` (un seul magasin actif aujourd'hui, mais le filtre doit exister dès maintenant pour anticiper une extension multi-magasins sans refonte).
- Type de vente -> `chp_etatligne` / `tbl_les_reglement.type_ca` (voir la réserve déjà notée à l'étape 2).

### Règles métier

Les listes déroulantes (Vendeur, Famille, Sous-famille, Caisse) doivent être alimentées dynamiquement depuis la base de reporting (pas codées en dur dans le frontend), pour rester à jour si le client ajoute un employé ou une famille de produits.

### API à développer

```
GET /api/filtres/vendeurs
GET /api/filtres/familles
GET /api/filtres/sous-familles?famille=...
GET /api/filtres/caisses
```

### Composants Frontend

1. Composant de sélection de plage de dates avec les mêmes raccourcis rapides que le logiciel existant (Aujourd'hui, Hier, 7 derniers jours, Mois en cours), plus un sélecteur libre.
2. Listes déroulantes alimentées par les endpoints ci-dessus, avec un état « Tout » par défaut (cohérent avec `_tout` déjà observé dans le logiciel existant).
3. Persistance des filtres choisis pendant la session (si l'utilisateur change de page puis revient, les filtres restent appliqués) -- amélioration par rapport au logiciel existant qui réinitialise probablement les filtres à chaque écran.

### Contrôles et validations

Le filtre « Sous-famille » se limite-t-il bien aux sous-familles de la famille sélectionnée (et se réinitialise-t-il si la famille change) ?

### Optimisations recommandées

Mettre en cache, côté frontend, les listes de filtres (vendeurs, familles) qui changent rarement, pour éviter un appel réseau à chaque ouverture de page.

### Tests à réaliser avant de passer à l'étape suivante

- Vérifier que chaque filtre, appliqué seul puis combiné avec d'autres, renvoie bien un résultat cohérent (comparé aux fiches de rapport déjà validées avec les mêmes filtres).
- Vérifier le raccourci « Auj. après clôture » : confirmer avec l'éditeur (point encore ouvert, voir étape 2) le comportement exact attendu, puis l'implémenter et le tester sur une journée déjà clôturée et une journée en cours.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 14} -- Terminé : système de filtres transverse développé et branché sur tous les rapports, KPI et graphiques. Vérifié : chaque filtre, seul et combiné, produit un résultat cohérent avec les fiches déjà validées. Validé : le client confirme retrouver tous les filtres du logiciel existant, avec en plus la persistance de session. Étape suivante : Étape 15 -- Développement des exports (PDF, Excel, CSV).
\end{factbox}
```

---

## Étape 15 -- Développement des exports (PDF, Excel, CSV)

### Objectif

Reproduire, et si possible dépasser, la fonctionnalité d'export déjà présente dans le logiciel existant (bouton Excel vert, impressions multiples, export A4) sur chacun des 6 rapports.

### Prérequis

Étape 10 terminée (rapports fonctionnels avec leurs filtres).

### Dépendances

Peut être développée en parallèle des étapes 11 à 14, une fois les rapports de l'étape 10 stabilisés.

### Tables concernées / Colonnes / Relations / Calculs

Aucune donnée supplémentaire -- l'export réutilise exactement les données déjà renvoyées par les endpoints de l'étape 6, sans recalcul indépendant (pour garantir que l'export et l'écran affichent toujours la même chose).

### API à développer

```
GET /api/export/csv
    ?rapport=ventes-articles&date_debut=...&date_fin=...
    &...(mêmes filtres que le rapport)

GET /api/export/xlsx
    ?rapport=...&...(mêmes filtres)

GET /api/export/pdf
    ?rapport=...&...(mêmes filtres)
```

### Traitements Backend

1. **CSV** : sérialisation directe du même jeu de données que l'endpoint JSON, avec les séparateurs et l'encodage adaptés (attention à l'encodage des caractères accentués français, et au séparateur décimal -- virgule en France/Maroc, à ne pas confondre avec le séparateur de colonnes).
2. **Excel (XLSX)** : génération via une bibliothèque dédiée (ex. `exceljs`), avec mise en forme minimale (en-têtes en gras, ligne de total distinguée) -- reproduisant l'esprit du bouton Excel déjà présent dans le logiciel existant.
3. **PDF** : génération via une bibliothèque de rendu serveur (ex. Puppeteer pour convertir un gabarit HTML en PDF), avec un gabarit reprenant l'en-tête du rapport (filtres appliqués, période, date de génération) -- pour qu'un export imprimé reste compréhensible hors contexte, contrairement à une simple capture d'écran.

### Composants Frontend

Boutons d'export en haut de chaque tableau de rapport (CSV / Excel / PDF), déclenchant un téléchargement direct du fichier généré par le backend.

### Contrôles et validations

- L'export contient-il exactement les mêmes lignes et les mêmes totaux que ce qui est affiché à l'écran au moment de l'export (mêmes filtres appliqués) ?
- Les montants sont-ils correctement formatés (2 décimales, séparateur de milliers cohérent avec l'usage marocain/français) dans chaque format d'export ?

### Optimisations recommandées

Générer les exports de manière asynchrone (file d'attente) si un export porte sur un très gros volume de données (plusieurs années d'historique), plutôt que de bloquer la requête HTTP en attendant la génération complète.

### Tests à réaliser avant de passer à l'étape suivante

- Générer un export de chaque type (CSV, Excel, PDF) pour chacun des 6 rapports, et vérifier manuellement qu'il s'ouvre correctement dans les logiciels courants (Excel, un lecteur PDF, un éditeur de texte pour le CSV).
- Vérifier la cohérence des accents et caractères spéciaux dans les exports CSV (test classique : un nom de prestation avec un accent ou une apostrophe, ex. « Forfait Spa manicure + Spa pedicure »).

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 15} -- Terminé : exports CSV, Excel et PDF disponibles sur les 6 rapports. Vérifié : contenu des exports strictement identique à l'écran, formats de fichiers valides et lisibles. Validé : le client a testé l'ouverture d'au moins un export de chaque type dans ses outils habituels. Étape suivante : Étape 16 -- Développement des notifications (si nécessaire).
\end{factbox}
```

---

## Étape 16 -- Développement des notifications (si nécessaire)

### Objectif

Évaluer, avec le client, le besoin réel de notifications (alertes de rupture de stock, baisse anormale du CA, tickets suspects) avant de développer quoi que ce soit -- cette étape peut se conclure par « non nécessaire pour la version 1 » sans que ce soit un échec.

### Prérequis

Étapes 9 et 11 terminées (les calculs statistiques nécessaires pour détecter une anomalie existent déjà).

### Dépendances

Optionnelle -- ne bloque aucune autre étape si elle est reportée à une version ultérieure.

### Tables concernées

`log_des_actions` (déjà repérée dans l'analyse initiale comme source potentielle pour détecter des actions suspectes -- tickets annulés/négatifs). `tbl_produits` / `tbl_stock` si le module stock est un jour activé par ce commerce (actuellement non alimenté).

### Sous-étapes détaillées (si le besoin est confirmé)

1. **Cadrer avec le client** les alertes réellement utiles pour son activité (probablement, pour un institut de beauté sans stock suivi : baisse anormale du CA d'un jour vs sa moyenne mobile, ticket à 0 resté ouvert trop longtemps, montant offert anormalement élevé).
2. **Définir les seuils** de déclenchement (ex. CA du jour inférieur de plus de 30 pourcent à la moyenne mobile des 4 dernières semaines du même jour).
3. **Choisir le canal de notification** : dans l'application (badge, centre de notifications), et/ou email, et/ou SMS -- à valider avec le client selon ses habitudes.
4. **Développer un job planifié** qui évalue les règles de détection à intervalle régulier (ex. toutes les heures, ou une fois par jour après clôture) et déclenche les notifications correspondantes.

### API à développer (si le besoin est confirmé)

```
GET /api/notifications
    (liste des alertes actives pour l'utilisateur connecté)

POST /api/notifications/:id/lu
    (marquer une alerte comme lue)
```

### Contrôles et validations

Les seuils de déclenchement ont-ils été validés avec le client (pas de fausses alertes trop fréquentes, qui décrédibiliseraient la fonctionnalité) ?

### Tests à réaliser avant de passer à l'étape suivante

Si développée : tester chaque règle de détection avec un jeu de données construit spécifiquement pour la déclencher, et un jeu de données qui ne doit surtout pas la déclencher (éviter les faux positifs).

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 16} -- Terminé : décision actée avec le client (fonctionnalité développée, ou explicitement reportée à une version ultérieure, avec justification écrite). Vérifié : si développée, règles de détection testées sans faux positif sur les données réelles. Validé : le client a confirmé la décision, quelle qu'elle soit. Étape suivante : Étape 17 -- Optimisation des performances.
\end{factbox}
```

---

## Étape 17 -- Optimisation des performances

### Objectif

Fiabiliser les temps de réponse de l'application, en particulier la stratégie de cache déjà esquissée dans le guide d'architecture, avant la phase de tests intensifs et le déploiement.

### Prérequis

Étapes 6 à 15 terminées (l'application est fonctionnellement complète).

### Dépendances

Doit être terminée avant l'étape 19 (tests de performance inclus dans les tests fonctionnels).

### Règles métier -- stratégie de cache (rappel consolidé)

```{=latex}
\begin{notebox}
Règle unique, déjà établie dans le guide d'architecture et reprise dans chaque fiche de rapport : une période \textbf{entièrement close} (avant la dernière clôture confirmée dans \texttt{tbl\_cloture}) ne change plus jamais -- son résultat est cacheable indéfiniment. Seule la journée en cours (ou une période qui l'inclut) doit être recalculée fréquemment (toutes les 30 à 60 secondes, ou sur notification de nouvel encaissement).
\end{notebox}
```

### Sous-étapes détaillées

1. **Mettre en place la clé de cache** = `(nom_endpoint, tous_les_filtres_triés_et_concaténés)`, avec le service `cloture.js` (étape 8) pour décider si le résultat est cacheable indéfiniment ou doit expirer rapidement.
2. **Choisir le backend de cache** : mémoire applicative (suffisant pour un seul magasin, un seul serveur) ou Redis (si plusieurs instances du backend doivent partager le même cache, ou si plusieurs magasins sont ajoutés dans le futur).
3. **Invalider le cache du jour courant** à chaque cycle de synchronisation (étape 4), pas seulement après un délai fixe -- pour que le dashboard reste cohérent avec la dernière synchronisation réelle.
4. **Auditer les requêtes lentes** : activer la journalisation des requêtes SQL dépassant un seuil (ex. 500 ms) sur la base de reporting, et optimiser les index en conséquence.
5. **Vérifier les index recommandés** (déjà listés à l'étape 4) sont bien utilisés par le plan d'exécution (`EXPLAIN`) des requêtes les plus fréquentes.
6. **Charger en avance (préchauffage)** les KPI de la page d'accueil juste après chaque synchronisation, plutôt que d'attendre la première visite d'un utilisateur pour les calculer.

### Optimisations recommandées

- Compresser les réponses HTTP (gzip / brotli) pour les gros tableaux exportés en JSON.
- Charger les graphiques et tableaux de façon différée (lazy loading) : ne pas calculer un widget qui n'est pas visible à l'écran (onglet non ouvert, par exemple).
- Limiter la profondeur d'historique interrogeable sans confirmation explicite (ex. avertir si une plage de dates dépasse 2 ans, plutôt que de laisser l'utilisateur lancer une requête très lourde sans le savoir).

### Tests à réaliser avant de passer à l'étape suivante

- Mesurer le temps de réponse de chaque endpoint principal, avec et sans cache, sur un volume de données représentatif d'un an d'activité.
- Simuler plusieurs utilisateurs simultanés (test de charge basique) pour vérifier que le pool de connexions (étape 5) et le cache tiennent la charge attendue.
- Vérifier qu'un changement de donnée (nouvelle vente synchronisée) apparaît bien dans le dashboard dans le délai annoncé au client, ni plus tôt ni (surtout) plus tard.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 17} -- Terminé : stratégie de cache implémentée et réglée, requêtes lentes identifiées et optimisées. Vérifié : temps de réponse mesurés et jugés acceptables sur un volume de données représentatif. Validé : le client a validé le délai de fraîcheur des données affichées (ex. « les chiffres du jour se mettent à jour toutes les minutes »). Étape suivante : Étape 18 -- Sécurisation de l'application.
\end{factbox}
```

---

## Étape 18 -- Sécurisation de l'application

### Objectif

Passer en revue systématiquement les points de sécurité déjà identifiés dans le guide d'architecture, avant la phase de tests finaux et le déploiement en production.

### Prérequis

Étapes 6 à 17 terminées.

### Dépendances

Doit être terminée avant l'étape 20 (validation finale) et l'étape 21 (déploiement) -- aucune mise en production ne doit avoir lieu avant que cette étape soit close.

### Sous-étapes détaillées (check-list de sécurité)

1. **Base de données** : l'utilisateur MySQL du backend a-t-il uniquement des droits `SELECT` sur la base de reporting (jamais `INSERT` / `UPDATE` / `DELETE`, jamais d'accès à la base de production de la caisse) ?
2. **Injection SQL** : toutes les requêtes utilisent-elles des paramètres liés (requêtes préparées), sans aucune concaténation de chaîne de caractères issue d'une entrée utilisateur ?
3. **Authentification** : les jetons JWT ont-ils une expiration courte, un secret suffisamment long et stocké hors du dépôt de code (variable d'environnement) ?
4. **Autorisation** : chaque endpoint sensible (masse salariale, marges) vérifie-t-il explicitement le rôle de l'utilisateur, y compris en cas d'appel direct hors interface (test déjà prévu à l'étape 7) ?
5. **Transport** : l'application est-elle exclusivement servie en HTTPS (certificat valide), y compris en environnement de test si celui-ci est accessible depuis l'extérieur ?
6. **Journalisation** : les logs applicatifs contiennent-ils uniquement l'information nécessaire au diagnostic, sans jamais de mot de passe ni de jeton d'authentification en clair ?
7. **Dépendances logicielles** : les bibliothèques utilisées (backend et frontend) sont-elles à jour et exemptes de vulnérabilités connues (audit automatisé, ex. `npm audit`) ?
8. **Protection contre les abus** : une limitation de débit (rate limiting) est-elle en place sur les endpoints d'authentification, pour empêcher une tentative de force brute sur les mots de passe ?
9. **Sauvegardes** : la base de reporting (et la configuration de l'application) fait-elle l'objet de sauvegardes régulières, testées (une sauvegarde jamais restaurée n'est pas une sauvegarde fiable) ?

### Contrôles et validations

Chaque point de la check-list ci-dessus est-il explicitement coché « fait » ou « non applicable, car... », avec une justification écrite, avant de passer à l'étape suivante ?

### Tests à réaliser avant de passer à l'étape suivante

- Test d'intrusion basique (manuel ou outil automatisé) sur les endpoints d'authentification et sur au moins un endpoint de données sensibles.
- Tentative volontaire d'injection SQL sur un champ de filtre (ex. dans le champ « vendeur » ou « famille »), pour confirmer qu'elle échoue proprement.
- Vérification que le certificat HTTPS est valide et que le site refuse les connexions non chiffrées.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 18} -- Terminé : check-list de sécurité intégralement passée en revue et documentée. Vérifié : tests d'intrusion basiques et tentative d'injection SQL sans succès. Validé : le lead technique (ou un pair externe) confirme par écrit que l'application est prête, du point de vue sécurité, pour la phase de tests finaux. Étape suivante : Étape 19 -- Tests unitaires, tests d'intégration et tests fonctionnels.
\end{factbox}
```

---

## Étape 19 -- Tests unitaires, tests d'intégration et tests fonctionnels

### Objectif

Consolider, en une campagne de tests formelle, l'ensemble des vérifications déjà faites au fil des étapes précédentes -- pour obtenir une confiance globale dans l'application avant la validation finale du client.

### Prérequis

Étapes 5 à 18 terminées.

### Dépendances

Conditionne l'étape 20 (validation finale) -- aucune validation client ne devrait être demandée sur une application qui n'a pas passé cette campagne de tests.

### Sous-étapes détaillées

#### 19.1 Tests unitaires

Portent sur les fonctions isolées, sans base de données : services de l'étape 8 (`periode.js`, `filtreVente.js`, `vendeur.js`, `cloture.js`), calculs statistiques de l'étape 9. Objectif de couverture : les règles métier à risque (arrondis, cas limites de dates, division par zéro) doivent être couvertes en priorité, plus que la couverture globale en pourcentage.

#### 19.2 Tests d'intégration

Portent sur les endpoints de l'étape 6, avec une vraie base de données de test (jeu de données reprenant les cas déjà validés dans les fiches de rapport). Vérifient que chaque endpoint, appelé avec des filtres réels, renvoie exactement les valeurs déjà établies comme vraies (CA 32 660,00, total « Ventes par articles » 1 268 898,29 HT, etc.).

#### 19.3 Tests fonctionnels (bout en bout)

Simulent un parcours utilisateur complet dans le navigateur (connexion -> consultation du tableau de bord -> ouverture d'un rapport -> application de filtres -> export). Outils recommandés : Playwright ou Cypress.

Parcours minimum à couvrir :

1. Connexion avec chaque rôle (gérant, responsable, employé) et vérification des accès autorisés / refusés.
2. Consultation du tableau de bord du jour, vérification des valeurs affichées.
3. Consultation de chacun des 6 rapports, avec au moins un jeu de filtres appliqué.
4. Export d'au moins un rapport dans chacun des 3 formats.
5. Déconnexion et vérification qu'un accès ultérieur sans nouvelle connexion est bien refusé.

#### 19.4 Tests de non-régression

À chaque nouvelle fonctionnalité ajoutée après cette étape (voir étape 22, maintenance), rejouer l'ensemble de cette campagne de tests avant toute mise en production, pour garantir qu'aucune régression n'a été introduite.

### Contrôles et validations

- Le taux de réussite de la campagne de tests est-il de 100 pourcent sur les scénarios critiques (chiffre d'affaires, authentification, exports) ?
- Les tests sont-ils automatisés et rejouables (pas seulement une checklist manuelle), pour pouvoir être relancés à chaque évolution future ?

### Tests à réaliser avant de passer à l'étape suivante

C'est l'objet même de cette étape -- la sortie de cette étape est la campagne de tests elle-même, entièrement passée avec succès.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 19} -- Terminé : campagne de tests unitaires, d'intégration et fonctionnels rédigée et automatisée. Vérifié : 100 pourcent de réussite sur les scénarios critiques. Validé : le lead technique confirme par écrit que l'application est prête pour la validation client. Étape suivante : Étape 20 -- Validation finale.
\end{factbox}
```

---

## Étape 20 -- Validation finale

### Objectif

Faire valider formellement, par le client, que l'application répond au périmètre défini à l'étape 1, avant tout déploiement en production.

### Prérequis

Étape 19 terminée avec succès.

### Dépendances

Conditionne l'étape 21 (déploiement) -- aucun déploiement en production sans validation client explicite.

### Sous-étapes détaillées

1. **Recette utilisateur** : organiser une session avec le client (le gérant), sur l'environnement de `staging`, où il retrouve lui-même chaque rapport et KPI déjà présents dans son logiciel actuel, filtre par filtre.
2. **Revue de la liste des points « à valider avec l'éditeur »** ouverte à l'étape 2 : pour chacun, documenter la décision finale prise (confirmée par l'éditeur Clyo Systems, ou tranchée par défaut avec l'accord du client si l'éditeur n'a pas répondu). Rappel de la liste consolidée :
   - Signification de la courbe orange du graphique « Evolution des ventes ».
   - Définition exacte de « Ratio A. » / « Ratio V. ».
   - Comportement exact du raccourci « Auj. après clôture ».
   - Liste complète des valeurs du menu « Vente » (Vente générale / Offert / autres ?).
   - Mécanisme exact de distinction Vente générale / Offert (`chp_etatligne` vs `type_ca`).
   - Critère de tri du rapport « Meilleures ventes par article ».
   - Caractère réel ou fictif des données de `tbl_pointeuse` pour ce commerce.
3. **Procès-verbal de recette** : document signé (ou email formel) listant les éventuelles réserves, avec un plan d'action et une date pour chacune.
4. **Formation des utilisateurs finaux** : session de prise en main avec le gérant et, si pertinent, les responsables ayant un accès au dashboard.

### Contrôles et validations

Chaque point de la liste de réserves a-t-il un responsable et une échéance clairement identifiés ?

### Tests à réaliser avant de passer à l'étape suivante

Aucun nouveau test technique -- cette étape est une validation humaine et contractuelle, pas une étape de développement.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 20} -- Terminé : session de recette utilisateur réalisée, formation dispensée. Vérifié : toutes les réserves éventuelles sont documentées avec un plan d'action. Validé : le client a signé (ou confirmé par écrit) la recette de l'application. Étape suivante : Étape 21 -- Déploiement.
\end{factbox}
```

---

## Étape 21 -- Déploiement

### Objectif

Mettre l'application en production, de façon maîtrisée et réversible.

### Prérequis

Étape 20 terminée (validation client obtenue).

### Dépendances

Dernière étape avant la maintenance courante (étape 22).

### Sous-étapes détaillées

1. **Préparer l'environnement de production** : serveur (ou service cloud) pour le backend et le frontend, base de reporting de production (distincte de celle de test), certificat HTTPS, nom de domaine.
2. **Mettre en place la synchronisation de production** (étape 4, rejouée en conditions réelles) entre la base de la caisse réelle et la base de reporting de production -- avec une phase d'observation de quelques jours avant la bascule des utilisateurs.
3. **Déployer le backend et le frontend** (processus de déploiement automatisé recommandé -- intégration continue -- plutôt que des copies manuelles de fichiers).
4. **Créer les comptes utilisateurs de production** (gérant, responsables) avec des mots de passe initiaux à changer à la première connexion.
5. **Mettre en place la supervision** : surveillance de la disponibilité (`GET /api/health`, étape 5), alertes en cas de panne, suivi de la fraîcheur de la synchronisation (étape 4).
6. **Mettre en place les sauvegardes automatiques** de la base de reporting et de la configuration.
7. **Basculer les utilisateurs réels** : communiquer la date de mise à disposition, garder le logiciel de caisse existant strictement inchangé (le dashboard est un système de consultation, en aucun cas un remplacement de la caisse).
8. **Définir un plan de retour arrière** (rollback) : que faire si un problème bloquant apparaît dans les premiers jours (revenir à une version précédente du backend/frontend, couper temporairement l'accès au dashboard sans impact sur la caisse elle-même, qui continue de fonctionner indépendamment).

### Contrôles et validations

- La supervision détecte-t-elle correctement une panne simulée (backend arrêté, base de reporting inaccessible) ?
- Le plan de retour arrière a-t-il été testé au moins une fois en environnement de test avant le déploiement réel ?

### Tests à réaliser avant de passer à l'étape suivante

- Test de bout en bout en production, avec un compte de test, sur les données réelles (lecture seule -- aucune action destructive).
- Vérification, sur les premiers jours réels, que les chiffres affichés correspondent à l'activité réelle de l'institut (dernière validation croisée avec l'écran caisse, en conditions de production).

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 21} -- Terminé : application déployée en production, comptes utilisateurs créés, supervision et sauvegardes actives. Vérifié : chiffres de production cohérents avec l'activité réelle sur les premiers jours d'observation. Validé : le client confirme l'entrée en service effective du dashboard. Étape suivante : Étape 22 -- Maintenance et évolutions futures (bascule en fonctionnement courant).
\end{factbox}
```

---

## Étape 22 -- Maintenance et évolutions futures

### Objectif

Organiser le fonctionnement du projet après sa mise en production : correctifs, surveillance continue, et cadre pour les évolutions futures.

### Prérequis

Étape 21 terminée.

### Dépendances

Étape continue, sans fin définie -- elle couvre toute la vie du produit après la mise en production.

### Sous-étapes détaillées

1. **Astreinte et support** : définir qui répond en cas de panne signalée par le client (délai de prise en charge, canal de contact).
2. **Suivi de la synchronisation** : vérification régulière (automatisée, voir supervision de l'étape 21) que la base de reporting reste à jour ; alerte immédiate en cas de désynchronisation prolongée.
3. **Cycle de correctifs** : tout bug remonté par le client suit le même chemin que le développement initial (reproduire, corriger, tester -- étape 19 rejouée pour le périmètre concerné -- puis déployer).
4. **Journal des évolutions** (changelog) : documenter chaque nouvelle fonctionnalité ou correctif, avec sa date de mise en production.
5. **Revue périodique des points « à valider avec l'éditeur »** : si un point restait sans réponse définitive de l'éditeur Clyo Systems à l'étape 20, prévoir une relance régulière (ex. trimestrielle) jusqu'à obtenir une confirmation officielle.
6. **Anticipation de l'évolution multi-magasins** : si le client ouvre un second établissement, le filtre « Établissement » déjà prévu dès l'étape 14 doit permettre d'étendre l'application sans refonte majeure -- vérifier ce scénario dès qu'il devient concret.
7. **Veille technique** : mise à jour régulière des dépendances logicielles (sécurité, étape 18), suivi des évolutions du logiciel de caisse Clyo Systems qui pourraient modifier le schéma de données source.
8. **Bilan d'usage** : après quelques mois d'utilisation réelle, recueillir le retour du client sur les rapports et KPI réellement consultés, pour prioriser les évolutions futures (nouveaux rapports, nouveaux KPI, nouvelles alertes -- voir étape 16).

### Contrôles et validations

Le changelog est-il tenu à jour à chaque mise en production, même mineure ?

### Tests à réaliser avant chaque nouvelle mise en production

Rejouer systématiquement la campagne de tests de l'étape 19 (au minimum les scénarios critiques) avant toute mise en production d'un correctif ou d'une évolution, aussi petite soit-elle.

```{=latex}
\begin{factbox}
\textbf{Sortie de l'étape 22} -- Cette étape n'a pas de fin : elle définit le mode de fonctionnement continu du projet. Elle est considérée « en place » quand : le processus de support est défini et connu du client, la supervision est active, et le changelog est initialisé. Prochaine étape : aucune -- retour à l'étape 22 en continu, ou ouverture d'un nouveau cycle (étapes 1 à 21) si une évolution majeure (ex. multi-magasins, nouveau module) est décidée.
\end{factbox}
```

---

## Synthèse -- vue d'ensemble du processus

```{=latex}
\begin{notebox}
Ordre de réalisation résumé, avec les étapes qui peuvent être menées en parallèle par une équipe de plusieurs développeurs :
\begin{itemize}
\item \textbf{Séquentiel strict} : 1 $\rightarrow$ 2 $\rightarrow$ 3 $\rightarrow$ 4 $\rightarrow$ 5 (chaque étape dépend entièrement de la précédente).
\item \textbf{Parallélisable} : à partir de l'étape 5, les étapes 6 (API) et 7 (authentification) peuvent avancer en parallèle ; de même, les étapes 11 (KPI), 12 (graphiques), 13 (tableaux) et 14 (filtres) peuvent être réparties entre plusieurs développeurs une fois les étapes 8, 9 et 10 posées.
\item \textbf{Séquentiel strict en fin de projet} : 17 (optimisation) $\rightarrow$ 18 (sécurisation) $\rightarrow$ 19 (tests) $\rightarrow$ 20 (validation) $\rightarrow$ 21 (déploiement) -- ne jamais inverser cet ordre, en particulier ne jamais déployer avant la sécurisation et la validation client.
\item \textbf{Continu} : l'étape 22 n'a pas de fin et encadre toute la vie du produit après le déploiement.
\end{itemize}
\end{notebox}
```

Ce plan s'appuie sur, et renvoie systématiquement à, les documents déjà livrés dans ce projet :

- `Analyse_BDD_Dashboard_POS.pdf` -- schéma complet, sections 0 à 6.
- `Analyse_Statistiques_Periode_Serie2.pdf` -- rapports par période.
- `Dashboard_POS_Pack_Developpeur.zip` -- 12 fiches de rapport en fichiers séparés, prêtes à l'emploi.
- `Guide_BDD_Vers_Application_Web.pdf` -- architecture cible.
- Les deux schémas : `schema_base_de_donnees.png` et `schema_architecture_application.png`.

Ce plan de développement en est la synthèse opérationnelle : il ne remplace aucun de ces documents, il organise leur mise en œuvre dans le temps.


# Partie 5 -- Fiches pratiques par écran (versions corrigées et définitives)

```{=latex}
\begin{warnbox}
Les deux fiches de cette partie sont les versions \textbf{les plus à jour} pour ces deux écrans -- elles corrigent et remplacent les fiches \texttt{01\_Reglements} et \texttt{06\_Dashboard\_Du\_Jour} de la Partie 6, dont il ne faut plus suivre les recommandations initiales sur ces deux points précis.
\end{warnbox}
```

## 5.1 Tableau de bord du jour


```{=latex}
\begin{tldrbox}
\begin{itemize}
\item Mise à jour majeure à partir d'une capture d'écran réelle de l'écran : en plus des trois KPI déjà documentés (chiffre d'affaires, tickets, ticket moyen), l'écran affiche aussi cinq types d'opérations -- Offerts, Remises, Annulations, Retours, Pertes -- et une masse salariale.
\item \textbf{Décision produit du 22 juillet 2026} : pour ces cinq types d'opérations, seule la colonne \textbf{Montant} est développée (pas de Quantité, pas de Pourcentage). La masse salariale reste hors périmètre de ce guide -- elle est déjà couverte par la fiche \texttt{Rapport\_Pointeuse}.
\item \textbf{Découverte clé de cette mise à jour}, vérifiée ligne par ligne dans le dump SQL réel : Offerts, Annulations, Retours et Pertes proviennent tous d'une même table jusqu'ici non documentée, \texttt{tbl\_action} (journal des actions de caisse), en regroupant sur sa colonne \texttt{etat\_ligne} (codes N / A / R / O / P). Remises reste basé sur \texttt{delta\_remise} de \texttt{vw\_nl}, déjà établi.
\item Cette découverte résout le point resté ouvert dans la version précédente de ce guide sur l'écart Offerts 0 DH / 300 DH : le service offert a bien été passé, puis annulé avant la clôture du ticket resté ouvert (ticket \#3746) -- net 0 DH, exactement la valeur affichée.
\end{itemize}
\end{tldrbox}
```

### 1. Ce que montre l'écran

Le Tableau de bord du jour affiche trois chiffres de synthèse (chiffre d'affaires TTC, nombre de tickets, ticket moyen), puis cinq lignes « types d'opérations » (Offerts, Remises, Annulations, Retours, Pertes -- montant uniquement dans cette version), et une masse salariale (hors périmètre de ce guide). Contrairement à la version « par période » du module Statistiques, il ne porte que sur une seule journée -- pas de sélecteur de plage de dates.

```{=latex}
\begin{factbox}
Valeurs vérifiées ligne par ligne dans le dump SQL réel pour le 21 / 07 / 2026, magasin 1 : chiffre d'affaires 32\,660,00 DH, 9 tickets, ticket moyen 3\,628,89 DH -- Offerts 0,00, Remises 90,00, Annulations 0,00, Retours 1\,050,00, Pertes 450,00. Ce ne sont plus seulement des valeurs lues sur une capture d'écran : chaque montant a été recalculé à partir des lignes brutes de la base et correspond exactement à ce qu'affiche l'écran.
\end{factbox}
```

### 2. Tables et champs à utiliser

**Table `vw_ne`** (vue unifiant `ne_fichier` + `ne_fichier_day`) -- pour le chiffre d'affaires et le nombre de tickets :

- `chp_date`, `num_magasin` -- filtres période et magasin.
- `chp_mont` -- montant TTC du ticket (colonne principale du CA).
- `chp_primary` -- identifiant du ticket, sert à les compter.

**Table `vw_nl`** (vue unifiant `nl_fichier` + `nl_fichier_day`) -- pour les remises uniquement :

- `chp_date`, `num_magasin` -- filtres.
- `delta_remise` -- montant de la remise accordée sur une ligne, quel que soit son état.

```{=latex}
\begin{notebox}
Nouvelle table à documenter : \texttt{tbl\_action}, un journal dédié qui enregistre chaque action spéciale de caisse (offrir, annuler, perdre une ligne ou un ticket) -- distincte de \texttt{nl\_fichier(\_day)}, qui ne reflète que l'état final des lignes de vente. C'est la source correcte pour Offerts, Annulations, Retours et Pertes.
\end{notebox}
```

**Table `tbl_action`** -- pour Offerts, Annulations, Retours et Pertes :

- `chp_date_service` -- date du jour d'exploitation (colonne de type `date`, à utiliser pour le filtre -- préférer cette colonne à `chp_date`, qui est un horodatage complet de l'action).
- `num_magasin` -- filtre magasin.
- `etat_ligne` -- code d'état résultant de l'action : `N` (normal), `A` (annulation), `R` (retour), `O` (offert), `P` (perte) -- les mêmes codes que ceux déjà documentés pour `nl_fichier.chp_etatligne`.
- `mont_ttc` -- montant TTC affecté par l'action (positif pour l'action d'origine, négatif si l'action est elle-même contre-passée par une action suivante).

```{=latex}
\begin{factbox}
\texttt{tbl\_action} contient aussi \texttt{id\_type\_action} (identifiant du bouton pressé en caisse : Offrir Ligne, Offrir Ticket, Perte ligne, Perte Ticket, Annuler Ligne, Annuler Ticket -- table de référence \texttt{tbl\_type\_action}). Ce champ ne doit \textbf{pas} servir de base de regroupement pour ce KPI : plusieurs \texttt{id\_type\_action} peuvent produire le même \texttt{etat\_ligne}, et c'est bien \texttt{etat\_ligne} qui correspond exactement aux cinq catégories affichées à l'écran.
\end{factbox}
```

### 3. Règles métier et calculs exacts

```{=latex}
\begin{warnbox}
Règle capitale, vérifiée sur la capture d'origine : un ticket à \texttt{chp\_mont = 0} est un ticket resté ouvert en caisse (non finalisé), pas une vente. Il doit être exclu de tous les comptages. C'est exactement ce qui explique le compteur \guillemotleft{} 9 \guillemotright{} affiché sur le tableau de bord alors que 10 tickets existaient ce jour-là dans la bande de contrôle.
\end{warnbox}
```

1. **Chiffre d'affaires** = `SUM(chp_mont)` sur `vw_ne`, `chp_mont > 0`. Valeur vérifiée : 32 660,00 DH.
2. **Nombre de tickets** = `COUNT(*)` sur `vw_ne`, même exclusion. Valeur vérifiée : 9.
3. **Ticket moyen** = Chiffre d'affaires ÷ Nombre de tickets = 32 660 ÷ 9 = 3 628,89 (exact).
4. **Remises** = `SUM(delta_remise)` sur `vw_nl`. Valeur vérifiée : 90,00 DH.
5. **Offerts** = `SUM(mont_ttc)` sur `tbl_action` où `etat_ligne = 'O'`. Valeur vérifiée : 0,00 DH.
6. **Annulations** = `SUM(mont_ttc)` sur `tbl_action` où `etat_ligne = 'A'`. Valeur vérifiée : 0,00 DH.
7. **Retours** = `SUM(mont_ttc)` sur `tbl_action` où `etat_ligne = 'R'`. Valeur vérifiée : 1 050,00 DH.
8. **Pertes** = `SUM(mont_ttc)` sur `tbl_action` où `etat_ligne = 'P'`. Valeur vérifiée : 450,00 DH.

```{=latex}
\begin{factbox}
Détail de la vérification (dump réel, 21 / 07 / 2026, magasin 1) : \textbf{Offerts} -- 3 lignes \guillemotleft{} Soin cheveux \guillemotright{} offertes à +100,00 chacune, puis les 3 mêmes lignes contre-passées à -100,00 chacune lorsque le ticket \#3746 est resté ouvert -- net 0,00. \textbf{Pertes} -- 1 ligne \guillemotleft{} Barbe rase \guillemotright{} à 150,00 (perte ligne) et 2 lignes à 150,00 (perte ticket) -- total 450,00. \textbf{Retours} -- 7 lignes \guillemotleft{} Coupe jeune \guillemotright{} à 150,00 chacune, toutes annulées au niveau ticket -- total 1\,050,00. \textbf{Annulations} -- aucune ligne avec \texttt{etat\_ligne = 'A'} ce jour-là -- total 0,00.
\end{factbox}
```

### 4. Requête SQL prête à l'emploi

Une seule requête à sous-requêtes renvoie les huit valeurs en un seul aller-retour vers la base de données :

```sql
SELECT
  (SELECT COALESCE(SUM(chp_mont), 0)
     FROM vw_ne
     WHERE chp_date = :date AND num_magasin = 1
       AND chp_mont > 0)                          AS ca_ttc,

  (SELECT COUNT(*)
     FROM vw_ne
     WHERE chp_date = :date AND num_magasin = 1
       AND chp_mont > 0)                          AS nb_tickets,

  (SELECT COALESCE(SUM(delta_remise), 0)
     FROM vw_nl
     WHERE chp_date = :date
       AND num_magasin = 1)                       AS total_remises,

  (SELECT COALESCE(SUM(mont_ttc), 0)
     FROM tbl_action
     WHERE chp_date_service = :date
       AND num_magasin = 1
       AND etat_ligne = 'O')                      AS total_offert,

  (SELECT COALESCE(SUM(mont_ttc), 0)
     FROM tbl_action
     WHERE chp_date_service = :date
       AND num_magasin = 1
       AND etat_ligne = 'A')                      AS total_annulations,

  (SELECT COALESCE(SUM(mont_ttc), 0)
     FROM tbl_action
     WHERE chp_date_service = :date
       AND num_magasin = 1
       AND etat_ligne = 'R')                      AS total_retours,

  (SELECT COALESCE(SUM(mont_ttc), 0)
     FROM tbl_action
     WHERE chp_date_service = :date
       AND num_magasin = 1
       AND etat_ligne = 'P')                      AS total_pertes;
```

Le ticket moyen se calcule ensuite côté application (pas en SQL) : `ca_ttc / nb_tickets`, avec une protection contre la division par zéro si aucune vente n'a eu lieu ce jour-là.

```{=latex}
\begin{notebox}
Si les colonnes Quantité et Pourcentage devaient être ajoutées plus tard, il suffit d'ajouter \texttt{COUNT(*)} à chacune des quatre sous-requêtes sur \texttt{tbl\_action} (déjà vérifié : 3 lignes pour Pertes, 7 lignes pour Retours) et de calculer le pourcentage côté application par rapport au chiffre d'affaires -- aucune nouvelle table à découvrir, juste une extension de la requête actuelle.
\end{notebox}
```

### 5. Implémentation développeur

**Endpoint à créer** : `GET /api/dashboard/jour?date=2026-07-21`, qui exécute la requête ci-dessus et renvoie les huit valeurs (plus le ticket moyen calculé) sous forme de JSON.

```{=latex}
\begin{notebox}
Mutualisation à ne pas manquer : ce même service backend, appelé avec \texttt{date\_debut = date\_fin = la date choisie}, sert aussi le Tableau de bord « par période » déjà documenté séparément. Un seul service, un paramètre de plage de dates -- ne codez jamais deux fois cette logique.
\end{notebox}
```

### 6. Architecture d'affichage (Frontend)

Huit cartes KPI (Chiffre d'affaires, Tickets, Ticket moyen, puis Offerts, Remises, Annulations, Retours, Pertes -- chacune avec un seul montant, sans quantité ni pourcentage dans cette version). Réutiliser le même composant `CarteKPI` que pour la version par période -- titre, valeur, éventuellement une variation en pourcentage vs la veille.

### 7. Temps réel ou cache ?

Cet écran porte presque toujours sur la journée en cours : il doit donc être recalculé en temps réel (rafraîchissement toutes les 30 à 60 secondes, ou à chaque nouvel encaissement synchronisé). Il ne devient cacheable indéfiniment que si l'utilisateur consulte volontairement une journée déjà passée et clôturée dans `tbl_cloture`.

### 8. Prochaine étape concrète

1. Développer la requête SQL de la section 4 en environnement de test.
2. Comparer son résultat, chiffre par chiffre, avec l'écran caisse réel de la journée testée -- exactement la méthode déjà utilisée pour valider les huit valeurs de ce guide (32 660,00 DH, 9 tickets, 3 628,89 DH de ticket moyen, 0,00 / 90,00 / 0,00 / 1 050,00 / 450,00 pour Offerts / Remises / Annulations / Retours / Pertes).
3. Brancher l'endpoint `GET /api/dashboard/jour`.
4. Développer les huit cartes KPI côté frontend.
5. Ne passer à l'écran suivant qu'une fois ces huit chiffres validés avec le référent métier du client.

```{=latex}
\begin{factbox}
Ce guide fait partie du même ensemble documentaire que les fiches déjà livrées (\texttt{Rapports\_Journaliers/06\_Dashboard\_Du\_Jour}, \texttt{Rapports\_Par\_Periode/02\_Tableau\_De\_Bord\_Periode}) et le plan officiel de développement en 22 étapes (\texttt{Plan\_Officiel\_Developpement\_Dashboard\_POS.pdf}, étapes 9 et 11). Il ne les remplace pas : il en extrait, pour ce seul écran, une version courte et directement actionnable pour démarrer le développement.
\end{factbox}
```


## 5.2 Écran Règlement


```{=latex}
\begin{tldrbox}
\begin{itemize}
\item Ce guide met à jour la fiche \texttt{Rapports\_Journaliers/01\_Reglements} déjà livrée, à partir d'une capture d'écran plus détaillée (colonnes Total / Ventes / Client / \% / Nb, sélecteur \guillemotleft{} CAISSE 1 \guillemotright{}, tableau en deux blocs).
\item \textbf{Décision produit du 22 juillet 2026} : pour cette version de l'écran, le tableau n'affichera que \textbf{deux colonnes} -- \guillemotleft{} Règlement \guillemotright{} (le libellé du mode de paiement) et \guillemotleft{} Ventes \guillemotright{} (le montant) -- les colonnes Total, Client, \% et Nb ne sont \textbf{pas} développées dans cette itération.
\item Conséquence technique directe : plus besoin de \texttt{tbl\_caisse\_detaille}. La source la plus simple redevient les colonnes à plat \texttt{chp\_reg1} à \texttt{chp\_reg22} de \texttt{vw\_ne}, exactement comme dans la fiche \texttt{01\_Reglements} déjà livrée -- un seul aller-retour, sans jointure supplémentaire.
\item Le tableau garde ses deux blocs (règlements immédiats avec un sous-total, puis Compte Client affiché à part) avant un total général, toujours piloté par \texttt{tbl\_les\_reglement.type\_ca}.
\end{itemize}
\end{tldrbox}
```

### 1. Ce que montre l'écran

L'écran « Règlement » affiche, pour une journée et une caisse données (sélecteur « CAISSE 1 » en haut à droite) : un donut des moyens de paiement, et un tableau à **deux colonnes** -- Règlement (libellé du mode de paiement) et Ventes (montant encaissé). Le tableau reste structuré en deux blocs : les règlements immédiats (Espèces, Chèques, Carte Bleue), avec un sous-total, puis le Compte Client affiché séparément, avant un total général.

```{=latex}
\begin{factbox}
Valeurs vérifiées sur la capture du 21 / 07 / 2026, colonne Ventes : Espèces 25\,010,00, Chèques 2\,400,00, Carte Bleue 4\,500,00 -- sous-total 31\,910,00 -- puis Compte Client 750,00 -- total général 32\,660,00. Ce sont ces mêmes montants, déjà vérifiés au centime près, qui alimentent la seule colonne conservée dans cette version simplifiée.
\end{factbox}
```

### 2. Table à utiliser : `vw_ne` (colonnes `chp_reg1` à `chp_reg22`)

```{=latex}
\begin{notebox}
Grâce à la simplification à deux colonnes, la recommandation initiale de la fiche \texttt{01\_Reglements} redevient la plus adaptée : les colonnes à plat \texttt{chp\_reg1}...\texttt{chp\_reg22} de \texttt{vw\_ne} suffisent pour calculer un simple total par mode de paiement. \texttt{tbl\_caisse\_detaille} n'est utile que si la colonne \guillemotleft{} Nb \guillemotright{} (nombre de paiements) doit être ajoutée plus tard -- ce n'est plus le cas dans cette version.
\end{notebox}
```

Colonnes de `vw_ne` (unifiant `ne_fichier` + `ne_fichier_day`) à utiliser :

- `chp_reg1` ... `chp_reg22` -- une colonne par mode de paiement possible, montant réglé sur ce ticket via ce mode.
- `chp_ncaisse` -- numéro de caisse, pour le sélecteur « CAISSE 1 ».
- `chp_date`, `num_magasin` -- filtres période et magasin.

### 3. Table `tbl_les_reglement` -- libellé et regroupement

Colonnes utilisées : `num_regl` (clé, 1 à 22, correspond positionnellement au numéro de la colonne `chp_regN`), `chp_intitule` (« Espèces », « Chèques », « Carte Bleue », « Compte Client »), `type_ca` (0 = vente normale, 1 = différé / compte, 2 = offert, 3 = remise -- déjà établi dans l'analyse de la base).

```{=latex}
\begin{factbox}
Hypothèse retenue pour expliquer la structure en deux blocs du tableau : les règlements immédiats (Espèces, Chèques, Carte Bleue) ont un \texttt{type\_ca} différent de 1, tandis que Compte Client a \texttt{type\_ca = 1}. À confirmer en base de test en vérifiant la valeur réelle de \texttt{type\_ca} pour chaque ligne de \texttt{tbl\_les\_reglement}.
\end{factbox}
```

### 4. Filtre Caisse

Le sélecteur « CAISSE 1 » se filtre directement sur `vw_ne.chp_ncaisse = :caisse`, sans jointure supplémentaire -- puisque la source est déjà `vw_ne` elle-même, contrairement à l'approche via `tbl_caisse_detaille` qui aurait demandé une jointure sur le ticket.

### 5. Process complet pour récupérer les données en SQL

1. Filtrer `vw_ne` sur la date, le magasin, et si besoin la caisse (`chp_date = :date AND num_magasin = 1 AND chp_ncaisse = :caisse`).
2. Pour chaque mode de paiement (`num_regl` de 1 à 22), sommer la colonne `chp_regN` correspondante -- via un `CASE WHEN` par numéro, encapsulé dans une vue SQL dédiée pour ne pas dupliquer ce code côté application.
3. Joindre `tbl_les_reglement` sur `num_regl` pour récupérer `chp_intitule` (libellé Règlement) et `type_ca`.
4. Grouper par `num_regl`, `chp_intitule`, `type_ca` ; ne garder que les totaux strictement positifs.
5. Séparer l'affichage en deux blocs selon `type_ca` : règlements immédiats avec un sous-total, puis Compte Client isolé, puis le total général.

### 6. Requête SQL prête à l'emploi

```sql
SELECT r.num_regl, r.chp_intitule, r.type_ca,
       SUM(CASE r.num_regl
             WHEN 1  THEN ne.chp_reg1
             WHEN 2  THEN ne.chp_reg2
             WHEN 3  THEN ne.chp_reg3
             WHEN 4  THEN ne.chp_reg4
             WHEN 5  THEN ne.chp_reg5
             WHEN 6  THEN ne.chp_reg6
             WHEN 7  THEN ne.chp_reg7
             WHEN 8  THEN ne.chp_reg8
             WHEN 9  THEN ne.chp_reg9
             WHEN 10 THEN ne.chp_reg10
             WHEN 11 THEN ne.chp_reg11
             WHEN 12 THEN ne.chp_reg12
             WHEN 13 THEN ne.chp_reg13
             WHEN 14 THEN ne.chp_reg14
             WHEN 15 THEN ne.chp_reg15
             WHEN 16 THEN ne.chp_reg16
             WHEN 17 THEN ne.chp_reg17
             WHEN 18 THEN ne.chp_reg18
             WHEN 19 THEN ne.chp_reg19
             WHEN 20 THEN ne.chp_reg20
             WHEN 21 THEN ne.chp_reg21
             WHEN 22 THEN ne.chp_reg22
             ELSE 0
           END) AS ventes
FROM vw_ne ne
CROSS JOIN tbl_les_reglement r
WHERE ne.chp_date = :date
  AND ne.num_magasin = 1
  -- AND ne.chp_ncaisse = :caisse
  --   (à ajouter uniquement si un filtre caisse est actif)
GROUP BY r.num_regl, r.chp_intitule, r.type_ca
HAVING ventes > 0
ORDER BY r.type_ca, ventes DESC;
```

Comme déjà recommandé pour la fiche `01_Reglements`, encapsuler ce `CASE WHEN` dans une vue SQL (`vw_reglements_jour`) plutôt que de le dupliquer dans le code applicatif.

### 7. Points à valider avant développement final

```{=latex}
\begin{warnbox}
\begin{enumerate}
\item \textbf{Colonnes Total, Client, \% et Nb} : volontairement écartées de cette itération suite à la décision produit du 22 juillet 2026. Si elles doivent être ajoutées plus tard, revoir la recommandation de source de données (probablement \texttt{tbl\_caisse\_detaille} pour Nb, voir la version précédente de ce guide conservée dans l'historique du projet).
\item \textbf{Hypothèse `type\_ca`} pour la séparation en deux blocs : toujours à confirmer en base de test (voir section 3).
\item \textbf{Nouveaux moyens de paiement au-delà de `chp\_reg22`} : à vérifier auprès de l'éditeur, comme déjà signalé dans la fiche \texttt{01\_Reglements} -- la vue \texttt{vw\_reglements\_jour} devra être mise à jour si un 23\textsuperscript{e} mode apparaît.
\end{enumerate}
\end{warnbox}
```

### 8. Implémentation développeur et architecture d'affichage

**Endpoint** : `GET /api/reglements?date=...&caisse=...` (déjà prévu dans le plan officiel, étape 6), qui interroge directement `vw_ne` via la vue `vw_reglements_jour`.

**Frontend** : donut (comme déjà conçu) + tableau à deux colonnes (Règlement, Ventes) structuré en deux blocs avec sous-total intermédiaire (règlements immédiats) et total général -- un composant de tableau à sections, pas un simple tableau plat, pour reproduire la présentation en deux blocs de l'écran existant.

### 9. Temps réel ou cache ?

Identique à la recommandation déjà établie pour ce rapport : temps réel pour la journée en cours (chaque nouveau paiement encaissé doit apparaître rapidement), cacheable indéfiniment pour une journée déjà clôturée dans `tbl_cloture`.

```{=latex}
\begin{factbox}
Ce guide met à jour \texttt{Rapports\_Journaliers/01\_Reglements} déjà livré dans \texttt{Dashboard\_POS\_Pack\_Developpeur.zip}, sur la base d'une capture d'écran plus complète puis d'une décision produit de simplification à deux colonnes. Il s'inscrit dans les étapes 6 et 10 du plan officiel de développement (\texttt{Plan\_Officiel\_Developpement\_Dashboard\_POS.pdf}).
\end{factbox}
```


# Partie 6 -- Fiches détaillées par rapport (pack développeur)

Chaque fiche suit la même structure en 9 points : informations affichées, tables utilisées, colonnes, relations entre tables, calculs, requête SQL prête à l'emploi, conseils d'implémentation, architecture d'affichage recommandée, et recommandation temps réel vs cache.

## 6.A Rapports journaliers (série 1 -- statistiques d'une seule journée)



### 6.A.1 Règlements du jour

```{=latex}
\begin{warnbox}
Fiche remplacée par la version corrigée -- voir Partie 5.2 « Écran Règlement ». La recommandation initiale ci-dessous (colonnes \texttt{chp\_reg1} à \texttt{chp\_reg22}) reste correcte pour un simple total par mode de paiement, mais la Partie 5.2 documente en plus la structure en deux blocs et la décision produit du 22 juillet 2026.
\end{warnbox}
```


### Écran caisse : Règlements du jour (camembert des moyens de paiement)

#### 1 Informations affichées

Camembert de la journée (21 / 07 / 2026, magasin n°1) ventilant l'encaissement du jour par moyen de paiement : Espèces, Chèques, Carte Bleue, Compte Client (crédit / différé).

```{=latex}
\begin{factbox}
Preuve vérifiée au centime près sur les données brutes du dump : Espèces 25\,010,00 ; Chèques 2\,400,00 ; Carte Bleue 4\,500,00 ; Compte Client 750,00 -- soit un total de 32\,660,00, exactement le chiffre d'affaires du jour affiché sur le Tableau de bord (fiche 6).
\end{factbox}
```

#### 2 -- 3 Tables et colonnes

`ne_fichier_day` (jour non clôturé) / `ne_fichier` (jours clos), unifiées en `vw_ne` : colonnes `chp_reg1` à `chp_reg22` (une colonne par moyen de paiement possible), `chp_date`, `num_magasin`. `tbl_les_reglement` : `num_regl` (clé, 1 à 22), `chp_intitule` (libellé affiché : « Espèces », « Chèques »...), `type_ca`. Alternative plus normalisée : `tbl_caisse_detaille` (`num_reglement`, `montant`, `chp_date`) jointe à `tbl_les_reglement`.

#### 4 Relations

`ne_fichier(_day).chp_regN` --> `tbl_les_reglement.num_regl = N` (relation positionnelle par numéro de colonne, pas une vraie clé étrangère : le mapping est fixé par convention applicative). `tbl_caisse_detaille.num_reglement` --> `tbl_les_reglement.num_regl` (relation plus classique, à privilégier si le module de caisse détaillée est bien alimenté).

#### 5 Calculs

Pour chaque mode de paiement N (1 à 22) : `SUM(chp_regN)` sur la journée. Total du camembert = somme de tous les modes = chiffre d'affaires TTC du jour.

#### 6 Requête SQL

```sql
SELECT r.num_regl, r.chp_intitule,
       SUM(CASE r.num_regl
             WHEN 1 THEN ne.chp_reg1  WHEN 2 THEN ne.chp_reg2  WHEN 3 THEN
               ne.chp_reg3
             WHEN 4 THEN ne.chp_reg4  WHEN 5 THEN ne.chp_reg5  WHEN 6 THEN
               ne.chp_reg6
             WHEN 7 THEN ne.chp_reg7  WHEN 8 THEN ne.chp_reg8  WHEN 9 THEN
               ne.chp_reg9
             WHEN 10 THEN ne.chp_reg10 WHEN 11 THEN ne.chp_reg11 WHEN 12
               THEN ne.chp_reg12
             WHEN 13 THEN ne.chp_reg13 WHEN 14 THEN ne.chp_reg14 WHEN 15
               THEN ne.chp_reg15
             WHEN 16 THEN ne.chp_reg16 WHEN 17 THEN ne.chp_reg17 WHEN 18
               THEN ne.chp_reg18
             WHEN 19 THEN ne.chp_reg19 WHEN 20 THEN ne.chp_reg20 WHEN 21
               THEN ne.chp_reg21
             WHEN 22 THEN ne.chp_reg22 ELSE 0 END) AS total
FROM vw_ne ne
CROSS JOIN tbl_les_reglement r
WHERE ne.chp_date = :date
  AND ne.num_magasin = 1
GROUP BY r.num_regl, r.chp_intitule
HAVING total > 0
ORDER BY total DESC;
```

#### 7 Implémentation développeur

Ne jamais coder les 22 `CASE WHEN` en dur dans le backend applicatif : les encapsuler dans une **vue SQL** (ou une fonction stockée) une bonne fois pour toutes, afin que le code applicatif reste simple (`SELECT * FROM vw_reglements_jour WHERE chp_date = ? AND num_magasin = ?`). Vérifier auprès de l'éditeur si de nouveaux moyens de paiement peuvent apparaître au-delà de `chp_reg22` (auquel cas la vue devra être mise à jour).

#### 8 Architecture d'affichage

Camembert / donut avec légende (montant + pourcentage par mode), complété d'une carte KPI « Total encaissé » au centre ou au-dessus. Couleurs cohérentes avec le reste du dashboard (voir palette du document principal).

#### 9 Temps réel ou cache ?

Temps réel obligatoire pour la journée en cours (lecture de `ne_fichier_day`, rafraîchissement à chaque encaissement ou toutes les 30 à 60 secondes) ; entièrement cacheable pour les journées passées et déjà clôturées dans `tbl_cloture`.

### Écran caisse : Bande de contrôle / tickets encaissés

#### 1 Informations affichées

Journal chronologique de tous les tickets de la journée : numéro de ticket, numéro de document, heure, mode de règlement, montant. C'est le relevé brut, ticket par ticket, dont dérivent tous les autres KPI du jour.

```{=latex}
\begin{factbox}
Preuve vérifiée : les 10 tickets de la bande de contrôle du 21 / 07 / 2026 (chp\_primary 3737 à 3746) totalisent 8500 + 20000 + 800 + 400 + 750 + 510 + 300 + 800 + 600 + 0 = 32\,660,00 DH, exactement le chiffre d'affaires affiché. Le ticket chp\_primary = 3746 (montant 0,00, réglé « --- », horodaté 22:04:53) est un ticket resté ouvert en caisse au moment de l'export -- il doit être exclu du compte de tickets (d'où « Tickets : 9 » et non 10 sur le tableau de bord).
\end{factbox}
```

#### 2 -- 3 Tables et colonnes

`ne_fichier_day` / `ne_fichier` (`vw_ne`) : `chp_primary` (numéro de ticket), `chp_ntik` (numéro de document / « Docu... »), `chp_hr` (heure), `chp_dt` (date texte), `chp_date` (date), `chp_mont_ht`, `chp_mont_tva`, `chp_mont` (montant TTC), `chp_reg1`...`chp_reg22` (détail du règlement de ce ticket précis), `chp_serv` (vendeur), `num_magasin`.

#### 4 Relations

Aucune jointure nécessaire pour cet écran : il s'agit d'une lecture directe et chronologique de `vw_ne`, éventuellement enrichie d'un `LEFT JOIN tbl_users_fixe` pour afficher le nom du vendeur plutôt que son code.

#### 5 Calculs

Aucun calcul d'agrégation : c'est une liste, triée par `chp_primary` ou par heure croissante. Seule règle de gestion : exclure ou signaler visuellement les tickets à `chp_mont = 0` (tickets ouverts / non finalisés) plutôt que de les compter comme des ventes.

#### 6 Requête SQL

```sql
SELECT chp_primary AS ticket, chp_ntik AS document, chp_hr AS heure,
       chp_mont_ht, chp_mont_tva, chp_mont AS montant_ttc, chp_serv
FROM vw_ne
WHERE chp_date = :date
  AND num_magasin = 1
ORDER BY chp_primary;
```

#### 7 Implémentation développeur

Afficher clairement les tickets à 0,00 DH avec un badge « en cours / non finalisé » plutôt que de les masquer silencieusement -- utile pour le gérant qui veut vérifier qu'aucun ticket ne reste bloqué en caisse en fin de journée. Prévoir un lien de chaque ligne vers le détail des articles vendus sur ce ticket (jointure vers `vw_nl` via `chp_ref_prim`).

#### 8 Architecture d'affichage

Tableau simple, trié chronologiquement, avec une ligne de total en bas (nombre de tickets valides, montant total). Recherche/filtre par vendeur ou par mode de règlement utile pour le contrôle de caisse.

#### 9 Temps réel ou cache ?

Temps réel pour la journée en cours (nouveau ticket = nouvelle ligne immédiatement) ; figé et cacheable une fois la journée clôturée.

### Rapports et analyses : Journal des ventes -- filtre « Vente générale » (jour)

#### 1 Informations affichées

Détail des articles / prestations vendus dans la journée, filtré sur les ventes payantes normales (« Vente générale », par opposition aux lignes « Offert »). Colonnes attendues : désignation, quantité, prix unitaire, prix HT, TVA, prix TTC, remise -- même structure que le rapport « Ventes par articles » de la série 2, mais borné à une seule journée.

```{=latex}
\begin{factbox}
Preuve vérifiée : les désignations de \texttt{nl\_fichier\_day.description\_article} du 21 / 07 / 2026 (« Soin cheveux », « Manicure pedicure », « Demi jambe », « Forfeit ozone cares », « Forfait Spa manicure + Spa pedicure »...) correspondent mot pour mot au contenu de ce rapport dans le logiciel existant.
\end{factbox}
```

#### 2 -- 3 Tables et colonnes

`nl_fichier_day` / `nl_fichier` (`vw_nl`) : `chp_qt`, `chp_prix`, `chp_Tprix_ht`, `chp_Tprix` (TTC), `tva_par_article`, `delta_remise`, `chp_etatligne`, `des_coresp`, `description_article`, `chp_date`, `chp_serv`. `corres_des` : `des_coresp`, `chp_des`.

#### 4 Relations

`vw_nl.des_coresp` --> `corres_des.des_coresp`. Le filtre « Vente générale » exclut les lignes dont `chp_etatligne` correspond à une vente offerte (voir fiche suivante, « Ventes offertes »).

```{=latex}
\begin{warnbox}
Le mécanisme exact du filtre « Vente générale » / « Offert » mérite confirmation auprès de l'éditeur : \texttt{chp\_etatligne} (valeurs observées N, O, P, R) et \texttt{tbl\_les\_reglement.type\_ca} (0 = vente normale, 2 = offert) semblent coexister comme deux façons distinctes d'exprimer la gratuité -- le tableau de bord du jour affichait « Offerts : 0 » le même jour où le rapport « Offert » listait pourtant une ligne (remise de 300 DH sur un soin cheveux). Ne pas supposer qu'un seul champ suffit à trancher ; à valider en environnement de test avant le développement final.
\end{warnbox}
```

#### 5 Calculs

Par article, sur la journée : Quantité = `SUM(chp_qt)` ; Prix HT = `SUM(chp_Tprix_ht)` ; Tva = `SUM(tva_par_article)` ; Prix TTC = `SUM(chp_Tprix)` ; Remise = `SUM(delta_remise)`. Filtre `chp_etatligne <> 'O'` (lignes non offertes) -- à confirmer.

#### 6 Requête SQL

```sql
SELECT COALESCE(cd.chp_des, nl.description_article) AS designation,
       SUM(nl.chp_qt)          AS quantite,
       SUM(nl.chp_Tprix_ht)    AS prix_vente_ht,
       SUM(nl.tva_par_article) AS tva,
       SUM(nl.chp_Tprix)       AS prix_vente_ttc,
       SUM(nl.delta_remise)    AS remise
FROM vw_nl nl
LEFT JOIN corres_des cd ON cd.des_coresp = nl.des_coresp
WHERE nl.chp_date = :date
  AND nl.num_magasin = 1
  AND nl.chp_etatligne <> 'O'   -- à confirmer avec l'éditeur
GROUP BY COALESCE(cd.chp_des, nl.description_article)
ORDER BY designation;
```

#### 7 Implémentation développeur

Réutiliser exactement le même service backend que le rapport « Ventes par articles » de la série 2 (fiche `03_Ventes_Par_Articles`), simplement avec `date_debut = date_fin = date du jour`. Un seul endpoint paramétré par plage de dates couvre donc les deux besoins (jour et période) -- ne pas dupliquer la logique.

#### 8 Architecture d'affichage

Tableau détaillé, avec ligne de total. Peut être combiné à un export PDF/Excel identique au bouton déjà présent dans le logiciel existant.

#### 9 Temps réel ou cache ?

Temps réel pour la journée en cours ; cacheable dès la clôture.

### Rapports et analyses : Journal des ventes -- filtre « Offert » (jour)

#### 1 Informations affichées

Même rapport que « Ventes générale », mais filtré sur les lignes de vente accordées gratuitement (offertes) durant la journée -- utile pour surveiller la générosité commerciale (invitations, gestes clients, erreurs de caisse à corriger).

```{=latex}
\begin{factbox}
Preuve vérifiée : le rapport « Offert » du 21 / 07 / 2026 liste une ligne (Soin cheveux, remise de 300 DH), cohérente avec une ligne de \texttt{nl\_fichier\_day} où le prix vendu a été ramené à 0 ou fortement réduit.
\end{factbox}
```

#### 2 -- 3 Tables et colonnes

Identiques à la fiche précédente : `nl_fichier_day` / `nl_fichier` (`vw_nl`), `corres_des`. Le filtre s'appuie sur `chp_etatligne` (valeur `'O'` supposée) et / ou sur le montant de la ligne rapproché de `tbl_les_reglement.type_ca = 2` au niveau du ticket parent.

#### 4 Relations

Identiques à la fiche précédente. `vw_nl.chp_ref_prim` --> `vw_ne.chp_primary` si le mécanisme de gratuité doit être vérifié au niveau du ticket entier plutôt que ligne par ligne.

```{=latex}
\begin{warnbox}
Comme indiqué dans la fiche « Ventes générale », deux mécanismes de gratuité semblent coexister dans ce logiciel (ligne offerte au sein d'un ticket normal, vs paiement intégral via un mode de règlement « Invitation »/« Maison »). Le développeur doit choisir -- après validation avec l'éditeur -- si ce rapport doit capter uniquement le premier cas, le second, ou les deux, car le tableau de bord du jour (fiche 6) et ce rapport ne semblaient pas s'accorder exactement sur la même journée test (« Offerts : 0 » au tableau de bord contre une ligne offerte listée ici).
\end{warnbox}
```

#### 5 Calculs

Identiques à la fiche précédente, avec `chp_etatligne = 'O'` au lieu de `<> 'O'`.

#### 6 Requête SQL

```sql
SELECT COALESCE(cd.chp_des, nl.description_article) AS designation,
       SUM(nl.chp_qt)       AS quantite,
       SUM(nl.chp_Tprix_ht) AS valeur_offerte_ht,
       SUM(nl.chp_Tprix)    AS valeur_offerte_ttc
FROM vw_nl nl
LEFT JOIN corres_des cd ON cd.des_coresp = nl.des_coresp
WHERE nl.chp_date = :date
  AND nl.num_magasin = 1
  AND nl.chp_etatligne = 'O'   -- à confirmer avec l'éditeur
GROUP BY COALESCE(cd.chp_des, nl.description_article)
ORDER BY valeur_offerte_ttc DESC;
```

#### 7 Implémentation développeur

Même service backend paramétrable que « Ventes générale », avec un paramètre `type_vente = offert`. Envisager une alerte automatique si le total offert dépasse un seuil défini par le gérant (pourcentage du CA du jour, par exemple) -- fonctionnalité qui n'existe pas dans le logiciel actuel mais qui a du sens pour un dashboard de pilotage.

#### 8 Architecture d'affichage

Tableau détaillé + une carte KPI « Total offert du jour » (montant et pourcentage du CA), afin de rendre ce chiffre visible sans avoir à ouvrir le rapport détaillé.

#### 9 Temps réel ou cache ?

Temps réel pour la journée en cours ; cacheable dès la clôture.

### Rapports et analyses : C.A. par vendeur (jour)

#### 1 Informations affichées

Chiffre d'affaires du jour ventilé par vendeur / prestataire, avec nombre de tickets et panier moyen -- même rapport que la fiche « C.A. par vendeur » de la série 2, mais borné à une seule journée.

```{=latex}
\begin{factbox}
Preuve vérifiée : les vendeurs listés sur la capture du 21 / 07 / 2026 correspondent aux codes déjà identifiés dans \texttt{tbl\_users\_fixe} (1-SAID, Z99-Manager, etc.), et la somme des chiffres d'affaires par vendeur recoupe le total de 32\,660,00 DH validé sur la bande de contrôle (fiche 2) et le camembert des règlements (fiche 1).
\end{factbox}
```

#### 2 -- 3 Tables et colonnes

`ne_fichier_day` / `ne_fichier` (`vw_ne`) : `chp_serv`, `chp_mont_ht`, `chp_mont` (TTC), `chp_primary`, `chp_date`. `tbl_users_fixe` : `num_user`, `nom_user`.

#### 4 Relations

`vw_ne.chp_serv` --> `tbl_users_fixe.num_user`, avec la même réserve que pour la fiche équivalente de la série 2 concernant `chp_serv` (prestataire) vs `chp_servenc` (encaisseur) -- privilégier `chp_serv` pour un usage de suivi de performance / commissionnement.

#### 5 Calculs

Par vendeur : Nombre tickets = `COUNT(chp_primary)` ; C.A. HT = `SUM(chp_mont_ht)` ; C.A. TTC = `SUM(chp_mont)` ; Panier moyen = `SUM(chp_mont) / COUNT(chp_primary)`. Exclure les tickets à `chp_mont = 0` (voir fiche 2, ticket resté ouvert).

#### 6 Requête SQL

```sql
SELECT COALESCE(u.nom_user, CONCAT('Vendeur #', ne.chp_serv)) AS vendeur,
       COUNT(ne.chp_primary)                              AS nb_tickets,
       SUM(ne.chp_mont_ht)                                 AS ca_ht,
       SUM(ne.chp_mont)                                    AS ca_ttc,
       SUM(ne.chp_mont) / NULLIF(COUNT(ne.chp_primary),0)  AS panier_moyen
FROM vw_ne ne
LEFT JOIN tbl_users_fixe u ON u.num_user = ne.chp_serv AND u.num_magasin =
  ne.num_magasin
WHERE ne.chp_date = :date
  AND ne.num_magasin = 1
  AND ne.chp_mont > 0
GROUP BY ne.chp_serv, u.nom_user
ORDER BY ca_ttc DESC;
```

#### 7 Implémentation développeur

Endpoint identique à celui de la série 2 (`06_CA_Par_Vendeur_Periode`), simplement appelé avec `date_debut = date_fin = aujourd'hui`. Ne pas dupliquer le code : un seul service, un paramètre de plage de dates.

#### 8 Architecture d'affichage

Classement des vendeurs trié par C.A. décroissant, sous forme de tableau ou de barres horizontales -- vue « du jour » à afficher en priorité sur la page d'accueil du dashboard pour un usage managérial quotidien.

#### 9 Temps réel ou cache ?

Temps réel recommandé (rafraîchissement toutes les quelques minutes), car ce rapport sert typiquement à un suivi en direct de l'activité des équipes en cours de journée.


### 6.A.6 Dashboard du jour -- synthèse KPI

```{=latex}
\begin{warnbox}
Fiche remplacée par la version corrigée et étendue -- voir Partie 5.1 « Tableau de bord du jour », qui ajoute les cinq types d'opérations (Offerts, Remises, Annulations, Retours, Pertes) découverts via la table \texttt{tbl\_action}, absents de la version ci-dessous.
\end{warnbox}
```


### Tableau de bord du jour

#### 1 Informations affichées

Vue de synthèse combinant plusieurs KPI de la journée : chiffre d'affaires, nombre de tickets, ticket moyen, remises accordées, ventes offertes, retours / annulations.

```{=latex}
\begin{factbox}
Preuve vérifiée au centime près sur le 21 / 07 / 2026 : Chiffre d'affaires 32\,660,00 (= somme exacte des 10 tickets de la bande de contrôle, dont un à 0,00) ; Tickets = 9 (le ticket \texttt{chp\_primary} = 3746, montant 0,00, horodaté 22:04:53, est exclu car resté ouvert / non finalisé) ; Ticket moyen = 3\,628,89 (= 32\,660 / 9, exact). Ces trois chiffres se recoupent avec la bande de contrôle (fiche 2) et le camembert des règlements (fiche 1).
\end{factbox}
```

#### 2 -- 3 Tables et colonnes

`ne_fichier_day` / `ne_fichier` (`vw_ne`) pour le CA, le nombre de tickets et le ticket moyen. `nl_fichier_day` / `nl_fichier` (`vw_nl`) pour les remises, les ventes offertes et les retours (via `chp_etatligne`).

#### 4 Relations

`vw_ne` --- 1 : N --- `vw_nl` via `chp_ref_prim`. Voir fiches 3 et 4 pour la distinction Vente générale / Offert, et le document principal pour la relation avec `tbl_cloture` (bascule `_day` --> historique après clôture).

#### 5 Calculs

- Chiffre d'affaires = `SUM(chp_mont)` sur `vw_ne`, `chp_mont > 0`.
- Nombre de tickets = `COUNT(*)` sur `vw_ne`, `chp_mont > 0` (règle capitale : exclure les tickets ouverts / non réglés, confirmée par la preuve ci-dessus).
- Ticket moyen = Chiffre d'affaires / Nombre de tickets.
- Remises = `SUM(delta_remise)` sur `vw_nl`.
- Offerts = `SUM(chp_Tprix)` sur `vw_nl` où `chp_etatligne = 'O'` (sous réserve de validation, voir fiche 4).
- Retours / annulations = à définir avec l'éditeur (valeurs `chp_etatligne` = `P` ou `R` observées mais non confirmées).

#### 6 Requête SQL

```sql
SELECT
  (SELECT COALESCE(SUM(chp_mont), 0) FROM vw_ne
     WHERE chp_date = :date AND num_magasin = 1 AND chp_mont > 0)
       AS ca_ttc,
  (SELECT COUNT(*) FROM vw_ne
     WHERE chp_date = :date AND num_magasin = 1 AND chp_mont > 0)
       AS nb_tickets,
  (SELECT COALESCE(SUM(delta_remise), 0) FROM vw_nl
     WHERE chp_date = :date AND num_magasin = 1)
       AS total_remises,
  (SELECT COALESCE(SUM(chp_Tprix), 0) FROM vw_nl
     WHERE chp_date = :date AND num_magasin = 1 AND chp_etatligne = 'O')
       AS total_offert;
-- ticket_moyen = ca_ttc / NULLIF(nb_tickets, 0), calculé côté application ou
-- en CTE
```

#### 7 Implémentation développeur

Exposer un endpoint unique `GET /api/dashboard/jour?date=...` qui renvoie ces quatre agrégats en un seul JSON (une seule requête multi-sous-requêtes ou 4 requêtes courtes en parallèle) -- éviter les allers-retours multiples depuis le frontend pour une simple page d'accueil.

#### 8 Architecture d'affichage

Rangée de cartes KPI (CA, tickets, ticket moyen, remises, offerts, retours), chacune avec une variation vs la veille ou le même jour de la semaine précédente (`chp_date - INTERVAL 1 DAY` / `- INTERVAL 7 DAY`) -- amélioration naturelle par rapport à l'écran actuel qui n'affiche pas de comparaison.

#### 9 Temps réel ou cache ?

Temps réel pour la journée en cours (rafraîchissement toutes les 30 à 60 secondes, ou sur notification de nouvel encaissement) ; figé et cacheable indéfiniment une fois la journée clôturée dans `tbl_cloture`.


## 6.B Rapports par période (série 2 -- module Statistiques)


### Tableau de bord (vue par période)

#### 1 Informations affichées

L'écran « Tableau de bord » du module Statistiques affiche, pour la plage Date Début / Date Fin choisie (ici 01 / 07 / 2026 au 21 / 07 / 2026, soit le mois en cours) :

- Un sélecteur de période avec quatre raccourcis rapides et une case « Afficher les légendes ».
- Un graphique **Evolution des ventes** : une aire (dégradée bleu-gris) représentant le chiffre d'affaires quotidien sur toute la plage, superposée à une **courbe orange** dont la signification exacte n'est pas certaine à la seule lecture de l'écran (voir point 1.5).
- Un histogramme **C.A. par jour** : le chiffre d'affaires est regroupé **par jour de la semaine** (les libellés affichés sont en anglais -- Tuesday, Monday, Saturday, Friday, Thursday, Wednesday -- alors que le reste de l'interface est en français, et l'ordre n'est ni alphabétique ni chronologique). Une courbe de tendance orange est superposée.
- Un donut « Direct » : un seul segment, valeur 185 410.
- Un second donut réparti par famille de produits : Coupe homme 85 880, Esthetique 61 050, Hammam Spa 31 400, Non classé 3 650, produits 3 430 (étiquettes se chevauchant sur la capture).

```{=latex}
\begin{factbox}
Preuve vérifiée sur les chiffres de la capture : 85\,880 + 61\,050 + 31\,400 + 3\,650 + 3\,430 = 185\,410, exactement le total du donut « Direct ». Les deux donuts représentent donc la \textbf{même somme totale} (le chiffre d'affaires de la période), simplement ventilée selon deux axes différents : le mode de vente (donut de gauche) et la famille de produits (donut de droite).
\end{factbox}
```

#### 2 -- 3 Tables et colonnes utilisées

- `ne_fichier` / `ne_fichier_day` (vue `vw_ne`) : `chp_date`, `chp_mont_ht`, `chp_mont_tva`, `chp_mont` (TTC), `chp_serv`, `chp_servenc`, `internet` (indicateur vente web/livraison), `num_magasin`, `chp_primary` / `chp_ref_prim`.
- `nl_fichier` / `nl_fichier_day` (vue `vw_nl`) : `chp_Tprix_ht`, `chp_Tprix` (TTC), `tva_par_article`, `des_coresp`, `chp_ref_prim`, `chp_date`.
- `corres_des` : `des_coresp` (clé), `chp_fam`.
- `tbl_famille` : `num_fam` (clé), `des` (libellé affiché dans le donut : Coupe homme, Esthetique, Hammam Spa, Non classé, produits).

#### 4 Relations entre tables

`vw_ne` (1 ticket) --- 1 : N --- `vw_nl` (N lignes) via `chp_ref_prim` = `chp_primary`. `vw_nl.des_coresp` --> `corres_des.des_coresp`. `corres_des.chp_fam` (varchar) --> `tbl_famille.num_fam` (int) : jointure à faire avec une conversion de type explicite (`CAST(chp_fam AS UNSIGNED)`), car aucune contrainte de clé étrangère n'existe dans ce schéma (comme déjà noté dans le document 1).

#### 5 Calculs nécessaires

- **Evolution des ventes (aire)** : `SUM(chp_mont)` (ou `chp_mont_ht`, à confirmer selon que le graphe est en TTC ou HT) groupé par `chp_date`, sur la plage sélectionnée.

```{=latex}
\begin{warnbox}
La courbe orange superposée à l'aire n'a pas de légende visible sur la capture (la case « Afficher les légendes » est décochée). Trois hypothèses raisonnables : (a) le chiffre d'affaires de la période de comparaison précédente (semaine ou mois n-1), (b) une moyenne mobile lissée sur quelques jours, (c) un objectif de vente configuré. Il faut cocher « Afficher les légendes » dans le logiciel existant (ou interroger l'éditeur Clyo Systems) avant de coder ce composant, sous peine de reproduire un graphique dont le sens réel est incertain.
\end{warnbox}
```

- **C.A. par jour (histogramme par jour de semaine)** : `SUM(chp_mont)` groupé par le nom du jour de semaine de `chp_date` (`DAYNAME(chp_date)` en SQL, ou `DAYOFWEEK` pour l'ordre). Cela agrège tous les mardis de la période ensemble, tous les mercredis ensemble, etc.

```{=latex}
\begin{warnbox}
Le logiciel actuel affiche les jours en anglais et dans un ordre qui n'est ni chronologique (lundi à dimanche) ni alphabétique ni décroissant par valeur stricte -- cela ressemble à un artefact technique de l'application existante (ordre d'itération d'une structure de données interne), pas à un choix volontaire. Le nouveau dashboard ne doit \textbf{pas} reproduire ce bug : afficher les jours en français, dans l'ordre lundi $\rightarrow$ dimanche (ou trié par valeur décroissante si l'objectif est un classement, mais alors le préciser visuellement).
\end{warnbox}
```

- **Donut « mode de vente »** : `SUM(chp_mont)` groupé par `CASE WHEN internet = 1 THEN 'Web / Livraison' ELSE 'Direct' END`. Ce commerce n'ayant aucune vente `internet = 1` sur la période, un seul segment apparaît -- le code doit néanmoins prévoir les autres cas (champs `livreur`, `idOrdersWeb`, `date_commande` existent dans `ne_fichier` et confirment que la fonctionnalité livraison / web existe dans le logiciel, simplement inutilisée par ce commerce).
- **Donut « par famille »** : jointure `vw_nl` → `corres_des` → `tbl_famille`, `SUM(chp_Tprix)` groupé par `tbl_famille.des`.

#### 6 Requêtes SQL

```sql
-- Evolution des ventes (CA quotidien, TTC)
SELECT chp_date, SUM(chp_mont) AS ca_ttc_jour
FROM vw_ne
WHERE num_magasin = 1
  AND chp_date BETWEEN :date_debut AND :date_fin
GROUP BY chp_date
ORDER BY chp_date;

-- C.A. par jour de semaine (à réordonner lundi -> dimanche côté application)
SELECT DAYOFWEEK(chp_date) AS jour_num, DAYNAME(chp_date) AS jour_nom,
       SUM(chp_mont) AS ca_ttc
FROM vw_ne
WHERE num_magasin = 1
  AND chp_date BETWEEN :date_debut AND :date_fin
GROUP BY jour_num, jour_nom
ORDER BY jour_num;

-- Répartition par mode de vente
SELECT CASE WHEN internet = 1 THEN 'Web / Livraison' ELSE 'Direct' END AS
  mode_vente,
       SUM(chp_mont) AS ca_ttc
FROM vw_ne
WHERE num_magasin = 1
  AND chp_date BETWEEN :date_debut AND :date_fin
GROUP BY mode_vente;

-- Répartition par famille
SELECT f.des AS famille, SUM(nl.chp_Tprix) AS ca_ttc
FROM vw_nl nl
JOIN corres_des cd ON cd.des_coresp = nl.des_coresp
JOIN tbl_famille f  ON f.num_fam = CAST(cd.chp_fam AS UNSIGNED)
WHERE nl.num_magasin = 1
  AND nl.chp_date BETWEEN :date_debut AND :date_fin
GROUP BY f.des
ORDER BY ca_ttc DESC;
```

#### 7 Implémentation développeur

Exposer un unique endpoint `GET /api/dashboard?start=...&end=...` qui exécute les quatre requêtes ci-dessus côté serveur et renvoie un JSON structuré (une clé par widget). Ne jamais laisser le front-end faire l'agrégation par jour ou par famille lui-même : cela doit rester en SQL pour rester correct quel que soit le volume de données. Prévoir un index composite `(num_magasin, chp_date)` sur `ne_fichier`, `ne_fichier_day`, `nl_fichier`, `nl_fichier_day` (déjà présent d'après le document 1) pour que ces requêtes restent rapides même sur plusieurs années d'historique.

#### 8 Architecture d'affichage recommandée

- Une rangée de cartes KPI en tête (C.A. TTC total, C.A. HT, nombre de tickets, panier moyen) calculée sur la même plage.
- Le graphique « Evolution des ventes » en aire + ligne (Chart.js, Recharts ou ECharts), avec légende toujours visible par défaut (contrairement au logiciel existant).
- L'histogramme « C.A. par jour » réordonné lundi → dimanche, en français.
- Remplacer les deux donuts côte à côte par un unique graphique avec un sélecteur d'axe (« Par mode de vente » / « Par famille »), plus lisible et plus évolutif si de nouvelles familles ou de nouveaux modes de vente apparaissent.

#### 9 Temps réel ou cache ?

Si la plage sélectionnée inclut la journée en cours (non encore clôturée), les données de `ne_fichier_day` / `nl_fichier_day` changent en continu : rafraîchir toutes les 30 à 60 secondes, ou après chaque nouvel encaissement si un mécanisme de notification existe. Si la plage est entièrement dans le passé (avant la dernière clôture confirmée dans `tbl_cloture`), les données sont figées : mettre en cache indéfiniment par clé `(start, end)`, en n'invalidant que le bucket du jour courant.

---

```{=latex}
\begin{factbox}
Ce document fait partie du pack de documentation technique du Dashboard POS (voir schema\_architecture\_application.png et le guide « De la base de données à l'application web » fournis dans le même lot). Il réutilise les vues déjà définies dans l'analyse principale :
\begin{itemize}
\item \texttt{vw\_ne = ne\_fichier UNION ALL ne\_fichier\_day} (un ticket par ligne)
\item \texttt{vw\_nl = nl\_fichier UNION ALL nl\_fichier\_day} (une ligne de vente par article vendu), reliées par \texttt{chp\_ref\_prim}
\end{itemize}
Ce rapport fonctionne sur une plage \textbf{Date Début / Date Fin} (module Statistiques), au contraire des rapports du dossier « Rapports\_Journaliers » qui portent sur une seule journée.
\end{factbox}
```

### Rapports et analyses : Ventes par articles

#### 1 Informations affichées

Écran « Rapports Et Analyses », filtre `Rapport = Ventes par articles`. Filtres disponibles : Date Début (01 / 01 / 2025), Date Fin (21 / 07 / 2026), `Vente` (Vente générale), `Caisse` (_tout), `Vendeur` (_tout), `Famille` / `Sous-famille` (vides, avec bouton « CL » pour effacer), `Etablissement` (Tout). Tableau détaillé par article : Désignation, Quantité, P unit..., Prix ach..., Prix vente HT, C.A. marge HT, Tva, C.A. TTC, Remise, Ratio A. Ratio V. Ligne Total en bas (Quantité 6 727, Prix vente HT 1 268 898,29, C.A. marge HT 1 268 898,29, Tva 169 671,81, C.A. TTC 1 438 570,10, Remise 350,00).

```{=latex}
\begin{factbox}
Preuve vérifiée : 1\,268\,898,29 (HT) + 169\,671,81 (Tva) = 1\,438\,570,10 (TTC), exactement le total affiché. La colonne « C.A. marge HT » est partout identique à « Prix vente HT » et « Prix ach... » vaut 0,00 sur toutes les lignes visibles : confirme que \texttt{p\_achat} n'est jamais renseigné pour ce commerce, donc marge = prix de vente HT dans 100 pourcent des cas actuels.
\end{factbox}
```

#### 2 -- 3 Tables et colonnes

`nl_fichier` / `nl_fichier_day` (`vw_nl`) : `chp_qt` (quantité), `chp_prix` (prix unitaire), `p_achat` (coût d'achat unitaire), `chp_Tprix_ht` (total HT ligne), `chp_Tprix` (total TTC ligne), `tva_par_article`, `delta_remise` / `tx_remise` (remise), `chp_etatligne`, `chp_serv`, `chp_date`, `des_coresp`, `num_magasin`. `corres_des` : `des_coresp`, `chp_des` (désignation affichée), `chp_fam`, `chp_ss_fam`. `tbl_famille` / `tbl_ss_famille` pour les filtres Famille / Sous-famille. `ne_fichier` (`vw_ne`) via `chp_ref_prim` pour filtrer par Caisse (`chp_ncaisse`) et par Établissement (`num_magasin`) au niveau du ticket.

#### 4 Relations

`vw_nl.des_coresp` --> `corres_des.des_coresp` --> `corres_des.chp_fam` / `chp_ss_fam` --> `tbl_famille.num_fam` / `tbl_ss_famille.num_ss_fam`. `vw_nl.chp_ref_prim` --> `vw_ne.chp_primary` (pour les filtres Caisse et Vendeur, présents à la fois sur la ligne, via `nl_fichier.chp_serv`, et sur le ticket, via `ne_fichier.chp_serv` -- privilégier le champ ligne, plus précis en cas de ticket multi-vendeurs).

#### 5 Calculs

Pour chaque article (`des_coresp`) : Quantité = `SUM(chp_qt)` ; P unit. = `SUM(chp_Tprix_ht) / SUM(chp_qt)` (prix moyen) ; Prix ach. = `SUM(p_achat * chp_qt)` ; Prix vente HT = `SUM(chp_Tprix_ht)` ; C.A. marge HT = `SUM(chp_Tprix_ht - p_achat * chp_qt)` ; Tva = `SUM(tva_par_article)` ; C.A. TTC = `SUM(chp_Tprix)` ; Remise = `SUM(delta_remise)`.

```{=latex}
\begin{warnbox}
La colonne « Ratio A. Ratio V. » regroupe visiblement deux ratios sur la capture. Hypothèse la plus probable : Ratio Achat = P.achat / Prix vente HT $\times$ 100 (0 pourcent ici puisque P.achat = 0) et Ratio Vente = C.A. marge HT / Prix vente HT $\times$ 100 (100 pourcent ici). À confirmer en agrandissant la colonne dans le logiciel existant ou auprès de l'éditeur avant de la reproduire à l'identique.
\end{warnbox}
```

Le filtre `Vente = Vente générale` correspond très probablement au même mécanisme que dans la série 1 (exclusion des lignes « offertes » ou « remises », via `chp_etatligne` ou `tbl_les_reglement.type_ca`) : à revalider en essayant les autres valeurs de ce menu déroulant dans le logiciel existant.

#### 6 Requête SQL

```sql
SELECT cd.chp_des                                   AS designation,
       SUM(nl.chp_qt)                               AS quantite,
       SUM(nl.chp_Tprix_ht) / NULLIF(SUM(nl.chp_qt),0) AS prix_unitaire_moyen,
       SUM(nl.p_achat * nl.chp_qt)                  AS prix_achat_total,
       SUM(nl.chp_Tprix_ht)                         AS prix_vente_ht,
       SUM(nl.chp_Tprix_ht - nl.p_achat * nl.chp_qt) AS ca_marge_ht,
       SUM(nl.tva_par_article)                      AS tva,
       SUM(nl.chp_Tprix)                             AS ca_ttc,
       SUM(nl.delta_remise)                          AS remise
FROM vw_nl nl
JOIN corres_des cd ON cd.des_coresp = nl.des_coresp
WHERE nl.num_magasin = 1
  AND nl.chp_date BETWEEN :date_debut AND :date_fin
  -- AND cd.chp_fam = :famille           (si filtre Famille actif)
  -- AND nl.chp_serv = :vendeur          (si filtre Vendeur actif)
GROUP BY cd.des_coresp, cd.chp_des
ORDER BY cd.chp_des;
```

#### 7 Implémentation développeur

Endpoint paginé `GET /api/rapports/ventes-articles` acceptant tous les filtres en paramètres de requête (date_debut, date_fin, famille, sous_famille, caisse, vendeur, etablissement, type_vente). Calculer la ligne Total côté SQL (`SUM(...)` sans `GROUP BY`) en parallèle de la requête détaillée, plutôt que de la recalculer en JavaScript. Prévoir un bouton d'export Excel / CSV (déjà présent dans le logiciel existant, bouton vert visible en haut à droite de l'écran) via une bibliothèque type `exceljs`.

#### 8 Architecture d'affichage

Tableau de données filtrable et triable (TanStack Table, AG Grid), avec ligne de total figée en bas d'écran (« sticky footer »), sélecteurs de filtres en en-tête reproduisant Date Début / Fin, Famille, Sous-famille, Caisse, Vendeur, Établissement, et un bouton d'export.

#### 9 Temps réel ou cache ?

Le filtre par défaut couvre une très large plage (01 / 01 / 2025 à aujourd'hui) : mettre en cache le résultat par combinaison de filtres pendant plusieurs minutes (ou jusqu'au prochain encaissement si la plage inclut aujourd'hui), car recalculer cette agrégation sur 18 mois de lignes à chaque clic de filtre serait coûteux sans cache.

---

```{=latex}
\begin{factbox}
Ce document fait partie du pack de documentation technique du Dashboard POS (voir schema\_architecture\_application.png et le guide « De la base de données à l'application web » fournis dans le même lot). Il réutilise les vues déjà définies dans l'analyse principale :
\begin{itemize}
\item \texttt{vw\_ne = ne\_fichier UNION ALL ne\_fichier\_day} (un ticket par ligne)
\item \texttt{vw\_nl = nl\_fichier UNION ALL nl\_fichier\_day} (une ligne de vente par article vendu), reliées par \texttt{chp\_ref\_prim}
\end{itemize}
Ce rapport fonctionne sur une plage \textbf{Date Début / Date Fin} (module Statistiques), au contraire des rapports du dossier « Rapports\_Journaliers » qui portent sur une seule journée.
\end{factbox}
```

### Rapports et analyses : Meilleures ventes par article

#### 1 Informations affichées

Même écran « Rapports Et Analyses », `Rapport = Meilleures ventes par article`, mêmes filtres (Date Début 01 / 01 / 2025, Date Fin 21 / 07 / 2026, Vente générale, tout Caisse / Vendeur / Établissement). Mêmes colonnes que la fiche 2, mais seulement les 10 premiers articles, classés par un critère de performance (l'ordre observé -- Coupe homme 2018, Barbe taille 713, Coupe jeune 524... -- correspond à un classement par quantité décroissante). Total affiché : 5 159 (quantité), 869 884,28 (HT), 990 180,10 (TTC), remise 50,00.

```{=latex}
\begin{factbox}
Ce total (5\,159) est \textbf{inférieur} au total de la fiche « Ventes par articles » (6\,727) sur la même période et les mêmes filtres. Ce n'est pas une incohérence : le rapport « Meilleures ventes » ne fait pas la somme de tous les articles, il fait la somme des 10 lignes affichées seulement (un Top 10). Le développeur doit reproduire ce comportement -- ou, mieux, l'expliciter clairement dans la nouvelle interface (« Total du Top 10 » plutôt que « Total »), car le libellé actuel du logiciel existant peut prêter à confusion.
\end{factbox}
```

#### 2 -- 6 Tables, colonnes, relations, calculs, requête SQL

Strictement identiques à la fiche 2 (même source `vw_nl` + `corres_des` + `tbl_famille` / `tbl_ss_famille`, mêmes colonnes, même logique de calcul par article). La seule différence est la clause finale de la requête :

```sql
-- Reprendre la requête de la fiche 2, puis :
ORDER BY quantite DESC
LIMIT 10;
```

```{=latex}
\begin{warnbox}
Le critère de tri exact (quantité vendue, ou C.A. TTC, ou C.A. marge) n'est pas certain à 100 pourcent depuis la capture seule -- l'ordre observé colle bien à un tri par quantité décroissante, mais il faudrait le confirmer en changeant les filtres dans le logiciel existant (par exemple restreindre à une famille et vérifier si l'ordre suit toujours la quantité).
\end{warnbox}
```

#### 7 Implémentation développeur

Réutiliser le même service que la fiche 2 en ajoutant un paramètre `top_n` (configurable, 5 / 10 / 20) et un paramètre `tri_par` (quantite / ca_ttc / ca_marge) exposé dans l'interface -- une amélioration naturelle par rapport au logiciel existant qui semble figer ce choix.

#### 8 Architecture d'affichage

Un classement visuel (barres horizontales triées, type « Top 10 des ventes ») plutôt qu'un simple tableau : c'est un rapport de classement, une représentation graphique le rend plus lisible qu'une table brute. Garder un lien « voir le détail complet » vers la fiche 2 (Ventes par articles) pour l'utilisateur qui veut aller plus loin que le Top 10.

#### 9 Temps réel ou cache ?

Identique à la fiche 2 : cache par combinaison de filtres, invalidation uniquement si la plage inclut la journée en cours.

---

```{=latex}
\begin{factbox}
Ce document fait partie du pack de documentation technique du Dashboard POS (voir schema\_architecture\_application.png et le guide « De la base de données à l'application web » fournis dans le même lot). Il réutilise les vues déjà définies dans l'analyse principale :
\begin{itemize}
\item \texttt{vw\_ne = ne\_fichier UNION ALL ne\_fichier\_day} (un ticket par ligne)
\item \texttt{vw\_nl = nl\_fichier UNION ALL nl\_fichier\_day} (une ligne de vente par article vendu), reliées par \texttt{chp\_ref\_prim}
\end{itemize}
Ce rapport fonctionne sur une plage \textbf{Date Début / Date Fin} (module Statistiques), au contraire des rapports du dossier « Rapports\_Journaliers » qui portent sur une seule journée.
\end{factbox}
```

### Rapports et analyses : Ventes par famille

#### 1 Informations affichées

`Rapport = Ventes par famille`, mêmes filtres que les fiches précédentes. Tableau plus simple : Désignation (famille), Quantité, Prix HT, Tva, Prix (TTC), %. Cinq familles : Coupe homme (4 205 ; 650 891,21 ; 86 775,56 ; 737 666,77 ; 51,28 pourcent), Esthetique (1 789 ; 363 943,50 ; 48 319,83 ; 412 263,33 ; 28,66 pourcent), Hammam Spa (558 ; 223 723,72 ; 30 676,28 ; 254 400,00 ; 17,68 pourcent), Non classé (109 ; 17 147,46 ; 2 312,54 ; 19 460,00 ; 1,35 pourcent), produits (66 ; 13 188,98 ; 1 591,02 ; 14 780,00 ; 1,03 pourcent). Total général : Quantité 6 727 -- les colonnes monétaires du total affichent 0,00 dans le logiciel existant (Prix HT, Tva, Prix toutes à 0,00), ce qui est visiblement un défaut d'affichage du logiciel existant sur cette ligne précise.

```{=latex}
\begin{factbox}
Double preuve vérifiée sur cette capture :
\begin{enumerate}
\item La somme des 5 valeurs de la colonne « Prix » (737\,666,77 + 412\,263,33 + 254\,400,00 + 19\,460,00 + 14\,780,00) = 1\,438\,570,10, exactement le total C.A. TTC de la fiche « Ventes par articles » sur la même période -- confirme que les deux rapports partagent la même source de données, seulement agrégée à un niveau différent (famille contre article).
\item La colonne « pourcent » correspond bien à la part de chaque famille dans le total \textbf{TTC} (737\,666,77 / 1\,438\,570,10 = 51,28 pourcent) et non dans la quantité (4\,205 / 6\,727 = 62,5 pourcent, qui ne correspond pas à l'affichage). Le calcul du pourcentage doit donc se baser sur le chiffre d'affaires, pas sur les quantités.
\end{enumerate}
\end{factbox}
```

#### 2 -- 4 Tables, colonnes, relations

Identiques à la fiche 2, mais sans jointure à `corres_des` au niveau article : agrégation directe `vw_nl` --> `corres_des.chp_fam` --> `tbl_famille.des`, sans descendre au niveau `des_coresp` individuel.

#### 5 Calculs

Par famille : Quantité = `SUM(chp_qt)` ; Prix HT = `SUM(chp_Tprix_ht)` ; Tva = `SUM(tva_par_article)` ; Prix (TTC) = `SUM(chp_Tprix)` ; % = `Prix famille / SUM(Prix TTC toutes familles) * 100`.

#### 6 Requête SQL

```sql
SELECT f.des                            AS famille,
       SUM(nl.chp_qt)                   AS quantite,
       SUM(nl.chp_Tprix_ht)             AS prix_ht,
       SUM(nl.tva_par_article)          AS tva,
       SUM(nl.chp_Tprix)                AS prix_ttc,
       SUM(nl.chp_Tprix) / SUM(SUM(nl.chp_Tprix)) OVER () * 100 AS pourcentage
FROM vw_nl nl
JOIN corres_des cd ON cd.des_coresp = nl.des_coresp
JOIN tbl_famille f  ON f.num_fam = CAST(cd.chp_fam AS UNSIGNED)
WHERE nl.num_magasin = 1
  AND nl.chp_date BETWEEN :date_debut AND :date_fin
GROUP BY f.des
ORDER BY prix_ttc DESC;
```

#### 7 Implémentation développeur

Calculer réellement le total (au lieu de 0,00) : `SUM(prix_ttc)` sur l'ensemble du résultat, affiché explicitement dans la nouvelle interface. Ne pas reproduire le défaut d'affichage constaté dans le logiciel existant sur la ligne Total de cet écran précis.

#### 8 Architecture d'affichage

C'est exactement la donnée du donut « par famille » du Tableau de bord (fiche 1) : réutiliser le même composant graphique (camembert / donut), complété par un tableau détaillé en dessous pour les valeurs exactes -- combiner visualisation et précision plutôt que de choisir l'un ou l'autre.

#### 9 Temps réel ou cache ?

Identique aux fiches 2 et 3 : cacheable par combinaison de filtres, avec invalidation si la plage inclut aujourd'hui.

---

```{=latex}
\begin{factbox}
Ce document fait partie du pack de documentation technique du Dashboard POS (voir schema\_architecture\_application.png et le guide « De la base de données à l'application web » fournis dans le même lot). Il réutilise les vues déjà définies dans l'analyse principale :
\begin{itemize}
\item \texttt{vw\_ne = ne\_fichier UNION ALL ne\_fichier\_day} (un ticket par ligne)
\item \texttt{vw\_nl = nl\_fichier UNION ALL nl\_fichier\_day} (une ligne de vente par article vendu), reliées par \texttt{chp\_ref\_prim}
\end{itemize}
Ce rapport fonctionne sur une plage \textbf{Date Début / Date Fin} (module Statistiques), au contraire des rapports du dossier « Rapports\_Journaliers » qui portent sur une seule journée.
\end{factbox}
```

### Rapports et analyses : C.A. par vendeur

#### 1 Informations affichées

`Rapport = C.A. par vendeur`, mêmes filtres. Tableau : Vendeur, Nombre tickets, Prix HT, Prix TTC, Moyenne par ticket. Onze vendeurs listés (1-SAID, 2-BRAHIM, 3-MOUNAIM, 5-YOUSSEF, 7-MARIA, 8-NARJISS, 9-AMAL, Z10-RAJAA, Z11-KHADIJA, Z12-SARA, Z13-SPA). Total : 6 949 tickets, 1 268 894,92 HT, 1 438 570,10 TTC.

```{=latex}
\begin{factbox}
Le total HT de cette fiche (1\,268\,894,92) est très proche -- mais pas rigoureusement identique -- au total HT de la fiche « Ventes par articles » (1\,268\,898,29), un écart de 3,37 DH sur 1,27 million (0,0003 pourcent). C'est la preuve que ce rapport est calculé à partir de \texttt{ne\_fichier} (montant global du ticket, champ \texttt{chp\_mont\_ht}) et non en resommant les lignes de \texttt{nl\_fichier} : deux chemins de calcul indépendants, avec un arrondi qui diffère de quelques centimes selon qu'on arrondit par ligne ou par ticket. Le C.A. TTC (1\,438\,570,10), lui, est rigoureusement identique dans les deux rapports.
\end{factbox}
```

#### 2 -- 3 Tables et colonnes

`ne_fichier` / `ne_fichier_day` (`vw_ne`) : `chp_serv` (vendeur), `chp_mont_ht`, `chp_mont` (TTC), `chp_primary` (compte des tickets). `tbl_users_fixe` : `num_user`, `nom_user` (le libellé « 1-SAID », « Z10-RAJAA », etc. correspond très probablement au champ `nom_user` directement, le préfixe numérique / « Z » faisant partie du texte saisi par l'exploitant plutôt qu'un code séparé).

#### 4 Relations

`vw_ne.chp_serv` --> `tbl_users_fixe.num_user` (jointure implicite, sans contrainte déclarée). Noter l'existence d'un second champ, `chp_servenc` (le « serveur encaisseur », potentiellement différent du serveur ayant réalisé la prestation) : à clarifier avec l'éditeur si le rapport doit s'appuyer sur celui qui a exécuté la prestation ou celui qui a encaissé -- pour un institut de beauté, la logique commerciale (commissionnement) pointe vers `chp_serv` (le prestataire), déjà retenu par défaut ici.

#### 5 Calculs

Par vendeur : Nombre tickets = `COUNT(chp_primary)` ; Prix HT = `SUM(chp_mont_ht)` ; Prix TTC = `SUM(chp_mont)` ; Moyenne par ticket = `SUM(chp_mont) / COUNT(chp_primary)`.

#### 6 Requête SQL

```sql
SELECT COALESCE(u.nom_user, CONCAT('Vendeur #', ne.chp_serv)) AS vendeur,
       COUNT(ne.chp_primary)                                  AS nb_tickets,
       SUM(ne.chp_mont_ht)                                    AS prix_ht,
       SUM(ne.chp_mont)                                        AS prix_ttc,
       SUM(ne.chp_mont) / NULLIF(COUNT(ne.chp_primary),0)      AS
         moyenne_par_ticket
FROM vw_ne ne
LEFT JOIN tbl_users_fixe u ON u.num_user = ne.chp_serv AND u.num_magasin =
  ne.num_magasin
WHERE ne.num_magasin = 1
  AND ne.chp_date BETWEEN :date_debut AND :date_fin
GROUP BY ne.chp_serv, u.nom_user
ORDER BY prix_ttc DESC;
```

#### 7 Implémentation développeur

Utiliser un `LEFT JOIN` (pas un `INNER JOIN`) vers `tbl_users_fixe`, car un ticket ancien peut référencer un vendeur depuis supprimé ou renommé -- prévoir un libellé de repli (« Vendeur #12 ») plutôt qu'une ligne manquante. C'est un cas classique du fait que le schéma n'a aucune contrainte de clé étrangère (comme établi dans le document 1) : l'intégrité doit être gérée côté application.

#### 8 Architecture d'affichage

Tableau trié par C.A. décroissant (classement implicite des performances commerciales), avec éventuellement une barre de progression horizontale par ligne pour visualiser rapidement les écarts entre vendeurs -- utile pour un usage managérial (suivi de performance individuelle), sensible en termes d'accès (à réserver aux profils gérants / responsables).

#### 9 Temps réel ou cache ?

Cacheable comme les fiches précédentes ; toutefois, si ce rapport est consulté en fin de journée pour un suivi de performance quotidien, prévoir un rafraîchissement plus fréquent (par exemple toutes les 5 minutes) lorsque la plage inclut aujourd'hui.

---

```{=latex}
\begin{factbox}
Ce document fait partie du pack de documentation technique du Dashboard POS (voir schema\_architecture\_application.png et le guide « De la base de données à l'application web » fournis dans le même lot). Il réutilise les vues déjà définies dans l'analyse principale :
\begin{itemize}
\item \texttt{vw\_ne = ne\_fichier UNION ALL ne\_fichier\_day} (un ticket par ligne)
\item \texttt{vw\_nl = nl\_fichier UNION ALL nl\_fichier\_day} (une ligne de vente par article vendu), reliées par \texttt{chp\_ref\_prim}
\end{itemize}
Ce rapport fonctionne sur une plage \textbf{Date Début / Date Fin} (module Statistiques), au contraire des rapports du dossier « Rapports\_Journaliers » qui portent sur une seule journée.
\end{factbox}
```

### Rapports et analyses : Rapport pointeuse

#### 1 Informations affichées

`Rapport = Rapport pointeuse`, mêmes filtres de date. Tableau : Vendeur, Nb heures, Coût. Six employés, tous à 01:02 (heures) et 0,00 DH (coût). En bas : Coût total 0,00 DH, « Masse Salariale / CA HT » 0 pourcent, « Masse Salariale / CA TTC » 0 pourcent.

```{=latex}
\begin{warnbox}
Cette fiche est la seule des six où les données semblent \textbf{non représentatives de l'activité réelle} : une durée de 01:02 identique pour six employés différents ressemble à une valeur de test ou de démonstration, pas à un relevé de pointeuse réel. Avant de bâtir un widget de « masse salariale » dans le nouveau dashboard, il faut vérifier avec le client si la pointeuse est réellement utilisée au quotidien dans ce commerce, et si un coût horaire (\texttt{cout\_hr}) a un jour été renseigné pour au moins un employé.
\end{warnbox}
```

#### 2 -- 3 Tables et colonnes

`tbl_pointeuse` : `id_serveur`, `chp_date`, `date_heure_demarre`, `date_heure_arret`, `cout_hr` (taux horaire au moment du pointage). `tbl_users_fixe` : `num_user`, `nom_user`, `cout_hr` (taux horaire courant de l'employé -- un second champ du même nom existe sur cette table, potentiellement le taux par défaut si celui du pointage est absent).

#### 4 Relations

`tbl_pointeuse.id_serveur` --> `tbl_users_fixe.num_user`. Le rapport croise ensuite ce résultat avec le chiffre d'affaires de la période, calculé depuis `vw_ne` (indépendamment du vendeur, sur l'ensemble du magasin) pour les deux ratios du bas de tableau.

#### 5 Calculs

Nb heures (par employé) = `SUM(TIMESTAMPDIFF(SECOND, date_heure_demarre, date_heure_arret)) / 3600`. Coût (par employé) = `SUM(TIMESTAMPDIFF(SECOND, date_heure_demarre, date_heure_arret) / 3600 * COALESCE(NULLIF(cout_hr_pointage,0), cout_hr_employe))`. Masse Salariale / CA HT = `SUM(coût de tous les employés) / SUM(chp_mont_ht sur la période, tout le magasin) * 100`. Masse Salariale / CA TTC = idem avec `chp_mont`.

#### 6 Requête SQL

```sql
-- Heures et coût par employé
SELECT u.nom_user,
       SUM(TIMESTAMPDIFF(SECOND, p.date_heure_demarre, p.date_heure_arret))
         / 3600 AS nb_heures,
       SUM(TIMESTAMPDIFF(SECOND, p.date_heure_demarre, p.date_heure_arret) /
         3600
           * COALESCE(NULLIF(p.cout_hr, 0), u.cout_hr))
             AS cout
FROM tbl_pointeuse p
JOIN tbl_users_fixe u ON u.num_user = p.id_serveur AND u.num_magasin =
  p.num_magasin
WHERE p.num_magasin = 1
  AND p.chp_date BETWEEN :date_debut AND :date_fin
  AND p.date_heure_arret IS NOT NULL
GROUP BY u.num_user, u.nom_user;

-- Ratio masse salariale / CA (sur l'ensemble du magasin, même période)
SELECT
  (SELECT SUM(TIMESTAMPDIFF(SECOND, p.date_heure_demarre,
    p.date_heure_arret) / 3600
              * COALESCE(NULLIF(p.cout_hr, 0), u.cout_hr))
   FROM tbl_pointeuse p JOIN tbl_users_fixe u ON u.num_user = p.id_serveur
   WHERE p.num_magasin = 1 AND p.chp_date BETWEEN :date_debut AND :date_fin)
  / NULLIF((SELECT SUM(chp_mont_ht) FROM vw_ne
            WHERE num_magasin = 1 AND chp_date BETWEEN :date_debut AND
              :date_fin), 0)
  * 100 AS masse_salariale_sur_ca_ht;
```

#### 7 Implémentation développeur

Exclure les pointages en cours (`date_heure_arret IS NULL`, employé encore « pointé » au moment de la requête) du calcul de coût, mais les signaler séparément dans l'interface (« en cours de service »). Prévoir un écran de configuration du taux horaire par employé dans `tbl_users_fixe.cout_hr`, car sans cette donnée renseignée, ce rapport restera à 0 pourcent quel que soit le développement effectué.

#### 8 Architecture d'affichage

Deux indicateurs KPI en tête (Masse salariale / CA HT, Masse salariale / CA TTC) suivis d'un tableau détaillé par employé (heures, coût). Ce widget a plus de valeur pour un gérant que pour un usage quotidien : le placer dans un onglet ou une section « Ressources humaines » plutôt qu'au premier plan du tableau de bord principal.

#### 9 Temps réel ou cache ?

Peu volatile (les pointages sont saisis a posteriori) : cache de quelques minutes suffisant, même sur la journée en cours, sauf si l'entreprise utilise le pointage pour un suivi de présence en direct.

---

```{=latex}
\begin{factbox}
Ce document fait partie du pack de documentation technique du Dashboard POS (voir schema\_architecture\_application.png et le guide « De la base de données à l'application web » fournis dans le même lot). Il réutilise les vues déjà définies dans l'analyse principale :
\begin{itemize}
\item \texttt{vw\_ne = ne\_fichier UNION ALL ne\_fichier\_day} (un ticket par ligne)
\item \texttt{vw\_nl = nl\_fichier UNION ALL nl\_fichier\_day} (une ligne de vente par article vendu), reliées par \texttt{chp\_ref\_prim}
\end{itemize}
Ce rapport fonctionne sur une plage \textbf{Date Début / Date Fin} (module Statistiques), au contraire des rapports du dossier « Rapports\_Journaliers » qui portent sur une seule journée.
\end{factbox}
```


# Clôture du document

```{=latex}
\begin{factbox}
Ce document regroupe l'intégralité des livrables produits pour le projet Dashboard POS jusqu'au 22 juillet 2026 : vision du projet, architecture technique, analyse complète de la base de données, plan officiel de développement en 22 étapes, et toutes les fiches pratiques par écran et par rapport (journaliers et par période). C'est la seule référence à suivre pour démarrer et poursuivre le développement.
\end{factbox}
```
