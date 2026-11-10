// Home-state talent for recruit generation.
// DATA SOURCE: FloWrestling, "2025 NCAA Wrestling Championship Qualifiers By State" (330 D1 qualifiers; 40 states + 3 countries).
// STATE_NQ = number of 2025 NCAA qualifiers from each state. It drives (a) how many recruits come from a state and (b) their average quality.
export const STATE_NQ = {
  PA: 41, OH: 27, NJ: 26, CA: 26, IL: 24, NY: 17, WI: 14, MN: 13, MI: 12, IN: 12, IA: 12, MO: 11, FL: 10, OK: 9, GA: 9, CO: 8, TN: 6, NE: 4, VA: 4, TX: 4,
  SC: 4, MA: 4, NC: 3, WV: 2, UT: 2, OR: 2, MT: 2, MD: 2, LA: 2, KY: 2, KS: 2, AL: 2, AK: 2, WA: 1, SD: 1, RI: 1, ND: 1, ID: 1, NH: 1, AZ: 1, INTL: 3,
};
export const STATE_REGION = {
  PA: 'East', NJ: 'East', NY: 'East', MA: 'East', RI: 'East', NH: 'East', MD: 'East', VA: 'East', WV: 'East', INTL: 'East',
  FL: 'South', GA: 'South', TN: 'South', SC: 'South', NC: 'South', AL: 'South', KY: 'South', LA: 'South', TX: 'South',
  OH: 'Midwest', IL: 'Midwest', WI: 'Midwest', MN: 'Midwest', MI: 'Midwest', IN: 'Midwest', IA: 'Midwest', MO: 'Midwest',
  OK: 'Plains', NE: 'Plains', KS: 'Plains', SD: 'Plains', ND: 'Plains',
  CA: 'West', CO: 'West', UT: 'West', OR: 'West', MT: 'West', AK: 'West', WA: 'West', ID: 'West', AZ: 'West',
};
// Average-quality boost (in rating points) for recruits from a state: deep hotbeds (PA, OH, NJ, CA, IL) ~ +0.9 to +1.1, one-qualifier states ~ +0.1.
export const stateBoost = st => 0.55 * Math.log(1 + (STATE_NQ[st] || 1) / 6);
// Home state of each school (for the "stay close to home" recruiting factor).
export const STATE_OF = {
  'Penn State': 'PA', 'Iowa': 'IA', 'Ohio State': 'OH', 'Nebraska': 'NE', 'Minnesota': 'MN', 'Michigan': 'MI', 'Illinois': 'IL', 'Rutgers': 'NJ', 'Northwestern': 'IL',
  'Wisconsin': 'WI', 'Michigan State': 'MI', 'Purdue': 'IN', 'Indiana': 'IN', 'Maryland': 'MD', 'Oklahoma State': 'OK', 'Iowa State': 'IA', 'Arizona State': 'AZ',
  'Missouri': 'MO', 'Oklahoma': 'OK', 'Northern Iowa': 'IA', 'North Dakota State': 'ND', 'Cal Poly': 'CA', 'South Dakota State': 'SD', 'Northern Colorado': 'CO',
  'West Virginia': 'WV', 'Utah Valley': 'UT', 'Wyoming': 'WY', 'Air Force': 'CO', 'NC State': 'NC', 'Virginia Tech': 'VA', 'Pittsburgh': 'PA',
  'North Carolina': 'NC', 'Stanford': 'CA', 'Virginia': 'VA', 'Duke': 'NC', 'Cornell': 'NY', 'Lehigh': 'PA', 'Princeton': 'NJ', 'Penn': 'PA', 'Binghamton': 'NY',
  'Army': 'NY', 'Navy': 'MD', 'Harvard': 'MA', 'Lock Haven': 'PA', 'Bucknell': 'PA', 'Brown': 'RI', 'Columbia': 'NY', 'American': 'DC', 'Hofstra': 'NY', 'Drexel': 'PA',
  'Franklin & Marshall': 'PA', 'Sacred Heart': 'CT', 'Central Michigan': 'MI', 'Rider': 'NJ', 'Ohio': 'OH', 'Buffalo': 'NY', 'Kent State': 'OH', 'Northern Illinois': 'IL',
  'Oregon State': 'OR', 'Little Rock': 'AR', 'SIU Edwardsville': 'IL', 'Campbell': 'NC',
  'Gardner-Webb': 'NC', 'Appalachian State': 'NC', 'Chattanooga': 'TN',
  'Edinboro': 'PA', 'George Mason': 'VA', 'Clarion': 'PA', 'Bloomsburg': 'PA', 'Mercyhurst': 'PA', 'LIU': 'NY', 'Morgan State': 'MD', 'CSU Bakersfield': 'CA',
  'VMI': 'VA', 'The Citadel': 'SC', 'Bellarmine': 'KY', 'Davidson': 'NC', 'Presbyterian': 'SC',
};
