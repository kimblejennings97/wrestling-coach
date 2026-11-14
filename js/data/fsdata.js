// Freestyle mode data (docs/freestyle.md). Real US senior men's freestyle wrestlers who are NOT in the college rosters (graduated), with the school RTC
// they are assigned to (approximate: real clubs are not 1:1 with schools), birth year (approximate) and a rating tier from 2025-26 results
// (2026 Worlds / Final X / US Open, sources in docs/freestyle.md). Real names follow REAL_NAMES_ENABLED like the college rosters.
// "Name|kg|RTC school|born|FS OVR|archetype"   FS OVR is exact (attributes are nudged onto it, freestyle.js pinFs): ~19.3-19.5 World champion,
// ~18.8-19 World medalist, ~18-18.4 World Team, 15-17 US Open placers. 2026 World Team set from the Astana results (2026-11-14).
export const FS_REAL_US = `Spencer Lee|57|Iowa|1998|19.5|scrambler
Brody Teske|57|Iowa|2000|15.9|leg_attacker
Liam Cronin|57|Nebraska|2001|15.5|leg_attacker
Austin DeSanto|61|Iowa|1998|16.8|leg_attacker
Michael McGee|61|Arizona State|1998|16.0|scrambler
Seth Gross|61|Wisconsin|1995|15.8|leg_attacker
Nathan Tomasello|61|Ohio State|1993|15.6|grinder
Kyle Burwick|61|Wisconsin|1999|15.0|balanced
Eric Barnett|61|Wisconsin|2000|15.2|leg_attacker
Real Woods|65|Iowa|2000|17.8|leg_attacker
Joey McKenna|65|Ohio State|1994|17.0|grinder
Beau Bartlett|65|Penn State|2002|17.0|grinder
Vito Arujau|65|Cornell|2000|16.9|scrambler
Brock Hardy|65|Nebraska|2001|15.6|scrambler
Zain Retherford|70|Penn State|1995|18.8|grinder
Ridge Lovett|70|Nebraska|2001|17.4|scrambler
Alec Pantaleo|70|Michigan|1996|16.0|balanced
Ed Scott|70|NC State|2000|15.4|balanced
Melvin Miller|70|NC State|2000|15.4|leg_attacker
James Green|74|Nebraska|1992|18.4|leg_attacker
David Carr|74|Iowa State|2000|17.8|leg_attacker
Quincy Monday|74|North Carolina|2000|16.2|scrambler
Cam Amine|74|Michigan|1998|16.0|grinder
Will Lewan|74|Michigan|2001|15.8|leg_attacker
Jarrett Jacques|74|Missouri|1999|15.6|balanced
Chance Marsteller|79|Rutgers|1995|17.4|grinder
Evan Wick|79|Wisconsin|1999|16.6|leg_attacker
Patrick Kennedy|79|Iowa|2001|16.4|grinder
Bernie Truax|79|Penn State|2000|15.8|balanced
Muhamed McBryde|79|Ohio State|2002|15.6|leg_attacker
Dean Hamiti|79|Wisconsin|2002|15.6|leg_attacker
Kyle Dake|86|Cornell|1991|19.3|balanced
Zahid Valencia|86|Arizona State|1997|18.4|scrambler
Parker Keckeisen|86|Northern Iowa|2000|17.2|scrambler
Aaron Brooks|86|Penn State|2000|17.0|grinder
Marcus Coleman|86|Iowa State|2001|16.0|leg_attacker
Mekhi Lewis|86|Virginia Tech|1999|16.0|leg_attacker
Cade DeVos|86|South Dakota State|2001|15.4|balanced
Trent Hidlay|92|NC State|1999|19.0|grinder
Michael Macchiavello|92|NC State|1999|17.4|grinder
Dustin Plott|92|Oklahoma State|2001|17.0|scrambler
Kyle Snyder|97|Ohio State|1995|19.4|grinder
Stephen Buchanan|97|Iowa|2000|17.6|thrower
Hayden Zillmer|97|Minnesota|1993|16.8|grinder
Jay Aiello|97|Virginia|2001|16.2|balanced
Wyatt Hendrickson|125|Oklahoma State|2001|18.8|thrower
Mason Parris|125|Michigan|2001|17.6|grinder
Greg Kerkvliet|125|Penn State|2001|16.8|grinder
Tony Cassioppi|125|Iowa|2000|16.6|thrower
Demetrius Thomas|125|Pittsburgh|1999|16.4|thrower
Jordan Wood|125|Lehigh|1999|15.6|grinder`;

// 2026 World Team members still in college: minimum FS OVR at the first freestyle season (raised mostly through the freestyle-heavy attributes)
export const FS_COLLEGE_FLOOR = { 'Bo Bassett': 19.4, 'Levi Haines': 19.2, 'Marcus Blaze': 18.8 };

// College wrestlers already in the game whose real freestyle weight is not the 1:1 mapping of their college weight (their one move, pre-applied)
export const FS_KG_OVERRIDE = { 'Bo Bassett': 65, 'Levi Haines': 79, 'Marcus Blaze': 61, 'Tyler Kasak': 70, 'Jordan Williams': 70, 'Jesse Mendez': 65,
  'Pierson Manville': 65, 'Seth Shumate': 92, 'Matty Singleton': 79, 'Connor Mirasola': 97, 'Rylan Rogers': 86 };

// The season before the game's first freestyle season (2026): US World Team and World Championships results (Astana, Oct 2026).
// Team members qualify for the next Trials; medalists get a bye to the best-of-3 final at their weight.
export const FS_PREV = { season: 2026,
  team: { 57: 'Spencer Lee', 61: 'Marcus Blaze', 65: 'Bo Bassett', 70: 'Zain Retherford', 74: 'James Green', 79: 'Levi Haines', 86: 'Kyle Dake', 92: 'Trent Hidlay', 97: 'Kyle Snyder', 125: 'Wyatt Hendrickson' },
  medal: { 57: 1, 61: 3, 65: 1, 70: 3, 74: 0, 79: 1, 86: 1, 92: 2, 97: 1, 125: 3 } };

// Real foreign wrestlers: the 2026 World Championships (Astana) medalists and 5th places (Wikipedia bracket pages, checked 2026-11-14). Each
// replaces his country's generated wrestler at that weight (no rng: name, age, FS OVR set after the pools are built). Birth years approximate.
// "Name|kg|country|born|FS OVR|2026 place"   FS OVR: champion ~19.4, silver ~19.1, bronze ~18.9, 5th ~18.5 (big names a little higher)
// Flags: IOC code -> ISO 3166 alpha-2; the images are assets/flags/<iso2>.svg (flag-icons 7.2.3, MIT, 4:3), flagOf = emoji fallback
const ISO2 = { USA: 'US', RUS: 'RU', IRI: 'IR', JPN: 'JP', AZE: 'AZ', GEO: 'GE', UZB: 'UZ', BRN: 'BH', KAZ: 'KZ', TUR: 'TR', MGL: 'MN', IND: 'IN', ARM: 'AM', ALB: 'AL',
  KGZ: 'KG', BUL: 'BG', UKR: 'UA', GRE: 'GR', CUB: 'CU', MDA: 'MD', TJK: 'TJ', HUN: 'HU', CHN: 'CN', SVK: 'SK', MKD: 'MK', CAN: 'CA', POL: 'PL', ROU: 'RO', ITA: 'IT',
  GER: 'DE', FRA: 'FR', SRB: 'RS', PUR: 'PR', MEX: 'MX', KOR: 'KR', EGY: 'EG', VEN: 'VE', COL: 'CO', NGR: 'NG', ALG: 'DZ', BRA: 'BR', AUS: 'AU', ECU: 'EC', PRK: 'KP',
  BLR: 'BY', SUI: 'CH' };
export const iso2Of = code => (ISO2[code] || '').toLowerCase();
export const flagOf = code => { const c = ISO2[code]; return c ? String.fromCodePoint(...[...c].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : ''; };

export const FS_REAL_INTL = `Roman Bravo-Young|57|MEX|1999|19.0|2
Han Chong-song|57|PRK|2001|18.8|3
Abubakar Mutaliev|57|RUS|2003|18.9|3
Batkhuyagiin Mönkh-Erdene|57|MGL|1998|18.5|5
Islam Bazarganov|57|AZE|2003|18.5|5
Ahmad Javan|61|IRI|2003|19.3|1
Zaur Uguev|61|RUS|1995|19.2|2
Kim Kwang-myong|61|PRK|2000|18.8|3
Zelimkhan Abakarov|61|ALB|1996|18.5|5
Assyl Aitakyn|61|KAZ|2001|18.4|5
Vazgen Tevanyan|65|ARM|1999|19.1|2
Rahman Amouzad|65|IRI|2002|19.1|3
Abasgadzhi Magomedov|65|RUS|2000|18.9|3
Shamil Mamedov|65|BUL|1999|18.5|5
Abdulmazhid Kudiev|65|TJK|1996|18.4|5
Ibragim Ibragimov|70|RUS|2000|19.4|1
Ernazar Akmataliev|70|KGZ|2001|19.0|2
Tömör-Ochiryn Tulga|70|MGL|1996|18.8|3
Vasile Diacon|70|MDA|2000|18.4|5
Lachlan McNeil|70|CAN|1995|18.3|5
Inalbek Sheriev|74|RUS|2000|19.4|1
Nurkozha Kaipanov|74|KAZ|1999|19.1|2
Amir Mohammad Yazdani|74|IRI|2000|18.9|3
Yoshinosuke Aoyagi|74|JPN|2004|18.9|3
Tajmuraz Salkazanov|74|SVK|1996|18.5|5
Turan Bayramov|74|AZE|2002|18.5|5
Mohammad Nokhodi|79|IRI|1996|19.1|2
Mahamedkhabib Kadzimahamedau|79|BLR|2001|18.9|3
Ismail Khaniev|79|RUS|2002|18.9|3
Dzhabrail Gadzhiev|79|AZE|2002|18.5|5
Olonbayaryn Süldkhüü|79|MGL|2004|18.4|5
Arsenii Dzhioev|86|AZE|1999|19.1|2
Vladimeri Gamkrelidze|86|GEO|2002|18.9|3
Malik Shavaev|86|KGZ|2000|18.8|3
Georgios Kougioumtsidis|86|GRE|1998|18.4|5
Ibragim Kadiev|86|RUS|2003|18.6|5
Amanula Gadzhimagomedov|92|RUS|2001|19.4|1
Ali Tcokaev|92|AZE|2002|18.9|3
Miriani Maisuradze|92|GEO|1999|18.9|3
Amir Hossein Firouzpour|92|IRI|1998|18.6|5
Samuel Scherrer|92|SUI|1997|18.2|5
Arash Yoshida|97|JPN|2002|19.1|2
Abdulrashid Sadulaev|97|RUS|1996|19.2|3
Hassan Yazdani|97|IRI|1994|19.0|3
Zbigniew Baranowski|97|POL|1991|18.4|5
Akhmed Tazhudinov|97|BRN|2003|18.9|5
Amir Hossein Zare|125|IRI|2001|19.5|1
Abdulla Kurbanov|125|RUS|2001|19.1|2
Giorgi Meshvildishvili|125|AZE|1997|18.9|3
Vladislav Baitsaev|125|HUN|1996|18.4|5
Jaspooran Singh|125|IND|2006|18.2|5`;

// Countries: [code, name, strength (average attribute of their best wrestler at a weight), share of weights entered at the Worlds, name pool].
// Strength follows recent World / Olympic results (approximate).
export const COUNTRIES = [
  ['RUS', 'Russia', 18.8, 1, 'cau'], ['IRI', 'Iran', 18.6, 1, 'per'], ['JPN', 'Japan', 18.2, 1, 'jpn'], ['AZE', 'Azerbaijan', 17.8, 1, 'tur'], ['GEO', 'Georgia', 17.6, 1, 'geo'],
  ['UZB', 'Uzbekistan', 17.6, 1, 'tur'], ['BRN', 'Bahrain', 17.0, 0.6, 'cau'], ['KAZ', 'Kazakhstan', 16.8, 1, 'tur'], ['TUR', 'Turkey', 16.8, 1, 'tur'], ['MGL', 'Mongolia', 16.6, 0.9, 'mgl'],
  ['IND', 'India', 16.6, 1, 'ind'], ['ARM', 'Armenia', 16.4, 0.9, 'geo'], ['ALB', 'Albania', 16.2, 0.5, 'cau'], ['KGZ', 'Kyrgyzstan', 16.2, 0.9, 'tur'], ['BUL', 'Bulgaria', 16.2, 0.9, 'eur'],
  ['UKR', 'Ukraine', 15.7, 0.9, 'eur'], ['GRE', 'Greece', 15.5, 0.6, 'eur'], ['CUB', 'Cuba', 15.5, 0.6, 'lat'], ['MDA', 'Moldova', 15.3, 0.8, 'eur'], ['TJK', 'Tajikistan', 15.3, 0.7, 'tur'],
  ['HUN', 'Hungary', 15.3, 0.8, 'eur'], ['CHN', 'China', 15.3, 0.9, 'asi'], ['SVK', 'Slovakia', 15.1, 0.5, 'cau'], ['MKD', 'North Macedonia', 14.9, 0.5, 'cau'], ['CAN', 'Canada', 14.9, 1, 'ang'],
  ['POL', 'Poland', 14.7, 0.8, 'eur'], ['ROU', 'Romania', 14.5, 0.7, 'eur'], ['ITA', 'Italy', 14.5, 0.8, 'eur'], ['GER', 'Germany', 14.5, 0.8, 'eur'], ['FRA', 'France', 14.3, 0.8, 'eur'],
  ['SRB', 'Serbia', 14.3, 0.5, 'eur'], ['PUR', 'Puerto Rico', 14.3, 0.6, 'lat'], ['MEX', 'Mexico', 14.3, 0.7, 'lat'], ['KOR', 'South Korea', 14.3, 0.8, 'asi'], ['EGY', 'Egypt', 13.9, 0.7, 'ara'],
  ['VEN', 'Venezuela', 13.7, 0.6, 'lat'], ['COL', 'Colombia', 13.5, 0.6, 'lat'], ['NGR', 'Nigeria', 13.5, 0.6, 'afr'], ['ALG', 'Algeria', 13.3, 0.6, 'ara'], ['BRA', 'Brazil', 13.1, 0.6, 'lat'],
  ['AUS', 'Australia', 12.7, 0.6, 'ang'], ['ECU', 'Ecuador', 12.7, 0.5, 'lat'],
  ['PRK', 'North Korea', 16.2, 0.5, 'asi'], ['BLR', 'Belarus', 15.5, 0.6, 'eur'], ['SUI', 'Switzerland', 13.5, 0.4, 'eur']];   // added 2026-11-14 (2026 Worlds medalists / placers)
// Countries that send wrestlers to the Bill Farrell (an open in New York): mostly the Americas plus a few European / Asian guests
// Nationality of real college wrestlers who wrestle internationally for another country (user request 2026-11-14); everyone else is US.
// They may train at an RTC and enter the Bill Farrell (an open), but not the US Open / World Team Trials; at the Worlds / Olympics they can be
// their country's entry (freestyle.js worldsWeight).
export const COLLEGE_NAT = { 'Masanosuke Ono': 'JPN', 'Rin Sakamoto': 'JPN' };
// International recruits (recruit.js): share of each class and where they come from (weights); names from that country's NAME_POOLS
export const INTL_RECRUITS = { share: 0.03, from: { CAN: 4, JPN: 2, MEX: 1, PUR: 1, IND: 1, MGL: 1, GEO: 1, UKR: 1, KOR: 1, NGR: 1, AUS: 1, COL: 1 } };
export const FARRELL_GUESTS = ['CAN', 'PUR', 'MEX', 'CUB', 'GEO', 'JPN', 'IND', 'UKR', 'VEN', 'COL'];

// Generated names (first / last) per pool; combinations are random, not real people.
export const NAME_POOLS = {
  cau: [['Magomed', 'Abdulrashid', 'Zaurbek', 'Akhmed', 'Shamil', 'Gadzhi', 'Rasul', 'Abdulla', 'Murad', 'Khetag', 'Zelimkhan', 'Arslan', 'Ramazan', 'Islam', 'Said', 'Musa'],
    ['Magomedov', 'Gadzhiev', 'Abdulaev', 'Khasanov', 'Tsakoev', 'Alibekov', 'Kurbanov', 'Umarov', 'Dzhabrailov', 'Batyrov', 'Saidov', 'Omarov', 'Murtazaliev', 'Gamzatov', 'Bilalov', 'Kadiev']],
  per: [['Amir', 'Mohammad', 'Reza', 'Hassan', 'Ali', 'Mehdi', 'Hossein', 'Saeed', 'Kamran', 'Morteza', 'Yazdan', 'Peyman', 'Alireza', 'Abolfazl', 'Mojtaba', 'Rahman'],
    ['Hosseini', 'Rezaei', 'Karimi', 'Moradi', 'Ghasemi', 'Jafari', 'Rahimi', 'Sadeghi', 'Ahmadi', 'Mohammadi', 'Nikpour', 'Azizi', 'Ebrahimi', 'Taheri', 'Bagheri', 'Shahbazi']],
  jpn: [['Kenta', 'Yuto', 'Daichi', 'Takuto', 'Haruki', 'Ren', 'Sota', 'Kaito', 'Riku', 'Shota', 'Yuma', 'Kotaro', 'Hayato', 'Masato'],
    ['Takahashi', 'Yamamoto', 'Sato', 'Fujita', 'Higuchi', 'Kobayashi', 'Tanaka', 'Nakamura', 'Morikawa', 'Shiraishi', 'Okada', 'Ishikawa', 'Kiyota', 'Ogawa']],
  tur: [['Turan', 'Haji', 'Emin', 'Kerem', 'Ulukbek', 'Bekzod', 'Azamat', 'Nurlan', 'Daniyar', 'Sardor', 'Askar', 'Ruslan', 'Ayaz', 'Selim', 'Burak', 'Orkhan'],
    ['Aliyev', 'Mammadov', 'Huseynov', 'Yilmaz', 'Demir', 'Kaya', 'Toshmatov', 'Nurmatov', 'Abdullayev', 'Seitkali', 'Zhakupov', 'Bakirov', 'Jumaev', 'Ozturk', 'Celik', 'Rustamov']],
  geo: [['Giorgi', 'Levan', 'Davit', 'Avtandil', 'Tornike', 'Nika', 'Vahe', 'Arsen', 'Gor', 'Aram', 'Irakli', 'Luka'],
    ['Beridze', 'Kapanadze', 'Gogoladze', 'Tsiklauri', 'Mchedlidze', 'Abuladze', 'Harutyunyan', 'Petrosyan', 'Grigoryan', 'Hovhannisyan', 'Lomidze', 'Kvaratskhelia']],
  mgl: [['Batbayar', 'Erdenebat', 'Tsogtbaatar', 'Ganzorig', 'Bat-Erdene', 'Tuvshin', 'Munkh-Orgil', 'Byambadorj', 'Temuulen', 'Enkhjin'],
    ['Batbold', 'Dorj', 'Ganbaatar', 'Purevjav', 'Enkhbayar', 'Bayaraa', 'Tumur', 'Sukhbaatar', 'Otgonbayar', 'Davaa']],
  ind: [['Aman', 'Deepak', 'Ravi', 'Sujeet', 'Vikas', 'Sagar', 'Naveen', 'Rohit', 'Amit', 'Yash', 'Udit', 'Sandeep'],
    ['Kumar', 'Singh', 'Malik', 'Dahiya', 'Sehrawat', 'Poonia', 'Kadian', 'Ahlawat', 'Rathee', 'Jakhar']],
  eur: [['Ivan', 'Nikolai', 'Andrei', 'Mihai', 'Stefan', 'Marek', 'Tomas', 'Luca', 'Matteo', 'Pierre', 'Jonas', 'Lukas', 'Dimitar', 'Georgios', 'Aleksandar', 'Petar'],
    ['Petrov', 'Ivanov', 'Dimitrov', 'Popescu', 'Novak', 'Kovacs', 'Horvat', 'Rossi', 'Bianchi', 'Weber', 'Muller', 'Dubois', 'Nowak', 'Papadopoulos', 'Stojanovic', 'Marku']],
  lat: [['Juan', 'Carlos', 'Luis', 'Jose', 'Miguel', 'Alejandro', 'Andres', 'Diego', 'Pedro', 'Jorge', 'Yandro', 'Ruben'],
    ['Garcia', 'Rodriguez', 'Hernandez', 'Lopez', 'Martinez', 'Perez', 'Gonzalez', 'Ramirez', 'Torres', 'Diaz', 'Cruz', 'Mendoza']],
  ang: [['Liam', 'Noah', 'Jack', 'Ethan', 'Owen', 'Lucas', 'Nathan', 'Ryan', 'Callum', 'Dylan'],
    ['MacDonald', 'Tremblay', 'Smith', 'Wilson', 'Campbell', 'Gagnon', 'Roy', 'Taylor', 'Fraser', 'Kelly']],
  ara: [['Mohamed', 'Ahmed', 'Youssef', 'Karim', 'Omar', 'Mahmoud', 'Abdelrahman', 'Amine', 'Bilal', 'Hamza'],
    ['Hassan', 'Saleh', 'Benali', 'Mansour', 'Abdelaziz', 'Said', 'Haddad', 'Belkacem', 'Fathy', 'Amer']],
  afr: [['Emmanuel', 'Samuel', 'Chinedu', 'Ifeanyi', 'Tobi', 'Daniel', 'Godwin', 'Victor'],
    ['Okafor', 'Adeyemi', 'Bello', 'Eze', 'Nwosu', 'Ogunleye', 'Abiodun', 'Okoro']],
  asi: [['Wei', 'Hao', 'Jun', 'Lei', 'Min-jun', 'Seung-ho', 'Ji-hoon', 'Tao', 'Dong-hyun', 'Peng'],
    ['Zhang', 'Wang', 'Li', 'Liu', 'Kim', 'Lee', 'Park', 'Chen', 'Choi', 'Zhao']],
  usa: [['Tyler', 'Cole', 'Hunter', 'Mason', 'Logan', 'Brady', 'Jake', 'Trey', 'Garrett', 'Colton', 'Nolan', 'Wyatt', 'Bryce', 'Dalton', 'Reese', 'Caden'],
    ['Miller', 'Johnson', 'Brown', 'Davis', 'Anderson', 'Thompson', 'Martin', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'King', 'Wright', 'Hill', 'Baker']],
};
