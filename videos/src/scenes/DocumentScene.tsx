import React from "react";
import { AbsoluteFill } from "remotion";
import { C, MONO, SERIF, SAFE, label } from "../brand/tokens";
import { cameraTransform, cue } from "../engine/motion";
import { Night, SceneChrome, type Of, type SceneProps } from "./common";

// Blank SEC forms, typeset from the forms' own wording. Nothing is filled in: no filer, no figures.
// Each form lists the phrases a scene can highlight (by index).
const serif = (size: number, weight = 420, extra: React.CSSProperties = {}): React.CSSProperties => ({ fontFamily: SERIF, fontSize: size, fontWeight: weight, lineHeight: 1.22, color: C.night, fontVariationSettings: `'opsz' ${Math.min(60, Math.max(8, size / 2))}`, ...extra });
const box: React.CSSProperties = { border: `2px solid ${C.night}`, padding: "14px 16px" };
const blank = (w: number | string) => <span style={{ display: "inline-block", width: w, borderBottom: `2px solid ${C.night}`, transform: "translateY(-6px)" }} />;
const check = (on = false) => <span style={{ display: "inline-block", width: 24, height: 24, border: `2px solid ${C.night}`, marginRight: 12, verticalAlign: "-3px", background: on ? C.night : "transparent" }} />;

type Mark = (i: number, node: React.ReactNode) => React.ReactNode;

const Form4: React.FC<{ mark: Mark }> = ({ mark }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
    <div style={{ display: "grid", gridTemplateColumns: "190px 1fr 250px", gap: 0, border: `2px solid ${C.night}` }}>
      <div style={{ ...box, border: "none", borderRight: `2px solid ${C.night}`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={serif(64, 800, { lineHeight: 1 })}>FORM 4</div>
      </div>
      <div style={{ ...box, border: "none", textAlign: "center" }}>
        <div style={serif(27, 700)}>UNITED STATES SECURITIES AND EXCHANGE COMMISSION</div>
        <div style={serif(23)}>Washington, D.C. 20549</div>
        <div style={{ ...serif(33, 800), margin: "14px 0 8px" }}>{mark(0, "STATEMENT OF CHANGES IN BENEFICIAL OWNERSHIP")}</div>
        <div style={serif(19)}>{mark(1, "Filed pursuant to Section 16(a) of the Securities Exchange Act of 1934")} or Section 30(h) of the Investment Company Act of 1940</div>
      </div>
      <div style={{ ...box, border: "none", borderLeft: `2px solid ${C.night}`, ...serif(17) }}>
        <div style={serif(19, 700)}>OMB APPROVAL</div>
        <div style={{ marginTop: 6 }}>OMB Number: 3235-0287</div>
        <div>Estimated average burden hours per response: 0.5</div>
      </div>
    </div>
    <div style={serif(19)}>{check()}Check this box if no longer subject to Section 16. Form 4 or Form 5 obligations may continue. See Instruction 1(b).</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: `2px solid ${C.night}` }}>
      <div style={{ ...box, border: "none", borderRight: `2px solid ${C.night}`, ...serif(19) }}>
        <div style={serif(19, 700)}>1. Name and Address of Reporting Person*</div>
        <div style={{ margin: "26px 0 4px" }}>{blank("100%")}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontStyle: "normal" }}><span>(Last)</span><span>(First)</span><span>(Middle)</span></div>
        <div style={{ margin: "22px 0 4px" }}>{blank("100%")}</div>
        <div>(Street)</div>
        <div style={{ margin: "22px 0 4px" }}>{blank("100%")}</div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>(City)</span><span>(State)</span><span>(Zip)</span></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ ...box, border: "none", borderBottom: `2px solid ${C.night}`, ...serif(19) }}>
          <div style={serif(19, 700)}>2. {mark(2, "Issuer Name and Ticker or Trading Symbol")}</div>
          <div style={{ marginTop: 26 }}>{blank("100%")}</div>
        </div>
        <div style={{ ...box, border: "none", borderBottom: `2px solid ${C.night}`, ...serif(19) }}>
          <div style={serif(19, 700)}>3. {mark(3, "Date of Earliest Transaction")} (Month/Day/Year)</div>
          <div style={{ marginTop: 26 }}>{blank("60%")}</div>
        </div>
        <div style={{ ...box, border: "none", ...serif(19) }}>
          <div style={serif(19, 700)}>5. Relationship of Reporting Person(s) to Issuer</div>
          <div style={{ marginTop: 8 }}>(Check all applicable)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 8, marginTop: 10 }}>
            <span>{check()}Director</span><span>{check()}10% Owner</span>
            <span>{check()}Officer (give title below)</span><span>{check()}Other (specify below)</span>
          </div>
        </div>
      </div>
    </div>
    <div style={{ border: `2px solid ${C.night}` }}>
      <div style={{ ...box, border: "none", borderBottom: `2px solid ${C.night}`, textAlign: "center", ...serif(22, 800) }}>{mark(4, "Table I - Non-Derivative Securities Acquired, Disposed of, or Beneficially Owned")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr 1.5fr 1.2fr", ...serif(16) }}>
        {["1. Title of Security (Instr. 3)", "2. Transaction Date (Month/Day/Year)", "2A. Deemed Execution Date, if any", "3. Transaction Code (Instr. 8)", "4. Securities Acquired (A) or Disposed Of (D) (Instr. 3, 4 and 5)", "5. Amount of Securities Beneficially Owned Following Reported Transaction(s)"].map((h, i) => (
          <div key={i} style={{ padding: "10px 10px 70px", borderRight: i < 5 ? `2px solid ${C.night}` : "none", fontWeight: 600 }}>{h}</div>
        ))}
      </div>
    </div>
  </div>
);

const Form10K: React.FC<{ mark: Mark }> = ({ mark }) => (
  <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 20 }}>
    <div style={serif(34, 700)}>UNITED STATES</div>
    <div style={serif(40, 800)}>SECURITIES AND EXCHANGE COMMISSION</div>
    <div style={serif(26)}>Washington, D.C. 20549</div>
    <div style={{ height: 2, background: C.night, margin: "8px 120px" }} />
    <div style={serif(96, 800, { lineHeight: 1 })}>{mark(0, "FORM 10-K")}</div>
    <div style={{ height: 2, background: C.night, margin: "8px 120px" }} />
    <div style={serif(22)}>(Mark One)</div>
    <div style={{ ...serif(25, 700), textAlign: "left" }}>{check()}{mark(1, "ANNUAL REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934")}</div>
    <div style={serif(23)}>For the fiscal year ended {blank(260)}</div>
    <div style={serif(23, 700)}>OR</div>
    <div style={{ ...serif(25, 700), textAlign: "left" }}>{check()}TRANSITION REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934</div>
    <div style={serif(23)}>For the transition period from {blank(160)} to {blank(160)}</div>
    <div style={serif(23)}>Commission File Number {blank(220)}</div>
    <div style={{ marginTop: 30 }}>{blank("80%")}</div>
    <div style={serif(21)}>{mark(2, "(Exact name of registrant as specified in its charter)")}</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, marginTop: 24, ...serif(19) }}>
      <div>{blank("100%")}<div style={{ marginTop: 8 }}>(State or other jurisdiction of incorporation or organization)</div></div>
      <div>{blank("100%")}<div style={{ marginTop: 8 }}>(I.R.S. Employer Identification No.)</div></div>
    </div>
    <div style={{ ...serif(21, 700), marginTop: 26 }}>{mark(3, "Securities registered pursuant to Section 12(b) of the Act:")}</div>
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 1.2fr", ...serif(18), borderTop: `2px solid ${C.night}`, paddingTop: 10 }}>
      <span>Title of each class</span><span>Trading Symbol(s)</span><span>Name of each exchange on which registered</span>
    </div>
  </div>
);

const Form8K: React.FC<{ mark: Mark }> = ({ mark }) => (
  <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 20 }}>
    <div style={serif(34, 700)}>UNITED STATES</div>
    <div style={serif(40, 800)}>SECURITIES AND EXCHANGE COMMISSION</div>
    <div style={serif(26)}>Washington, D.C. 20549</div>
    <div style={{ height: 2, background: C.night, margin: "8px 120px" }} />
    <div style={serif(96, 800, { lineHeight: 1 })}>{mark(0, "FORM 8-K")}</div>
    <div style={serif(36, 800)}>{mark(1, "CURRENT REPORT")}</div>
    <div style={serif(24)}>Pursuant to Section 13 or 15(d) of the Securities Exchange Act of 1934</div>
    <div style={serif(23)}>{mark(2, "Date of Report (Date of earliest event reported)")}: {blank(220)}</div>
    <div style={{ marginTop: 26 }}>{blank("80%")}</div>
    <div style={serif(21)}>(Exact name of registrant as specified in its charter)</div>
    <div style={{ ...serif(21), textAlign: "left", marginTop: 26 }}>Check the appropriate box below if the Form 8-K filing is intended to simultaneously satisfy the filing obligation of the registrant under any of the following provisions:</div>
    {["Written communications pursuant to Rule 425 under the Securities Act (17 CFR 230.425)", "Soliciting material pursuant to Rule 14a-12 under the Exchange Act (17 CFR 240.14a-12)", "Pre-commencement communications pursuant to Rule 14d-2(b) under the Exchange Act (17 CFR 240.14d-2(b))", "Pre-commencement communications pursuant to Rule 13e-4(c) under the Exchange Act (17 CFR 240.13e-4(c))"].map((t, i) => (
      <div key={i} style={{ ...serif(20), textAlign: "left" }}>{check()}{i === 0 ? mark(3, t) : t}</div>
    ))}
  </div>
);

const FORMS = { form4: Form4, "10k": Form10K, "8k": Form8K } as const;

/** A blank SEC form on paper, seen at an angle under a slow camera, with one phrase marked in ink. */
export const DocumentScene: React.FC<SceneProps<Of<"document">>> = p => {
  const { scene, frame, span, fpb } = p;
  const sweep = cue(frame, fpb * 1.0, 12);
  const captionIn = cue(frame, fpb * 0.6, 12);
  const Form = FORMS[scene.form];
  const mark: Mark = (i, node) => (i !== scene.highlight ? node : (
    <span style={{ position: "relative", display: "inline" }}>
      <span style={{ position: "absolute", left: -6, right: -6, top: "-0.08em", bottom: "-0.08em", background: C.night, transformOrigin: "left", transform: `scaleX(${sweep})` }} />
      <span style={{ position: "relative", color: sweep > 0.5 ? C.ink : C.night }}>{node}</span>
    </span>
  ));
  return (
    <Night>
      <AbsoluteFill style={{ perspective: 2200, perspectiveOrigin: "50% 40%" }}>
        <AbsoluteFill style={{ transform: `${cameraTransform(scene.camera, frame / span)} rotateX(${scene.tilt}deg) rotateZ(-2.5deg)`, transformOrigin: "50% 45%" }}>
          <div style={{ position: "absolute", left: 40, right: 40, top: 160, minHeight: 1700, background: C.ink, padding: "56px 48px" }}>
            <Form mark={mark} />
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 70% at 50% 46%, rgba(12,12,11,0) 45%, rgba(12,12,11,.86) 100%)" }} />
      {scene.caption && (
        <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, bottom: 1920 - SAFE.bottom, opacity: captionIn, transform: `translateY(${(1 - captionIn) * 12}px)` }}>
          <div style={{ display: "inline-block", background: C.night, padding: "22px 26px", border: `2px solid ${C.line2}` }}>
            <div style={{ ...label(21, C.muted), marginBottom: 10 }}>From the form</div>
            <div style={{ fontFamily: MONO, fontSize: 33, lineHeight: 1.4, color: C.ink }}>{scene.caption}</div>
          </div>
        </div>
      )}
      <SceneChrome p={p} theme="night" />
    </Night>
  );
};
