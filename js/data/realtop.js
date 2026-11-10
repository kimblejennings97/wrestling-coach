// REAL ranked wrestlers: FloWrestling 2026-27 NCAA Championship prediction rankings (JD Rader, Jul 27 2026), top 16 per weight.
// Format per line: tier|class|name|school  (tier = rank 1-8, then 12 = ranks 9-12, 16 = ranks 13-16).
// Pulled by hand from public ranking pages (no full rosters are available: WrestleStat blocks automated access, Trackwrestling/Flo team pages are not fetchable).
// Ambiguous either/or entries resolved to the first name listed; ohio state 125 R16 class year unknown (assumed SO).
// FOR SHARING: set REAL_NAMES_ENABLED false (or delete this file's use in newGame) and the game falls back to fully generated names.
export const REAL_NAMES_ENABLED = true;

const RAW = {
  125: `1|JR|Luke Lilledahl|Penn State
2|SR|Troy Spratley|Oklahoma State
3|JR|Vincent Robinson|Nebraska
4|JR|Marc-Anthony McGowan|Princeton
5|SR|Jore Volk|Minnesota
6|SR|Nico Provo|Stanford
7|SR|Eddie Ventresca|Virginia Tech
8|FR|Anthony Knox|Rutgers
12|FR|Leo Deluca|Iowa
12|SO|Ezekiel Witt|North Dakota State
12|SR|Nicolar Rivera|Maryland
12|SR|Brendan McCrone|North Carolina
16|SR|Trever Anderson|Northern Iowa
16|FR|Christian Castillo|Arizona State
16|FR|Isaiah Cortez|Cornell
16|SO|Vinny Kilkeary|Ohio State`,
  133: `1|SO|Jax Forrest|Oklahoma State
2|SO|Ben Davino|Ohio State
3|SO|Aaron Seidel|Virginia Tech
3|SO|Marcus Blaze|Penn State
5|JR|Ryan Crookham|Iowa
6|JR|Tyler Knox|Stanford
7|SR|Jacob Van Dee|Nebraska
8|SR|Garrett Grice|Iowa State
12|JR|T.K. Davis|Gardner-Webb
12|JR|Tyler Ferrara|Cornell
12|SR|Evan Mougalian|Penn
12|SO|Matty Lopes|Lehigh
16|SO|Gunner Andrick|West Virginia
16|JR|Gage Walker|Missouri
16|FR|Moses Mendoza|Michigan
16|SR|Markel Baker|Northern Illinois`,
  141: `1|JR|Luke Stanich|Lehigh
2|FR|Bo Bassett|Virginia Tech
3|SR|Masanosuke Ono|Penn State
4|SR|Anthony Echemendia|Nebraska
5|SR|Evan Frost|Iowa State
6|SR|Nasir Bailey|Iowa
7|SR|Vance Vombaur|Minnesota
8|FR|Jordyn Raney|Oklahoma State
12|SR|Vince Cornella|Cornell
12|JR|Zeth Romney|Cal Poly
12|SR|Elijah Griffin|Rider
12|SO|Jack Consiglio|Stanford
16|SO|Luke Simcox|North Carolina
16|SO|Caedyn Ricciardi|Navy
16|FR|Kellen Wolbert|Michigan
16|JR|Carter Nogle|Air Force`,
  149: `1|SO|Sergio Vega|Oklahoma State
2|SO|Aden Valencia|Stanford
3|SR|Shayne Van Ness|Penn State
4|SR|Caleb Henson|Virginia Tech
5|SO|Jaxon Joy|Cornell
6|FR|Seth Mendoza|Missouri
7|JR|Ryder Block|Iowa
8|JR|Paniro Johnson|Iowa State
12|JR|Cross Wasilewski|Penn
12|JR|Koy Buesgens|NC State
12|FR|Alex Nini|Rutgers
12|SO|Kyler Larkin|Arizona State
16|SO|Sergio Lemley|Michigan
16|SR|Max Petersen|North Dakota State
16|JR|Brock Herman|Little Rock
16|SO|Kade Brown|Ohio State`,
  157: `1|SO|PJ Duke|Penn State
2|SO|Landon Robideau|Oklahoma State
3|SR|Antrell Taylor|Nebraska
4|JR|Kannon Webster|Illinois
5|JR|Brandon Cannon|Ohio State
6|JR|Ty Watters|West Virginia
7|SR|Daniel Cardenas|Stanford
8|SO|Collin Gaj|Virginia Tech
12|SR|Jude Swisher|Penn
12|SR|Jackson Arrington|NC State
12|SO|Charlie Millard|Minnesota
12|JR|Jacob Frost|Iowa State
16|FR|Daniel Zepeda|Michigan
16|JR|Logan Rozynski|Lehigh
16|JR|Rafael Hipolito|Oklahoma
16|SR|Jordan Williams|Iowa`,
  165: `1|SR|Mitchell Mesenbrink|Penn State
2|SO|LaDarion Lockett|Oklahoma State
3|JR|Nicco Ruiz|Arizona State
4|SR|Joey Blaze|Purdue
5|SR|Bryce Hepner|North Carolina
6|SO|EJ Parco|Stanford
7|SO|LJ Araujo|Nebraska
8|SO|Will Denny|NC State
12|JR|Connor Euton|Iowa State
12|SR|Ryder Downey|Northern Iowa
12|JR|Braeden Scoles|Illinois
12|SO|Cam Catrabone|Michigan
16|FR|Noah Nininger|Virginia Tech
16|SR|Noah Mulvaney|Bucknell
16|SR|Ty Whalen|Princeton
16|FR|Alessio Perentin|Cornell`,
  174: `1|JR|Christopher Minto|Nebraska
2|FR|Jayden James|Penn State
3|JR|Beau Mantanona|Michigan
4|SR|Cam Steed|Missouri
5|SR|Danny Wask|Navy
6|JR|Simon Ruiz|Cornell
7|SO|Kaleb Larkin|Arizona State
8|SO|Zack Ryder|Oklahoma State
12|JR|Gabe Arnold|Iowa
12|SR|Jaxon Smith|Ohio State
12|SR|MJ Gaitan|Iowa State
12|SR|Matthew Singleton|NC State
16|SR|Hunter Garvin|Stanford
16|SO|Colin Kelly|Illinois
16|SO|Ryan Burton|Virginia Tech
16|JR|Moses Espinoza-Owens|South Dakota State`,
  184: `1|JR|Max McEnelly|Minnesota
2|JR|Rocco Welsh|Penn State
3|SO|Angelo Ferrari|Iowa
4|SO|Aeoden Sinclair|Missouri
5|SO|Brock Mantanona|Michigan
6|SR|Bennett Berge|Oklahoma State
7|JR|Eddie Neitenbach|Wyoming
8|SR|Dylan Fishback|Ohio State
12|JR|Shane Cartagena-Walsh|Rutgers
12|SR|Sergio Desiante|Virginia Tech
12|SR|Caleb Campos|American
12|SR|Rylan Rogers|Lehigh
16|SO|Jake Dailey|North Carolina
16|SO|Brian Soldano|Oklahoma
16|JR|Chris Moore|Illinois
16|SR|Lucas Cochran|Nebraska`,
  197: `1|JR|Josh Barr|Penn State
2|SO|Cody Merrill|Oklahoma State
3|SR|Stephen Little|Little Rock
4|SR|Joey Novak|Wyoming
5|JR|Camden McDanel|Nebraska
6|SO|Angelo Posada|Stanford
7|JR|Sonny Sasso|Virginia Tech
8|JR|Justin Rademacher|Oregon State
12|JR|Branson John|Maryland
12|SR|Mac Stout|Pittsburgh
12|JR|Remy Cotton|Rutgers
12|JR|Luke Geog|Missouri
16|SO|Rune Lawrence|West Virginia
16|JR|Andrew Reall|Brown
16|JR|Dillon Bechtold|Bucknell
16|SO|Wyatt Ingham|Wisconsin`,
  285: `1|FR|Dreshaun Ross|Oklahoma State
2|SO|Cole Mirasola|Penn State
3|JR|Ben Kueter|Iowa
4|SR|Nick Feldman|Ohio State
5|FR|Coby Merrill|Iowa State
6|JR|Christian Carroll|Wyoming
7|SR|Braxton Amos|Wisconsin
8|SR|Massoma Endene|Little Rock
12|FR|Cade Ziola|Nebraska
12|SO|Koy Hopke|Minnesota
12|SR|Nathan Taylor|Lehigh
12|SR|Wyatt Voelker|Northern Iowa
16|JR|Brady Colbert|Army
16|SR|Dayton Pitzer|Pittsburgh
16|SO|Spencer Lanosga|Navy
16|JR|Jimmy Mullen|Virginia Tech`,
};

const CLS = { FR: 1, SO: 2, JR: 3, SR: 4 };
export const REAL_TOP = [];
for (const [wt, txt] of Object.entries(RAW)) {
  for (const line of txt.split('\n')) {
    const [tier, cls, name, school] = line.split('|');
    REAL_TOP.push({ weight: +wt, tier: +tier, cls: CLS[cls], name, school });
  }
}
// Target overall rating (1-20 scale) by ranking tier.
export const TIER_OVR = { 1: 18.6, 2: 18.0, 3: 17.6, 4: 17.2, 5: 16.9, 6: 16.6, 7: 16.3, 8: 16.0, 12: 15.4, 16: 14.8 };
