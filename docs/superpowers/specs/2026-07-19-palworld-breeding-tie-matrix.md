# Palworld Breeding Step-3 Tie Matrix — higher-rank rule vs CombiDuplicatePriority

Date: 2026-07-19. Companion to the data audit (section 10-F breeding tie-break) and the
deferred-systems plan section 9. **Purpose: every possible equal-distance tie, with example
parent pairs to hatch in game**, so the tie-break direction can be verified case by case
instead of relying on a handful of past hatches.

## Setup

- Child = eligible species whose `CombiRank` is nearest to `target = floor((rankA+rankB+1)/2)`.
- A **step-3 tie** occurs when `target` is exactly midway between two adjacent eligible ranks.
- Eligible pool: 183 species (combo-only children and IgnoreCombi legendaries excluded).
  Every pool rank is held by exactly one species, and **within the pool
  `CombiDuplicatePriority = CombiRank x 100` with zero exceptions** - so ordering by the
  priority is identical to ordering by rank.

## The two methods

| method | tie pick | equivalent to |
|---|---|---|
| **current engine (since 2026-07-19)**: CombiDuplicatePriority **descending** | **higher rank** (pool priority = rank x 100) | the previously verified higher-rank rule |
| CombiDuplicatePriority ascending (lower wins) | **lower rank** | the mirror hypothesis this matrix can falsify |

Because priority = rank x 100 in the pool, the two candidate orderings are mirror images:
**they disagree on every one of the 182 ties below.** One in-game hatch of ANY row settles
the global direction; hatching a spread of rows guards against the rule being non-uniform.

Example parents avoid unique-combo pairs (which override rank-average breeding) and prefer
low-Paldeck (early-game) pals. `target` is what floor((rankA+rankB+1)/2) must equal - any
other parent pair summing to 2 x target works too.

## Tie matrix (182 ties)

| # | target | lower candidate (rank) | higher candidate (rank) | higher-rank pick | dup-asc pick | example parents (rankA+rankB) |
|---|---|---|---|---|---|---|
| 1 | 130 | Aegidron (30) | Ophydia (230) | **Ophydia** | Aegidron | Hartalis + Jormuntide Ignis (90+170); Dandilord + Tetroise Primo (60+200) |
| 2 | 245 | Ophydia (230) | Knocklem (260) | **Knocklem** | Ophydia | Bastigor + Elgrove Cryst (50+440); Frostallion Noct + Moldron Cryst (110+380) |
| 3 | 270 | Knocklem (260) | Solenne (280) | **Solenne** | Knocklem | Blazamut Ryu + Elgrove Cryst (100+440); Jormuntide Ignis + Whalaska Ignis (170+370) |
| 4 | 285 | Solenne (280) | Renjishi (290) | **Renjishi** | Solenne | Aegidron + Univolt Cryst (30+540); Blazamut Ryu + Cryolinx Terra (100+470) |
| 5 | 295 | Renjishi (290) | Eidrolon (300) | **Eidrolon** | Renjishi | Bastigor + Univolt Cryst (50+540); Knocklem Ignis + Moldron Cryst (210+380) |
| 6 | 345 | Eidrolon (300) | Flaracle (390) | **Flaracle** | Eidrolon | Dualith Noct + Elgrove Cryst (250+440); Frostallion + Univolt Cryst (150+540) |
| 7 | 400 | Flaracle (390) | Blazamut (410) | **Blazamut** | Flaracle | Knocklem + Univolt Cryst (260+540); Jormuntide Ignis + Warsect Terra (170+630) |
| 8 | 415 | Blazamut (410) | Azurmane (420) | **Azurmane** | Blazamut | Dualith Noct + Beakon Cryst (250+580); Renjishi + Univolt Cryst (290+540) |
| 9 | 450 | Azurmane (420) | Anubis (480) | **Anubis** | Azurmane | Elgrove Cryst + Pierdon Cryst (440+460); Selyne + Univolt Cryst (360+540) |
| 10 | 485 | Anubis (480) | Astegon (490) | **Astegon** | Anubis | Starryon Primo + Univolt Cryst (430+540); Moldron Cryst + Jormuntide (380+590) |
| 11 | 500 | Astegon (490) | Dualith (510) | **Dualith** | Astegon | Pierdon Cryst + Univolt Cryst (460+540); Blazamut Ryu + Fenglope Lux (100+900) |
| 12 | 515 | Dualith (510) | Dupin (520) | **Dupin** | Dualith | Elgrove Cryst + Jormuntide (440+590); Astegon + Univolt Cryst (490+540) |
| 13 | 525 | Dupin (520) | Roujay (530) | **Roujay** | Dupin | Dualith + Univolt Cryst (510+540); Elgrove Cryst + Wumpo Botan (440+610) |
| 14 | 545 | Roujay (530) | Silvegis (560) | **Silvegis** | Roujay | Elgrove Cryst + Sibelyx Primo (440+650); Dualith Noct + Bushi Noct (250+840) |
| 15 | 575 | Silvegis (560) | Jormuntide (590) | **Jormuntide** | Silvegis | Univolt Cryst + Wumpo Botan (540+610); Moldron Cryst + Relaxaurus Lux (380+770) |
| 16 | 600 | Jormuntide (590) | Wumpo Botan (610) | **Wumpo Botan** | Jormuntide | Moldron Cryst + Petallia Ignis (380+820); Blazamut Ryu + Polapup Terra (100+1100) |
| 17 | 660 | Wumpo Botan (610) | Whalaska (710) | **Whalaska** | Wumpo Botan | Blazamut Ryu + Azurobe Cryst (100+1220); Elgrove Cryst + Ghangler (440+880) |
| 18 | 720 | Whalaska (710) | Gildane (730) | **Gildane** | Whalaska | Univolt Cryst + Fenglope Lux (540+900); Beakon Cryst + Frostplume (580+860) |
| 19 | 740 | Gildane (730) | Moldron (750) | **Moldron** | Gildane | Moldron Cryst + Polapup Terra (380+1100); Beakon Cryst + Fenglope Lux (580+900) |
| 20 | 755 | Moldron (750) | Mycora (760) | **Mycora** | Moldron | Elgrove Cryst + Mammorest Cryst (440+1070); Moldron Cryst + Helzephyr (380+1130) |
| 21 | 770 | Mycora (760) | Splatterina (780) | **Splatterina** | Mycora | Elgrove Cryst + Polapup Terra (440+1100); Beakon Cryst + Helzephyr Lux (580+960) |
| 22 | 785 | Splatterina (780) | Tetroise  (790) | **Tetroise ** | Splatterina | Elgrove Cryst + Helzephyr (440+1130); Univolt Cryst + Braloha (540+1030) |
| 23 | 800 | Tetroise  (790) | Lapure (810) | **Lapure** | Tetroise  | Moldron Cryst + Azurobe Cryst (380+1220); Menasting Terra + Helzephyr Lux (640+960) |
| 24 | 820 | Lapure (810) | Wumpo (830) | **Wumpo** | Lapure | Univolt Cryst + Polapup Terra (540+1100); Kitsun Noct + Bushi Noct (800+840) |
| 25 | 845 | Wumpo (830) | Frostplume (860) | **Frostplume** | Wumpo | Cryolinx Terra + Azurobe Cryst (470+1220); Univolt Cryst + Starryon (540+1150) |
| 26 | 865 | Frostplume (860) | Sekhmet (870) | **Sekhmet** | Frostplume | Elgrove Cryst + Loupmoon Cryst (440+1290); Tetroise Primo + Kingpaca Cryst (200+1530) |
| 27 | 875 | Sekhmet (870) | Ghangler (880) | **Ghangler** | Sekhmet | Elgrove Cryst + Incineram Noct (440+1310); Univolt Cryst + Quivern (540+1210) |
| 28 | 885 | Ghangler (880) | Loomen (890) | **Loomen** | Ghangler | Elgrove Cryst + Turtacle Terra (440+1330); Menasting Terra + Helzephyr (640+1130) |
| 29 | 930 | Loomen (890) | Venusa (970) | **Venusa** | Loomen | Menasting Terra + Azurobe Cryst (640+1220); Fenglope Lux + Helzephyr Lux (900+960) |
| 30 | 975 | Venusa (970) | Sootseer (980) | **Sootseer** | Venusa | Univolt Cryst + Leafan (540+1410); Blazamut Ryu + Penking Lux (100+1850) |
| 31 | 995 | Sootseer (980) | Majex (1010) | **Majex** | Sootseer | Relaxaurus Lux + Azurobe Cryst (770+1220); Pierdon Cryst + Kingpaca Cryst (460+1530) |
| 32 | 1020 | Majex (1010) | Braloha (1030) | **Braloha** | Majex | Petallia Ignis + Azurobe Cryst (820+1220); Dualith + Kingpaca Cryst (510+1530) |
| 33 | 1035 | Braloha (1030) | Cryolinx (1040) | **Cryolinx** | Braloha | Univolt Cryst + Kingpaca Cryst (540+1530); Elgrove Cryst + Gloopie Primo (440+1630) |
| 34 | 1045 | Cryolinx (1040) | Ragnahawk (1050) | **Ragnahawk** | Cryolinx | Elgrove Cryst + Vanwyrm (440+1650); Helzephyr Lux + Helzephyr (960+1130) |
| 35 | 1055 | Ragnahawk (1050) | Reptyro (1060) | **Reptyro** | Ragnahawk | Beakon Cryst + Kingpaca Cryst (580+1530); Univolt Cryst + Felbat (540+1570) |
| 36 | 1075 | Reptyro (1060) | Relaxaurus (1090) | **Relaxaurus** | Reptyro | Petallia Ignis + Turtacle Terra (820+1330); Beakon Cryst + Felbat (580+1570) |
| 37 | 1100 | Relaxaurus (1090) | Pierdon (1110) | **Pierdon** | Relaxaurus | Univolt Cryst + Polapup (540+1660); Relaxaurus Lux + Vanwyrm Cryst (770+1430) |
| 38 | 1115 | Pierdon (1110) | Menasting (1120) | **Menasting** | Pierdon | Fenglope Lux + Turtacle Terra (900+1330); Moldron Cryst + Penking Lux (380+1850) |
| 39 | 1125 | Menasting (1120) | Helzephyr (1130) | **Helzephyr** | Menasting | Ghangler Ignis + Kingpaca Cryst (720+1530); Helzephyr Lux + Loupmoon Cryst (960+1290) |
| 40 | 1135 | Helzephyr (1130) | Omascul (1140) | **Omascul** | Helzephyr | Elgrove Cryst + Azurobe (440+1830); Univolt Cryst + Tarantriss (540+1730) |
| 41 | 1145 | Omascul (1140) | Starryon (1150) | **Starryon** | Omascul | Elgrove Cryst + Penking Lux (440+1850); Helzephyr Lux + Turtacle Terra (960+1330) |
| 42 | 1155 | Starryon (1150) | Verdash (1160) | **Verdash** | Starryon | Relaxaurus + Azurobe Cryst (1090+1220); Pierdon Cryst + Penking Lux (460+1850) |
| 43 | 1165 | Verdash (1160) | Gildra (1170) | **Gildra** | Verdash | Univolt Cryst + Elizabee (540+1790); Kitsun Noct + Kingpaca Cryst (800+1530) |
| 44 | 1175 | Gildra (1170) | Wistella (1180) | **Wistella** | Gildra | Petallia Ignis + Kingpaca Cryst (820+1530); Helzephyr + Azurobe Cryst (1130+1220) |
| 45 | 1185 | Wistella (1180) | Bulldosu (1190) | **Bulldosu** | Wistella | Univolt Cryst + Azurobe (540+1830); Bushi Noct + Kingpaca Cryst (840+1530) |
| 46 | 1195 | Bulldosu (1190) | Suzaku (1200) | **Suzaku** | Bulldosu | Univolt Cryst + Penking Lux (540+1850); Polapup Terra + Loupmoon Cryst (1100+1290) |
| 47 | 1205 | Suzaku (1200) | Quivern (1210) | **Quivern** | Suzaku | Ghangler + Kingpaca Cryst (880+1530); Beakon Cryst + Azurobe (580+1830) |
| 48 | 1220 | Quivern (1210) | Nitemary (1230) | **Nitemary** | Quivern | Beakon Cryst + Croajiro Noct (580+1860); Jormuntide + Penking Lux (590+1850) |
| 49 | 1235 | Nitemary (1230) | Palumba (1240) | **Palumba** | Nitemary | Elgrove Cryst + Woolipop Terra (440+2030); Jormuntide Ignis + Fuack Ignis (170+2300) |
| 50 | 1245 | Palumba (1240) | Nyafia (1250) | **Nyafia** | Palumba | Helzephyr Lux + Kingpaca Cryst (960+1530); Menasting Terra + Penking Lux (640+1850) |
| 51 | 1255 | Nyafia (1250) | Icelyn (1260) | **Icelyn** | Nyafia | Azurobe Cryst + Loupmoon Cryst (1220+1290); Elgrove Cryst + Penking (440+2070) |
| 52 | 1270 | Icelyn (1260) | Warsect (1280) | **Warsect** | Icelyn | Majex + Kingpaca Cryst (1010+1530); Fenglope Lux + Elphidran Aqua (900+1640) |
| 53 | 1310 | Warsect (1280) | Mammorest (1340) | **Mammorest** | Warsect | Loupmoon Cryst + Turtacle Terra (1290+1330); Relaxaurus Lux + Penking Lux (770+1850) |
| 54 | 1345 | Mammorest (1340) | Tropicaw (1350) | **Tropicaw** | Mammorest | Univolt Cryst + Sweepa (540+2150); Bushi Noct + Penking Lux (840+1850) |
| 55 | 1355 | Tropicaw (1350) | Blazehowl (1360) | **Blazehowl** | Tropicaw | Menasting Terra + Penking (640+2070); Azurobe Cryst + Wixen Noct (1220+1490) |
| 56 | 1365 | Blazehowl (1360) | Solmora (1370) | **Solmora** | Blazehowl | Ghangler + Penking Lux (880+1850); Polapup Terra + Gloopie Primo (1100+1630) |
| 57 | 1375 | Solmora (1370) | Broncherry (1380) | **Broncherry** | Solmora | Azurobe Cryst + Kingpaca Cryst (1220+1530); Fenglope Lux + Penking Lux (900+1850) |
| 58 | 1385 | Broncherry (1380) | Prunelia (1390) | **Prunelia** | Broncherry | Loupmoon Cryst + Vaelet (1290+1480); Palumba + Kingpaca Cryst (1240+1530) |
| 59 | 1395 | Prunelia (1390) | Dynamoff (1400) | **Dynamoff** | Prunelia | Univolt Cryst + Wispaw (540+2250); Azurobe Cryst + Felbat (1220+1570) |
| 60 | 1405 | Dynamoff (1400) | Leafan (1410) | **Leafan** | Dynamoff | Helzephyr Lux + Penking Lux (960+1850); Turtacle Terra + Vaelet (1330+1480) |
| 61 | 1415 | Leafan (1410) | Skutlass (1420) | **Skutlass** | Leafan | Polapup Terra + Tarantriss (1100+1730); Quivern Botan + Kingpaca Cryst (1300+1530) |
| 62 | 1435 | Skutlass (1420) | Shroomer Noct (1450) | **Shroomer Noct** | Skutlass | Azurobe Cryst + Vanwyrm (1220+1650); Mammorest + Kingpaca Cryst (1340+1530) |
| 63 | 1455 | Shroomer Noct (1450) | Dogen (1460) | **Dogen** | Shroomer Noct | Bushi Noct + Penking (840+2070); Univolt Cryst + Cawgnito (540+2370) |
| 64 | 1465 | Dogen (1460) | Incineram (1470) | **Incineram** | Dogen | Mammorest Cryst + Croajiro Noct (1070+1860); Elgrove Cryst + Pengullet Lux (440+2490) |
| 65 | 1475 | Incineram (1470) | Vaelet (1480) | **Vaelet** | Incineram | Polapup Terra + Penking Lux (1100+1850); Univolt Cryst + Turtacle (540+2410) |
| 66 | 1495 | Vaelet (1480) | Prixter (1510) | **Prixter** | Vaelet | Helzephyr + Croajiro Noct (1130+1860); Turtacle Terra + Polapup (1330+1660) |
| 67 | 1515 | Prixter (1510) | Shroomer (1520) | **Shroomer** | Prixter | Univolt Cryst + Pengullet Lux (540+2490); Helzephyr Lux + Penking (960+2070) |
| 68 | 1530 | Shroomer (1520) | Bakemi (1540) | **Bakemi** | Shroomer | Univolt Cryst + Amione (540+2520); Bushi Noct + Kingpaca (840+2220) |
| 69 | 1545 | Bakemi (1540) | Digtoise (1550) | **Digtoise** | Bakemi | Kingpaca Cryst + Bushi (1530+1560); Univolt Cryst + Gobfin (540+2550) |
| 70 | 1555 | Digtoise (1550) | Bushi (1560) | **Bushi** | Digtoise | Univolt Cryst + Galeclaw (540+2570); Vaelet + Gloopie Primo (1480+1630) |
| 71 | 1565 | Bushi (1560) | Felbat (1570) | **Felbat** | Bushi | Univolt Cryst + Jellroy (540+2590); Polapup Terra + Woolipop Terra (1100+2030) |
| 72 | 1610 | Felbat (1570) | Vanwyrm (1650) | **Vanwyrm** | Felbat | Univolt Cryst + Direhowl (540+2680); Bushi Noct + Celaray Lux (840+2380) |
| 73 | 1655 | Vanwyrm (1650) | Polapup (1660) | **Polapup** | Vanwyrm | Univolt Cryst + Killamari (540+2770); Petallia Ignis + Pengullet Lux (820+2490) |
| 74 | 1665 | Polapup (1660) | Kitsun (1670) | **Kitsun** | Polapup | Vaelet + Penking Lux (1480+1850); Univolt Cryst + Fuddler (540+2790) |
| 75 | 1675 | Kitsun (1670) | Lapiron (1680) | **Lapiron** | Kitsun | Wixen Noct + Croajiro Noct (1490+1860); Univolt Cryst + Kelpsea (540+2810) |
| 76 | 1685 | Lapiron (1680) | Beakon (1690) | **Beakon** | Lapiron | Univolt Cryst + Tanzee Ignis (540+2830); Azurobe Cryst + Sweepa (1220+2150) |
| 77 | 1695 | Beakon (1690) | Carnibora (1700) | **Carnibora** | Beakon | Kingpaca Cryst + Croajiro Noct (1530+1860); Univolt Cryst + Jolthog Cryst (540+2850) |
| 78 | 1705 | Carnibora (1700) | Maraith (1710) | **Maraith** | Carnibora | Univolt Cryst + Rooby (540+2870); Elgrove Cryst + Clovee (440+2970) |
| 79 | 1715 | Maraith (1710) | Petallia (1720) | **Petallia** | Maraith | Univolt Cryst + Cremis (540+2890); Felbat + Croajiro Noct (1570+1860) |
| 80 | 1725 | Petallia (1720) | Tarantriss (1730) | **Tarantriss** | Petallia | Univolt Cryst + Daedream (540+2910); Mammorest Cryst + Celaray Lux (1070+2380) |
| 81 | 1740 | Tarantriss (1730) | Slowatt (1750) | **Slowatt** | Tarantriss | Gloopie Primo + Penking Lux (1630+1850); Univolt Cryst + Hoocrates (540+2940) |
| 82 | 1755 | Slowatt (1750) | Smokie (1760) | **Smokie** | Slowatt | Univolt Cryst + Clovee (540+2970); Vanwyrm + Croajiro Noct (1650+1860) |
| 83 | 1765 | Smokie (1760) | Hoodle (1770) | **Hoodle** | Smokie | Univolt Cryst + Foxparks (540+2990); Fenglope Lux + Herbil (900+2630) |
| 84 | 1775 | Hoodle (1770) | Snock (1780) | **Snock** | Hoodle | Turtacle Terra + Kingpaca (1330+2220); Vaelet + Penking (1480+2070) |
| 85 | 1785 | Snock (1780) | Elizabee (1790) | **Elizabee** | Snock | Univolt Cryst + Jolthog (540+3030); Gloopie Primo + Caprity Noct (1630+1940) |
| 86 | 1800 | Elizabee (1790) | Sibelyx (1810) | **Sibelyx** | Elizabee | Kingpaca Cryst + Penking (1530+2070); Azurobe Cryst + Celaray Lux (1220+2380) |
| 87 | 1820 | Sibelyx (1810) | Azurobe (1830) | **Azurobe** | Sibelyx | Kingpaca Cryst + Loupmoon (1530+2110); Felbat + Penking (1570+2070) |
| 88 | 1865 | Azurobe (1830) | Valentail (1900) | **Valentail** | Azurobe | Vanwyrm Cryst + Fuack Ignis (1430+2300); Azurobe Cryst + Hangyu Cryst (1220+2510) |
| 89 | 1910 | Valentail (1900) | Rayhound (1920) | **Rayhound** | Valentail | Azurobe Cryst + Croajiro (1220+2600); Turtacle Terra + Pengullet Lux (1330+2490) |
| 90 | 1925 | Rayhound (1920) | Reindrix (1930) | **Reindrix** | Rayhound | Azurobe Cryst + Herbil (1220+2630); Gloopie Primo + Kingpaca (1630+2220) |
| 91 | 1945 | Reindrix (1930) | Fenglope (1960) | **Fenglope** | Reindrix | Croajiro Noct + Woolipop Terra (1860+2030); Loupmoon Cryst + Croajiro (1290+2600) |
| 92 | 1965 | Fenglope (1960) | Foxcicle (1970) | **Foxcicle** | Fenglope | Croajiro Noct + Penking (1860+2070); Turtacle Terra + Croajiro (1330+2600) |
| 93 | 1975 | Foxcicle (1970) | Pyrin (1980) | **Pyrin** | Foxcicle | Vanwyrm + Fuack Ignis (1650+2300); Felbat + Celaray Lux (1570+2380) |
| 94 | 1985 | Pyrin (1980) | Lullu (1990) | **Lullu** | Pyrin | Croajiro Noct + Loupmoon (1860+2110); Azurobe Cryst + Mau Cryst (1220+2750) |
| 95 | 1995 | Lullu (1990) | Souffline (2000) | **Souffline** | Lullu | Kingpaca Cryst + Ribbuny Botan (1530+2460); Azurobe Cryst + Killamari (1220+2770) |
| 96 | 2005 | Souffline (2000) | Lunaris (2010) | **Lunaris** | Souffline | Croajiro Noct + Sweepa (1860+2150); Caprity Noct + Penking (1940+2070) |
| 97 | 2015 | Lunaris (2010) | Elgrove (2020) | **Elgrove** | Lunaris | Kingpaca Cryst + Foxparks Cryst (1530+2500); Turtacle Terra + Flambelle (1330+2700) |
| 98 | 2030 | Elgrove (2020) | Katress (2040) | **Katress** | Elgrove | Kingpaca Cryst + Gloopie (1530+2530); Vanwyrm Cryst + Herbil (1430+2630) |
| 99 | 2050 | Katress (2040) | Mossanda (2060) | **Mossanda** | Katress | Woolipop Terra + Penking (2030+2070); Turtacle Terra + Killamari (1330+2770) |
| 100 | 2065 | Mossanda (2060) | Penking (2070) | **Penking** | Mossanda | Kingpaca Cryst + Croajiro (1530+2600); Azurobe + Fuack Ignis (1830+2300) |
| 101 | 2075 | Penking (2070) | Wixen (2080) | **Wixen** | Penking | Penking Lux + Fuack Ignis (1850+2300); Azurobe Cryst + Pupperai (1220+2930) |
| 102 | 2085 | Wixen (2080) | Lovander (2090) | **Lovander** | Wixen | Azurobe Cryst + Gumoss (1220+2950); Vanwyrm Cryst + Celaray (1430+2740) |
| 103 | 2095 | Lovander (2090) | Dinossom (2100) | **Dinossom** | Lovander | Azurobe Cryst + Clovee (1220+2970); Vanwyrm Cryst + Cattiva (1430+2760) |
| 104 | 2105 | Dinossom (2100) | Loupmoon (2110) | **Loupmoon** | Dinossom | Azurobe + Celaray Lux (1830+2380); Kingpaca Cryst + Direhowl (1530+2680) |
| 105 | 2115 | Loupmoon (2110) | Grintale (2120) | **Grintale** | Loupmoon | Penking Lux + Celaray Lux (1850+2380); Kingpaca Cryst + Flambelle (1530+2700) |
| 106 | 2125 | Grintale (2120) | Munchill (2130) | **Munchill** | Grintale | Kingpaca Cryst + Melpaca (1530+2720); Azurobe Cryst + Jolthog (1220+3030) |
| 107 | 2135 | Munchill (2130) | Gorirat (2140) | **Gorirat** | Munchill | Kingpaca Cryst + Celaray (1530+2740); Azurobe Cryst + Lamball (1220+3050) |
| 108 | 2145 | Gorirat (2140) | Sweepa (2150) | **Sweepa** | Gorirat | Kingpaca Cryst + Cattiva (1530+2760); Penking + Kingpaca (2070+2220) |
| 109 | 2180 | Sweepa (2150) | Dazemu (2210) | **Dazemu** | Sweepa | Croajiro Noct + Foxparks Cryst (1860+2500); Kingpaca Cryst + Tanzee Ignis (1530+2830) |
| 110 | 2215 | Dazemu (2210) | Kingpaca (2220) | **Kingpaca** | Dazemu | Kingpaca Cryst + Tanzee (1530+2900); Azurobe + Croajiro (1830+2600) |
| 111 | 2225 | Kingpaca (2220) | Yakumo (2230) | **Yakumo** | Kingpaca | Penking + Celaray Lux (2070+2380); Penking Lux + Croajiro (1850+2600) |
| 112 | 2240 | Yakumo (2230) | Wispaw (2250) | **Wispaw** | Yakumo | Penking Lux + Herbil (1850+2630); Kingpaca Cryst + Gumoss (1530+2950) |
| 113 | 2255 | Wispaw (2250) | Robinquill (2260) | **Robinquill** | Wispaw | Kingpaca Cryst + Fuack (1530+2980); Croajiro Noct + Jelliette (1860+2650) |
| 114 | 2265 | Robinquill (2260) | Univolt (2270) | **Univolt** | Robinquill | Kingpaca Cryst + Depresso (1530+3000); Sweepa + Celaray Lux (2150+2380) |
| 115 | 2275 | Univolt (2270) | Elphidran (2280) | **Elphidran** | Univolt | Kingpaca Cryst + Lifmunk (1530+3020); Penking Lux + Flambelle (1850+2700) |
| 116 | 2285 | Elphidran (2280) | Dumud (2290) | **Dumud** | Elphidran | Penking Lux + Melpaca (1850+2720); Croajiro Noct + Eikthyrdeer (1860+2710) |
| 117 | 2300 | Dumud (2290) | Kikit (2310) | **Kikit** | Dumud | Croajiro Noct + Celaray (1860+2740); Kingpaca + Celaray Lux (2220+2380) |
| 118 | 2315 | Kikit (2310) | Arsox (2320) | **Arsox** | Kikit | Croajiro Noct + Killamari (1860+2770); Woolipop Terra + Croajiro (2030+2600) |
| 119 | 2325 | Arsox (2320) | Chillet (2330) | **Chillet** | Arsox | Croajiro Noct + Fuddler (1860+2790); Penking + Eikthyrdeer Terra (2070+2580) |
| 120 | 2335 | Chillet (2330) | Tombat (2340) | **Tombat** | Chillet | Penking + Croajiro (2070+2600); Croajiro Noct + Kelpsea (1860+2810) |
| 121 | 2345 | Tombat (2340) | Beegarde (2350) | **Beegarde** | Tombat | Croajiro Noct + Tanzee Ignis (1860+2830); Penking Lux + Swee (1850+2840) |
| 122 | 2355 | Beegarde (2350) | Puffolt (2360) | **Puffolt** | Beegarde | Croajiro Noct + Jolthog Cryst (1860+2850); Kingpaca + Pengullet Lux (2220+2490) |
| 123 | 2365 | Puffolt (2360) | Cawgnito (2370) | **Cawgnito** | Puffolt | Croajiro Noct + Rooby (1860+2870); Penking Lux + Rushoar (1850+2880) |
| 124 | 2380 | Cawgnito (2370) | Snugloo (2390) | **Snugloo** | Cawgnito | Croajiro Noct + Tanzee (1860+2900); Penking Lux + Daedream (1850+2910) |
| 125 | 2395 | Snugloo (2390) | Dazzi (2400) | **Dazzi** | Snugloo | Croajiro Noct + Pupperai (1860+2930); Fuack Ignis + Pengullet Lux (2300+2490) |
| 126 | 2405 | Dazzi (2400) | Turtacle (2410) | **Turtacle** | Dazzi | Croajiro Noct + Gumoss (1860+2950); Penking + Celaray (2070+2740) |
| 127 | 2415 | Turtacle (2410) | Needoll (2420) | **Needoll** | Turtacle | Penking + Cattiva (2070+2760); Penking Lux + Fuack (1850+2980) |
| 128 | 2430 | Needoll (2420) | Surfent (2440) | **Surfent** | Needoll | Croajiro Noct + Depresso (1860+3000); Penking + Fuddler (2070+2790) |
| 129 | 2445 | Surfent (2440) | Finsider (2450) | **Finsider** | Surfent | Croajiro Noct + Jolthog (1860+3030); Sweepa + Celaray (2150+2740) |
| 130 | 2460 | Finsider (2450) | Kelpsea Ignis (2470) | **Kelpsea Ignis** | Finsider | Croajiro Noct + Vixy (1860+3060); Penking Lux + Teafant (1850+3070) |
| 131 | 2475 | Kelpsea Ignis (2470) | Muffly (2480) | **Muffly** | Kelpsea Ignis | Penking + Rushoar (2070+2880); Fuack Ignis + Jelliette (2300+2650) |
| 132 | 2500 | Muffly (2480) | Amione (2520) | **Amione** | Muffly | Fuack Ignis + Flambelle (2300+2700); Penking + Pupperai (2070+2930) |
| 133 | 2525 | Amione (2520) | Gloopie (2530) | **Gloopie** | Amione | Penking + Fuack (2070+2980); Fuack Ignis + Mau Cryst (2300+2750) |
| 134 | 2540 | Gloopie (2530) | Gobfin (2550) | **Gobfin** | Gloopie | Celaray Lux + Flambelle (2380+2700); Woolipop Terra + Lamball (2030+3050) |
| 135 | 2555 | Gobfin (2550) | Nitewing (2560) | **Nitewing** | Gobfin | Kingpaca + Cremis (2220+2890); Woolipop Terra + Chikipi (2030+3080) |
| 136 | 2565 | Nitewing (2560) | Galeclaw (2570) | **Galeclaw** | Nitewing | Penking + Vixy (2070+3060); Fuack Ignis + Tanzee Ignis (2300+2830) |
| 137 | 2580 | Galeclaw (2570) | Jellroy (2590) | **Jellroy** | Galeclaw | Kingpaca + Hoocrates (2220+2940); Celaray Lux + Hangyu (2380+2780) |
| 138 | 2595 | Jellroy (2590) | Croajiro (2600) | **Croajiro** | Jellroy | Fuack Ignis + Cremis (2300+2890); Kingpaca + Clovee (2220+2970) |
| 139 | 2605 | Croajiro (2600) | Caprity (2610) | **Caprity** | Croajiro | Fuack Ignis + Daedream (2300+2910); Celaray Lux + Tanzee Ignis (2380+2830) |
| 140 | 2615 | Caprity (2610) | Cinnamoth (2620) | **Cinnamoth** | Caprity | Fuack Ignis + Pupperai (2300+2930); Croajiro + Herbil (2600+2630) |
| 141 | 2625 | Cinnamoth (2620) | Herbil (2630) | **Herbil** | Cinnamoth | Fuack Ignis + Gumoss (2300+2950); Pengullet Lux + Cattiva (2490+2760) |
| 142 | 2640 | Herbil (2630) | Jelliette (2650) | **Jelliette** | Herbil | Fuack Ignis + Fuack (2300+2980); Kingpaca + Vixy (2220+3060) |
| 143 | 2655 | Jelliette (2650) | Flopie (2660) | **Flopie** | Jelliette | Celaray Lux + Pupperai (2380+2930); Croajiro + Eikthyrdeer (2600+2710) |
| 144 | 2665 | Flopie (2660) | Leezpunk (2670) | **Leezpunk** | Flopie | Celaray Lux + Gumoss (2380+2950); Fuack Ignis + Jolthog (2300+3030) |
| 145 | 2675 | Leezpunk (2670) | Direhowl (2680) | **Direhowl** | Leezpunk | Fuack Ignis + Lamball (2300+3050); Celaray Lux + Clovee (2380+2970) |
| 146 | 2685 | Direhowl (2680) | Bristla (2690) | **Bristla** | Direhowl | Fuack Ignis + Teafant (2300+3070); Herbil + Celaray (2630+2740) |
| 147 | 2695 | Bristla (2690) | Flambelle (2700) | **Flambelle** | Bristla | Herbil + Cattiva (2630+2760); Foxparks Cryst + Cremis (2500+2890) |
| 148 | 2705 | Flambelle (2700) | Eikthyrdeer (2710) | **Eikthyrdeer** | Flambelle | Celaray Lux + Jolthog (2380+3030); Pengullet Lux + Nox (2490+2920) |
| 149 | 2715 | Eikthyrdeer (2710) | Melpaca (2720) | **Melpaca** | Eikthyrdeer | Celaray Lux + Lamball (2380+3050); Croajiro + Tanzee Ignis (2600+2830) |
| 150 | 2725 | Melpaca (2720) | Tocotoco (2730) | **Tocotoco** | Melpaca | Celaray Lux + Teafant (2380+3070); Croajiro + Jolthog Cryst (2600+2850) |
| 151 | 2735 | Tocotoco (2730) | Celaray (2740) | **Celaray** | Tocotoco | Pengullet Lux + Fuack (2490+2980); Eikthyrdeer + Cattiva (2710+2760) |
| 152 | 2750 | Celaray (2740) | Cattiva (2760) | **Cattiva** | Celaray | Celaray + Cattiva (2740+2760); Croajiro + Tanzee (2600+2900) |
| 153 | 2765 | Cattiva (2760) | Killamari (2770) | **Killamari** | Cattiva | Croajiro + Pupperai (2600+2930); Cattiva + Killamari (2760+2770) |
| 154 | 2775 | Killamari (2770) | Hangyu (2780) | **Hangyu** | Killamari | Croajiro + Gumoss (2600+2950); Pengullet Lux + Vixy (2490+3060) |
| 155 | 2785 | Hangyu (2780) | Fuddler (2790) | **Fuddler** | Hangyu | Pengullet Lux + Chikipi (2490+3080); Croajiro + Clovee (2600+2970) |
| 156 | 2795 | Fuddler (2790) | Mozzarina (2800) | **Mozzarina** | Fuddler | Celaray + Jolthog Cryst (2740+2850); Cattiva + Tanzee Ignis (2760+2830) |
| 157 | 2805 | Mozzarina (2800) | Kelpsea (2810) | **Kelpsea** | Mozzarina | Herbil + Fuack (2630+2980); Cattiva + Jolthog Cryst (2760+2850) |
| 158 | 2815 | Kelpsea (2810) | Woolipop (2820) | **Woolipop** | Kelpsea | Celaray + Cremis (2740+2890); Croajiro + Jolthog (2600+3030) |
| 159 | 2830 | Woolipop (2820) | Swee (2840) | **Swee** | Woolipop | Croajiro + Vixy (2600+3060); Herbil + Jolthog (2630+3030) |
| 160 | 2850 | Swee (2840) | Ribbuny (2860) | **Ribbuny** | Swee | Herbil + Teafant (2630+3070); Cattiva + Hoocrates (2760+2940) |
| 161 | 2865 | Ribbuny (2860) | Rooby (2870) | **Rooby** | Ribbuny | Cattiva + Clovee (2760+2970); Mau Cryst + Fuack (2750+2980) |
| 162 | 2875 | Rooby (2870) | Rushoar (2880) | **Rushoar** | Rooby | Flambelle + Lamball (2700+3050); Cattiva + Foxparks (2760+2990) |
| 163 | 2885 | Rushoar (2880) | Cremis (2890) | **Cremis** | Rushoar | Melpaca + Lamball (2720+3050); Celaray + Jolthog (2740+3030) |
| 164 | 2895 | Cremis (2890) | Tanzee (2900) | **Tanzee** | Cremis | Celaray + Lamball (2740+3050); Cattiva + Jolthog (2760+3030) |
| 165 | 2905 | Tanzee (2900) | Daedream (2910) | **Daedream** | Tanzee | Cattiva + Lamball (2760+3050); Celaray + Teafant (2740+3070) |
| 166 | 2915 | Daedream (2910) | Nox (2920) | **Nox** | Daedream | Cattiva + Teafant (2760+3070); Jolthog Cryst + Fuack (2850+2980) |
| 167 | 2925 | Nox (2920) | Pupperai (2930) | **Pupperai** | Nox | Cremis + Pengullet (2890+2960); Tanzee Ignis + Lifmunk (2830+3020) |
| 168 | 2935 | Pupperai (2930) | Hoocrates (2940) | **Hoocrates** | Pupperai | Cremis + Fuack (2890+2980); Jolthog Cryst + Lifmunk (2850+3020) |
| 169 | 2945 | Hoocrates (2940) | Gumoss (2950) | **Gumoss** | Hoocrates | Cremis + Depresso (2890+3000); Daedream + Fuack (2910+2980) |
| 170 | 2955 | Gumoss (2950) | Pengullet (2960) | **Pengullet** | Gumoss | Cremis + Lifmunk (2890+3020); Pupperai + Fuack (2930+2980) |
| 171 | 2965 | Pengullet (2960) | Clovee (2970) | **Clovee** | Pengullet | Gumoss + Fuack (2950+2980); Jolthog Cryst + Chikipi (2850+3080) |
| 172 | 2975 | Clovee (2970) | Fuack (2980) | **Fuack** | Clovee | Cremis + Vixy (2890+3060); Pupperai + Lifmunk (2930+3020) |
| 173 | 2985 | Fuack (2980) | Foxparks (2990) | **Foxparks** | Fuack | Cremis + Chikipi (2890+3080); Gumoss + Lifmunk (2950+3020) |
| 174 | 2995 | Foxparks (2990) | Depresso (3000) | **Depresso** | Foxparks | Clovee + Lifmunk (2970+3020); Pupperai + Vixy (2930+3060) |
| 175 | 3005 | Depresso (3000) | Sparkit (3010) | **Sparkit** | Depresso | Pupperai + Chikipi (2930+3080); Gumoss + Vixy (2950+3060) |
| 176 | 3015 | Sparkit (3010) | Lifmunk (3020) | **Lifmunk** | Sparkit | Fuack + Lamball (2980+3050); Gumoss + Chikipi (2950+3080) |
| 177 | 3025 | Lifmunk (3020) | Jolthog (3030) | **Jolthog** | Lifmunk | Fuack + Teafant (2980+3070); Clovee + Chikipi (2970+3080) |
| 178 | 3035 | Jolthog (3030) | Mau (3040) | **Mau** | Jolthog | Lifmunk + Lamball (3020+3050); Depresso + Teafant (3000+3070) |
| 179 | 3045 | Mau (3040) | Lamball (3050) | **Lamball** | Mau | Lifmunk + Teafant (3020+3070); Jolthog + Vixy (3030+3060) |
| 180 | 3055 | Lamball (3050) | Vixy (3060) | **Vixy** | Lamball | Lamball + Vixy (3050+3060); Jolthog + Chikipi (3030+3080) |
| 181 | 3065 | Vixy (3060) | Teafant (3070) | **Teafant** | Vixy | Lamball + Chikipi (3050+3080); Vixy + Teafant (3060+3070) |
| 182 | 3075 | Teafant (3070) | Chikipi (3080) | **Chikipi** | Teafant | Teafant + Chikipi (3070+3080); Lamball + Green Slime (3050+3100) |

## How to use

1. Pick a row, breed the example parents, hatch the egg. The high-target rows (#170+) use
   early-game starters (Lamball / Vixy / Teafant / Chikipi) - cheapest to test.
2. Child = the **higher-rank pick** column -> current engine correct (priority read descending,
   as implemented in lib/breeding.ts).
3. Child = the **dup-asc pick** column -> flip the engine to read the priority ascending.
4. Anything else -> the pair hit an unhandled special case; note the parents and child.

Caveat: examples listing legendaries (Frostallion, ...) or Yakushima-collab parents (Green
Slime, ...) assume those species breed as normal rank-average parents - if the game refuses
the pair, use any other two parents whose ranks sum to 2 x target.

## Appendix — 9 subspecies probes (stronger than any tie)

Across the WHOLE table, `CombiDuplicatePriority = CombiRank x 100` for 743 of 753 IsPal
rows. The 10 exceptions: `BOSS_KingWhale_otomo` (699, non-breedable codename) and the 9
element subspecies below, which carry tiny sequential priorities (571-581). They are
combo-only children; our engine excludes them from rank-average candidates entirely.

None of their ranks collides with an eligible rank, so a parent pair whose target lands
EXACTLY on a subspecies rank discriminates harder than any tie: if the game included them
as candidates, the subspecies would win at distance 0 **regardless of tie-break
direction**; if (as community lore says) they never hatch from rank-average, the nearest
normal species (third column) should appear, proving the game excludes them like our engine.

| subspecies (rank, dup) | target | engine predicts (dist) | if subspecies hatches | example parents |
|---|---|---|---|---|
| Turtacle Terra (1330, 577) | 1330 | **Mammorest** (1340, ±10) | engine must include subspecies as candidates | Aegidron + Herbil (30+2630); Knocklem + Dazzi (260+2400) |
| Pengullet Lux (2490, 572) | 2490 | **Muffly** (2480, ±10) | engine must include subspecies as candidates | Valentail + Chikipi (1900+3080); Rayhound + Vixy (1920+3060) |
| Azurobe Cryst (1220, 578) | 1220 | **Quivern** (1210, ±10) | engine must include subspecies as candidates | Aegidron + Turtacle (30+2410); Ophydia + Dazemu (230+2210) |
| Fuack Ignis (2300, 575) | 2300 | **Dumud** (2290, ±10) | engine must include subspecies as candidates | Shroomer + Chikipi (1520+3080); Bakemi + Vixy (1540+3060) |
| Killamari Primo (2540, 571) | 2540 | **Gloopie** (2530, ±10) | engine must include subspecies as candidates | Souffline + Chikipi (2000+3080); Lunaris + Teafant (2010+3070) |
| Penking Lux (1850, 573) | 1850 | **Azurobe** (1830, ±20) | engine must include subspecies as candidates | Whalaska + Foxparks (710+2990); Gildane + Clovee (730+2970) |
| Celaray Lux (2380, 574) | 2380 | **Cawgnito** (2370, ±10) | engine must include subspecies as candidates | Lapiron + Chikipi (1680+3080); Beakon + Teafant (1690+3070) |
| Dumud Gild (1620, 576) | 1620 | **Vanwyrm** (1650, ±30) | engine must include subspecies as candidates | Ophydia + Sparkit (230+3010); Knocklem + Fuack (260+2980) |
| Finsider Ignis (2240, 581) | 2240 | **Yakumo** (2230, ±10) | engine must include subspecies as candidates | Dynamoff + Chikipi (1400+3080); Leafan + Teafant (1410+3070) |
