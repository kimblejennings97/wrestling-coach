// Practice types. `attrs` = which attributes a focus trains (weights sum to 1). fat/inj = relative fatigue and injury load.
export const PRACTICE = {
  strength:     { label: 'Strength training',        attrs: { str: 0.8, topc: 0.2 },                         fat: 1.0, inj: 0.8 },
  conditioning: { label: 'Conditioning',             attrs: { cardio: 1 },                                   fat: 1.2, inj: 0.7 },
  speed:        { label: 'Speed & agility',          attrs: { speed: 0.8, flex: 0.2 },                       fat: 0.9, inj: 0.8 },
  flexibility:  { label: 'Flexibility & mobility',   attrs: { flex: 1 },                                     fat: 0.4, inj: 0.4 },
  shots:        { label: 'Takedown offense drills',  attrs: { tdo: 0.8, speed: 0.2 },                        fat: 1.0, inj: 1.0 },
  tdd:          { label: 'Takedown defense drills',  attrs: { tdd: 0.9, hand: 0.1 },                         fat: 0.9, inj: 0.9 },
  hand:         { label: 'Hand fighting & ties',     attrs: { hand: 1 },                                     fat: 0.8, inj: 0.7 },
  topride:      { label: 'Top control (riding)',     attrs: { topc: 1 },                                     fat: 1.0, inj: 0.9 },
  topturns:     { label: 'Top turns & pinning',      attrs: { topt: 1 },                                     fat: 1.0, inj: 1.1 },
  escapes:      { label: 'Bottom control & escapes', attrs: { botEsc: 1 },                                   fat: 1.0, inj: 0.9 },
  botdef:       { label: 'Bottom resistance',        attrs: { botRes: 1 },                                   fat: 1.0, inj: 1.0 },
  bigmoves:     { label: 'Big moves & throws',       attrs: { big: 0.8, str: 0.2 },                          fat: 1.1, inj: 1.5 },
  film:         { label: 'Film study & mental',      attrs: { iq: 0.7, comp: 0.3 },                          fat: 0.2, inj: 0.1 },
  live:         { label: 'Live wrestling',           attrs: { tdo: 0.2, tdd: 0.2, hand: 0.2, topc: 0.1, botEsc: 0.1, iq: 0.2 }, fat: 1.5, inj: 1.8 },
  recovery:     { label: 'Recovery & rehab',         attrs: {},                                              fat: 0.0, inj: 0.1, recover: true },
};
export const INTENSITY = {
  light:  { label: 'Light (taper / recover)', gain: 0.7, fat: 2.5, inj: 0.5 },   // fatigue eased 2026-11-09 (was 3 / 9 / 15)
  normal: { label: 'Normal',                  gain: 1.0, fat: 7.5, inj: 1.0 },
  hard:   { label: 'Hard (build)',            gain: 1.3, fat: 11,  inj: 1.6 },
};
export const FOCUS_SHARES = [0.5, 0.3, 0.2];
