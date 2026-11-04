# Twins that approve themselves

Live sweep of both venues on 2026-11-04 (read-only dry run, scripts/twins-dry.ts). swept 234147 Polymarket, 167187 Kalshi markets; 1400 twins found, 1007 approve themselves.

All five fields matched from structured exchange data: same league game (team codes + game date), same side, the same exact line, resolution sources on the same domain, close times within 36 hours. The other 393 (every race, and anything matched from title text or with a field missing) wait in /admin/twins.

| League | Kind | Twins |
|---|---|---|
| NBA | moneyline | 27 |
| NBA | spread | 324 |
| NBA | total | 344 |
| NFL | moneyline | 16 |
| NFL | spread | 199 |
| NFL | total | 69 |
| NHL | moneyline | 28 |

## NBA moneyline (27)

| Polymarket | Kalshi | Kalshi ticker |
|---|---|---|
| Hawks vs. Wizards | Atlanta wins | `KXNBAGAME-26NOV04ATLWAS-ATL` |
| Hornets vs. Nets | Charlotte wins | `KXNBAGAME-26NOV04CHABKN-CHA` |
| Bulls vs. Knicks | Chicago wins | `KXNBAGAME-26NOV04CHINYK-CHI` |
| Cavaliers vs. Thunder | Cleveland wins | `KXNBAGAME-26NOV04CLEOKC-CLE` |
| Mavericks vs. Spurs | Dallas wins | `KXNBAGAME-26NOV04DALSAS-DAL` |
| Pacers vs. Grizzlies | Indiana wins | `KXNBAGAME-26NOV04INDMEM-IND` |
| Bucks vs. Celtics | Milwaukee wins | `KXNBAGAME-26NOV04MILBOS-MIL` |
| Timberwolves vs. Rockets | Minnesota wins | `KXNBAGAME-26NOV04MINHOU-MIN` |
| 76ers vs. Pistons | Philadelphia wins | `KXNBAGAME-26NOV04PHIDET-PHI` |
| Trail Blazers vs. Suns | Portland wins | `KXNBAGAME-26NOV04PORPHX-POR` |
| Raptors vs. Nuggets | Toronto wins | `KXNBAGAME-26NOV04TORDEN-TOR` |
| Jazz vs. Pelicans | Utah wins | `KXNBAGAME-26NOV04UTANOP-UTA` |
| Heat vs. Warriors | Miami wins | `KXNBAGAME-26NOV05MIAGSW-MIA` |
| Magic vs. Suns | Orlando wins | `KXNBAGAME-26NOV05ORLPHX-ORL` |
| Timberwolves vs. Pelicans | Minnesota wins | `KXNBAGAME-26NOV06MINNOP-MIN` |
| Thunder vs. Grizzlies | Oklahoma City wins | `KXNBAGAME-26NOV06OKCMEM-OKC` |
| 76ers vs. Cavaliers | Philadelphia wins | `KXNBAGAME-26NOV06PHICLE-PHI` |
| Spurs vs. Kings | San Antonio wins | `KXNBAGAME-26NOV06SASSAC-SAS` |
| Raptors vs. Bucks | Toronto wins | `KXNBAGAME-26NOV06TORMIL-TOR` |
| Jazz vs. Mavericks | Utah wins | `KXNBAGAME-26NOV06UTADAL-UTA` |
| Wizards vs. Hawks | Washington wins | `KXNBAGAME-26NOV06WASATL-WAS` |
| Nets vs. Hawks | Brooklyn wins | `KXNBAGAME-26NOV07BKNATL-BKN` |
| Nuggets vs. Pacers | Denver wins | `KXNBAGAME-26NOV07DENIND-DEN` |
| Rockets vs. Suns | Houston wins | `KXNBAGAME-26NOV07HOUPHX-HOU` |
| Knicks vs. Cavaliers | New York wins | `KXNBAGAME-26NOV07NYKCLE-NYK` |
| Magic vs. Warriors | Orlando wins | `KXNBAGAME-26NOV07ORLGSW-ORL` |
| Wizards vs. Thunder | Washington wins | `KXNBAGAME-26NOV07WASOKC-WAS` |

## NBA spread (324)

| Polymarket | Kalshi | Kalshi ticker |
|---|---|---|
| Spread: Hawks (-9.5) | Atlanta wins by over 9.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL10` |
| Spread: Hawks (-11.5) | Atlanta wins by over 11.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL12` |
| Spread: Hawks (-13.5) | Atlanta wins by over 13.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL14` |
| Spread: Hawks (-15.5) | Atlanta wins by over 15.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL16` |
| Spread: Hawks (-17.5) | Atlanta wins by over 17.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL18` |
| Spread: Hawks (-1.5) | Atlanta wins by over 1.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL2` |
| Spread: Hawks (-19.5) | Atlanta wins by over 19.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL20` |
| Spread: Hawks (-21.5) | Atlanta wins by over 21.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL22` |
| Spread: Hawks (-23.5) | Atlanta wins by over 23.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL24` |
| Spread: Hawks (-25.5) | Atlanta wins by over 25.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL26` |
| Spread: Hawks (-27.5) | Atlanta wins by over 27.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL28` |
| Spread: Hawks (-2.5) | Atlanta wins by over 2.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL3` |
| Spread: Hawks (-3.5) | Atlanta wins by over 3.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL4` |
| Spread: Hawks (-4.5) | Atlanta wins by over 4.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL5` |
| Spread: Hawks (-5.5) | Atlanta wins by over 5.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL6` |
| Spread: Hawks (-6.5) | Atlanta wins by over 6.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL7` |
| Spread: Hawks (-7.5) | Atlanta wins by over 7.5 points | `KXNBASPREAD-26NOV04ATLWAS-ATL8` |
| Spread: Wizards (-10.5) | Washington wins by over 10.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS11` |
| Spread: Wizards (-12.5) | Washington wins by over 12.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS13` |
| Spread: Wizards (-14.5) | Washington wins by over 14.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS15` |
| Spread: Wizards (-16.5) | Washington wins by over 16.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS17` |
| Spread: Wizards (-18.5) | Washington wins by over 18.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS19` |
| Spread: Wizards (-1.5) | Washington wins by over 1.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS2` |
| Spread: Wizards (-20.5) | Washington wins by over 20.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS21` |
| Spread: Wizards (-22.5) | Washington wins by over 22.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS23` |
| Spread: Wizards (-24.5) | Washington wins by over 24.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS25` |
| Spread: Wizards (-26.5) | Washington wins by over 26.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS27` |
| Spread: Wizards (-2.5) | Washington wins by over 2.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS3` |
| Spread: Wizards (-3.5) | Washington wins by over 3.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS4` |
| Spread: Wizards (-4.5) | Washington wins by over 4.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS5` |
| Spread: Wizards (-6.5) | Washington wins by over 6.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS7` |
| Spread: Wizards (-8.5) | Washington wins by over 8.5 points | `KXNBASPREAD-26NOV04ATLWAS-WAS9` |
| Spread: Nets (-9.5) | Brooklyn wins by over 9.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN10` |
| Spread: Nets (-11.5) | Brooklyn wins by over 11.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN12` |
| Spread: Nets (-13.5) | Brooklyn wins by over 13.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN14` |
| Spread: Nets (-15.5) | Brooklyn wins by over 15.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN16` |
| Spread: Nets (-17.5) | Brooklyn wins by over 17.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN18` |
| Spread: Nets (-1.5) | Brooklyn wins by over 1.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN2` |
| Spread: Nets (-19.5) | Brooklyn wins by over 19.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN20` |
| Spread: Nets (-21.5) | Brooklyn wins by over 21.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN22` |
| Spread: Nets (-23.5) | Brooklyn wins by over 23.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN24` |
| Spread: Nets (-25.5) | Brooklyn wins by over 25.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN26` |
| Spread: Nets (-2.5) | Brooklyn wins by over 2.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN3` |
| Spread: Nets (-3.5) | Brooklyn wins by over 3.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN4` |
| Spread: Nets (-5.5) | Brooklyn wins by over 5.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN6` |
| Spread: Nets (-7.5) | Brooklyn wins by over 7.5 points | `KXNBASPREAD-26NOV04CHABKN-BKN8` |
| Spread: Hornets (-10.5) | Charlotte wins by over 10.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA11` |
| Spread: Hornets (-12.5) | Charlotte wins by over 12.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA13` |
| Spread: Hornets (-14.5) | Charlotte wins by over 14.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA15` |
| Spread: Hornets (-16.5) | Charlotte wins by over 16.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA17` |
| Spread: Hornets (-18.5) | Charlotte wins by over 18.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA19` |
| Spread: Hornets (-1.5) | Charlotte wins by over 1.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA2` |
| Spread: Hornets (-20.5) | Charlotte wins by over 20.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA21` |
| Spread: Hornets (-22.5) | Charlotte wins by over 22.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA23` |
| Spread: Hornets (-24.5) | Charlotte wins by over 24.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA25` |
| Spread: Hornets (-26.5) | Charlotte wins by over 26.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA27` |
| Spread: Hornets (-28.5) | Charlotte wins by over 28.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA29` |
| Spread: Hornets (-2.5) | Charlotte wins by over 2.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA3` |
| Spread: Hornets (-3.5) | Charlotte wins by over 3.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA4` |
| Spread: Hornets (-4.5) | Charlotte wins by over 4.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA5` |
| Spread: Hornets (-5.5) | Charlotte wins by over 5.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA6` |
| Spread: Hornets (-6.5) | Charlotte wins by over 6.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA7` |
| Spread: Hornets (-7.5) | Charlotte wins by over 7.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA8` |
| Spread: Hornets (-8.5) | Charlotte wins by over 8.5 points | `KXNBASPREAD-26NOV04CHABKN-CHA9` |
| Spread: Bulls (-9.5) | Chicago wins by over 9.5 points | `KXNBASPREAD-26NOV04CHINYK-CHI10` |
| Spread: Bulls (-11.5) | Chicago wins by over 11.5 points | `KXNBASPREAD-26NOV04CHINYK-CHI12` |
| Spread: Bulls (-13.5) | Chicago wins by over 13.5 points | `KXNBASPREAD-26NOV04CHINYK-CHI14` |
| Spread: Bulls (-1.5) | Chicago wins by over 1.5 points | `KXNBASPREAD-26NOV04CHINYK-CHI2` |
| Spread: Bulls (-3.5) | Chicago wins by over 3.5 points | `KXNBASPREAD-26NOV04CHINYK-CHI4` |
| Spread: Bulls (-5.5) | Chicago wins by over 5.5 points | `KXNBASPREAD-26NOV04CHINYK-CHI6` |
| Spread: Bulls (-7.5) | Chicago wins by over 7.5 points | `KXNBASPREAD-26NOV04CHINYK-CHI8` |
| Spread: Knicks (-9.5) | New York wins by over 9.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK10` |
| Spread: Knicks (-10.5) | New York wins by over 10.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK11` |
| Spread: Knicks (-11.5) | New York wins by over 11.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK12` |
| Spread: Knicks (-12.5) | New York wins by over 12.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK13` |
| Spread: Knicks (-13.5) | New York wins by over 13.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK14` |
| Spread: Knicks (-14.5) | New York wins by over 14.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK15` |
| Spread: Knicks (-15.5) | New York wins by over 15.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK16` |
| Spread: Knicks (-16.5) | New York wins by over 16.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK17` |
| Spread: Knicks (-17.5) | New York wins by over 17.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK18` |
| Spread: Knicks (-18.5) | New York wins by over 18.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK19` |
| Spread: Knicks (-20.5) | New York wins by over 20.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK21` |
| Spread: Knicks (-22.5) | New York wins by over 22.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK23` |
| Spread: Knicks (-24.5) | New York wins by over 24.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK25` |
| Spread: Knicks (-26.5) | New York wins by over 26.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK27` |
| Spread: Knicks (-28.5) | New York wins by over 28.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK29` |
| Spread: Knicks (-2.5) | New York wins by over 2.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK3` |
| Spread: Knicks (-30.5) | New York wins by over 30.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK31` |
| Spread: Knicks (-32.5) | New York wins by over 32.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK33` |
| Spread: Knicks (-34.5) | New York wins by over 34.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK35` |
| Spread: Knicks (-36.5) | New York wins by over 36.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK37` |
| Spread: Knicks (-38.5) | New York wins by over 38.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK39` |
| Spread: Knicks (-4.5) | New York wins by over 4.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK5` |
| Spread: Knicks (-6.5) | New York wins by over 6.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK7` |
| Spread: Knicks (-7.5) | New York wins by over 7.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK8` |
| Spread: Knicks (-8.5) | New York wins by over 8.5 points | `KXNBASPREAD-26NOV04CHINYK-NYK9` |
| Spread: Cavaliers (-9.5) | Cleveland wins by over 9.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE10` |
| Spread: Cavaliers (-11.5) | Cleveland wins by over 11.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE12` |
| Spread: Cavaliers (-13.5) | Cleveland wins by over 13.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE14` |
| Spread: Cavaliers (-15.5) | Cleveland wins by over 15.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE16` |
| Spread: Cavaliers (-17.5) | Cleveland wins by over 17.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE18` |
| Spread: Cavaliers (-1.5) | Cleveland wins by over 1.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE2` |
| Spread: Cavaliers (-19.5) | Cleveland wins by over 19.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE20` |
| Spread: Cavaliers (-21.5) | Cleveland wins by over 21.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE22` |
| Spread: Cavaliers (-23.5) | Cleveland wins by over 23.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE24` |
| Spread: Cavaliers (-25.5) | Cleveland wins by over 25.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE26` |
| Spread: Cavaliers (-2.5) | Cleveland wins by over 2.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE3` |
| Spread: Cavaliers (-3.5) | Cleveland wins by over 3.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE4` |
| Spread: Cavaliers (-5.5) | Cleveland wins by over 5.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE6` |
| Spread: Cavaliers (-7.5) | Cleveland wins by over 7.5 points | `KXNBASPREAD-26NOV04CLEOKC-CLE8` |
| Spread: Thunder (-10.5) | Oklahoma City wins by over 10.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC11` |
| Spread: Thunder (-12.5) | Oklahoma City wins by over 12.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC13` |
| Spread: Thunder (-14.5) | Oklahoma City wins by over 14.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC15` |
| Spread: Thunder (-16.5) | Oklahoma City wins by over 16.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC17` |
| Spread: Thunder (-18.5) | Oklahoma City wins by over 18.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC19` |
| Spread: Thunder (-1.5) | Oklahoma City wins by over 1.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC2` |
| Spread: Thunder (-20.5) | Oklahoma City wins by over 20.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC21` |
| Spread: Thunder (-22.5) | Oklahoma City wins by over 22.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC23` |
| Spread: Thunder (-24.5) | Oklahoma City wins by over 24.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC25` |
| Spread: Thunder (-26.5) | Oklahoma City wins by over 26.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC27` |
| Spread: Thunder (-28.5) | Oklahoma City wins by over 28.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC29` |
| Spread: Thunder (-2.5) | Oklahoma City wins by over 2.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC3` |
| Spread: Thunder (-3.5) | Oklahoma City wins by over 3.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC4` |
| Spread: Thunder (-4.5) | Oklahoma City wins by over 4.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC5` |
| Spread: Thunder (-5.5) | Oklahoma City wins by over 5.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC6` |
| Spread: Thunder (-6.5) | Oklahoma City wins by over 6.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC7` |
| Spread: Thunder (-7.5) | Oklahoma City wins by over 7.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC8` |
| Spread: Thunder (-8.5) | Oklahoma City wins by over 8.5 points | `KXNBASPREAD-26NOV04CLEOKC-OKC9` |
| Spread: Spurs (-9.5) | San Antonio wins by over 9.5 points | `KXNBASPREAD-26NOV04DALSAS-SAS10` |
| Spread: Spurs (-10.5) | San Antonio wins by over 10.5 points | `KXNBASPREAD-26NOV04DALSAS-SAS11` |
| Spread: Spurs (-11.5) | San Antonio wins by over 11.5 points | `KXNBASPREAD-26NOV04DALSAS-SAS12` |
| Spread: Spurs (-12.5) | San Antonio wins by over 12.5 points | `KXNBASPREAD-26NOV04DALSAS-SAS13` |
| Spread: Spurs (-13.5) | San Antonio wins by over 13.5 points | `KXNBASPREAD-26NOV04DALSAS-SAS14` |
| Spread: Spurs (-14.5) | San Antonio wins by over 14.5 points | `KXNBASPREAD-26NOV04DALSAS-SAS15` |
| Spread: Spurs (-15.5) | San Antonio wins by over 15.5 points | `KXNBASPREAD-26NOV04DALSAS-SAS16` |
| Spread: Spurs (-16.5) | San Antonio wins by over 16.5 points | `KXNBASPREAD-26NOV04DALSAS-SAS17` |
| Spread: Spurs (-17.5) | San Antonio wins by over 17.5 points | `KXNBASPREAD-26NOV04DALSAS-SAS18` |
| Spread: Spurs (-1.5) | San Antonio wins by over 1.5 points | `KXNBASPREAD-26NOV04DALSAS-SAS2` |
| Spread: Spurs (-6.5) | San Antonio wins by over 6.5 points | `KXNBASPREAD-26NOV04DALSAS-SAS7` |
| Spread: Spurs (-7.5) | San Antonio wins by over 7.5 points | `KXNBASPREAD-26NOV04DALSAS-SAS8` |
| Spread: Spurs (-8.5) | San Antonio wins by over 8.5 points | `KXNBASPREAD-26NOV04DALSAS-SAS9` |
| Spread: Pacers (-9.5) | Indiana wins by over 9.5 points | `KXNBASPREAD-26NOV04INDMEM-IND10` |
| Spread: Pacers (-11.5) | Indiana wins by over 11.5 points | `KXNBASPREAD-26NOV04INDMEM-IND12` |
| Spread: Pacers (-13.5) | Indiana wins by over 13.5 points | `KXNBASPREAD-26NOV04INDMEM-IND14` |
| Spread: Pacers (-15.5) | Indiana wins by over 15.5 points | `KXNBASPREAD-26NOV04INDMEM-IND16` |
| Spread: Pacers (-17.5) | Indiana wins by over 17.5 points | `KXNBASPREAD-26NOV04INDMEM-IND18` |
| Spread: Pacers (-1.5) | Indiana wins by over 1.5 points | `KXNBASPREAD-26NOV04INDMEM-IND2` |
| Spread: Pacers (-19.5) | Indiana wins by over 19.5 points | `KXNBASPREAD-26NOV04INDMEM-IND20` |
| Spread: Pacers (-21.5) | Indiana wins by over 21.5 points | `KXNBASPREAD-26NOV04INDMEM-IND22` |
| Spread: Pacers (-3.5) | Indiana wins by over 3.5 points | `KXNBASPREAD-26NOV04INDMEM-IND4` |
| Spread: Pacers (-5.5) | Indiana wins by over 5.5 points | `KXNBASPREAD-26NOV04INDMEM-IND6` |
| Spread: Pacers (-7.5) | Indiana wins by over 7.5 points | `KXNBASPREAD-26NOV04INDMEM-IND8` |
| Spread: Grizzlies (-9.5) | Memphis wins by over 9.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM10` |
| Spread: Grizzlies (-10.5) | Memphis wins by over 10.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM11` |
| Spread: Grizzlies (-11.5) | Memphis wins by over 11.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM12` |
| Spread: Grizzlies (-12.5) | Memphis wins by over 12.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM13` |
| Spread: Grizzlies (-14.5) | Memphis wins by over 14.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM15` |
| Spread: Grizzlies (-16.5) | Memphis wins by over 16.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM17` |
| Spread: Grizzlies (-18.5) | Memphis wins by over 18.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM19` |
| Spread: Grizzlies (-1.5) | Memphis wins by over 1.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM2` |
| Spread: Grizzlies (-20.5) | Memphis wins by over 20.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM21` |
| Spread: Grizzlies (-22.5) | Memphis wins by over 22.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM23` |
| Spread: Grizzlies (-24.5) | Memphis wins by over 24.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM25` |
| Spread: Grizzlies (-26.5) | Memphis wins by over 26.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM27` |
| Spread: Grizzlies (-28.5) | Memphis wins by over 28.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM29` |
| Spread: Grizzlies (-2.5) | Memphis wins by over 2.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM3` |
| Spread: Grizzlies (-30.5) | Memphis wins by over 30.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM31` |
| Spread: Grizzlies (-32.5) | Memphis wins by over 32.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM33` |
| Spread: Grizzlies (-3.5) | Memphis wins by over 3.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM4` |
| Spread: Grizzlies (-4.5) | Memphis wins by over 4.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM5` |
| Spread: Grizzlies (-5.5) | Memphis wins by over 5.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM6` |
| Spread: Grizzlies (-6.5) | Memphis wins by over 6.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM7` |
| Spread: Grizzlies (-7.5) | Memphis wins by over 7.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM8` |
| Spread: Grizzlies (-8.5) | Memphis wins by over 8.5 points | `KXNBASPREAD-26NOV04INDMEM-MEM9` |
| Spread: Celtics (-9.5) | Boston wins by over 9.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS10` |
| Spread: Celtics (-10.5) | Boston wins by over 10.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS11` |
| Spread: Celtics (-11.5) | Boston wins by over 11.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS12` |
| Spread: Celtics (-12.5) | Boston wins by over 12.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS13` |
| Spread: Celtics (-13.5) | Boston wins by over 13.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS14` |
| Spread: Celtics (-14.5) | Boston wins by over 14.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS15` |
| Spread: Celtics (-15.5) | Boston wins by over 15.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS16` |
| Spread: Celtics (-16.5) | Boston wins by over 16.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS17` |
| Spread: Celtics (-17.5) | Boston wins by over 17.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS18` |
| Spread: Celtics (-18.5) | Boston wins by over 18.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS19` |
| Spread: Celtics (-19.5) | Boston wins by over 19.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS20` |
| Spread: Celtics (-20.5) | Boston wins by over 20.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS21` |
| Spread: Celtics (-22.5) | Boston wins by over 22.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS23` |
| Spread: Celtics (-24.5) | Boston wins by over 24.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS25` |
| Spread: Celtics (-26.5) | Boston wins by over 26.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS27` |
| Spread: Celtics (-28.5) | Boston wins by over 28.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS29` |
| Spread: Celtics (-2.5) | Boston wins by over 2.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS3` |
| Spread: Celtics (-30.5) | Boston wins by over 30.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS31` |
| Spread: Celtics (-32.5) | Boston wins by over 32.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS33` |
| Spread: Celtics (-34.5) | Boston wins by over 34.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS35` |
| Spread: Celtics (-36.5) | Boston wins by over 36.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS37` |
| Spread: Celtics (-38.5) | Boston wins by over 38.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS39` |
| Spread: Celtics (-40.5) | Boston wins by over 40.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS41` |
| Spread: Celtics (-4.5) | Boston wins by over 4.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS5` |
| Spread: Celtics (-6.5) | Boston wins by over 6.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS7` |
| Spread: Celtics (-8.5) | Boston wins by over 8.5 points | `KXNBASPREAD-26NOV04MILBOS-BOS9` |
| Spread: Bucks (-9.5) | Milwaukee wins by over 9.5 points | `KXNBASPREAD-26NOV04MILBOS-MIL10` |
| Spread: Bucks (-11.5) | Milwaukee wins by over 11.5 points | `KXNBASPREAD-26NOV04MILBOS-MIL12` |
| Spread: Bucks (-1.5) | Milwaukee wins by over 1.5 points | `KXNBASPREAD-26NOV04MILBOS-MIL2` |
| Spread: Bucks (-3.5) | Milwaukee wins by over 3.5 points | `KXNBASPREAD-26NOV04MILBOS-MIL4` |
| Spread: Bucks (-5.5) | Milwaukee wins by over 5.5 points | `KXNBASPREAD-26NOV04MILBOS-MIL6` |
| Spread: Bucks (-7.5) | Milwaukee wins by over 7.5 points | `KXNBASPREAD-26NOV04MILBOS-MIL8` |
| Spread: Rockets (-9.5) | Houston wins by over 9.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU10` |
| Spread: Rockets (-10.5) | Houston wins by over 10.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU11` |
| Spread: Rockets (-11.5) | Houston wins by over 11.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU12` |
| Spread: Rockets (-12.5) | Houston wins by over 12.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU13` |
| Spread: Rockets (-13.5) | Houston wins by over 13.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU14` |
| Spread: Rockets (-14.5) | Houston wins by over 14.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU15` |
| Spread: Rockets (-15.5) | Houston wins by over 15.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU16` |
| Spread: Rockets (-17.5) | Houston wins by over 17.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU18` |
| Spread: Rockets (-1.5) | Houston wins by over 1.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU2` |
| Spread: Rockets (-19.5) | Houston wins by over 19.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU20` |
| Spread: Rockets (-21.5) | Houston wins by over 21.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU22` |
| Spread: Rockets (-23.5) | Houston wins by over 23.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU24` |
| Spread: Rockets (-25.5) | Houston wins by over 25.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU26` |
| Spread: Rockets (-27.5) | Houston wins by over 27.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU28` |
| Spread: Rockets (-29.5) | Houston wins by over 29.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU30` |
| Spread: Rockets (-31.5) | Houston wins by over 31.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU32` |
| Spread: Rockets (-33.5) | Houston wins by over 33.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU34` |
| Spread: Rockets (-35.5) | Houston wins by over 35.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU36` |
| Spread: Rockets (-3.5) | Houston wins by over 3.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU4` |
| Spread: Rockets (-4.5) | Houston wins by over 4.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU5` |
| Spread: Rockets (-5.5) | Houston wins by over 5.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU6` |
| Spread: Rockets (-6.5) | Houston wins by over 6.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU7` |
| Spread: Rockets (-7.5) | Houston wins by over 7.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU8` |
| Spread: Rockets (-8.5) | Houston wins by over 8.5 points | `KXNBASPREAD-26NOV04MINHOU-HOU9` |
| Spread: Timberwolves (-10.5) | Minnesota wins by over 10.5 points | `KXNBASPREAD-26NOV04MINHOU-MIN11` |
| Spread: Timberwolves (-12.5) | Minnesota wins by over 12.5 points | `KXNBASPREAD-26NOV04MINHOU-MIN13` |
| Spread: Timberwolves (-14.5) | Minnesota wins by over 14.5 points | `KXNBASPREAD-26NOV04MINHOU-MIN15` |
| Spread: Timberwolves (-16.5) | Minnesota wins by over 16.5 points | `KXNBASPREAD-26NOV04MINHOU-MIN17` |
| Spread: Timberwolves (-2.5) | Minnesota wins by over 2.5 points | `KXNBASPREAD-26NOV04MINHOU-MIN3` |
| Spread: Timberwolves (-4.5) | Minnesota wins by over 4.5 points | `KXNBASPREAD-26NOV04MINHOU-MIN5` |
| Spread: Timberwolves (-6.5) | Minnesota wins by over 6.5 points | `KXNBASPREAD-26NOV04MINHOU-MIN7` |
| Spread: Timberwolves (-8.5) | Minnesota wins by over 8.5 points | `KXNBASPREAD-26NOV04MINHOU-MIN9` |
| Spread: Pistons (-9.5) | Detroit wins by over 9.5 points | `KXNBASPREAD-26NOV04PHIDET-DET10` |
| Spread: Pistons (-11.5) | Detroit wins by over 11.5 points | `KXNBASPREAD-26NOV04PHIDET-DET12` |
| Spread: Pistons (-13.5) | Detroit wins by over 13.5 points | `KXNBASPREAD-26NOV04PHIDET-DET14` |
| Spread: Pistons (-15.5) | Detroit wins by over 15.5 points | `KXNBASPREAD-26NOV04PHIDET-DET16` |
| Spread: Pistons (-17.5) | Detroit wins by over 17.5 points | `KXNBASPREAD-26NOV04PHIDET-DET18` |
| Spread: Pistons (-1.5) | Detroit wins by over 1.5 points | `KXNBASPREAD-26NOV04PHIDET-DET2` |
| Spread: Pistons (-19.5) | Detroit wins by over 19.5 points | `KXNBASPREAD-26NOV04PHIDET-DET20` |
| Spread: Pistons (-21.5) | Detroit wins by over 21.5 points | `KXNBASPREAD-26NOV04PHIDET-DET22` |
| Spread: Pistons (-23.5) | Detroit wins by over 23.5 points | `KXNBASPREAD-26NOV04PHIDET-DET24` |
| Spread: Pistons (-25.5) | Detroit wins by over 25.5 points | `KXNBASPREAD-26NOV04PHIDET-DET26` |
| Spread: Pistons (-27.5) | Detroit wins by over 27.5 points | `KXNBASPREAD-26NOV04PHIDET-DET28` |
| Spread: Pistons (-2.5) | Detroit wins by over 2.5 points | `KXNBASPREAD-26NOV04PHIDET-DET3` |
| Spread: Pistons (-3.5) | Detroit wins by over 3.5 points | `KXNBASPREAD-26NOV04PHIDET-DET4` |
| Spread: Pistons (-4.5) | Detroit wins by over 4.5 points | `KXNBASPREAD-26NOV04PHIDET-DET5` |
| Spread: Pistons (-5.5) | Detroit wins by over 5.5 points | `KXNBASPREAD-26NOV04PHIDET-DET6` |
| Spread: Pistons (-6.5) | Detroit wins by over 6.5 points | `KXNBASPREAD-26NOV04PHIDET-DET7` |
| Spread: Pistons (-7.5) | Detroit wins by over 7.5 points | `KXNBASPREAD-26NOV04PHIDET-DET8` |
| Spread: 76ers (-10.5) | Philadelphia wins by over 10.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI11` |
| Spread: 76ers (-12.5) | Philadelphia wins by over 12.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI13` |
| Spread: 76ers (-14.5) | Philadelphia wins by over 14.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI15` |
| Spread: 76ers (-16.5) | Philadelphia wins by over 16.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI17` |
| Spread: 76ers (-18.5) | Philadelphia wins by over 18.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI19` |
| Spread: 76ers (-1.5) | Philadelphia wins by over 1.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI2` |
| Spread: 76ers (-20.5) | Philadelphia wins by over 20.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI21` |
| Spread: 76ers (-22.5) | Philadelphia wins by over 22.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI23` |
| Spread: 76ers (-24.5) | Philadelphia wins by over 24.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI25` |
| Spread: 76ers (-26.5) | Philadelphia wins by over 26.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI27` |
| Spread: 76ers (-2.5) | Philadelphia wins by over 2.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI3` |
| Spread: 76ers (-3.5) | Philadelphia wins by over 3.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI4` |
| Spread: 76ers (-4.5) | Philadelphia wins by over 4.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI5` |
| Spread: 76ers (-6.5) | Philadelphia wins by over 6.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI7` |
| Spread: 76ers (-8.5) | Philadelphia wins by over 8.5 points | `KXNBASPREAD-26NOV04PHIDET-PHI9` |
| Spread: Suns (-1.5) | Phoenix wins by over 1.5 points | `KXNBASPREAD-26NOV04PORPHX-PHX2` |
| Spread: Suns (-2.5) | Phoenix wins by over 2.5 points | `KXNBASPREAD-26NOV04PORPHX-PHX3` |
| Spread: Suns (-3.5) | Phoenix wins by over 3.5 points | `KXNBASPREAD-26NOV04PORPHX-PHX4` |
| Spread: Trail Blazers (-1.5) | Portland wins by over 1.5 points | `KXNBASPREAD-26NOV04PORPHX-POR2` |
| Spread: Trail Blazers (-2.5) | Portland wins by over 2.5 points | `KXNBASPREAD-26NOV04PORPHX-POR3` |
| Spread: Trail Blazers (-3.5) | Portland wins by over 3.5 points | `KXNBASPREAD-26NOV04PORPHX-POR4` |
| Spread: Trail Blazers (-4.5) | Portland wins by over 4.5 points | `KXNBASPREAD-26NOV04PORPHX-POR5` |
| Spread: Trail Blazers (-5.5) | Portland wins by over 5.5 points | `KXNBASPREAD-26NOV04PORPHX-POR6` |
| Spread: Trail Blazers (-6.5) | Portland wins by over 6.5 points | `KXNBASPREAD-26NOV04PORPHX-POR7` |
| Spread: Trail Blazers (-7.5) | Portland wins by over 7.5 points | `KXNBASPREAD-26NOV04PORPHX-POR8` |
| Spread: Trail Blazers (-8.5) | Portland wins by over 8.5 points | `KXNBASPREAD-26NOV04PORPHX-POR9` |
| Spread: Nuggets (-9.5) | Denver wins by over 9.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN10` |
| Spread: Nuggets (-10.5) | Denver wins by over 10.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN11` |
| Spread: Nuggets (-11.5) | Denver wins by over 11.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN12` |
| Spread: Nuggets (-13.5) | Denver wins by over 13.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN14` |
| Spread: Nuggets (-15.5) | Denver wins by over 15.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN16` |
| Spread: Nuggets (-17.5) | Denver wins by over 17.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN18` |
| Spread: Nuggets (-1.5) | Denver wins by over 1.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN2` |
| Spread: Nuggets (-19.5) | Denver wins by over 19.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN20` |
| Spread: Nuggets (-21.5) | Denver wins by over 21.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN22` |
| Spread: Nuggets (-23.5) | Denver wins by over 23.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN24` |
| Spread: Nuggets (-25.5) | Denver wins by over 25.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN26` |
| Spread: Nuggets (-27.5) | Denver wins by over 27.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN28` |
| Spread: Nuggets (-2.5) | Denver wins by over 2.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN3` |
| Spread: Nuggets (-29.5) | Denver wins by over 29.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN30` |
| Spread: Nuggets (-31.5) | Denver wins by over 31.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN32` |
| Spread: Nuggets (-3.5) | Denver wins by over 3.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN4` |
| Spread: Nuggets (-4.5) | Denver wins by over 4.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN5` |
| Spread: Nuggets (-5.5) | Denver wins by over 5.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN6` |
| Spread: Nuggets (-6.5) | Denver wins by over 6.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN7` |
| Spread: Nuggets (-7.5) | Denver wins by over 7.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN8` |
| Spread: Nuggets (-8.5) | Denver wins by over 8.5 points | `KXNBASPREAD-26NOV04TORDEN-DEN9` |
| Spread: Raptors (-10.5) | Toronto wins by over 10.5 points | `KXNBASPREAD-26NOV04TORDEN-TOR11` |
| Spread: Raptors (-12.5) | Toronto wins by over 12.5 points | `KXNBASPREAD-26NOV04TORDEN-TOR13` |
| Spread: Raptors (-14.5) | Toronto wins by over 14.5 points | `KXNBASPREAD-26NOV04TORDEN-TOR15` |
| Spread: Raptors (-16.5) | Toronto wins by over 16.5 points | `KXNBASPREAD-26NOV04TORDEN-TOR17` |
| Spread: Raptors (-18.5) | Toronto wins by over 18.5 points | `KXNBASPREAD-26NOV04TORDEN-TOR19` |
| Spread: Raptors (-20.5) | Toronto wins by over 20.5 points | `KXNBASPREAD-26NOV04TORDEN-TOR21` |
| Spread: Raptors (-22.5) | Toronto wins by over 22.5 points | `KXNBASPREAD-26NOV04TORDEN-TOR23` |
| Spread: Raptors (-2.5) | Toronto wins by over 2.5 points | `KXNBASPREAD-26NOV04TORDEN-TOR3` |
| Spread: Raptors (-4.5) | Toronto wins by over 4.5 points | `KXNBASPREAD-26NOV04TORDEN-TOR5` |
| Spread: Raptors (-6.5) | Toronto wins by over 6.5 points | `KXNBASPREAD-26NOV04TORDEN-TOR7` |
| Spread: Raptors (-8.5) | Toronto wins by over 8.5 points | `KXNBASPREAD-26NOV04TORDEN-TOR9` |
| Spread: Pelicans (-9.5) | New Orleans wins by over 9.5 points | `KXNBASPREAD-26NOV04UTANOP-NOP10` |
| Spread: Pelicans (-10.5) | New Orleans wins by over 10.5 points | `KXNBASPREAD-26NOV04UTANOP-NOP11` |
| Spread: Pelicans (-1.5) | New Orleans wins by over 1.5 points | `KXNBASPREAD-26NOV04UTANOP-NOP2` |
| Spread: Pelicans (-2.5) | New Orleans wins by over 2.5 points | `KXNBASPREAD-26NOV04UTANOP-NOP3` |
| Spread: Pelicans (-3.5) | New Orleans wins by over 3.5 points | `KXNBASPREAD-26NOV04UTANOP-NOP4` |
| Spread: Pelicans (-4.5) | New Orleans wins by over 4.5 points | `KXNBASPREAD-26NOV04UTANOP-NOP5` |
| Spread: Pelicans (-5.5) | New Orleans wins by over 5.5 points | `KXNBASPREAD-26NOV04UTANOP-NOP6` |
| Spread: Pelicans (-6.5) | New Orleans wins by over 6.5 points | `KXNBASPREAD-26NOV04UTANOP-NOP7` |
| Spread: Pelicans (-7.5) | New Orleans wins by over 7.5 points | `KXNBASPREAD-26NOV04UTANOP-NOP8` |
| Spread: Pelicans (-8.5) | New Orleans wins by over 8.5 points | `KXNBASPREAD-26NOV04UTANOP-NOP9` |
| Spread: Jazz (-1.5) | Utah wins by over 1.5 points | `KXNBASPREAD-26NOV04UTANOP-UTA2` |

## NBA total (344)

| Polymarket | Kalshi | Kalshi ticker |
|---|---|---|
| Hawks vs. Wizards: O/U 206.5 | Full Game: Over 206.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-207` |
| Hawks vs. Wizards: O/U 208.5 | Full Game: Over 208.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-209` |
| Hawks vs. Wizards: O/U 210.5 | Full Game: Over 210.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-211` |
| Hawks vs. Wizards: O/U 212.5 | Full Game: Over 212.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-213` |
| Hawks vs. Wizards: O/U 214.5 | Full Game: Over 214.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-215` |
| Hawks vs. Wizards: O/U 216.5 | Full Game: Over 216.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-217` |
| Hawks vs. Wizards: O/U 218.5 | Full Game: Over 218.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-219` |
| Hawks vs. Wizards: O/U 220.5 | Full Game: Over 220.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-221` |
| Hawks vs. Wizards: O/U 222.5 | Full Game: Over 222.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-223` |
| Hawks vs. Wizards: O/U 224.5 | Full Game: Over 224.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-225` |
| Hawks vs. Wizards: O/U 226.5 | Full Game: Over 226.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-227` |
| Hawks vs. Wizards: O/U 228.5 | Full Game: Over 228.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-229` |
| Hawks vs. Wizards: O/U 230.5 | Full Game: Over 230.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-231` |
| Hawks vs. Wizards: O/U 232.5 | Full Game: Over 232.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-233` |
| Hawks vs. Wizards: O/U 234.5 | Full Game: Over 234.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-235` |
| Hawks vs. Wizards: O/U 236.5 | Full Game: Over 236.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-237` |
| Hawks vs. Wizards: O/U 238.5 | Full Game: Over 238.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-239` |
| Hawks vs. Wizards: O/U 240.5 | Full Game: Over 240.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-241` |
| Hawks vs. Wizards: O/U 242.5 | Full Game: Over 242.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-243` |
| Hawks vs. Wizards: O/U 244.5 | Full Game: Over 244.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-245` |
| Hawks vs. Wizards: O/U 246.5 | Full Game: Over 246.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-247` |
| Hawks vs. Wizards: O/U 248.5 | Full Game: Over 248.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-249` |
| Hawks vs. Wizards: O/U 250.5 | Full Game: Over 250.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-251` |
| Hawks vs. Wizards: O/U 252.5 | Full Game: Over 252.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-253` |
| Hawks vs. Wizards: O/U 254.5 | Full Game: Over 254.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-255` |
| Hawks vs. Wizards: O/U 256.5 | Full Game: Over 256.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-257` |
| Hawks vs. Wizards: O/U 258.5 | Full Game: Over 258.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-259` |
| Hawks vs. Wizards: O/U 260.5 | Full Game: Over 260.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-261` |
| Hawks vs. Wizards: O/U 262.5 | Full Game: Over 262.5 points scored | `KXNBATOTAL-26NOV04ATLWAS-263` |
| Hornets vs. Nets: O/U 186.5 | Full Game: Over 186.5 points scored | `KXNBATOTAL-26NOV04CHABKN-187` |
| Hornets vs. Nets: O/U 188.5 | Full Game: Over 188.5 points scored | `KXNBATOTAL-26NOV04CHABKN-189` |
| Hornets vs. Nets: O/U 190.5 | Full Game: Over 190.5 points scored | `KXNBATOTAL-26NOV04CHABKN-191` |
| Hornets vs. Nets: O/U 192.5 | Full Game: Over 192.5 points scored | `KXNBATOTAL-26NOV04CHABKN-193` |
| Hornets vs. Nets: O/U 194.5 | Full Game: Over 194.5 points scored | `KXNBATOTAL-26NOV04CHABKN-195` |
| Hornets vs. Nets: O/U 196.5 | Full Game: Over 196.5 points scored | `KXNBATOTAL-26NOV04CHABKN-197` |
| Hornets vs. Nets: O/U 198.5 | Full Game: Over 198.5 points scored | `KXNBATOTAL-26NOV04CHABKN-199` |
| Hornets vs. Nets: O/U 200.5 | Full Game: Over 200.5 points scored | `KXNBATOTAL-26NOV04CHABKN-201` |
| Hornets vs. Nets: O/U 202.5 | Full Game: Over 202.5 points scored | `KXNBATOTAL-26NOV04CHABKN-203` |
| Hornets vs. Nets: O/U 204.5 | Full Game: Over 204.5 points scored | `KXNBATOTAL-26NOV04CHABKN-205` |
| Hornets vs. Nets: O/U 206.5 | Full Game: Over 206.5 points scored | `KXNBATOTAL-26NOV04CHABKN-207` |
| Hornets vs. Nets: O/U 208.5 | Full Game: Over 208.5 points scored | `KXNBATOTAL-26NOV04CHABKN-209` |
| Hornets vs. Nets: O/U 210.5 | Full Game: Over 210.5 points scored | `KXNBATOTAL-26NOV04CHABKN-211` |
| Hornets vs. Nets: O/U 212.5 | Full Game: Over 212.5 points scored | `KXNBATOTAL-26NOV04CHABKN-213` |
| Hornets vs. Nets: O/U 214.5 | Full Game: Over 214.5 points scored | `KXNBATOTAL-26NOV04CHABKN-215` |
| Hornets vs. Nets: O/U 216.5 | Full Game: Over 216.5 points scored | `KXNBATOTAL-26NOV04CHABKN-217` |
| Hornets vs. Nets: O/U 218.5 | Full Game: Over 218.5 points scored | `KXNBATOTAL-26NOV04CHABKN-219` |
| Hornets vs. Nets: O/U 220.5 | Full Game: Over 220.5 points scored | `KXNBATOTAL-26NOV04CHABKN-221` |
| Hornets vs. Nets: O/U 222.5 | Full Game: Over 222.5 points scored | `KXNBATOTAL-26NOV04CHABKN-223` |
| Hornets vs. Nets: O/U 224.5 | Full Game: Over 224.5 points scored | `KXNBATOTAL-26NOV04CHABKN-225` |
| Hornets vs. Nets: O/U 226.5 | Full Game: Over 226.5 points scored | `KXNBATOTAL-26NOV04CHABKN-227` |
| Hornets vs. Nets: O/U 228.5 | Full Game: Over 228.5 points scored | `KXNBATOTAL-26NOV04CHABKN-229` |
| Hornets vs. Nets: O/U 230.5 | Full Game: Over 230.5 points scored | `KXNBATOTAL-26NOV04CHABKN-231` |
| Hornets vs. Nets: O/U 232.5 | Full Game: Over 232.5 points scored | `KXNBATOTAL-26NOV04CHABKN-233` |
| Hornets vs. Nets: O/U 234.5 | Full Game: Over 234.5 points scored | `KXNBATOTAL-26NOV04CHABKN-235` |
| Hornets vs. Nets: O/U 236.5 | Full Game: Over 236.5 points scored | `KXNBATOTAL-26NOV04CHABKN-237` |
| Hornets vs. Nets: O/U 238.5 | Full Game: Over 238.5 points scored | `KXNBATOTAL-26NOV04CHABKN-239` |
| Hornets vs. Nets: O/U 240.5 | Full Game: Over 240.5 points scored | `KXNBATOTAL-26NOV04CHABKN-241` |
| Hornets vs. Nets: O/U 242.5 | Full Game: Over 242.5 points scored | `KXNBATOTAL-26NOV04CHABKN-243` |
| Bulls vs. Knicks: O/U 204.5 | Full Game: Over 204.5 points scored | `KXNBATOTAL-26NOV04CHINYK-205` |
| Bulls vs. Knicks: O/U 206.5 | Full Game: Over 206.5 points scored | `KXNBATOTAL-26NOV04CHINYK-207` |
| Bulls vs. Knicks: O/U 208.5 | Full Game: Over 208.5 points scored | `KXNBATOTAL-26NOV04CHINYK-209` |
| Bulls vs. Knicks: O/U 210.5 | Full Game: Over 210.5 points scored | `KXNBATOTAL-26NOV04CHINYK-211` |
| Bulls vs. Knicks: O/U 212.5 | Full Game: Over 212.5 points scored | `KXNBATOTAL-26NOV04CHINYK-213` |
| Bulls vs. Knicks: O/U 214.5 | Full Game: Over 214.5 points scored | `KXNBATOTAL-26NOV04CHINYK-215` |
| Bulls vs. Knicks: O/U 216.5 | Full Game: Over 216.5 points scored | `KXNBATOTAL-26NOV04CHINYK-217` |
| Bulls vs. Knicks: O/U 218.5 | Full Game: Over 218.5 points scored | `KXNBATOTAL-26NOV04CHINYK-219` |
| Bulls vs. Knicks: O/U 220.5 | Full Game: Over 220.5 points scored | `KXNBATOTAL-26NOV04CHINYK-221` |
| Bulls vs. Knicks: O/U 222.5 | Full Game: Over 222.5 points scored | `KXNBATOTAL-26NOV04CHINYK-223` |
| Bulls vs. Knicks: O/U 224.5 | Full Game: Over 224.5 points scored | `KXNBATOTAL-26NOV04CHINYK-225` |
| Bulls vs. Knicks: O/U 226.5 | Full Game: Over 226.5 points scored | `KXNBATOTAL-26NOV04CHINYK-227` |
| Bulls vs. Knicks: O/U 228.5 | Full Game: Over 228.5 points scored | `KXNBATOTAL-26NOV04CHINYK-229` |
| Bulls vs. Knicks: O/U 230.5 | Full Game: Over 230.5 points scored | `KXNBATOTAL-26NOV04CHINYK-231` |
| Bulls vs. Knicks: O/U 232.5 | Full Game: Over 232.5 points scored | `KXNBATOTAL-26NOV04CHINYK-233` |
| Bulls vs. Knicks: O/U 234.5 | Full Game: Over 234.5 points scored | `KXNBATOTAL-26NOV04CHINYK-235` |
| Bulls vs. Knicks: O/U 236.5 | Full Game: Over 236.5 points scored | `KXNBATOTAL-26NOV04CHINYK-237` |
| Bulls vs. Knicks: O/U 238.5 | Full Game: Over 238.5 points scored | `KXNBATOTAL-26NOV04CHINYK-239` |
| Bulls vs. Knicks: O/U 240.5 | Full Game: Over 240.5 points scored | `KXNBATOTAL-26NOV04CHINYK-241` |
| Bulls vs. Knicks: O/U 242.5 | Full Game: Over 242.5 points scored | `KXNBATOTAL-26NOV04CHINYK-243` |
| Bulls vs. Knicks: O/U 244.5 | Full Game: Over 244.5 points scored | `KXNBATOTAL-26NOV04CHINYK-245` |
| Bulls vs. Knicks: O/U 246.5 | Full Game: Over 246.5 points scored | `KXNBATOTAL-26NOV04CHINYK-247` |
| Bulls vs. Knicks: O/U 248.5 | Full Game: Over 248.5 points scored | `KXNBATOTAL-26NOV04CHINYK-249` |
| Bulls vs. Knicks: O/U 250.5 | Full Game: Over 250.5 points scored | `KXNBATOTAL-26NOV04CHINYK-251` |
| Bulls vs. Knicks: O/U 252.5 | Full Game: Over 252.5 points scored | `KXNBATOTAL-26NOV04CHINYK-253` |
| Bulls vs. Knicks: O/U 254.5 | Full Game: Over 254.5 points scored | `KXNBATOTAL-26NOV04CHINYK-255` |
| Bulls vs. Knicks: O/U 256.5 | Full Game: Over 256.5 points scored | `KXNBATOTAL-26NOV04CHINYK-257` |
| Bulls vs. Knicks: O/U 258.5 | Full Game: Over 258.5 points scored | `KXNBATOTAL-26NOV04CHINYK-259` |
| Bulls vs. Knicks: O/U 260.5 | Full Game: Over 260.5 points scored | `KXNBATOTAL-26NOV04CHINYK-261` |
| Cavaliers vs. Thunder: O/U 200.5 | Full Game: Over 200.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-201` |
| Cavaliers vs. Thunder: O/U 202.5 | Full Game: Over 202.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-203` |
| Cavaliers vs. Thunder: O/U 204.5 | Full Game: Over 204.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-205` |
| Cavaliers vs. Thunder: O/U 206.5 | Full Game: Over 206.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-207` |
| Cavaliers vs. Thunder: O/U 208.5 | Full Game: Over 208.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-209` |
| Cavaliers vs. Thunder: O/U 210.5 | Full Game: Over 210.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-211` |
| Cavaliers vs. Thunder: O/U 212.5 | Full Game: Over 212.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-213` |
| Cavaliers vs. Thunder: O/U 214.5 | Full Game: Over 214.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-215` |
| Cavaliers vs. Thunder: O/U 216.5 | Full Game: Over 216.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-217` |
| Cavaliers vs. Thunder: O/U 218.5 | Full Game: Over 218.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-219` |
| Cavaliers vs. Thunder: O/U 220.5 | Full Game: Over 220.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-221` |
| Cavaliers vs. Thunder: O/U 222.5 | Full Game: Over 222.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-223` |
| Cavaliers vs. Thunder: O/U 224.5 | Full Game: Over 224.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-225` |
| Cavaliers vs. Thunder: O/U 226.5 | Full Game: Over 226.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-227` |
| Cavaliers vs. Thunder: O/U 228.5 | Full Game: Over 228.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-229` |
| Cavaliers vs. Thunder: O/U 230.5 | Full Game: Over 230.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-231` |
| Cavaliers vs. Thunder: O/U 232.5 | Full Game: Over 232.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-233` |
| Cavaliers vs. Thunder: O/U 234.5 | Full Game: Over 234.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-235` |
| Cavaliers vs. Thunder: O/U 236.5 | Full Game: Over 236.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-237` |
| Cavaliers vs. Thunder: O/U 238.5 | Full Game: Over 238.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-239` |
| Cavaliers vs. Thunder: O/U 240.5 | Full Game: Over 240.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-241` |
| Cavaliers vs. Thunder: O/U 242.5 | Full Game: Over 242.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-243` |
| Cavaliers vs. Thunder: O/U 244.5 | Full Game: Over 244.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-245` |
| Cavaliers vs. Thunder: O/U 246.5 | Full Game: Over 246.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-247` |
| Cavaliers vs. Thunder: O/U 248.5 | Full Game: Over 248.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-249` |
| Cavaliers vs. Thunder: O/U 250.5 | Full Game: Over 250.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-251` |
| Cavaliers vs. Thunder: O/U 252.5 | Full Game: Over 252.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-253` |
| Cavaliers vs. Thunder: O/U 254.5 | Full Game: Over 254.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-255` |
| Cavaliers vs. Thunder: O/U 256.5 | Full Game: Over 256.5 points scored | `KXNBATOTAL-26NOV04CLEOKC-257` |
| Mavericks vs. Spurs: O/U 201.5 | Full Game: Over 201.5 points scored | `KXNBATOTAL-26NOV04DALSAS-202` |
| Mavericks vs. Spurs: O/U 203.5 | Full Game: Over 203.5 points scored | `KXNBATOTAL-26NOV04DALSAS-204` |
| Mavericks vs. Spurs: O/U 205.5 | Full Game: Over 205.5 points scored | `KXNBATOTAL-26NOV04DALSAS-206` |
| Mavericks vs. Spurs: O/U 207.5 | Full Game: Over 207.5 points scored | `KXNBATOTAL-26NOV04DALSAS-208` |
| Mavericks vs. Spurs: O/U 209.5 | Full Game: Over 209.5 points scored | `KXNBATOTAL-26NOV04DALSAS-210` |
| Mavericks vs. Spurs: O/U 211.5 | Full Game: Over 211.5 points scored | `KXNBATOTAL-26NOV04DALSAS-212` |
| Mavericks vs. Spurs: O/U 213.5 | Full Game: Over 213.5 points scored | `KXNBATOTAL-26NOV04DALSAS-214` |
| Mavericks vs. Spurs: O/U 215.5 | Full Game: Over 215.5 points scored | `KXNBATOTAL-26NOV04DALSAS-216` |
| Mavericks vs. Spurs: O/U 217.5 | Full Game: Over 217.5 points scored | `KXNBATOTAL-26NOV04DALSAS-218` |
| Mavericks vs. Spurs: O/U 219.5 | Full Game: Over 219.5 points scored | `KXNBATOTAL-26NOV04DALSAS-220` |
| Mavericks vs. Spurs: O/U 221.5 | Full Game: Over 221.5 points scored | `KXNBATOTAL-26NOV04DALSAS-222` |
| Mavericks vs. Spurs: O/U 223.5 | Full Game: Over 223.5 points scored | `KXNBATOTAL-26NOV04DALSAS-224` |
| Mavericks vs. Spurs: O/U 225.5 | Full Game: Over 225.5 points scored | `KXNBATOTAL-26NOV04DALSAS-226` |
| Mavericks vs. Spurs: O/U 227.5 | Full Game: Over 227.5 points scored | `KXNBATOTAL-26NOV04DALSAS-228` |
| Mavericks vs. Spurs: O/U 229.5 | Full Game: Over 229.5 points scored | `KXNBATOTAL-26NOV04DALSAS-230` |
| Mavericks vs. Spurs: O/U 231.5 | Full Game: Over 231.5 points scored | `KXNBATOTAL-26NOV04DALSAS-232` |
| Mavericks vs. Spurs: O/U 233.5 | Full Game: Over 233.5 points scored | `KXNBATOTAL-26NOV04DALSAS-234` |
| Mavericks vs. Spurs: O/U 235.5 | Full Game: Over 235.5 points scored | `KXNBATOTAL-26NOV04DALSAS-236` |
| Mavericks vs. Spurs: O/U 237.5 | Full Game: Over 237.5 points scored | `KXNBATOTAL-26NOV04DALSAS-238` |
| Mavericks vs. Spurs: O/U 239.5 | Full Game: Over 239.5 points scored | `KXNBATOTAL-26NOV04DALSAS-240` |
| Mavericks vs. Spurs: O/U 241.5 | Full Game: Over 241.5 points scored | `KXNBATOTAL-26NOV04DALSAS-242` |
| Mavericks vs. Spurs: O/U 243.5 | Full Game: Over 243.5 points scored | `KXNBATOTAL-26NOV04DALSAS-244` |
| Mavericks vs. Spurs: O/U 245.5 | Full Game: Over 245.5 points scored | `KXNBATOTAL-26NOV04DALSAS-246` |
| Mavericks vs. Spurs: O/U 247.5 | Full Game: Over 247.5 points scored | `KXNBATOTAL-26NOV04DALSAS-248` |
| Mavericks vs. Spurs: O/U 249.5 | Full Game: Over 249.5 points scored | `KXNBATOTAL-26NOV04DALSAS-250` |
| Mavericks vs. Spurs: O/U 251.5 | Full Game: Over 251.5 points scored | `KXNBATOTAL-26NOV04DALSAS-252` |
| Mavericks vs. Spurs: O/U 253.5 | Full Game: Over 253.5 points scored | `KXNBATOTAL-26NOV04DALSAS-254` |
| Mavericks vs. Spurs: O/U 255.5 | Full Game: Over 255.5 points scored | `KXNBATOTAL-26NOV04DALSAS-256` |
| Mavericks vs. Spurs: O/U 257.5 | Full Game: Over 257.5 points scored | `KXNBATOTAL-26NOV04DALSAS-258` |
| Pacers vs. Grizzlies: O/U 202.5 | Full Game: Over 202.5 points scored | `KXNBATOTAL-26NOV04INDMEM-203` |
| Pacers vs. Grizzlies: O/U 204.5 | Full Game: Over 204.5 points scored | `KXNBATOTAL-26NOV04INDMEM-205` |
| Pacers vs. Grizzlies: O/U 206.5 | Full Game: Over 206.5 points scored | `KXNBATOTAL-26NOV04INDMEM-207` |
| Pacers vs. Grizzlies: O/U 208.5 | Full Game: Over 208.5 points scored | `KXNBATOTAL-26NOV04INDMEM-209` |
| Pacers vs. Grizzlies: O/U 210.5 | Full Game: Over 210.5 points scored | `KXNBATOTAL-26NOV04INDMEM-211` |
| Pacers vs. Grizzlies: O/U 212.5 | Full Game: Over 212.5 points scored | `KXNBATOTAL-26NOV04INDMEM-213` |
| Pacers vs. Grizzlies: O/U 214.5 | Full Game: Over 214.5 points scored | `KXNBATOTAL-26NOV04INDMEM-215` |
| Pacers vs. Grizzlies: O/U 216.5 | Full Game: Over 216.5 points scored | `KXNBATOTAL-26NOV04INDMEM-217` |
| Pacers vs. Grizzlies: O/U 218.5 | Full Game: Over 218.5 points scored | `KXNBATOTAL-26NOV04INDMEM-219` |
| Pacers vs. Grizzlies: O/U 220.5 | Full Game: Over 220.5 points scored | `KXNBATOTAL-26NOV04INDMEM-221` |
| Pacers vs. Grizzlies: O/U 222.5 | Full Game: Over 222.5 points scored | `KXNBATOTAL-26NOV04INDMEM-223` |
| Pacers vs. Grizzlies: O/U 224.5 | Full Game: Over 224.5 points scored | `KXNBATOTAL-26NOV04INDMEM-225` |
| Pacers vs. Grizzlies: O/U 226.5 | Full Game: Over 226.5 points scored | `KXNBATOTAL-26NOV04INDMEM-227` |
| Pacers vs. Grizzlies: O/U 228.5 | Full Game: Over 228.5 points scored | `KXNBATOTAL-26NOV04INDMEM-229` |
| Pacers vs. Grizzlies: O/U 230.5 | Full Game: Over 230.5 points scored | `KXNBATOTAL-26NOV04INDMEM-231` |
| Pacers vs. Grizzlies: O/U 232.5 | Full Game: Over 232.5 points scored | `KXNBATOTAL-26NOV04INDMEM-233` |
| Pacers vs. Grizzlies: O/U 234.5 | Full Game: Over 234.5 points scored | `KXNBATOTAL-26NOV04INDMEM-235` |
| Pacers vs. Grizzlies: O/U 236.5 | Full Game: Over 236.5 points scored | `KXNBATOTAL-26NOV04INDMEM-237` |
| Pacers vs. Grizzlies: O/U 238.5 | Full Game: Over 238.5 points scored | `KXNBATOTAL-26NOV04INDMEM-239` |
| Pacers vs. Grizzlies: O/U 240.5 | Full Game: Over 240.5 points scored | `KXNBATOTAL-26NOV04INDMEM-241` |
| Pacers vs. Grizzlies: O/U 242.5 | Full Game: Over 242.5 points scored | `KXNBATOTAL-26NOV04INDMEM-243` |
| Pacers vs. Grizzlies: O/U 244.5 | Full Game: Over 244.5 points scored | `KXNBATOTAL-26NOV04INDMEM-245` |
| Pacers vs. Grizzlies: O/U 246.5 | Full Game: Over 246.5 points scored | `KXNBATOTAL-26NOV04INDMEM-247` |
| Pacers vs. Grizzlies: O/U 248.5 | Full Game: Over 248.5 points scored | `KXNBATOTAL-26NOV04INDMEM-249` |
| Pacers vs. Grizzlies: O/U 250.5 | Full Game: Over 250.5 points scored | `KXNBATOTAL-26NOV04INDMEM-251` |
| Pacers vs. Grizzlies: O/U 252.5 | Full Game: Over 252.5 points scored | `KXNBATOTAL-26NOV04INDMEM-253` |
| Pacers vs. Grizzlies: O/U 254.5 | Full Game: Over 254.5 points scored | `KXNBATOTAL-26NOV04INDMEM-255` |
| Pacers vs. Grizzlies: O/U 256.5 | Full Game: Over 256.5 points scored | `KXNBATOTAL-26NOV04INDMEM-257` |
| Pacers vs. Grizzlies: O/U 258.5 | Full Game: Over 258.5 points scored | `KXNBATOTAL-26NOV04INDMEM-259` |
| Bucks vs. Celtics: O/U 197.5 | Full Game: Over 197.5 points scored | `KXNBATOTAL-26NOV04MILBOS-198` |
| Bucks vs. Celtics: O/U 199.5 | Full Game: Over 199.5 points scored | `KXNBATOTAL-26NOV04MILBOS-200` |
| Bucks vs. Celtics: O/U 201.5 | Full Game: Over 201.5 points scored | `KXNBATOTAL-26NOV04MILBOS-202` |
| Bucks vs. Celtics: O/U 203.5 | Full Game: Over 203.5 points scored | `KXNBATOTAL-26NOV04MILBOS-204` |
| Bucks vs. Celtics: O/U 205.5 | Full Game: Over 205.5 points scored | `KXNBATOTAL-26NOV04MILBOS-206` |
| Bucks vs. Celtics: O/U 207.5 | Full Game: Over 207.5 points scored | `KXNBATOTAL-26NOV04MILBOS-208` |
| Bucks vs. Celtics: O/U 209.5 | Full Game: Over 209.5 points scored | `KXNBATOTAL-26NOV04MILBOS-210` |
| Bucks vs. Celtics: O/U 211.5 | Full Game: Over 211.5 points scored | `KXNBATOTAL-26NOV04MILBOS-212` |
| Bucks vs. Celtics: O/U 213.5 | Full Game: Over 213.5 points scored | `KXNBATOTAL-26NOV04MILBOS-214` |
| Bucks vs. Celtics: O/U 215.5 | Full Game: Over 215.5 points scored | `KXNBATOTAL-26NOV04MILBOS-216` |
| Bucks vs. Celtics: O/U 217.5 | Full Game: Over 217.5 points scored | `KXNBATOTAL-26NOV04MILBOS-218` |
| Bucks vs. Celtics: O/U 219.5 | Full Game: Over 219.5 points scored | `KXNBATOTAL-26NOV04MILBOS-220` |
| Bucks vs. Celtics: O/U 221.5 | Full Game: Over 221.5 points scored | `KXNBATOTAL-26NOV04MILBOS-222` |
| Bucks vs. Celtics: O/U 223.5 | Full Game: Over 223.5 points scored | `KXNBATOTAL-26NOV04MILBOS-224` |
| Bucks vs. Celtics: O/U 225.5 | Full Game: Over 225.5 points scored | `KXNBATOTAL-26NOV04MILBOS-226` |
| Bucks vs. Celtics: O/U 227.5 | Full Game: Over 227.5 points scored | `KXNBATOTAL-26NOV04MILBOS-228` |
| Bucks vs. Celtics: O/U 229.5 | Full Game: Over 229.5 points scored | `KXNBATOTAL-26NOV04MILBOS-230` |
| Bucks vs. Celtics: O/U 231.5 | Full Game: Over 231.5 points scored | `KXNBATOTAL-26NOV04MILBOS-232` |
| Bucks vs. Celtics: O/U 233.5 | Full Game: Over 233.5 points scored | `KXNBATOTAL-26NOV04MILBOS-234` |
| Bucks vs. Celtics: O/U 235.5 | Full Game: Over 235.5 points scored | `KXNBATOTAL-26NOV04MILBOS-236` |
| Bucks vs. Celtics: O/U 237.5 | Full Game: Over 237.5 points scored | `KXNBATOTAL-26NOV04MILBOS-238` |
| Bucks vs. Celtics: O/U 239.5 | Full Game: Over 239.5 points scored | `KXNBATOTAL-26NOV04MILBOS-240` |
| Bucks vs. Celtics: O/U 241.5 | Full Game: Over 241.5 points scored | `KXNBATOTAL-26NOV04MILBOS-242` |
| Bucks vs. Celtics: O/U 243.5 | Full Game: Over 243.5 points scored | `KXNBATOTAL-26NOV04MILBOS-244` |
| Bucks vs. Celtics: O/U 245.5 | Full Game: Over 245.5 points scored | `KXNBATOTAL-26NOV04MILBOS-246` |
| Bucks vs. Celtics: O/U 247.5 | Full Game: Over 247.5 points scored | `KXNBATOTAL-26NOV04MILBOS-248` |
| Bucks vs. Celtics: O/U 249.5 | Full Game: Over 249.5 points scored | `KXNBATOTAL-26NOV04MILBOS-250` |
| Bucks vs. Celtics: O/U 251.5 | Full Game: Over 251.5 points scored | `KXNBATOTAL-26NOV04MILBOS-252` |
| Bucks vs. Celtics: O/U 253.5 | Full Game: Over 253.5 points scored | `KXNBATOTAL-26NOV04MILBOS-254` |
| Timberwolves vs. Rockets: O/U 196.5 | Full Game: Over 196.5 points scored | `KXNBATOTAL-26NOV04MINHOU-197` |
| Timberwolves vs. Rockets: O/U 198.5 | Full Game: Over 198.5 points scored | `KXNBATOTAL-26NOV04MINHOU-199` |
| Timberwolves vs. Rockets: O/U 200.5 | Full Game: Over 200.5 points scored | `KXNBATOTAL-26NOV04MINHOU-201` |
| Timberwolves vs. Rockets: O/U 202.5 | Full Game: Over 202.5 points scored | `KXNBATOTAL-26NOV04MINHOU-203` |
| Timberwolves vs. Rockets: O/U 204.5 | Full Game: Over 204.5 points scored | `KXNBATOTAL-26NOV04MINHOU-205` |
| Timberwolves vs. Rockets: O/U 206.5 | Full Game: Over 206.5 points scored | `KXNBATOTAL-26NOV04MINHOU-207` |
| Timberwolves vs. Rockets: O/U 208.5 | Full Game: Over 208.5 points scored | `KXNBATOTAL-26NOV04MINHOU-209` |
| Timberwolves vs. Rockets: O/U 210.5 | Full Game: Over 210.5 points scored | `KXNBATOTAL-26NOV04MINHOU-211` |
| Timberwolves vs. Rockets: O/U 212.5 | Full Game: Over 212.5 points scored | `KXNBATOTAL-26NOV04MINHOU-213` |
| Timberwolves vs. Rockets: O/U 214.5 | Full Game: Over 214.5 points scored | `KXNBATOTAL-26NOV04MINHOU-215` |
| Timberwolves vs. Rockets: O/U 216.5 | Full Game: Over 216.5 points scored | `KXNBATOTAL-26NOV04MINHOU-217` |
| Timberwolves vs. Rockets: O/U 218.5 | Full Game: Over 218.5 points scored | `KXNBATOTAL-26NOV04MINHOU-219` |
| Timberwolves vs. Rockets: O/U 220.5 | Full Game: Over 220.5 points scored | `KXNBATOTAL-26NOV04MINHOU-221` |
| Timberwolves vs. Rockets: O/U 222.5 | Full Game: Over 222.5 points scored | `KXNBATOTAL-26NOV04MINHOU-223` |
| Timberwolves vs. Rockets: O/U 224.5 | Full Game: Over 224.5 points scored | `KXNBATOTAL-26NOV04MINHOU-225` |
| Timberwolves vs. Rockets: O/U 226.5 | Full Game: Over 226.5 points scored | `KXNBATOTAL-26NOV04MINHOU-227` |
| Timberwolves vs. Rockets: O/U 228.5 | Full Game: Over 228.5 points scored | `KXNBATOTAL-26NOV04MINHOU-229` |
| Timberwolves vs. Rockets: O/U 230.5 | Full Game: Over 230.5 points scored | `KXNBATOTAL-26NOV04MINHOU-231` |
| Timberwolves vs. Rockets: O/U 232.5 | Full Game: Over 232.5 points scored | `KXNBATOTAL-26NOV04MINHOU-233` |
| Timberwolves vs. Rockets: O/U 234.5 | Full Game: Over 234.5 points scored | `KXNBATOTAL-26NOV04MINHOU-235` |
| Timberwolves vs. Rockets: O/U 236.5 | Full Game: Over 236.5 points scored | `KXNBATOTAL-26NOV04MINHOU-237` |
| Timberwolves vs. Rockets: O/U 238.5 | Full Game: Over 238.5 points scored | `KXNBATOTAL-26NOV04MINHOU-239` |
| Timberwolves vs. Rockets: O/U 240.5 | Full Game: Over 240.5 points scored | `KXNBATOTAL-26NOV04MINHOU-241` |
| Timberwolves vs. Rockets: O/U 242.5 | Full Game: Over 242.5 points scored | `KXNBATOTAL-26NOV04MINHOU-243` |
| Timberwolves vs. Rockets: O/U 244.5 | Full Game: Over 244.5 points scored | `KXNBATOTAL-26NOV04MINHOU-245` |
| Timberwolves vs. Rockets: O/U 246.5 | Full Game: Over 246.5 points scored | `KXNBATOTAL-26NOV04MINHOU-247` |
| Timberwolves vs. Rockets: O/U 248.5 | Full Game: Over 248.5 points scored | `KXNBATOTAL-26NOV04MINHOU-249` |
| Timberwolves vs. Rockets: O/U 250.5 | Full Game: Over 250.5 points scored | `KXNBATOTAL-26NOV04MINHOU-251` |
| Timberwolves vs. Rockets: O/U 252.5 | Full Game: Over 252.5 points scored | `KXNBATOTAL-26NOV04MINHOU-253` |
| 76ers vs. Pistons: O/U 191.5 | Full Game: Over 191.5 points scored | `KXNBATOTAL-26NOV04PHIDET-192` |
| 76ers vs. Pistons: O/U 193.5 | Full Game: Over 193.5 points scored | `KXNBATOTAL-26NOV04PHIDET-194` |
| 76ers vs. Pistons: O/U 195.5 | Full Game: Over 195.5 points scored | `KXNBATOTAL-26NOV04PHIDET-196` |
| 76ers vs. Pistons: O/U 197.5 | Full Game: Over 197.5 points scored | `KXNBATOTAL-26NOV04PHIDET-198` |
| 76ers vs. Pistons: O/U 199.5 | Full Game: Over 199.5 points scored | `KXNBATOTAL-26NOV04PHIDET-200` |
| 76ers vs. Pistons: O/U 201.5 | Full Game: Over 201.5 points scored | `KXNBATOTAL-26NOV04PHIDET-202` |
| 76ers vs. Pistons: O/U 203.5 | Full Game: Over 203.5 points scored | `KXNBATOTAL-26NOV04PHIDET-204` |
| 76ers vs. Pistons: O/U 205.5 | Full Game: Over 205.5 points scored | `KXNBATOTAL-26NOV04PHIDET-206` |
| 76ers vs. Pistons: O/U 207.5 | Full Game: Over 207.5 points scored | `KXNBATOTAL-26NOV04PHIDET-208` |
| 76ers vs. Pistons: O/U 209.5 | Full Game: Over 209.5 points scored | `KXNBATOTAL-26NOV04PHIDET-210` |
| 76ers vs. Pistons: O/U 211.5 | Full Game: Over 211.5 points scored | `KXNBATOTAL-26NOV04PHIDET-212` |
| 76ers vs. Pistons: O/U 213.5 | Full Game: Over 213.5 points scored | `KXNBATOTAL-26NOV04PHIDET-214` |
| 76ers vs. Pistons: O/U 215.5 | Full Game: Over 215.5 points scored | `KXNBATOTAL-26NOV04PHIDET-216` |
| 76ers vs. Pistons: O/U 217.5 | Full Game: Over 217.5 points scored | `KXNBATOTAL-26NOV04PHIDET-218` |
| 76ers vs. Pistons: O/U 219.5 | Full Game: Over 219.5 points scored | `KXNBATOTAL-26NOV04PHIDET-220` |
| 76ers vs. Pistons: O/U 221.5 | Full Game: Over 221.5 points scored | `KXNBATOTAL-26NOV04PHIDET-222` |
| 76ers vs. Pistons: O/U 223.5 | Full Game: Over 223.5 points scored | `KXNBATOTAL-26NOV04PHIDET-224` |
| 76ers vs. Pistons: O/U 225.5 | Full Game: Over 225.5 points scored | `KXNBATOTAL-26NOV04PHIDET-226` |
| 76ers vs. Pistons: O/U 227.5 | Full Game: Over 227.5 points scored | `KXNBATOTAL-26NOV04PHIDET-228` |
| 76ers vs. Pistons: O/U 229.5 | Full Game: Over 229.5 points scored | `KXNBATOTAL-26NOV04PHIDET-230` |
| 76ers vs. Pistons: O/U 231.5 | Full Game: Over 231.5 points scored | `KXNBATOTAL-26NOV04PHIDET-232` |
| 76ers vs. Pistons: O/U 233.5 | Full Game: Over 233.5 points scored | `KXNBATOTAL-26NOV04PHIDET-234` |
| 76ers vs. Pistons: O/U 235.5 | Full Game: Over 235.5 points scored | `KXNBATOTAL-26NOV04PHIDET-236` |
| 76ers vs. Pistons: O/U 237.5 | Full Game: Over 237.5 points scored | `KXNBATOTAL-26NOV04PHIDET-238` |
| 76ers vs. Pistons: O/U 239.5 | Full Game: Over 239.5 points scored | `KXNBATOTAL-26NOV04PHIDET-240` |
| 76ers vs. Pistons: O/U 241.5 | Full Game: Over 241.5 points scored | `KXNBATOTAL-26NOV04PHIDET-242` |
| 76ers vs. Pistons: O/U 243.5 | Full Game: Over 243.5 points scored | `KXNBATOTAL-26NOV04PHIDET-244` |
| 76ers vs. Pistons: O/U 245.5 | Full Game: Over 245.5 points scored | `KXNBATOTAL-26NOV04PHIDET-246` |
| 76ers vs. Pistons: O/U 247.5 | Full Game: Over 247.5 points scored | `KXNBATOTAL-26NOV04PHIDET-248` |
| Trail Blazers vs. Suns: O/U 200.5 | Full Game: Over 200.5 points scored | `KXNBATOTAL-26NOV04PORPHX-201` |
| Trail Blazers vs. Suns: O/U 202.5 | Full Game: Over 202.5 points scored | `KXNBATOTAL-26NOV04PORPHX-203` |
| Trail Blazers vs. Suns: O/U 204.5 | Full Game: Over 204.5 points scored | `KXNBATOTAL-26NOV04PORPHX-205` |
| Trail Blazers vs. Suns: O/U 206.5 | Full Game: Over 206.5 points scored | `KXNBATOTAL-26NOV04PORPHX-207` |
| Trail Blazers vs. Suns: O/U 208.5 | Full Game: Over 208.5 points scored | `KXNBATOTAL-26NOV04PORPHX-209` |
| Trail Blazers vs. Suns: O/U 210.5 | Full Game: Over 210.5 points scored | `KXNBATOTAL-26NOV04PORPHX-211` |
| Trail Blazers vs. Suns: O/U 212.5 | Full Game: Over 212.5 points scored | `KXNBATOTAL-26NOV04PORPHX-213` |
| Trail Blazers vs. Suns: O/U 214.5 | Full Game: Over 214.5 points scored | `KXNBATOTAL-26NOV04PORPHX-215` |
| Trail Blazers vs. Suns: O/U 216.5 | Full Game: Over 216.5 points scored | `KXNBATOTAL-26NOV04PORPHX-217` |
| Trail Blazers vs. Suns: O/U 218.5 | Full Game: Over 218.5 points scored | `KXNBATOTAL-26NOV04PORPHX-219` |
| Trail Blazers vs. Suns: O/U 220.5 | Full Game: Over 220.5 points scored | `KXNBATOTAL-26NOV04PORPHX-221` |
| Trail Blazers vs. Suns: O/U 222.5 | Full Game: Over 222.5 points scored | `KXNBATOTAL-26NOV04PORPHX-223` |
| Trail Blazers vs. Suns: O/U 224.5 | Full Game: Over 224.5 points scored | `KXNBATOTAL-26NOV04PORPHX-225` |
| Trail Blazers vs. Suns: O/U 226.5 | Full Game: Over 226.5 points scored | `KXNBATOTAL-26NOV04PORPHX-227` |
| Trail Blazers vs. Suns: O/U 228.5 | Full Game: Over 228.5 points scored | `KXNBATOTAL-26NOV04PORPHX-229` |
| Trail Blazers vs. Suns: O/U 230.5 | Full Game: Over 230.5 points scored | `KXNBATOTAL-26NOV04PORPHX-231` |
| Trail Blazers vs. Suns: O/U 232.5 | Full Game: Over 232.5 points scored | `KXNBATOTAL-26NOV04PORPHX-233` |
| Trail Blazers vs. Suns: O/U 234.5 | Full Game: Over 234.5 points scored | `KXNBATOTAL-26NOV04PORPHX-235` |
| Trail Blazers vs. Suns: O/U 236.5 | Full Game: Over 236.5 points scored | `KXNBATOTAL-26NOV04PORPHX-237` |
| Trail Blazers vs. Suns: O/U 238.5 | Full Game: Over 238.5 points scored | `KXNBATOTAL-26NOV04PORPHX-239` |
| Trail Blazers vs. Suns: O/U 240.5 | Full Game: Over 240.5 points scored | `KXNBATOTAL-26NOV04PORPHX-241` |
| Trail Blazers vs. Suns: O/U 242.5 | Full Game: Over 242.5 points scored | `KXNBATOTAL-26NOV04PORPHX-243` |
| Trail Blazers vs. Suns: O/U 244.5 | Full Game: Over 244.5 points scored | `KXNBATOTAL-26NOV04PORPHX-245` |
| Trail Blazers vs. Suns: O/U 246.5 | Full Game: Over 246.5 points scored | `KXNBATOTAL-26NOV04PORPHX-247` |
| Trail Blazers vs. Suns: O/U 248.5 | Full Game: Over 248.5 points scored | `KXNBATOTAL-26NOV04PORPHX-249` |
| Trail Blazers vs. Suns: O/U 250.5 | Full Game: Over 250.5 points scored | `KXNBATOTAL-26NOV04PORPHX-251` |
| Trail Blazers vs. Suns: O/U 252.5 | Full Game: Over 252.5 points scored | `KXNBATOTAL-26NOV04PORPHX-253` |
| Trail Blazers vs. Suns: O/U 254.5 | Full Game: Over 254.5 points scored | `KXNBATOTAL-26NOV04PORPHX-255` |
| Trail Blazers vs. Suns: O/U 256.5 | Full Game: Over 256.5 points scored | `KXNBATOTAL-26NOV04PORPHX-257` |
| Raptors vs. Nuggets: O/U 203.5 | Full Game: Over 203.5 points scored | `KXNBATOTAL-26NOV04TORDEN-204` |
| Raptors vs. Nuggets: O/U 205.5 | Full Game: Over 205.5 points scored | `KXNBATOTAL-26NOV04TORDEN-206` |
| Raptors vs. Nuggets: O/U 207.5 | Full Game: Over 207.5 points scored | `KXNBATOTAL-26NOV04TORDEN-208` |
| Raptors vs. Nuggets: O/U 209.5 | Full Game: Over 209.5 points scored | `KXNBATOTAL-26NOV04TORDEN-210` |
| Raptors vs. Nuggets: O/U 211.5 | Full Game: Over 211.5 points scored | `KXNBATOTAL-26NOV04TORDEN-212` |
| Raptors vs. Nuggets: O/U 213.5 | Full Game: Over 213.5 points scored | `KXNBATOTAL-26NOV04TORDEN-214` |
| Raptors vs. Nuggets: O/U 215.5 | Full Game: Over 215.5 points scored | `KXNBATOTAL-26NOV04TORDEN-216` |
| Raptors vs. Nuggets: O/U 217.5 | Full Game: Over 217.5 points scored | `KXNBATOTAL-26NOV04TORDEN-218` |
| Raptors vs. Nuggets: O/U 219.5 | Full Game: Over 219.5 points scored | `KXNBATOTAL-26NOV04TORDEN-220` |
| Raptors vs. Nuggets: O/U 221.5 | Full Game: Over 221.5 points scored | `KXNBATOTAL-26NOV04TORDEN-222` |
| Raptors vs. Nuggets: O/U 223.5 | Full Game: Over 223.5 points scored | `KXNBATOTAL-26NOV04TORDEN-224` |
| Raptors vs. Nuggets: O/U 225.5 | Full Game: Over 225.5 points scored | `KXNBATOTAL-26NOV04TORDEN-226` |
| Raptors vs. Nuggets: O/U 227.5 | Full Game: Over 227.5 points scored | `KXNBATOTAL-26NOV04TORDEN-228` |
| Raptors vs. Nuggets: O/U 229.5 | Full Game: Over 229.5 points scored | `KXNBATOTAL-26NOV04TORDEN-230` |
| Raptors vs. Nuggets: O/U 231.5 | Full Game: Over 231.5 points scored | `KXNBATOTAL-26NOV04TORDEN-232` |
| Raptors vs. Nuggets: O/U 233.5 | Full Game: Over 233.5 points scored | `KXNBATOTAL-26NOV04TORDEN-234` |
| Raptors vs. Nuggets: O/U 235.5 | Full Game: Over 235.5 points scored | `KXNBATOTAL-26NOV04TORDEN-236` |
| Raptors vs. Nuggets: O/U 237.5 | Full Game: Over 237.5 points scored | `KXNBATOTAL-26NOV04TORDEN-238` |
| Raptors vs. Nuggets: O/U 239.5 | Full Game: Over 239.5 points scored | `KXNBATOTAL-26NOV04TORDEN-240` |
| Raptors vs. Nuggets: O/U 241.5 | Full Game: Over 241.5 points scored | `KXNBATOTAL-26NOV04TORDEN-242` |
| Raptors vs. Nuggets: O/U 243.5 | Full Game: Over 243.5 points scored | `KXNBATOTAL-26NOV04TORDEN-244` |
| Raptors vs. Nuggets: O/U 245.5 | Full Game: Over 245.5 points scored | `KXNBATOTAL-26NOV04TORDEN-246` |
| Raptors vs. Nuggets: O/U 247.5 | Full Game: Over 247.5 points scored | `KXNBATOTAL-26NOV04TORDEN-248` |
| Raptors vs. Nuggets: O/U 249.5 | Full Game: Over 249.5 points scored | `KXNBATOTAL-26NOV04TORDEN-250` |
| Raptors vs. Nuggets: O/U 251.5 | Full Game: Over 251.5 points scored | `KXNBATOTAL-26NOV04TORDEN-252` |
| Raptors vs. Nuggets: O/U 253.5 | Full Game: Over 253.5 points scored | `KXNBATOTAL-26NOV04TORDEN-254` |
| Raptors vs. Nuggets: O/U 255.5 | Full Game: Over 255.5 points scored | `KXNBATOTAL-26NOV04TORDEN-256` |
| Raptors vs. Nuggets: O/U 257.5 | Full Game: Over 257.5 points scored | `KXNBATOTAL-26NOV04TORDEN-258` |
| Raptors vs. Nuggets: O/U 259.5 | Full Game: Over 259.5 points scored | `KXNBATOTAL-26NOV04TORDEN-260` |
| Jazz vs. Pelicans: O/U 211.5 | Full Game: Over 211.5 points scored | `KXNBATOTAL-26NOV04UTANOP-212` |
| Jazz vs. Pelicans: O/U 213.5 | Full Game: Over 213.5 points scored | `KXNBATOTAL-26NOV04UTANOP-214` |
| Jazz vs. Pelicans: O/U 215.5 | Full Game: Over 215.5 points scored | `KXNBATOTAL-26NOV04UTANOP-216` |
| Jazz vs. Pelicans: O/U 217.5 | Full Game: Over 217.5 points scored | `KXNBATOTAL-26NOV04UTANOP-218` |
| Jazz vs. Pelicans: O/U 219.5 | Full Game: Over 219.5 points scored | `KXNBATOTAL-26NOV04UTANOP-220` |
| Jazz vs. Pelicans: O/U 221.5 | Full Game: Over 221.5 points scored | `KXNBATOTAL-26NOV04UTANOP-222` |
| Jazz vs. Pelicans: O/U 223.5 | Full Game: Over 223.5 points scored | `KXNBATOTAL-26NOV04UTANOP-224` |
| Jazz vs. Pelicans: O/U 225.5 | Full Game: Over 225.5 points scored | `KXNBATOTAL-26NOV04UTANOP-226` |
| Jazz vs. Pelicans: O/U 227.5 | Full Game: Over 227.5 points scored | `KXNBATOTAL-26NOV04UTANOP-228` |
| Jazz vs. Pelicans: O/U 229.5 | Full Game: Over 229.5 points scored | `KXNBATOTAL-26NOV04UTANOP-230` |
| Jazz vs. Pelicans: O/U 231.5 | Full Game: Over 231.5 points scored | `KXNBATOTAL-26NOV04UTANOP-232` |
| Jazz vs. Pelicans: O/U 233.5 | Full Game: Over 233.5 points scored | `KXNBATOTAL-26NOV04UTANOP-234` |
| Jazz vs. Pelicans: O/U 235.5 | Full Game: Over 235.5 points scored | `KXNBATOTAL-26NOV04UTANOP-236` |
| Jazz vs. Pelicans: O/U 237.5 | Full Game: Over 237.5 points scored | `KXNBATOTAL-26NOV04UTANOP-238` |
| Jazz vs. Pelicans: O/U 239.5 | Full Game: Over 239.5 points scored | `KXNBATOTAL-26NOV04UTANOP-240` |
| Jazz vs. Pelicans: O/U 241.5 | Full Game: Over 241.5 points scored | `KXNBATOTAL-26NOV04UTANOP-242` |
| Jazz vs. Pelicans: O/U 243.5 | Full Game: Over 243.5 points scored | `KXNBATOTAL-26NOV04UTANOP-244` |
| Jazz vs. Pelicans: O/U 245.5 | Full Game: Over 245.5 points scored | `KXNBATOTAL-26NOV04UTANOP-246` |
| Jazz vs. Pelicans: O/U 247.5 | Full Game: Over 247.5 points scored | `KXNBATOTAL-26NOV04UTANOP-248` |
| Jazz vs. Pelicans: O/U 249.5 | Full Game: Over 249.5 points scored | `KXNBATOTAL-26NOV04UTANOP-250` |
| Jazz vs. Pelicans: O/U 251.5 | Full Game: Over 251.5 points scored | `KXNBATOTAL-26NOV04UTANOP-252` |
| Jazz vs. Pelicans: O/U 253.5 | Full Game: Over 253.5 points scored | `KXNBATOTAL-26NOV04UTANOP-254` |
| Jazz vs. Pelicans: O/U 255.5 | Full Game: Over 255.5 points scored | `KXNBATOTAL-26NOV04UTANOP-256` |
| Jazz vs. Pelicans: O/U 257.5 | Full Game: Over 257.5 points scored | `KXNBATOTAL-26NOV04UTANOP-258` |
| Jazz vs. Pelicans: O/U 259.5 | Full Game: Over 259.5 points scored | `KXNBATOTAL-26NOV04UTANOP-260` |

## NFL moneyline (16)

| Polymarket | Kalshi | Kalshi ticker |
|---|---|---|
| Cardinals vs. Seahawks | Arizona wins | `KXNFLGAME-26NOV08ARISEA-ARI` |
| Bengals vs. Falcons | Cincinnati wins | `KXNFLGAME-26NOV08CINATL-CIN` |
| Browns vs. Saints | Cleveland wins | `KXNFLGAME-26NOV08CLENO-CLE` |
| Cowboys vs. Colts | Dallas wins | `KXNFLGAME-26NOV08DALIND-DAL` |
| Broncos vs. Panthers | Denver wins | `KXNFLGAME-26NOV08DENCAR-DEN` |
| Lions vs. Dolphins | Detroit wins | `KXNFLGAME-26NOV08DETMIA-DET` |
| Packers vs. Patriots | Green Bay wins | `KXNFLGAME-26NOV08GBNE-GB` |
| Raiders vs. 49ers | Las Vegas wins | `KXNFLGAME-26NOV08LVSF-LV` |
| Panthers vs. Saints | Carolina wins | `KXNFLGAME-26NOV15CARNO-CAR` |
| Texans vs. Browns | Houston wins | `KXNFLGAME-26NOV15HOUCLE-HOU` |
| Chiefs vs. Falcons | Kansas City wins | `KXNFLGAME-26NOV15KCATL-KC` |
| Dolphins vs. Colts | Miami wins | `KXNFLGAME-26NOV15MIAIND-MIA` |
| Vikings vs. Packers | Minnesota wins | `KXNFLGAME-26NOV15MINGB-MIN` |
| Patriots vs. Lions | New England wins | `KXNFLGAME-26NOV15NEDET-NE` |
| Seahawks vs. Raiders | Seattle wins | `KXNFLGAME-26NOV15SEALV-SEA` |
| 49ers vs. Cowboys | San Francisco wins | `KXNFLGAME-26NOV15SFDAL-SF` |

## NFL spread (199)

| Polymarket | Kalshi | Kalshi ticker |
|---|---|---|
| Spread: Cardinals (-9.5) | Arizona wins by over 9.5 points? | `KXNFLSPREAD-26NOV08ARISEA-ARI10` |
| Spread: Cardinals (-10.5) | Arizona wins by over 10.5 points? | `KXNFLSPREAD-26NOV08ARISEA-ARI11` |
| Spread: Cardinals (-1.5) | Arizona wins by over 1.5 points? | `KXNFLSPREAD-26NOV08ARISEA-ARI2` |
| Spread: Cardinals (-2.5) | Arizona wins by over 2.5 points? | `KXNFLSPREAD-26NOV08ARISEA-ARI3` |
| Spread: Cardinals (-3.5) | Arizona wins by over 3.5 points? | `KXNFLSPREAD-26NOV08ARISEA-ARI4` |
| Spread: Cardinals (-4.5) | Arizona wins by over 4.5 points? | `KXNFLSPREAD-26NOV08ARISEA-ARI5` |
| Spread: Cardinals (-5.5) | Arizona wins by over 5.5 points? | `KXNFLSPREAD-26NOV08ARISEA-ARI6` |
| Spread: Cardinals (-6.5) | Arizona wins by over 6.5 points? | `KXNFLSPREAD-26NOV08ARISEA-ARI7` |
| Spread: Cardinals (-7.5) | Arizona wins by over 7.5 points? | `KXNFLSPREAD-26NOV08ARISEA-ARI8` |
| Spread: Seahawks (-9.5) | Seattle wins by over 9.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA10` |
| Spread: Seahawks (-10.5) | Seattle wins by over 10.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA11` |
| Spread: Seahawks (-13.5) | Seattle wins by over 13.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA14` |
| Spread: Seahawks (-14.5) | Seattle wins by over 14.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA15` |
| Spread: Seahawks (-16.5) | Seattle wins by over 16.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA17` |
| Spread: Seahawks (-17.5) | Seattle wins by over 17.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA18` |
| Spread: Seahawks (-1.5) | Seattle wins by over 1.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA2` |
| Spread: Seahawks (-20.5) | Seattle wins by over 20.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA21` |
| Spread: Seahawks (-2.5) | Seattle wins by over 2.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA3` |
| Spread: Seahawks (-3.5) | Seattle wins by over 3.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA4` |
| Spread: Seahawks (-4.5) | Seattle wins by over 4.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA5` |
| Spread: Seahawks (-5.5) | Seattle wins by over 5.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA6` |
| Spread: Seahawks (-6.5) | Seattle wins by over 6.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA7` |
| Spread: Seahawks (-7.5) | Seattle wins by over 7.5 points? | `KXNFLSPREAD-26NOV08ARISEA-SEA8` |
| Spread: Falcons (-9.5) | Atlanta wins by over 9.5 points? | `KXNFLSPREAD-26NOV08CINATL-ATL10` |
| Spread: Falcons (-10.5) | Atlanta wins by over 10.5 points? | `KXNFLSPREAD-26NOV08CINATL-ATL11` |
| Spread: Falcons (-13.5) | Atlanta wins by over 13.5 points? | `KXNFLSPREAD-26NOV08CINATL-ATL14` |
| Spread: Falcons (-14.5) | Atlanta wins by over 14.5 points? | `KXNFLSPREAD-26NOV08CINATL-ATL15` |
| Spread: Falcons (-1.5) | Atlanta wins by over 1.5 points? | `KXNFLSPREAD-26NOV08CINATL-ATL2` |
| Spread: Falcons (-2.5) | Atlanta wins by over 2.5 points? | `KXNFLSPREAD-26NOV08CINATL-ATL3` |
| Spread: Falcons (-3.5) | Atlanta wins by over 3.5 points? | `KXNFLSPREAD-26NOV08CINATL-ATL4` |
| Spread: Falcons (-4.5) | Atlanta wins by over 4.5 points? | `KXNFLSPREAD-26NOV08CINATL-ATL5` |
| Spread: Falcons (-5.5) | Atlanta wins by over 5.5 points? | `KXNFLSPREAD-26NOV08CINATL-ATL6` |
| Spread: Falcons (-6.5) | Atlanta wins by over 6.5 points? | `KXNFLSPREAD-26NOV08CINATL-ATL7` |
| Spread: Falcons (-7.5) | Atlanta wins by over 7.5 points? | `KXNFLSPREAD-26NOV08CINATL-ATL8` |
| Spread: Bengals (-9.5) | Cincinnati wins by over 9.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN10` |
| Spread: Bengals (-10.5) | Cincinnati wins by over 10.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN11` |
| Spread: Bengals (-13.5) | Cincinnati wins by over 13.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN14` |
| Spread: Bengals (-14.5) | Cincinnati wins by over 14.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN15` |
| Spread: Bengals (-16.5) | Cincinnati wins by over 16.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN17` |
| Spread: Bengals (-17.5) | Cincinnati wins by over 17.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN18` |
| Spread: Bengals (-1.5) | Cincinnati wins by over 1.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN2` |
| Spread: Bengals (-20.5) | Cincinnati wins by over 20.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN21` |
| Spread: Bengals (-2.5) | Cincinnati wins by over 2.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN3` |
| Spread: Bengals (-3.5) | Cincinnati wins by over 3.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN4` |
| Spread: Bengals (-4.5) | Cincinnati wins by over 4.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN5` |
| Spread: Bengals (-5.5) | Cincinnati wins by over 5.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN6` |
| Spread: Bengals (-6.5) | Cincinnati wins by over 6.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN7` |
| Spread: Bengals (-7.5) | Cincinnati wins by over 7.5 points? | `KXNFLSPREAD-26NOV08CINATL-CIN8` |
| Spread: Browns (-9.5) | Cleveland wins by over 9.5 points? | `KXNFLSPREAD-26NOV08CLENO-CLE10` |
| Spread: Browns (-10.5) | Cleveland wins by over 10.5 points? | `KXNFLSPREAD-26NOV08CLENO-CLE11` |
| Spread: Browns (-13.5) | Cleveland wins by over 13.5 points? | `KXNFLSPREAD-26NOV08CLENO-CLE14` |
| Spread: Browns (-14.5) | Cleveland wins by over 14.5 points? | `KXNFLSPREAD-26NOV08CLENO-CLE15` |
| Spread: Browns (-1.5) | Cleveland wins by over 1.5 points? | `KXNFLSPREAD-26NOV08CLENO-CLE2` |
| Spread: Browns (-2.5) | Cleveland wins by over 2.5 points? | `KXNFLSPREAD-26NOV08CLENO-CLE3` |
| Spread: Browns (-3.5) | Cleveland wins by over 3.5 points? | `KXNFLSPREAD-26NOV08CLENO-CLE4` |
| Spread: Browns (-4.5) | Cleveland wins by over 4.5 points? | `KXNFLSPREAD-26NOV08CLENO-CLE5` |
| Spread: Browns (-5.5) | Cleveland wins by over 5.5 points? | `KXNFLSPREAD-26NOV08CLENO-CLE6` |
| Spread: Browns (-6.5) | Cleveland wins by over 6.5 points? | `KXNFLSPREAD-26NOV08CLENO-CLE7` |
| Spread: Browns (-7.5) | Cleveland wins by over 7.5 points? | `KXNFLSPREAD-26NOV08CLENO-CLE8` |
| Spread: Saints (-9.5) | New Orleans wins by over 9.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO10` |
| Spread: Saints (-10.5) | New Orleans wins by over 10.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO11` |
| Spread: Saints (-13.5) | New Orleans wins by over 13.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO14` |
| Spread: Saints (-14.5) | New Orleans wins by over 14.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO15` |
| Spread: Saints (-16.5) | New Orleans wins by over 16.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO17` |
| Spread: Saints (-17.5) | New Orleans wins by over 17.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO18` |
| Spread: Saints (-1.5) | New Orleans wins by over 1.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO2` |
| Spread: Saints (-20.5) | New Orleans wins by over 20.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO21` |
| Spread: Saints (-2.5) | New Orleans wins by over 2.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO3` |
| Spread: Saints (-3.5) | New Orleans wins by over 3.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO4` |
| Spread: Saints (-4.5) | New Orleans wins by over 4.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO5` |
| Spread: Saints (-5.5) | New Orleans wins by over 5.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO6` |
| Spread: Saints (-6.5) | New Orleans wins by over 6.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO7` |
| Spread: Saints (-7.5) | New Orleans wins by over 7.5 points? | `KXNFLSPREAD-26NOV08CLENO-NO8` |
| Spread: Cowboys (-9.5) | Dallas wins by over 9.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL10` |
| Spread: Cowboys (-10.5) | Dallas wins by over 10.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL11` |
| Spread: Cowboys (-13.5) | Dallas wins by over 13.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL14` |
| Spread: Cowboys (-14.5) | Dallas wins by over 14.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL15` |
| Spread: Cowboys (-16.5) | Dallas wins by over 16.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL17` |
| Spread: Cowboys (-17.5) | Dallas wins by over 17.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL18` |
| Spread: Cowboys (-1.5) | Dallas wins by over 1.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL2` |
| Spread: Cowboys (-20.5) | Dallas wins by over 20.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL21` |
| Spread: Cowboys (-2.5) | Dallas wins by over 2.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL3` |
| Spread: Cowboys (-3.5) | Dallas wins by over 3.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL4` |
| Spread: Cowboys (-4.5) | Dallas wins by over 4.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL5` |
| Spread: Cowboys (-5.5) | Dallas wins by over 5.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL6` |
| Spread: Cowboys (-6.5) | Dallas wins by over 6.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL7` |
| Spread: Cowboys (-7.5) | Dallas wins by over 7.5 points? | `KXNFLSPREAD-26NOV08DALIND-DAL8` |
| Spread: Colts (-9.5) | Indianapolis wins by over 9.5 points? | `KXNFLSPREAD-26NOV08DALIND-IND10` |
| Spread: Colts (-10.5) | Indianapolis wins by over 10.5 points? | `KXNFLSPREAD-26NOV08DALIND-IND11` |
| Spread: Colts (-13.5) | Indianapolis wins by over 13.5 points? | `KXNFLSPREAD-26NOV08DALIND-IND14` |
| Spread: Colts (-14.5) | Indianapolis wins by over 14.5 points? | `KXNFLSPREAD-26NOV08DALIND-IND15` |
| Spread: Colts (-1.5) | Indianapolis wins by over 1.5 points? | `KXNFLSPREAD-26NOV08DALIND-IND2` |
| Spread: Colts (-2.5) | Indianapolis wins by over 2.5 points? | `KXNFLSPREAD-26NOV08DALIND-IND3` |
| Spread: Colts (-3.5) | Indianapolis wins by over 3.5 points? | `KXNFLSPREAD-26NOV08DALIND-IND4` |
| Spread: Colts (-4.5) | Indianapolis wins by over 4.5 points? | `KXNFLSPREAD-26NOV08DALIND-IND5` |
| Spread: Colts (-5.5) | Indianapolis wins by over 5.5 points? | `KXNFLSPREAD-26NOV08DALIND-IND6` |
| Spread: Colts (-6.5) | Indianapolis wins by over 6.5 points? | `KXNFLSPREAD-26NOV08DALIND-IND7` |
| Spread: Colts (-7.5) | Indianapolis wins by over 7.5 points? | `KXNFLSPREAD-26NOV08DALIND-IND8` |
| Spread: Panthers (-9.5) | Carolina wins by over 9.5 points? | `KXNFLSPREAD-26NOV08DENCAR-CAR10` |
| Spread: Panthers (-10.5) | Carolina wins by over 10.5 points? | `KXNFLSPREAD-26NOV08DENCAR-CAR11` |
| Spread: Panthers (-13.5) | Carolina wins by over 13.5 points? | `KXNFLSPREAD-26NOV08DENCAR-CAR14` |
| Spread: Panthers (-14.5) | Carolina wins by over 14.5 points? | `KXNFLSPREAD-26NOV08DENCAR-CAR15` |
| Spread: Panthers (-1.5) | Carolina wins by over 1.5 points? | `KXNFLSPREAD-26NOV08DENCAR-CAR2` |
| Spread: Panthers (-2.5) | Carolina wins by over 2.5 points? | `KXNFLSPREAD-26NOV08DENCAR-CAR3` |
| Spread: Panthers (-3.5) | Carolina wins by over 3.5 points? | `KXNFLSPREAD-26NOV08DENCAR-CAR4` |
| Spread: Panthers (-4.5) | Carolina wins by over 4.5 points? | `KXNFLSPREAD-26NOV08DENCAR-CAR5` |
| Spread: Panthers (-5.5) | Carolina wins by over 5.5 points? | `KXNFLSPREAD-26NOV08DENCAR-CAR6` |
| Spread: Panthers (-6.5) | Carolina wins by over 6.5 points? | `KXNFLSPREAD-26NOV08DENCAR-CAR7` |
| Spread: Panthers (-7.5) | Carolina wins by over 7.5 points? | `KXNFLSPREAD-26NOV08DENCAR-CAR8` |
| Spread: Broncos (-9.5) | Denver wins by over 9.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN10` |
| Spread: Broncos (-10.5) | Denver wins by over 10.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN11` |
| Spread: Broncos (-13.5) | Denver wins by over 13.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN14` |
| Spread: Broncos (-14.5) | Denver wins by over 14.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN15` |
| Spread: Broncos (-16.5) | Denver wins by over 16.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN17` |
| Spread: Broncos (-17.5) | Denver wins by over 17.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN18` |
| Spread: Broncos (-1.5) | Denver wins by over 1.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN2` |
| Spread: Broncos (-20.5) | Denver wins by over 20.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN21` |
| Spread: Broncos (-2.5) | Denver wins by over 2.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN3` |
| Spread: Broncos (-3.5) | Denver wins by over 3.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN4` |
| Spread: Broncos (-4.5) | Denver wins by over 4.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN5` |
| Spread: Broncos (-5.5) | Denver wins by over 5.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN6` |
| Spread: Broncos (-6.5) | Denver wins by over 6.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN7` |
| Spread: Broncos (-7.5) | Denver wins by over 7.5 points? | `KXNFLSPREAD-26NOV08DENCAR-DEN8` |
| Spread: Lions (-9.5) | Detroit wins by over 9.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET10` |
| Spread: Lions (-10.5) | Detroit wins by over 10.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET11` |
| Spread: Lions (-13.5) | Detroit wins by over 13.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET14` |
| Spread: Lions (-14.5) | Detroit wins by over 14.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET15` |
| Spread: Lions (-16.5) | Detroit wins by over 16.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET17` |
| Spread: Lions (-17.5) | Detroit wins by over 17.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET18` |
| Spread: Lions (-1.5) | Detroit wins by over 1.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET2` |
| Spread: Lions (-20.5) | Detroit wins by over 20.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET21` |
| Spread: Lions (-2.5) | Detroit wins by over 2.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET3` |
| Spread: Lions (-3.5) | Detroit wins by over 3.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET4` |
| Spread: Lions (-4.5) | Detroit wins by over 4.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET5` |
| Spread: Lions (-5.5) | Detroit wins by over 5.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET6` |
| Spread: Lions (-6.5) | Detroit wins by over 6.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET7` |
| Spread: Lions (-7.5) | Detroit wins by over 7.5 points? | `KXNFLSPREAD-26NOV08DETMIA-DET8` |
| Spread: Dolphins (-9.5) | Miami wins by over 9.5 points? | `KXNFLSPREAD-26NOV08DETMIA-MIA10` |
| Spread: Dolphins (-10.5) | Miami wins by over 10.5 points? | `KXNFLSPREAD-26NOV08DETMIA-MIA11` |
| Spread: Dolphins (-13.5) | Miami wins by over 13.5 points? | `KXNFLSPREAD-26NOV08DETMIA-MIA14` |
| Spread: Dolphins (-14.5) | Miami wins by over 14.5 points? | `KXNFLSPREAD-26NOV08DETMIA-MIA15` |
| Spread: Dolphins (-1.5) | Miami wins by over 1.5 points? | `KXNFLSPREAD-26NOV08DETMIA-MIA2` |
| Spread: Dolphins (-2.5) | Miami wins by over 2.5 points? | `KXNFLSPREAD-26NOV08DETMIA-MIA3` |
| Spread: Dolphins (-3.5) | Miami wins by over 3.5 points? | `KXNFLSPREAD-26NOV08DETMIA-MIA4` |
| Spread: Dolphins (-4.5) | Miami wins by over 4.5 points? | `KXNFLSPREAD-26NOV08DETMIA-MIA5` |
| Spread: Dolphins (-5.5) | Miami wins by over 5.5 points? | `KXNFLSPREAD-26NOV08DETMIA-MIA6` |
| Spread: Dolphins (-6.5) | Miami wins by over 6.5 points? | `KXNFLSPREAD-26NOV08DETMIA-MIA7` |
| Spread: Dolphins (-7.5) | Miami wins by over 7.5 points? | `KXNFLSPREAD-26NOV08DETMIA-MIA8` |
| Spread: Packers (-9.5) | Green Bay wins by over 9.5 points? | `KXNFLSPREAD-26NOV08GBNE-GB10` |
| Spread: Packers (-10.5) | Green Bay wins by over 10.5 points? | `KXNFLSPREAD-26NOV08GBNE-GB11` |
| Spread: Packers (-13.5) | Green Bay wins by over 13.5 points? | `KXNFLSPREAD-26NOV08GBNE-GB14` |
| Spread: Packers (-14.5) | Green Bay wins by over 14.5 points? | `KXNFLSPREAD-26NOV08GBNE-GB15` |
| Spread: Packers (-1.5) | Green Bay wins by over 1.5 points? | `KXNFLSPREAD-26NOV08GBNE-GB2` |
| Spread: Packers (-2.5) | Green Bay wins by over 2.5 points? | `KXNFLSPREAD-26NOV08GBNE-GB3` |
| Spread: Packers (-3.5) | Green Bay wins by over 3.5 points? | `KXNFLSPREAD-26NOV08GBNE-GB4` |
| Spread: Packers (-4.5) | Green Bay wins by over 4.5 points? | `KXNFLSPREAD-26NOV08GBNE-GB5` |
| Spread: Packers (-5.5) | Green Bay wins by over 5.5 points? | `KXNFLSPREAD-26NOV08GBNE-GB6` |
| Spread: Packers (-6.5) | Green Bay wins by over 6.5 points? | `KXNFLSPREAD-26NOV08GBNE-GB7` |
| Spread: Packers (-7.5) | Green Bay wins by over 7.5 points? | `KXNFLSPREAD-26NOV08GBNE-GB8` |
| Spread: Patriots (-9.5) | New England wins by over 9.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE10` |
| Spread: Patriots (-10.5) | New England wins by over 10.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE11` |
| Spread: Patriots (-13.5) | New England wins by over 13.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE14` |
| Spread: Patriots (-14.5) | New England wins by over 14.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE15` |
| Spread: Patriots (-16.5) | New England wins by over 16.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE17` |
| Spread: Patriots (-17.5) | New England wins by over 17.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE18` |
| Spread: Patriots (-1.5) | New England wins by over 1.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE2` |
| Spread: Patriots (-20.5) | New England wins by over 20.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE21` |
| Spread: Patriots (-2.5) | New England wins by over 2.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE3` |
| Spread: Patriots (-3.5) | New England wins by over 3.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE4` |
| Spread: Patriots (-4.5) | New England wins by over 4.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE5` |
| Spread: Patriots (-5.5) | New England wins by over 5.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE6` |
| Spread: Patriots (-6.5) | New England wins by over 6.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE7` |
| Spread: Patriots (-7.5) | New England wins by over 7.5 points? | `KXNFLSPREAD-26NOV08GBNE-NE8` |
| Spread: Raiders (-9.5) | Las Vegas wins by over 9.5 points? | `KXNFLSPREAD-26NOV08LVSF-LV10` |
| Spread: Raiders (-10.5) | Las Vegas wins by over 10.5 points? | `KXNFLSPREAD-26NOV08LVSF-LV11` |
| Spread: Raiders (-13.5) | Las Vegas wins by over 13.5 points? | `KXNFLSPREAD-26NOV08LVSF-LV14` |
| Spread: Raiders (-14.5) | Las Vegas wins by over 14.5 points? | `KXNFLSPREAD-26NOV08LVSF-LV15` |
| Spread: Raiders (-1.5) | Las Vegas wins by over 1.5 points? | `KXNFLSPREAD-26NOV08LVSF-LV2` |
| Spread: Raiders (-2.5) | Las Vegas wins by over 2.5 points? | `KXNFLSPREAD-26NOV08LVSF-LV3` |
| Spread: Raiders (-3.5) | Las Vegas wins by over 3.5 points? | `KXNFLSPREAD-26NOV08LVSF-LV4` |
| Spread: Raiders (-4.5) | Las Vegas wins by over 4.5 points? | `KXNFLSPREAD-26NOV08LVSF-LV5` |
| Spread: Raiders (-5.5) | Las Vegas wins by over 5.5 points? | `KXNFLSPREAD-26NOV08LVSF-LV6` |
| Spread: Raiders (-6.5) | Las Vegas wins by over 6.5 points? | `KXNFLSPREAD-26NOV08LVSF-LV7` |
| Spread: Raiders (-7.5) | Las Vegas wins by over 7.5 points? | `KXNFLSPREAD-26NOV08LVSF-LV8` |
| Spread: 49ers (-9.5) | San Francisco wins by over 9.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF10` |
| Spread: 49ers (-10.5) | San Francisco wins by over 10.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF11` |
| Spread: 49ers (-13.5) | San Francisco wins by over 13.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF14` |
| Spread: 49ers (-14.5) | San Francisco wins by over 14.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF15` |
| Spread: 49ers (-16.5) | San Francisco wins by over 16.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF17` |
| Spread: 49ers (-17.5) | San Francisco wins by over 17.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF18` |
| Spread: 49ers (-1.5) | San Francisco wins by over 1.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF2` |
| Spread: 49ers (-20.5) | San Francisco wins by over 20.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF21` |
| Spread: 49ers (-2.5) | San Francisco wins by over 2.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF3` |
| Spread: 49ers (-3.5) | San Francisco wins by over 3.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF4` |
| Spread: 49ers (-4.5) | San Francisco wins by over 4.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF5` |
| Spread: 49ers (-5.5) | San Francisco wins by over 5.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF6` |
| Spread: 49ers (-6.5) | San Francisco wins by over 6.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF7` |
| Spread: 49ers (-7.5) | San Francisco wins by over 7.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF8` |
| Spread: 49ers (-8.5) | San Francisco wins by over 8.5 points? | `KXNFLSPREAD-26NOV08LVSF-SF9` |

## NFL total (69)

| Polymarket | Kalshi | Kalshi ticker |
|---|---|---|
| Cardinals vs. Seahawks: O/U 26.5 | Full Game: over 26.5 points scored? | `KXNFLTOTAL-26NOV08ARISEA-27` |
| Cardinals vs. Seahawks: O/U 32.5 | Full Game: over 32.5 points scored? | `KXNFLTOTAL-26NOV08ARISEA-33` |
| Cardinals vs. Seahawks: O/U 38.5 | Full Game: over 38.5 points scored? | `KXNFLTOTAL-26NOV08ARISEA-39` |
| Cardinals vs. Seahawks: O/U 42.5 | Full Game: over 42.5 points scored? | `KXNFLTOTAL-26NOV08ARISEA-43` |
| Cardinals vs. Seahawks: O/U 44.5 | Full Game: over 44.5 points scored? | `KXNFLTOTAL-26NOV08ARISEA-45` |
| Cardinals vs. Seahawks: O/U 46.5 | Full Game: over 46.5 points scored? | `KXNFLTOTAL-26NOV08ARISEA-47` |
| Cardinals vs. Seahawks: O/U 50.5 | Full Game: over 50.5 points scored? | `KXNFLTOTAL-26NOV08ARISEA-51` |
| Cardinals vs. Seahawks: O/U 56.5 | Full Game: over 56.5 points scored? | `KXNFLTOTAL-26NOV08ARISEA-57` |
| Cardinals vs. Seahawks: O/U 62.5 | Full Game: over 62.5 points scored? | `KXNFLTOTAL-26NOV08ARISEA-63` |
| Bengals vs. Falcons: O/U 28.5 | Full Game: over 28.5 points scored? | `KXNFLTOTAL-26NOV08CINATL-29` |
| Bengals vs. Falcons: O/U 34.5 | Full Game: over 34.5 points scored? | `KXNFLTOTAL-26NOV08CINATL-35` |
| Bengals vs. Falcons: O/U 40.5 | Full Game: over 40.5 points scored? | `KXNFLTOTAL-26NOV08CINATL-41` |
| Bengals vs. Falcons: O/U 46.5 | Full Game: over 46.5 points scored? | `KXNFLTOTAL-26NOV08CINATL-47` |
| Bengals vs. Falcons: O/U 48.5 | Full Game: over 48.5 points scored? | `KXNFLTOTAL-26NOV08CINATL-49` |
| Bengals vs. Falcons: O/U 50.5 | Full Game: over 50.5 points scored? | `KXNFLTOTAL-26NOV08CINATL-51` |
| Bengals vs. Falcons: O/U 52.5 | Full Game: over 52.5 points scored? | `KXNFLTOTAL-26NOV08CINATL-53` |
| Bengals vs. Falcons: O/U 58.5 | Full Game: over 58.5 points scored? | `KXNFLTOTAL-26NOV08CINATL-59` |
| Bengals vs. Falcons: O/U 64.5 | Full Game: over 64.5 points scored? | `KXNFLTOTAL-26NOV08CINATL-65` |
| Browns vs. Saints: O/U 28.5 | Full Game: over 28.5 points scored? | `KXNFLTOTAL-26NOV08CLENO-29` |
| Browns vs. Saints: O/U 34.5 | Full Game: over 34.5 points scored? | `KXNFLTOTAL-26NOV08CLENO-35` |
| Browns vs. Saints: O/U 40.5 | Full Game: over 40.5 points scored? | `KXNFLTOTAL-26NOV08CLENO-41` |
| Browns vs. Saints: O/U 42.5 | Full Game: over 42.5 points scored? | `KXNFLTOTAL-26NOV08CLENO-43` |
| Browns vs. Saints: O/U 44.5 | Full Game: over 44.5 points scored? | `KXNFLTOTAL-26NOV08CLENO-45` |
| Browns vs. Saints: O/U 46.5 | Full Game: over 46.5 points scored? | `KXNFLTOTAL-26NOV08CLENO-47` |
| Browns vs. Saints: O/U 52.5 | Full Game: over 52.5 points scored? | `KXNFLTOTAL-26NOV08CLENO-53` |
| Browns vs. Saints: O/U 58.5 | Full Game: over 58.5 points scored? | `KXNFLTOTAL-26NOV08CLENO-59` |
| Browns vs. Saints: O/U 64.5 | Full Game: over 64.5 points scored? | `KXNFLTOTAL-26NOV08CLENO-65` |
| Cowboys vs. Colts: O/U 34.5 | Full Game: over 34.5 points scored? | `KXNFLTOTAL-26NOV08DALIND-35` |
| Cowboys vs. Colts: O/U 40.5 | Full Game: over 40.5 points scored? | `KXNFLTOTAL-26NOV08DALIND-41` |
| Cowboys vs. Colts: O/U 46.5 | Full Game: over 46.5 points scored? | `KXNFLTOTAL-26NOV08DALIND-47` |
| Cowboys vs. Colts: O/U 50.5 | Full Game: over 50.5 points scored? | `KXNFLTOTAL-26NOV08DALIND-51` |
| Cowboys vs. Colts: O/U 52.5 | Full Game: over 52.5 points scored? | `KXNFLTOTAL-26NOV08DALIND-53` |
| Cowboys vs. Colts: O/U 54.5 | Full Game: over 54.5 points scored? | `KXNFLTOTAL-26NOV08DALIND-55` |
| Cowboys vs. Colts: O/U 58.5 | Full Game: over 58.5 points scored? | `KXNFLTOTAL-26NOV08DALIND-59` |
| Cowboys vs. Colts: O/U 64.5 | Full Game: over 64.5 points scored? | `KXNFLTOTAL-26NOV08DALIND-65` |
| Broncos vs. Panthers: O/U 26.5 | Full Game: over 26.5 points scored? | `KXNFLTOTAL-26NOV08DENCAR-27` |
| Broncos vs. Panthers: O/U 32.5 | Full Game: over 32.5 points scored? | `KXNFLTOTAL-26NOV08DENCAR-33` |
| Broncos vs. Panthers: O/U 38.5 | Full Game: over 38.5 points scored? | `KXNFLTOTAL-26NOV08DENCAR-39` |
| Broncos vs. Panthers: O/U 42.5 | Full Game: over 42.5 points scored? | `KXNFLTOTAL-26NOV08DENCAR-43` |
| Broncos vs. Panthers: O/U 44.5 | Full Game: over 44.5 points scored? | `KXNFLTOTAL-26NOV08DENCAR-45` |
| Broncos vs. Panthers: O/U 46.5 | Full Game: over 46.5 points scored? | `KXNFLTOTAL-26NOV08DENCAR-47` |
| Broncos vs. Panthers: O/U 50.5 | Full Game: over 50.5 points scored? | `KXNFLTOTAL-26NOV08DENCAR-51` |
| Broncos vs. Panthers: O/U 56.5 | Full Game: over 56.5 points scored? | `KXNFLTOTAL-26NOV08DENCAR-57` |
| Broncos vs. Panthers: O/U 62.5 | Full Game: over 62.5 points scored? | `KXNFLTOTAL-26NOV08DENCAR-63` |
| Lions vs. Dolphins: O/U 30.5 | Full Game: over 30.5 points scored? | `KXNFLTOTAL-26NOV08DETMIA-31` |
| Lions vs. Dolphins: O/U 36.5 | Full Game: over 36.5 points scored? | `KXNFLTOTAL-26NOV08DETMIA-37` |
| Lions vs. Dolphins: O/U 42.5 | Full Game: over 42.5 points scored? | `KXNFLTOTAL-26NOV08DETMIA-43` |
| Lions vs. Dolphins: O/U 46.5 | Full Game: over 46.5 points scored? | `KXNFLTOTAL-26NOV08DETMIA-47` |
| Lions vs. Dolphins: O/U 48.5 | Full Game: over 48.5 points scored? | `KXNFLTOTAL-26NOV08DETMIA-49` |
| Lions vs. Dolphins: O/U 50.5 | Full Game: over 50.5 points scored? | `KXNFLTOTAL-26NOV08DETMIA-51` |
| Lions vs. Dolphins: O/U 54.5 | Full Game: over 54.5 points scored? | `KXNFLTOTAL-26NOV08DETMIA-55` |
| Lions vs. Dolphins: O/U 60.5 | Full Game: over 60.5 points scored? | `KXNFLTOTAL-26NOV08DETMIA-61` |
| Packers vs. Patriots: O/U 26.5 | Full Game: over 26.5 points scored? | `KXNFLTOTAL-26NOV08GBNE-27` |
| Packers vs. Patriots: O/U 32.5 | Full Game: over 32.5 points scored? | `KXNFLTOTAL-26NOV08GBNE-33` |
| Packers vs. Patriots: O/U 38.5 | Full Game: over 38.5 points scored? | `KXNFLTOTAL-26NOV08GBNE-39` |
| Packers vs. Patriots: O/U 44.5 | Full Game: over 44.5 points scored? | `KXNFLTOTAL-26NOV08GBNE-45` |
| Packers vs. Patriots: O/U 46.5 | Full Game: over 46.5 points scored? | `KXNFLTOTAL-26NOV08GBNE-47` |
| Packers vs. Patriots: O/U 48.5 | Full Game: over 48.5 points scored? | `KXNFLTOTAL-26NOV08GBNE-49` |
| Packers vs. Patriots: O/U 50.5 | Full Game: over 50.5 points scored? | `KXNFLTOTAL-26NOV08GBNE-51` |
| Packers vs. Patriots: O/U 56.5 | Full Game: over 56.5 points scored? | `KXNFLTOTAL-26NOV08GBNE-57` |
| Packers vs. Patriots: O/U 62.5 | Full Game: over 62.5 points scored? | `KXNFLTOTAL-26NOV08GBNE-63` |
| Raiders vs. 49ers: O/U 32.5 | Full Game: over 32.5 points scored? | `KXNFLTOTAL-26NOV08LVSF-33` |
| Raiders vs. 49ers: O/U 38.5 | Full Game: over 38.5 points scored? | `KXNFLTOTAL-26NOV08LVSF-39` |
| Raiders vs. 49ers: O/U 44.5 | Full Game: over 44.5 points scored? | `KXNFLTOTAL-26NOV08LVSF-45` |
| Raiders vs. 49ers: O/U 48.5 | Full Game: over 48.5 points scored? | `KXNFLTOTAL-26NOV08LVSF-49` |
| Raiders vs. 49ers: O/U 50.5 | Full Game: over 50.5 points scored? | `KXNFLTOTAL-26NOV08LVSF-51` |
| Raiders vs. 49ers: O/U 52.5 | Full Game: over 52.5 points scored? | `KXNFLTOTAL-26NOV08LVSF-53` |
| Raiders vs. 49ers: O/U 56.5 | Full Game: over 56.5 points scored? | `KXNFLTOTAL-26NOV08LVSF-57` |
| Raiders vs. 49ers: O/U 62.5 | Full Game: over 62.5 points scored? | `KXNFLTOTAL-26NOV08LVSF-63` |

## NHL moneyline (28)

| Polymarket | Kalshi | Kalshi ticker |
|---|---|---|
| Ducks vs. Canucks | Anaheim wins | `KXNHLGAME-26NOV03ANAVAN-ANA` |
| Hurricanes vs. Predators | Carolina wins | `KXNHLGAME-26NOV03CARNSH-CAR` |
| Blackhawks vs. Panthers | Chicago wins | `KXNHLGAME-26NOV04CHIFLA-CHI` |
| Senators vs. Sabres | Ottawa wins | `KXNHLGAME-26NOV04OTTBUF-OTT` |
| Sharks vs. Kings | San Jose wins | `KXNHLGAME-26NOV04SJLA-SJ` |
| Ducks vs. Oilers | Anaheim wins | `KXNHLGAME-26NOV05ANAEDM-ANA` |
| Bruins vs. Penguins | Boston wins | `KXNHLGAME-26NOV05BOSPIT-BOS` |
| Blackhawks vs. Lightning | Chicago wins | `KXNHLGAME-26NOV05CHITB-CHI` |
| Stars vs. Blue Jackets | Dallas wins | `KXNHLGAME-26NOV05DALCBJ-DAL` |
| Predators vs. Avalanche | Nashville wins | `KXNHLGAME-26NOV05NSHCOL-NSH` |
| Canucks vs. Jets | Vancouver wins | `KXNHLGAME-26NOV05VANWPG-VAN` |
| Blue Jackets vs. Sabres | Columbus wins | `KXNHLGAME-26NOV06CBJBUF-CBJ` |
| Sharks vs. Wild | San Jose wins | `KXNHLGAME-26NOV06SJMIN-SJ` |
| Blackhawks vs. Hurricanes | Chicago wins | `KXNHLGAME-26NOV07CHICAR-CHI` |
| Red Wings vs. Avalanche | Detroit wins | `KXNHLGAME-26NOV07DETCOL-DET` |
| Panthers vs. Capitals | Florida wins | `KXNHLGAME-26NOV07FLAWSH-FLA` |
| Penguins vs. Kings | Pittsburgh wins | `KXNHLGAME-26NOV07PITLA-PIT` |
| Sharks vs. Stars | San Jose wins | `KXNHLGAME-26NOV07SJDAL-SJ` |
| Lightning vs. Wild | Tampa Bay wins | `KXNHLGAME-26NOV07TBMIN-TB` |
| Canucks vs. Oilers | Vancouver wins | `KXNHLGAME-26NOV07VANEDM-VAN` |
| Panthers vs. Bruins | Florida wins | `KXNHLGAME-26NOV08FLABOS-FLA` |
| Penguins vs. Ducks | Pittsburgh wins | `KXNHLGAME-26NOV08PITANA-PIT` |
| Lightning vs. Jets | Tampa Bay wins | `KXNHLGAME-26NOV08TBWPG-TB` |
| Flyers vs. Canucks | Philadelphia wins | `KXNHLGAME-26NOV09PHIVAN-PHI` |
| Avalanche vs. Maple Leafs | Colorado wins | `KXNHLGAME-26NOV10COLTOR-COL` |
| Red Wings vs. Blues | Detroit wins | `KXNHLGAME-26NOV10DETSTL-DET` |
| Panthers vs. Blue Jackets | Florida wins | `KXNHLGAME-26NOV10FLACBJ-FLA` |
| Capitals vs. Senators | Washington wins | `KXNHLGAME-26NOV10WSHOTT-WSH` |
