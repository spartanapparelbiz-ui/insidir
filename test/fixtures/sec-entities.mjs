/* Real SEC EDGAR responses captured on 2026-10-20 (trimmed to the fields Insidir reads): submissions for Apple,
 * Meta (renamed from Facebook), Tim Cook (an individual reporting owner), Berkshire Hathaway Energy (an operating
 * company with no ticker) and Twitter (acquired; no longer listed); EDGAR's entity lookup for "berkshire hath"; and
 * lines from the daily form index for 2026-10-15. Expected values in the tests are read from these documents. */
export const SUBMISSIONS = {
 "0000320193": {
  "cik": "0000320193",
  "entityType": "operating",
  "sic": "3571",
  "sicDescription": "Electronic Computers",
  "name": "Apple Inc.",
  "tickers": [
   "AAPL"
  ],
  "exchanges": [
   "Nasdaq"
  ],
  "stateOfIncorporation": "CA",
  "formerNames": [
   {
    "name": "APPLE INC",
    "from": "2007-01-10T05:00:00.000Z",
    "to": "2019-08-05T04:00:00.000Z"
   },
   {
    "name": "APPLE COMPUTER INC",
    "from": "1994-01-26T05:00:00.000Z",
    "to": "2007-01-04T05:00:00.000Z"
   },
   {
    "name": "APPLE COMPUTER INC/ FA",
    "from": "1997-07-28T04:00:00.000Z",
    "to": "1997-07-28T04:00:00.000Z"
   }
  ],
  "insiderTransactionForOwnerExists": 0,
  "insiderTransactionForIssuerExists": 1,
  "filings": {
   "recent": {
    "accessionNumber": [
     "0001140361-26-040127",
     "0001140361-26-040126",
     "0001950047-26-010286",
     "0001140361-26-039785",
     "0001140361-26-039158"
    ],
    "filingDate": [
     "2026-10-19",
     "2026-10-19",
     "2026-10-16",
     "2026-10-15",
     "2026-10-08"
    ],
    "reportDate": [
     "2026-10-15",
     "2026-10-15",
     "",
     "2026-10-13",
     "2026-10-06"
    ],
    "form": [
     "4",
     "4",
     "144",
     "4",
     "4"
    ]
   },
   "files": [
    {
     "name": "CIK0000320193-submissions-001.json",
     "filingCount": 1268,
     "filingFrom": "1994-01-26",
     "filingTo": "2015-09-30"
    }
   ]
  }
 },
 "0001326801": {
  "cik": "0001326801",
  "entityType": "operating",
  "sic": "7370",
  "sicDescription": "Services-Computer Programming, Data Processing, Etc.",
  "name": "Meta Platforms, Inc.",
  "tickers": [
   "META"
  ],
  "exchanges": [
   "Nasdaq"
  ],
  "stateOfIncorporation": "DE",
  "formerNames": [
   {
    "name": "Facebook Inc",
    "from": "2005-05-06T04:00:00.000Z",
    "to": "2021-10-27T04:00:00.000Z"
   }
  ],
  "insiderTransactionForOwnerExists": 0,
  "insiderTransactionForIssuerExists": 1,
  "filings": {
   "recent": {
    "accessionNumber": [
     "0001921094-26-001104",
     "0000950103-26-015598",
     "0001921094-26-001084",
     "0000950103-26-015324",
     "0001921094-26-001069"
    ],
    "filingDate": [
     "2026-10-19",
     "2026-10-14",
     "2026-10-13",
     "2026-10-07",
     "2026-10-05"
    ],
    "reportDate": [
     "",
     "2026-10-12",
     "",
     "2026-10-05",
     ""
    ],
    "form": [
     "144",
     "4",
     "144",
     "4",
     "144"
    ]
   },
   "files": [
    {
     "name": "CIK0001326801-submissions-001.json",
     "filingCount": 2007,
     "filingFrom": "2017-05-17",
     "filingTo": "2024-06-18"
    },
    {
     "name": "CIK0001326801-submissions-002.json",
     "filingCount": 1192,
     "filingFrom": "2005-05-06",
     "filingTo": "2017-05-15"
    }
   ]
  }
 },
 "0001214156": {
  "cik": "0001214156",
  "entityType": "other",
  "sic": "",
  "sicDescription": "",
  "name": "COOK TIMOTHY D",
  "tickers": [],
  "exchanges": [],
  "stateOfIncorporation": "",
  "formerNames": [],
  "insiderTransactionForOwnerExists": 1,
  "insiderTransactionForIssuerExists": 0,
  "filings": {
   "recent": {
    "accessionNumber": [
     "0001140361-26-038674",
     "0001959173-26-007235",
     "0001140361-26-038021",
     "0000320187-26-000147",
     "0000320187-26-000049"
    ],
    "filingDate": [
     "2026-10-05",
     "2026-10-02",
     "2026-09-29",
     "2026-09-10",
     "2026-04-14"
    ],
    "reportDate": [
     "2026-10-01",
     "",
     "2026-09-27",
     "2026-09-08",
     "2026-04-10"
    ],
    "form": [
     "4",
     "144",
     "4",
     "4",
     "4"
    ]
   },
   "files": []
  }
 },
 "0001081316": {
  "cik": "0001081316",
  "entityType": "operating",
  "sic": "4900",
  "sicDescription": "Electric, Gas & Sanitary Services",
  "name": "BERKSHIRE HATHAWAY ENERGY CO",
  "tickers": [],
  "exchanges": [],
  "stateOfIncorporation": "IA",
  "formerNames": [
   {
    "name": "MIDAMERICAN ENERGY HOLDINGS CO /NEW/",
    "from": "1999-12-27T00:00:00.000Z",
    "to": "2014-04-10T00:00:00.000Z"
   },
   {
    "name": "MID AMERICAN ENERGY HOLDINGS CO /NEW/",
    "from": "1999-03-12T00:00:00.000Z",
    "to": "1999-03-12T00:00:00.000Z"
   }
  ],
  "insiderTransactionForOwnerExists": 0,
  "insiderTransactionForIssuerExists": 0,
  "filings": {
   "recent": {
    "accessionNumber": [
     "0001081316-26-000021",
     "0001081316-26-000017",
     "0001081316-26-000013",
     "0001081316-26-000009",
     "0001081316-26-000005"
    ],
    "filingDate": [
     "2026-09-25",
     "2026-08-10",
     "2026-05-04",
     "2026-04-10",
     "2026-03-26"
    ],
    "reportDate": [
     "",
     "2026-06-30",
     "2026-03-31",
     "2026-04-08",
     "2026-03-26"
    ],
    "form": [
     "SD",
     "10-Q",
     "10-Q",
     "8-K",
     "8-K"
    ]
   },
   "files": []
  }
 },
 "0001418091": {
  "cik": "0001418091",
  "entityType": "operating",
  "sic": "7370",
  "sicDescription": "Services-Computer Programming, Data Processing, Etc.",
  "name": "TWITTER, INC.",
  "tickers": [],
  "exchanges": [],
  "stateOfIncorporation": "DE",
  "formerNames": [
   {
    "name": "Twitter Inc",
    "from": "2007-11-30T00:00:00.000Z",
    "to": "2010-01-08T00:00:00.000Z"
   }
  ],
  "insiderTransactionForOwnerExists": 0,
  "insiderTransactionForIssuerExists": 1,
  "filings": {
   "recent": {
    "accessionNumber": [
     "0001140361-22-044318",
     "0001140361-22-044317",
     "0001140361-22-044316",
     "0001418091-22-000191",
     "0001193125-22-279042"
    ],
    "filingDate": [
     "2022-12-02",
     "2022-12-02",
     "2022-12-02",
     "2022-11-08",
     "2022-11-07"
    ],
    "reportDate": [
     "2022-10-27",
     "2022-10-27",
     "2022-10-27",
     "2022-10-27",
     ""
    ],
    "form": [
     "4",
     "4",
     "4",
     "4",
     "15-12G"
    ]
   },
   "files": [
    {
     "name": "CIK0001418091-submissions-001.json",
     "filingCount": 372,
     "filingFrom": "2007-11-30",
     "filingTo": "2015-10-29"
    }
   ]
  }
 }
};
export const EFTS_BERKSHIRE = {
 "hits": {
  "hits": [
   {
    "_id": "1067983",
    "_source": {
     "entity": "BERKSHIRE HATHAWAY INC (BRK-B, BRK-A)",
     "tickers": "BRK-B, BRK-A"
    }
   },
   {
    "_id": "1081316",
    "_source": {
     "entity": "BERKSHIRE HATHAWAY ENERGY CO",
     "tickers": null
    }
   },
   {
    "_id": "1274791",
    "_source": {
     "entity": "BERKSHIRE HATHAWAY FINANCE CORP",
     "tickers": null
    }
   },
   {
    "_id": "829771",
    "_source": {
     "entity": "Berkshire Hathaway Homestate Insurance Co.",
     "tickers": null
    }
   },
   {
    "_id": "1015867",
    "_source": {
     "entity": "BERKSHIRE HATHAWAY LIFE INSURANCE CO OF NEBRASKA",
     "tickers": null
    }
   }
  ]
 }
};
export const DAILY_INDEX_20261015 = "Description:           Daily Index of EDGAR Dissemination Feed by Form Type\nLast Data Received:    Oct 15, 2026\nComments:              webmaster@sec.gov\nAnonymous FTP:         ftp://ftp.sec.gov/edgar/\n \n \n \n \nForm Type   Company Name                                                  CIK\n      Date Filed  File Name\n---------------------------------------------------------------------------------------------------------------------------------------------\n4                A.K.A. BRANDS HOLDING CORP.                                   1865107     20261015    edgar/data/1865107/0001628280-26-066035.txt                                                \n4                ABSHER JODY K                                                 1815401     20261015    edgar/data/1815401/0001815401-26-000006.txt                                                \n4                ADAR1 Capital Management, LLC                                 1940272     20261015    edgar/data/1940272/0001940272-26-000025.txt                                                \n4                AETHLON MEDICAL INC                                           882291      20261015    edgar/data/882291/0001683168-26-007878.txt                                                \n4                AETHLON MEDICAL INC                                           882291      20261015    edgar/data/882291/0001683168-26-007879.txt                                                \n4                AETHLON MEDICAL INC                                           882291      20261015    edgar/data/882291/0001683168-26-007881.txt                                                \n4/A              AETHLON MEDICAL INC                                           882291      20261015    edgar/data/882291/0001683168-26-007880.txt                                                \n4/A              AJB Capital, LLC                                              2141914     20261015    edgar/data/2141914/0001536588-26-000042.txt                                                \n3                ALABEDIN ALI MOHAMMAD AHMAD MOHAMMAD                          2159719     20261015    edgar/data/2159719/0001213900-26-109968.txt                                                \n8-K              ACTELIS NETWORKS INC                                          1141284     20261015    edgar/data/1141284/0001213900-26-109880.txt                                                \n424B2            BANK OF AMERICA CORP /DE/                                     70858       20261015    edgar/data/70858/0001918704-26-031483.txt                                                \n";
