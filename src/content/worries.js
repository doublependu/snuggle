// SPDX-License-Identifier: GPL-3.0-only
// The worry board (systems/worries.js): "…but new Grumblings are always being born." Three of these are
// pinned up each day. Each is a real Grumbling at a set spot, soothed the way its species is.
// Add a worry: a line here. It needs a spot on a floor that the zone's guide can reach (tools/e2e checks).
//   zone, species   where, and what kind (content/species.js, content/species2.js)
//   at              [x, z] in the zone, or a marker's name
//   who             the id of the person in that zone who pinned it up (they thank you afterwards), or null
//   note            the note on the board; by: who signed it, when nobody is standing there to ask
//   thanks          what they say when it is soothed
// and what its species needs: spots (the Lost Sock's hiding places), company + radius (where the Pom-pom has
// company), person (who the Jitters loops round: an id, default who), to (who the Unsent Letter was written
// to: an id, a marker or [x, z]), flock (which of the market's sparrow seats), spot (the fishing spot where
// the Bottled-Up is).
export const PLACE = { academy: 'Mistbloom Academy', station: 'Lantern Bay station', market: 'the night market', quiet: 'the Quiet District', heart: 'the Old Quarter' };
export const ICON = { cloud: '☁️', sock: '🧦', homework: '📄', pompom: '🎀', sparrow: '🐦', grey: '🌫️', jitters: '🦋', bottled: '🍾', letter: '✉️' };

// who signs a note, for the people the dialogue box has no name for
export const BY = {
  tangtang: 'Sunny', s1: 'a first-year', s2: 'a second-year', bookworm: 'the student with all the books', player3: 'the tag team', vendor: 'the soy-milk seller',
  kid: 'the kid at the station', toyseller: 'the toy seller', chestnut: 'the chestnut seller', tea: 'the tea stall', lanternseller: 'the lantern seller', fishball: 'the fishball stall',
  oldman: 'a neighbour', noodle: 'the noodle auntie', barber: 'the barber', ferryman: 'the ferryman',
};

export const WORRIES = [
  // ---- Mistbloom Academy
  { id: 'a_cloud', zone: 'academy', species: 'cloud', at: [-21.5, 13.8], who: 'tangtang', note: 'A little cloud is raining on the kitchen step, and my tea towels are out. HELP. — Sunny', thanks: 'My tea towels! Dry! You’re a hero. A slightly damp hero.' },
  { id: 'a_sock', zone: 'academy', species: 'sock', at: 'GRUMB_sock', spots: ['POINT_sockspot_1', 'POINT_sockspot_2', 'POINT_sockspot_3', 'POINT_sockspot_5'], who: 's2', note: 'There’s a sock in the laundry yard that isn’t anybody’s. It keeps hiding in the baskets.', thanks: 'It wasn’t anybody’s, and now it’s yours. That seems fair.' },
  { id: 'a_homework', zone: 'academy', species: 'homework', at: 'GRUMB_homework', who: 'bookworm', note: 'Something under the library stairs throws paper at anyone who says the word “essay”.', thanks: 'You said “essay” to it and lived! I’m going to go and write mine. Probably.' },
  { id: 'a_pompom', zone: 'academy', species: 'pompom', at: [-22.5, -47.5], company: [-12, -43], radius: 6.5, who: 'player3', note: 'A pom-pom is sitting by the goal again. We keep waving. It keeps not believing us.', thanks: 'It’s on my team now. We’re still losing, but we’re losing TOGETHER.' },
  { id: 'a_jitters', zone: 'academy', species: 'jitters', at: [-6.5, -2.5], who: 's1', note: 'I have to read my poem out at assembly, and there are butterflies. Actual ones.', thanks: 'They’ve stopped! I’m still going to mumble. But I’ll mumble bravely.' },
  { id: 'a_letter', zone: 'academy', species: 'letter', at: [7, 0], to: 'fang', who: 's2', note: 'I wrote Master Fang a thank-you letter in my first week. It’s been circling the courtyard ever since.', thanks: 'She read it! She said “hm” in the good way!' },
  // ---- the station
  { id: 's_cloud', zone: 'station', species: 'cloud', at: [3.2, -2.6], who: 'vendor', note: 'A cloud has settled over the platform bench. It only rains on people who are waiting for someone.', thanks: 'Dry benches! I’ll tell the people waiting. They could do with good news.' },
  { id: 's_jitters', zone: 'station', species: 'jitters', at: [28, -9], who: 'kid', note: 'I’m going to ask if I can join Mistbloom next year. Tomorrow. Or the day after. There are butterflies.', thanks: 'I’m going to ask. Next year I’ll have a sign held up for ME.' },
  { id: 's_letter', zone: 'station', species: 'letter', at: [15, -2.5], to: 'fisher', who: 'vendor', note: 'Thirty years ago I wrote that fisherman a letter and lost my nerve. It’s still flying about the plaza.', thanks: 'He read it. He laughed. Then he bought two soy milks. Thirty years!' },
  // ---- the night market
  { id: 'm_sparrow', zone: 'market', species: 'sparrow', at: 'GRUMB_sparrow_4', flock: 2, who: 'toyseller', note: 'Two sparrows are back at the toy stall, looking at the spinning tops as if their hearts would break.', thanks: 'They’ve stopped knocking the tops over. Now they just watch them spin. Free of charge.' },
  { id: 'm_cloud', zone: 'market', species: 'cloud', at: [-4.5, -2.6], who: 'chestnut', note: 'A cloud over the chestnut wok. Wet chestnuts! Is nothing sacred?', thanks: 'Dry and crackling! Here, hold out your hands. Careful, they’re hot.' },
  { id: 'm_sock', zone: 'market', species: 'sock', at: [-27, -3.2], spots: [[-24.2, -1.6], [-30.5, -2.4], [-26.2, 0.4]], who: 'tea', note: 'Something woolly is living under the tea stall. It darts out and trips my customers.', thanks: 'A sock! All that fuss from one sock. Sit down, have tea.' },
  { id: 'm_letter', zone: 'market', species: 'letter', at: [-19.5, 1.2], to: 'musician', who: 'lanternseller', note: 'I wrote the musician a note about a song he played once. It won’t stay in my pocket.', thanks: 'He’s playing it again. Listen. That’s the one.' },
  { id: 'm_bottled', zone: 'market', species: 'bottled', spot: 'seawall', who: 'fishball', note: 'Something off the sea wall keeps bumping the stones at night, like a thing that wants to be asked.', thanks: 'A bottle with a note in it? All it wanted was fishing out. Don’t we all.' },
  // ---- the Quiet District
  // (her umbrella is one of the lost things in the canal: content/catches.js)
  { id: 'q_cloud', zone: 'quiet', species: 'cloud', at: [1.3, 15.2], who: 'noodle', note: 'My umbrella blew into the canal, and now there’s a little cloud raining on my step. Typical.', thanks: 'Dry! Now, if somebody could only fish my umbrella out as well. It’s striped.' },
  { id: 'q_grey', zone: 'quiet', species: 'grey', at: [-3.2, 27.6], who: 'oldman', note: 'There’s a grey one under the banyan again. It doesn’t want anything. Only somebody to sit a while.', thanks: 'You sat with it. That’s all any of us wanted, for fifty years.' },
  { id: 'q_homework', zone: 'quiet', species: 'homework', at: [1.4, -3.2], who: 'barber', note: 'The post office is open again, and something inside it is throwing forms at people.', thanks: 'Fifty years of forms nobody filled in. No wonder it was cross.' },
  { id: 'q_pompom', zone: 'quiet', species: 'pompom', at: [9.5, 13], company: [-0.2, 16.4], radius: 5.5, who: 'noodle', note: 'A little pom-pom is hanging about the alley, looking at the breakfast table and not coming over.', thanks: 'There’s room on the bench. There is always room on the bench.' },
  { id: 'q_letter', zone: 'quiet', species: 'letter', at: [-4.6, -13.6], to: 'ferryman', who: 'barber', note: 'I wrote to my brother across the bay and never posted it. The ferryman would take it, if it would hold still.', thanks: 'On the ferry by noon. He’ll fall off his chair.' },
  { id: 'q_bottled', zone: 'quiet', species: 'bottled', spot: 'jetty', who: 'ferryman', note: 'Something under the jetty knocks on the boat at night. Polite. Persistent.', thanks: 'Said it out loud at last, did it? Good. The knocking was getting on my nerves.' },
  // ---- the Old Quarter (nobody lives there yet: the notes are pinned to doors)
  { id: 'h_grey', zone: 'heart', species: 'grey', at: [12, -19.5], who: null, by: 'a note on a door in Laundry Alley', note: 'One of the sleepers has come back to its old doorstep. It would like company. It won’t ask.', thanks: '' },
  { id: 'h_cloud', zone: 'heart', species: 'cloud', at: [-14, 37], who: null, by: 'Master Fang', note: 'A cloud is raining on my grandmother’s table. I would see to it myself, but my knees have opinions.', thanks: '' },
  { id: 'h_letter', zone: 'heart', species: 'letter', at: [-14, 7], to: 'POINT_anchor_letter', who: null, by: 'a note on Thread Street', note: 'A letter has been flying up and down Thread Street for fifty years, looking for its letterbox.', thanks: '' },
  { id: 'h_sock', zone: 'heart', species: 'sock', at: [-11, -34], spots: [[-8.5, -36.5], [-14.5, -31.5], [-9, -31]], who: null, by: 'a note under the persimmon tree', note: 'A sock in the Persimmon Courtyard. It has been somebody’s only sock since before the fog.', thanks: '' },
];
