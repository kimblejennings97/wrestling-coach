// Freestyle mode: each school's Regional Training Center is named after its mascot ("Nittany Lion Wrestling Club"), user request 2026-11-14.
// Keyed by school name (G.teams[tid].name). Mascots shared by two programs keep the school name in front for the smaller one
// (Utah Valley Wolverine, Princeton Tiger, Pitt Panther, Bucknell Bison, ...). Schools not listed (custom leagues): "<School> RTC".
// Real mascots: like the school names, replace before any public release.
const MASCOT = {
  'Penn State': 'Nittany Lion', 'Iowa': 'Hawkeye', 'Ohio State': 'Buckeye', 'Nebraska': 'Husker', 'Minnesota': 'Gopher', 'Michigan': 'Wolverine',
  'Illinois': 'Illini', 'Rutgers': 'Scarlet Knight', 'Northwestern': 'Wildcat', 'Wisconsin': 'Badger', 'Michigan State': 'Spartan', 'Purdue': 'Boilermaker',
  'Indiana': 'Hoosier', 'Maryland': 'Terrapin', 'Oklahoma State': 'Cowboy', 'Iowa State': 'Cyclone', 'Arizona State': 'Sun Devil', 'Missouri': 'Tiger',
  'Oklahoma': 'Sooner', 'Northern Iowa': 'Panther', 'North Dakota State': 'Bison', 'Cal Poly': 'Mustang', 'South Dakota State': 'Jackrabbit',
  'Northern Colorado': 'Bear', 'West Virginia': 'Mountaineer', 'Utah Valley': 'Utah Valley Wolverine', 'Wyoming': 'Wyoming Cowboy', 'Air Force': 'Falcon',
  'CSU Bakersfield': 'Roadrunner', 'NC State': 'Wolfpack', 'Virginia Tech': 'Hokie', 'Pittsburgh': 'Pitt Panther', 'North Carolina': 'Tar Heel',
  'Stanford': 'Cardinal', 'Virginia': 'Cavalier', 'Duke': 'Blue Devil', 'Cornell': 'Big Red', 'Lehigh': 'Mountain Hawk', 'Princeton': 'Princeton Tiger',
  'Penn': 'Quaker', 'Binghamton': 'Bearcat', 'Army': 'Black Knight', 'Navy': 'Midshipman', 'Harvard': 'Crimson', 'Lock Haven': 'Bald Eagle',
  'Bucknell': 'Bucknell Bison', 'Brown': 'Brown Bear', 'Columbia': 'Lion', 'American': 'Eagle', 'Hofstra': 'Pride', 'Drexel': 'Dragon',
  'Franklin & Marshall': 'Diplomat', 'Sacred Heart': 'Pioneer', 'Edinboro': 'Fighting Scot', 'George Mason': 'Patriot', 'Clarion': 'Golden Eagle',
  'Bloomsburg': 'Husky', 'Mercyhurst': 'Laker', 'LIU': 'Shark', 'Morgan State': 'Morgan State Bear', 'Central Michigan': 'Chippewa', 'Rider': 'Bronc',
  'Ohio': 'Bobcat', 'Buffalo': 'Bull', 'Kent State': 'Golden Flash', 'Northern Illinois': 'Huskie', 'Oregon State': 'Beaver', 'Little Rock': 'Trojan',
  'SIU Edwardsville': 'Cougar', 'Campbell': 'Camel', 'Gardner-Webb': "Runnin' Bulldog", 'Appalachian State': 'App State Mountaineer',
  'Chattanooga': 'Moc', 'VMI': 'Keydet', 'The Citadel': 'Bulldog', 'Bellarmine': 'Knight', 'Davidson': 'Davidson Wildcat', 'Presbyterian': 'Blue Hose',
};
export const rtcName = name => (MASCOT[name] ? `${MASCOT[name]} Wrestling Club` : `${name} RTC`);
// every name a school's RTC has carried (freestyle history stores the name at the time: saves from before 2026-11-14 say "<School> RTC")
export const rtcNames = name => [rtcName(name), `${name} RTC`];
