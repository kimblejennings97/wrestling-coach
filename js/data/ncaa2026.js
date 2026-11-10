// 2026 NCAA D1 Championships (Cleveland, Mar 19-21 2026): top 8 per weight, in place order. Sources: FloWrestling "every 2026 NCAA champion" list.
// Used by applyRealTeams (core.js) as a FLOOR on a real wrestler's rating: a national champion can't be rated like a #13 wrestler.
// Format per weight: names separated by ';' (index 0 = champion). 285 is listed for completeness (the game's 285 data matches few names).
const RAW = {
  125: 'Luke Lilledahl;Marc-Anthony McGowan;Nico Provo;Vincent Robinson;Troy Spratley;Jacob Moran;Jore Volk;Tyler Klinsky',
  133: 'Jax Forrest;Ben Davino;Aaron Seidel;Marcus Blaze;Drake Ayala;Tyler Knox;Jacob Van Dee;Lucas Byrd',
  141: 'Sergio Vega;Jesse Mendez;Luke Stanich;Brock Hardy;Carter Nogle;Anthony Echemendia;CJ Composto;Wyatt Henson',
  149: 'Aden Valencia;Shayne Van Ness;Lachlan McNeil;Chance Lamer;Collin Gaj;Ryder Block;Cross Wasilewski;Casey Swiderski',
  157: 'Landon Robideau;Antrell Taylor;PJ Duke;Brandon Cannon;Kannon Webster;Ty Watters;Cameron Catrabone;Meyer Shapiro',
  165: 'Mitchell Mesenbrink;Mikey Caliendo;Cesar Alvan;Nicco Ruiz;Andrew Sparks;Joey Blaze;Bryce Hepner;Paddy Gallagher',
  174: 'Levi Haines;Christopher Minto;Patrick Kennedy;Carson Kharchla;Cam Steed;Danny Wask;Beau Mantanona;MJ Gaitan',
  184: 'Max McEnelly;Rocco Welsh;Aeoden Sinclair;Caleb Campos;Brock Mantanona;Angelo Ferrari;Eddie Neitenbach;Zack Ryder',
  197: 'Josh Barr;Cody Merrill;Stephen Little;Joey Novak;Camden McDanel;Angelo Posada;Gabe Arnold;Branson John',
  285: 'Isaac Trumble;Yonger Bastida;Taye Ghadiali;Konner Doucet;Ben Kueter;AJ Ferrari;David Szuba;Christian Carroll',
};
// rating floor by finish (OVR scale; the field's #1 by rating is ~18.5, a typical top-8 wrestler ~16.5)
const FLOOR = { 1: 17.8, 2: 17.4, 3: 17.0, 4: 17.0, 5: 16.6, 6: 16.6, 7: 16.2, 8: 16.2 };
const norm = s => s.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').trim();
export const NCAA_2026 = {};
for (const [wt, list] of Object.entries(RAW)) list.split(';').forEach((n, i) => { NCAA_2026[norm(n)] = { weight: +wt, place: i + 1 }; });
export const ncaaFloor = (name, weight) => { const r = NCAA_2026[norm(name)]; return r && Math.abs(r.weight - weight) <= 8 ? FLOOR[r.place] : 0; };
