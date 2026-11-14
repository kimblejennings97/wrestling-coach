// Freestyle mode data (docs/freestyle.md). Real US senior men's freestyle wrestlers who are NOT in the college rosters (graduated), with the school RTC
// they are assigned to (approximate: real clubs are not 1:1 with schools), birth year (approximate) and a rating tier from 2025-26 results
// (2026 Worlds / Final X / US Open, sources in docs/freestyle.md). Real names follow REAL_NAMES_ENABLED like the college rosters.
// "Name|kg|RTC school|born|quality|archetype"   quality ~ average attribute level (19 = World champion level, 15 = US Open placer)
export const FS_REAL_US = `Spencer Lee|57|Iowa|1998|19.2|scrambler
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
Zain Retherford|70|Penn State|1995|18.4|grinder
Ridge Lovett|70|Nebraska|2001|17.4|scrambler
Alec Pantaleo|70|Michigan|1996|16.0|balanced
Ed Scott|70|NC State|2000|15.4|balanced
Melvin Miller|70|NC State|2000|15.4|leg_attacker
James Green|74|Nebraska|1992|18.0|leg_attacker
David Carr|74|Iowa State|2000|17.8|leg_attacker
Quincy Monday|74|NC State|2000|16.2|scrambler
Cam Amine|74|Michigan|1998|16.0|grinder
Will Lewan|74|Michigan|2001|15.8|leg_attacker
Jarrett Jacques|74|Missouri|1999|15.6|balanced
Chance Marsteller|79|Rutgers|1995|17.4|grinder
Evan Wick|79|Wisconsin|1999|16.6|leg_attacker
Patrick Kennedy|79|Iowa|2001|16.4|grinder
Bernie Truax|79|Penn State|2000|15.8|balanced
Muhamed McBryde|79|Ohio State|2002|15.6|leg_attacker
Dean Hamiti|79|Wisconsin|2002|15.6|leg_attacker
Kyle Dake|86|Cornell|1991|19.0|balanced
Zahid Valencia|86|Arizona State|1997|18.4|scrambler
Parker Keckeisen|86|Northern Iowa|2000|17.2|scrambler
Aaron Brooks|86|Penn State|2000|17.0|grinder
Marcus Coleman|86|Iowa State|2001|16.0|leg_attacker
Mekhi Lewis|86|Virginia Tech|1999|16.0|leg_attacker
Cade DeVos|86|South Dakota State|2001|15.4|balanced
Trent Hidlay|92|NC State|1999|18.6|grinder
Michael Macchiavello|92|NC State|1999|17.4|grinder
Dustin Plott|92|Oklahoma State|2001|17.0|scrambler
Kyle Snyder|97|Penn State|1995|19.0|grinder
Stephen Buchanan|97|Iowa|2000|17.6|thrower
Hayden Zillmer|97|Minnesota|1993|16.8|grinder
Jay Aiello|97|Virginia|2001|16.2|balanced
Wyatt Hendrickson|125|Oklahoma State|2001|18.3|thrower
Mason Parris|125|Michigan|2001|17.6|grinder
Greg Kerkvliet|125|Penn State|2001|16.8|grinder
Tony Cassioppi|125|Iowa|2000|16.6|thrower
Demetrius Thomas|125|Pittsburgh|1999|16.4|thrower
Jordan Wood|125|Lehigh|1999|15.6|grinder`;

// College wrestlers already in the game whose real freestyle weight is not the 1:1 mapping of their college weight (their one move, pre-applied)
export const FS_KG_OVERRIDE = { 'Bo Bassett': 65, 'Levi Haines': 79, 'Marcus Blaze': 61, 'Tyler Kasak': 70, 'Jordan Williams': 70, 'Jesse Mendez': 65,
  'Pierson Manville': 65, 'Seth Shumate': 92, 'Matty Singleton': 79, 'Connor Mirasola': 97, 'Rylan Rogers': 86 };

// The season before the game's first freestyle season (2026): US World Team and World Championships results (Astana, Oct 2026).
// Team members qualify for the next Trials; medalists get a bye to the best-of-3 final at their weight.
export const FS_PREV = { season: 2026,
  team: { 57: 'Spencer Lee', 61: 'Marcus Blaze', 65: 'Bo Bassett', 70: 'Zain Retherford', 74: 'James Green', 79: 'Levi Haines', 86: 'Kyle Dake', 92: 'Trent Hidlay', 97: 'Kyle Snyder', 125: 'Wyatt Hendrickson' },
  medal: { 57: 1, 61: 3, 65: 1, 70: 3, 74: 0, 79: 1, 86: 1, 92: 2, 97: 1, 125: 3 } };

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
  ['AUS', 'Australia', 12.7, 0.6, 'ang'], ['ECU', 'Ecuador', 12.7, 0.5, 'lat']];
// Countries that send wrestlers to the Bill Farrell (an open in New York): mostly the Americas plus a few European / Asian guests
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
