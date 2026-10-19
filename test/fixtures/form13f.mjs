/* A small, synthetic Form 13F filing (cover page + information table) in the SEC schema, for parser and
 * storage tests only. Not real holdings; never served by the site. */
const PRIMARY = `<?xml version="1.0"?><edgarSubmission xmlns="http://www.sec.gov/edgar/thirteenffiler"><headerData><filerInfo><periodOfReport>06-30-2026</periodOfReport></filerInfo></headerData>
<formData><coverPage><reportCalendarOrQuarter>06-30-2026</reportCalendarOrQuarter><isAmendment>false</isAmendment><filingManager><name>Example Capital LLC</name></filingManager><reportType>13F HOLDINGS REPORT</reportType></coverPage>
<summaryPage><otherIncludedManagersCount>0</otherIncludedManagersCount><tableEntryTotal>3</tableEntryTotal><tableValueTotal>1550</tableValueTotal><isConfidentialOmitted>false</isConfidentialOmitted></summaryPage></formData></edgarSubmission>`;
const TABLE = `<?xml version="1.0"?><ns1:informationTable xmlns:ns1="http://www.sec.gov/edgar/document/thirteenf/informationtable">
<ns1:infoTable><ns1:nameOfIssuer>APPLE INC</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass><ns1:cusip>037833100</ns1:cusip><ns1:value>900</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>9</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt><ns1:investmentDiscretion>SOLE</ns1:investmentDiscretion></ns1:infoTable>
<ns1:infoTable><ns1:nameOfIssuer>BANK AMER CORP</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass><ns1:cusip>060505104</ns1:cusip><ns1:value>150</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>15</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt><ns1:investmentDiscretion>SOLE</ns1:investmentDiscretion></ns1:infoTable>
<ns1:infoTable><ns1:nameOfIssuer>TESLA INC</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass><ns1:cusip>88160R101</ns1:cusip><ns1:value>500</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>2</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt><ns1:putCall>Put</ns1:putCall><ns1:investmentDiscretion>DFND</ns1:investmentDiscretion></ns1:infoTable>
</ns1:informationTable>`;
export const FIXTURE_13F = { PRIMARY, TABLE };
