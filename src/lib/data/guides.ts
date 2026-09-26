/**
 * Curated destination guides.
 *
 * Attractions, dishes and areas are real, well-documented places. Fees, room
 * rates and meal costs are *typical 2025 estimates* for Indian travellers,
 * rounded, and are always presented to users as estimates — never as quotes.
 * Stays are described by type and area rather than invented business names.
 */
import type { Interest, Slot, StayTier } from "@/lib/agent/types";

export const GUIDE_PRICE_BASIS = "Typical 2025 prices for Indian travellers, rounded. Check before booking.";

export interface Attraction {
  id: string;
  name: string;
  interests: Interest[];
  lat: number;
  lng: number;
  hours: number;
  feePerPerson: number;
  slot: Slot | "any";
  blurb: string;
  /** 0-indexed months when this is available. Omitted = all year. */
  months?: number[];
  wikiTitle?: string;
}

export interface FoodSpot {
  name: string;
  description: string;
  costPerPerson: number;
}

export interface StayOption {
  tier: StayTier;
  name: string;
  area: string;
  /** Per room per night, two guests. */
  nightlyRate: number;
}

export interface DestinationGuide {
  id: string;
  tagline: string;
  /** 0–3: how well the destination serves each interest. */
  interestScores: Partial<Record<Interest, number>>;
  bestMonths: number[];
  /** Multiplier on food and local-transport costs (1 = national average). */
  costIndex: number;
  /** Road distance ÷ straight-line distance for the final approach. */
  roadFactor: number;
  seasonNotes: { months: number[]; note: string }[];
  attractions: Attraction[];
  food: FoodSpot[];
  stays: Record<StayTier, StayOption>;
}

const WINTER_SEASON = [9, 10, 11, 0, 1, 2];

export const GUIDES: Record<string, DestinationGuide> = {
  rishikesh: {
    id: "rishikesh",
    tagline: "Riverside yoga town at the foot of the Himalaya",
    interestScores: { nature: 3, spiritual: 3, adventure: 3, wellness: 3, food: 1, culture: 2 },
    bestMonths: [1, 2, 3, 8, 9, 10],
    costIndex: 0.9,
    roadFactor: 1.4,
    seasonNotes: [
      { months: [6, 7], note: "Monsoon: rafting is suspended and hill roads can close after heavy rain." },
      { months: [4, 5], note: "Hot afternoons — plan outdoor time for early mornings." },
    ],
    attractions: [
      { id: "rsk-jhula-walk", name: "Ram Jhula & Laxman Jhula walk", interests: ["culture", "spiritual"], lat: 30.1235, lng: 78.3155, hours: 2, feePerPerson: 0, slot: "morning", blurb: "Cross the suspension bridges and wander the ashram-lined riverbank.", wikiTitle: "Lakshman Jhula" },
      { id: "rsk-aarti", name: "Evening Ganga aarti at Triveni Ghat", interests: ["spiritual", "culture"], lat: 30.103, lng: 78.299, hours: 1.5, feePerPerson: 0, slot: "evening", blurb: "Lamps, chanting and floating diyas at the town's main ghat." },
      { id: "rsk-neergarh", name: "Neer Garh waterfall hike", interests: ["nature", "adventure"], lat: 30.133, lng: 78.344, hours: 3, feePerPerson: 30, slot: "morning", blurb: "A short forest trail to a series of cool pools." },
      { id: "rsk-rafting", name: "White-water rafting, Shivpuri to Rishikesh", interests: ["adventure", "nature"], lat: 30.14, lng: 78.39, hours: 3.5, feePerPerson: 700, slot: "morning", months: [0, 1, 2, 3, 4, 5, 8, 9, 10, 11], blurb: "A 16 km stretch of grade II–III rapids with licensed operators." },
      { id: "rsk-beatles", name: "Beatles Ashram (Chaurasi Kutia)", interests: ["history", "culture"], lat: 30.1136, lng: 78.313, hours: 2, feePerPerson: 150, slot: "afternoon", blurb: "The overgrown ashram where the Beatles stayed in 1968, now covered in murals.", wikiTitle: "Chaurasi Kutia" },
      { id: "rsk-yoga", name: "Drop-in yoga class in Tapovan", interests: ["wellness", "spiritual"], lat: 30.13, lng: 78.32, hours: 1.5, feePerPerson: 400, slot: "morning", blurb: "A gentle morning session at one of the many schools in the yoga capital." },
      { id: "rsk-rajaji", name: "Rajaji National Park jeep safari (Chilla)", interests: ["nature"], lat: 29.97, lng: 78.2, hours: 3.5, feePerPerson: 900, slot: "morning", months: [10, 11, 0, 1, 2, 3, 4, 5], blurb: "Elephants, deer and birdlife in the forests south of town.", wikiTitle: "Rajaji National Park" },
      { id: "rsk-kunjapuri", name: "Sunrise at Kunjapuri Temple", interests: ["nature", "spiritual"], lat: 30.2, lng: 78.315, hours: 3, feePerPerson: 0, slot: "morning", blurb: "A hilltop temple with a sweeping view of the snow peaks at dawn." },
      { id: "rsk-cafes", name: "Tapovan café trail", interests: ["food", "culture"], lat: 30.131, lng: 78.322, hours: 2, feePerPerson: 450, slot: "afternoon", blurb: "Riverside cafés serving everything from thalis to sourdough." },
    ],
    food: [
      { name: "Aloo puri breakfast near Swarg Ashram", description: "Spiced potatoes with fried bread, the classic pilgrim breakfast.", costPerPerson: 150 },
      { name: "Sattvic thali", description: "Simple vegetarian meal — Rishikesh is a vegetarian, alcohol-free town.", costPerPerson: 250 },
      { name: "Ganga-view café lunch", description: "Salads, bowls and wood-fired pizza with river views in Tapovan.", costPerPerson: 450 },
      { name: "Masala chai and pakoras by the ghat", description: "A roadside snack while the river goes by.", costPerPerson: 80 },
    ],
    stays: {
      budget: { tier: "budget", name: "Guesthouse private room", area: "Tapovan", nightlyRate: 1_500 },
      mid: { tier: "mid", name: "Riverside boutique hotel", area: "Laxman Jhula", nightlyRate: 3_500 },
      comfort: { tier: "comfort", name: "Ganga-view resort", area: "Tapovan", nightlyRate: 7_500 },
    },
  },

  manali: {
    id: "manali",
    tagline: "Pine forests, snow peaks and the Beas valley",
    interestScores: { nature: 3, adventure: 3, culture: 1, food: 1, history: 1, wellness: 1, spiritual: 1 },
    bestMonths: [2, 3, 4, 5, 8, 9],
    costIndex: 1.0,
    roadFactor: 1.6,
    seasonNotes: [
      { months: [6, 7], note: "Monsoon: landslides can close the highway — keep a buffer day." },
      { months: [11, 0, 1], note: "Snow season: some high passes close and temperatures drop below freezing." },
    ],
    attractions: [
      { id: "mnl-hadimba", name: "Hadimba Devi Temple & cedar forest", interests: ["history", "culture", "nature"], lat: 32.248, lng: 77.1817, hours: 1.5, feePerPerson: 0, slot: "morning", blurb: "A 16th-century wooden pagoda temple in a deodar grove.", wikiTitle: "Hidimba Devi Temple" },
      { id: "mnl-oldmanali", name: "Old Manali lanes and cafés", interests: ["culture", "food"], lat: 32.256, lng: 77.18, hours: 2.5, feePerPerson: 0, slot: "afternoon", blurb: "Stone houses, apple orchards and relaxed cafés above the Manalsu stream." },
      { id: "mnl-solang", name: "Solang Valley (ropeway or paragliding)", interests: ["adventure", "nature"], lat: 32.3166, lng: 77.157, hours: 4, feePerPerson: 1_200, slot: "morning", blurb: "Meadows and slopes for ropeway rides, paragliding or snow play in winter.", wikiTitle: "Solang Valley" },
      { id: "mnl-jogini", name: "Jogini Waterfall trek from Vashisht", interests: ["nature", "adventure"], lat: 32.269, lng: 77.195, hours: 3.5, feePerPerson: 0, slot: "morning", blurb: "An easy climb through orchards to a tall waterfall." },
      { id: "mnl-vashisht", name: "Vashisht hot springs & temple", interests: ["wellness", "spiritual"], lat: 32.267, lng: 77.188, hours: 1.5, feePerPerson: 0, slot: "afternoon", blurb: "Natural sulphur springs in a small stone temple complex." },
      { id: "mnl-mallroad", name: "Mall Road evening stroll", interests: ["culture", "food"], lat: 32.2396, lng: 77.1887, hours: 2, feePerPerson: 0, slot: "evening", blurb: "Shops, woollens and street snacks in the town centre." },
      { id: "mnl-naggar", name: "Naggar Castle & Roerich Art Gallery", interests: ["history", "culture"], lat: 32.11, lng: 77.17, hours: 3, feePerPerson: 100, slot: "afternoon", blurb: "A 15th-century castle and the Russian painter's hillside home.", wikiTitle: "Naggar Castle" },
      { id: "mnl-rafting", name: "Beas river rafting at Pirdi", interests: ["adventure"], lat: 32.0, lng: 77.13, hours: 2, feePerPerson: 600, slot: "afternoon", months: [2, 3, 4, 5, 8, 9], blurb: "A short, splashy run down the Beas near Kullu." },
      { id: "mnl-sissu", name: "Atal Tunnel drive to Sissu", interests: ["nature", "adventure"], lat: 32.48, lng: 77.125, hours: 6, feePerPerson: 0, slot: "morning", months: [3, 4, 5, 6, 7, 8, 9], blurb: "Through the 9 km tunnel into the stark Lahaul valley and its waterfall.", wikiTitle: "Atal Tunnel" },
    ],
    food: [
      { name: "Siddu with ghee", description: "Steamed Himachali wheat bun stuffed with walnuts or poppy seeds.", costPerPerson: 150 },
      { name: "Himachali dham", description: "A festive rice-and-lentil meal served on leaf plates.", costPerPerson: 300 },
      { name: "Grilled trout at a riverside café", description: "Locally farmed trout — Manali's signature dish.", costPerPerson: 600 },
      { name: "Apple pie and coffee in Old Manali", description: "Made with the valley's orchard apples.", costPerPerson: 250 },
    ],
    stays: {
      budget: { tier: "budget", name: "Homestay", area: "Old Manali", nightlyRate: 1_400 },
      mid: { tier: "mid", name: "Hotel near Mall Road", area: "Mall Road", nightlyRate: 3_200 },
      comfort: { tier: "comfort", name: "Mountain-view resort", area: "Hadimba Road", nightlyRate: 7_000 },
    },
  },

  jaipur: {
    id: "jaipur",
    tagline: "Forts, palaces and bazaars of the Pink City",
    interestScores: { history: 3, culture: 3, food: 2, spiritual: 1, nightlife: 1, nature: 0 },
    bestMonths: WINTER_SEASON,
    costIndex: 0.95,
    roadFactor: 1.3,
    seasonNotes: [{ months: [3, 4, 5], note: "Summer highs above 40°C — sightsee early and late." }],
    attractions: [
      { id: "jpr-amber", name: "Amber Fort", interests: ["history", "culture"], lat: 26.9855, lng: 75.8513, hours: 3, feePerPerson: 100, slot: "morning", blurb: "A hilltop fort-palace of mirrored halls and ramparts.", wikiTitle: "Amer Fort" },
      { id: "jpr-hawa", name: "Hawa Mahal", interests: ["history", "culture"], lat: 26.9239, lng: 75.8267, hours: 1, feePerPerson: 50, slot: "morning", blurb: "The honeycomb 'Palace of Winds' façade, best in morning light.", wikiTitle: "Hawa Mahal" },
      { id: "jpr-citypalace", name: "City Palace", interests: ["history", "culture"], lat: 26.9258, lng: 75.8237, hours: 2, feePerPerson: 300, slot: "afternoon", blurb: "The royal family's residence, courtyards and textile galleries.", wikiTitle: "City Palace, Jaipur" },
      { id: "jpr-jantar", name: "Jantar Mantar observatory", interests: ["history"], lat: 26.9248, lng: 75.8246, hours: 1, feePerPerson: 50, slot: "afternoon", blurb: "A UNESCO-listed set of 18th-century astronomical instruments.", wikiTitle: "Jantar Mantar, Jaipur" },
      { id: "jpr-nahargarh", name: "Sunset at Nahargarh Fort", interests: ["history", "nature"], lat: 26.9373, lng: 75.8155, hours: 2, feePerPerson: 50, slot: "evening", blurb: "The best view over the city as the lights come on.", wikiTitle: "Nahargarh Fort" },
      { id: "jpr-bazaar", name: "Johari & Bapu Bazaar walk", interests: ["culture"], lat: 26.92, lng: 75.827, hours: 2, feePerPerson: 0, slot: "evening", blurb: "Block-printed textiles, jewellery and juttis in the old city." },
      { id: "jpr-foodwalk", name: "Old-city food walk", interests: ["food", "culture"], lat: 26.922, lng: 75.82, hours: 2.5, feePerPerson: 600, slot: "evening", blurb: "Pyaaz kachori, lassi, ghevar and more with a local guide." },
      { id: "jpr-albert", name: "Albert Hall Museum", interests: ["history", "culture"], lat: 26.9116, lng: 75.8195, hours: 1.5, feePerPerson: 40, slot: "afternoon", blurb: "Indo-Saracenic museum with an Egyptian mummy and miniature paintings.", wikiTitle: "Albert Hall Museum" },
      { id: "jpr-pannameena", name: "Panna Meena ka Kund stepwell", interests: ["history"], lat: 26.9851, lng: 75.8547, hours: 0.75, feePerPerson: 0, slot: "morning", blurb: "A geometric stepwell a short walk from Amber Fort." },
      { id: "jpr-jalmahal", name: "Jal Mahal viewpoint", interests: ["history", "nature"], lat: 26.9535, lng: 75.8462, hours: 0.75, feePerPerson: 0, slot: "evening", blurb: "A palace floating in Man Sagar lake.", wikiTitle: "Jal Mahal" },
    ],
    food: [
      { name: "Pyaaz kachori breakfast", description: "Onion-stuffed fried pastry — Jaipur's favourite breakfast.", costPerPerson: 80 },
      { name: "Dal baati churma thali", description: "Baked wheat balls, lentils and sweet crumble.", costPerPerson: 400 },
      { name: "Lassi in a clay cup", description: "Thick, creamy lassi from an old-city lassi shop.", costPerPerson: 80 },
      { name: "Laal maas", description: "Fiery Rajasthani mutton curry.", costPerPerson: 500 },
    ],
    stays: {
      budget: { tier: "budget", name: "Heritage guesthouse", area: "Bani Park", nightlyRate: 1_600 },
      mid: { tier: "mid", name: "Haveli hotel", area: "Old city", nightlyRate: 3_800 },
      comfort: { tier: "comfort", name: "Heritage palace hotel", area: "Civil Lines", nightlyRate: 8_500 },
    },
  },

  udaipur: {
    id: "udaipur",
    tagline: "Lakes, palaces and rooftop sunsets",
    interestScores: { history: 3, culture: 3, nature: 2, food: 2, wellness: 1, nightlife: 1, spiritual: 1 },
    bestMonths: [8, ...WINTER_SEASON],
    costIndex: 1.0,
    roadFactor: 1.3,
    seasonNotes: [{ months: [3, 4, 5], note: "Hot and dry — lake levels may be low before the monsoon." }],
    attractions: [
      { id: "udr-citypalace", name: "City Palace, Udaipur", interests: ["history", "culture"], lat: 24.5764, lng: 73.6835, hours: 2.5, feePerPerson: 300, slot: "morning", blurb: "Rajasthan's largest palace complex, overlooking Lake Pichola.", wikiTitle: "City Palace, Udaipur" },
      { id: "udr-boat", name: "Sunset boat ride on Lake Pichola", interests: ["nature", "culture"], lat: 24.572, lng: 73.679, hours: 1, feePerPerson: 500, slot: "evening", blurb: "Glide past the Lake Palace and Jag Mandir as the sun sets.", wikiTitle: "Lake Pichola" },
      { id: "udr-jagdish", name: "Jagdish Temple", interests: ["history", "spiritual"], lat: 24.5794, lng: 73.6841, hours: 0.75, feePerPerson: 0, slot: "morning", blurb: "An intricately carved 17th-century temple in the old city.", wikiTitle: "Jagdish Temple" },
      { id: "udr-saheliyon", name: "Saheliyon ki Bari garden", interests: ["history", "nature"], lat: 24.603, lng: 73.686, hours: 1, feePerPerson: 50, slot: "any", blurb: "Fountains, lotus pools and marble pavilions.", wikiTitle: "Saheliyon-ki-Bari" },
      { id: "udr-sajjangarh", name: "Sajjangarh (Monsoon Palace)", interests: ["nature", "history"], lat: 24.593, lng: 73.642, hours: 2, feePerPerson: 350, slot: "evening", blurb: "A hilltop palace inside a wildlife sanctuary with sunset views.", wikiTitle: "Sajjan Garh Palace" },
      { id: "udr-dharohar", name: "Dharohar folk dance show, Bagore ki Haveli", interests: ["culture"], lat: 24.5799, lng: 73.6829, hours: 1, feePerPerson: 150, slot: "evening", blurb: "An evening of Rajasthani folk dance and puppetry.", wikiTitle: "Bagore ki Haveli" },
      { id: "udr-fatehsagar", name: "Fateh Sagar Lake promenade", interests: ["nature"], lat: 24.6, lng: 73.676, hours: 1.5, feePerPerson: 0, slot: "any", blurb: "A breezy lakeside walk with snack stalls.", wikiTitle: "Fateh Sagar Lake" },
      { id: "udr-cooking", name: "Rajasthani home cooking class", interests: ["food", "culture"], lat: 24.578, lng: 73.686, hours: 3, feePerPerson: 1_500, slot: "afternoon", blurb: "Cook dal, sabzi and rotis with a local family, then eat what you make." },
      { id: "udr-cars", name: "Vintage & Classic Car Museum", interests: ["history"], lat: 24.583, lng: 73.696, hours: 1, feePerPerson: 250, slot: "afternoon", blurb: "The royal family's car collection." },
    ],
    food: [
      { name: "Dal baati churma", description: "Rajasthan's signature comfort meal.", costPerPerson: 350 },
      { name: "Rooftop dinner with lake views", description: "Many old-city rooftops face Lake Pichola.", costPerPerson: 900 },
      { name: "Kachori and mirchi vada", description: "Spicy fried snacks near Surajpole.", costPerPerson: 80 },
      { name: "Malai ghevar", description: "A lacy, syrup-soaked sweet topped with cream.", costPerPerson: 100 },
    ],
    stays: {
      budget: { tier: "budget", name: "Lakeside guesthouse", area: "Lal Ghat", nightlyRate: 1_700 },
      mid: { tier: "mid", name: "Haveli hotel", area: "Gangaur Ghat", nightlyRate: 4_000 },
      comfort: { tier: "comfort", name: "Lake-view heritage hotel", area: "Lake Pichola", nightlyRate: 9_000 },
    },
  },

  varanasi: {
    id: "varanasi",
    tagline: "India's oldest living city on the banks of the Ganga",
    interestScores: { spiritual: 3, culture: 3, history: 2, food: 2, nature: 0 },
    bestMonths: WINTER_SEASON,
    costIndex: 0.85,
    roadFactor: 1.3,
    seasonNotes: [
      { months: [6, 7, 8], note: "Monsoon: the river rises and some ghats and boat rides close." },
      { months: [3, 4, 5], note: "Very hot — the ghats are best at sunrise and after dark." },
    ],
    attractions: [
      { id: "vns-aarti", name: "Ganga aarti at Dashashwamedh Ghat", interests: ["spiritual", "culture"], lat: 25.3068, lng: 83.0104, hours: 1.5, feePerPerson: 0, slot: "evening", blurb: "The city's grand nightly fire ceremony.", wikiTitle: "Dashashwamedh Ghat" },
      { id: "vns-boat", name: "Sunrise boat ride along the ghats", interests: ["spiritual", "culture", "nature"], lat: 25.3, lng: 83.01, hours: 1.5, feePerPerson: 300, slot: "morning", blurb: "Watch the city wake up from the river." },
      { id: "vns-kashi", name: "Kashi Vishwanath Temple corridor", interests: ["spiritual", "history"], lat: 25.3109, lng: 83.0107, hours: 2, feePerPerson: 0, slot: "morning", blurb: "One of the holiest Shiva temples, with its new riverside corridor.", wikiTitle: "Kashi Vishwanath Temple" },
      { id: "vns-sarnath", name: "Sarnath (Dhamek Stupa & museum)", interests: ["history", "spiritual"], lat: 25.3811, lng: 83.024, hours: 3, feePerPerson: 40, slot: "afternoon", blurb: "Where the Buddha gave his first sermon.", wikiTitle: "Sarnath" },
      { id: "vns-ghatwalk", name: "Ghat walk from Assi to Manikarnika", interests: ["culture", "history"], lat: 25.289, lng: 83.006, hours: 2.5, feePerPerson: 0, slot: "morning", blurb: "Eighty-odd ghats, each with its own story.", wikiTitle: "Ghats in Varanasi" },
      { id: "vns-bhu", name: "Bharat Kala Bhavan museum (BHU)", interests: ["history", "culture"], lat: 25.2677, lng: 82.9913, hours: 1.5, feePerPerson: 50, slot: "afternoon", blurb: "Miniature paintings and textiles on the university campus.", wikiTitle: "Bharat Kala Bhavan" },
      { id: "vns-ramnagar", name: "Ramnagar Fort", interests: ["history"], lat: 25.27, lng: 83.026, hours: 1.5, feePerPerson: 75, slot: "afternoon", blurb: "The Maharaja of Benares' riverside fort and museum.", wikiTitle: "Ramnagar Fort" },
      { id: "vns-foodwalk", name: "Old-city food walk", interests: ["food", "culture"], lat: 25.31, lng: 83.008, hours: 2, feePerPerson: 400, slot: "evening", blurb: "Kachori sabzi, tamatar chaat and kulhad lassi in the lanes." },
      { id: "vns-silk", name: "Banarasi silk weavers' lanes", interests: ["culture"], lat: 25.32, lng: 83.0, hours: 1.5, feePerPerson: 0, slot: "afternoon", blurb: "Watch handloom weavers at work on Banarasi saris." },
    ],
    food: [
      { name: "Kachori sabzi & jalebi", description: "The Banarasi breakfast.", costPerPerson: 100 },
      { name: "Tamatar chaat", description: "A tangy tomato chaat unique to the city.", costPerPerson: 80 },
      { name: "Kulhad lassi", description: "Thick lassi topped with malai.", costPerPerson: 80 },
      { name: "Baati chokha", description: "Roasted wheat balls with smoky mashed vegetables.", costPerPerson: 200 },
    ],
    stays: {
      budget: { tier: "budget", name: "Guesthouse", area: "Assi Ghat", nightlyRate: 1_300 },
      mid: { tier: "mid", name: "Ghat-side heritage hotel", area: "Dashashwamedh", nightlyRate: 3_500 },
      comfort: { tier: "comfort", name: "Riverside boutique hotel", area: "Assi Ghat", nightlyRate: 8_000 },
    },
  },

  amritsar: {
    id: "amritsar",
    tagline: "The Golden Temple and Punjab's best food",
    interestScores: { spiritual: 3, history: 3, food: 3, culture: 2 },
    bestMonths: [...WINTER_SEASON, 3],
    costIndex: 0.85,
    roadFactor: 1.25,
    seasonNotes: [{ months: [4, 5], note: "Summer heat above 40°C — sightsee early and after sunset." }],
    attractions: [
      { id: "asr-golden", name: "Golden Temple (Harmandir Sahib)", interests: ["spiritual", "history", "culture"], lat: 31.62, lng: 74.8765, hours: 2.5, feePerPerson: 0, slot: "morning", blurb: "The holiest Sikh shrine, shimmering over its sacred pool.", wikiTitle: "Golden Temple" },
      { id: "asr-jallianwala", name: "Jallianwala Bagh memorial", interests: ["history"], lat: 31.6207, lng: 74.88, hours: 1, feePerPerson: 0, slot: "morning", blurb: "Memorial to the 1919 massacre, steps from the temple.", wikiTitle: "Jallianwala Bagh" },
      { id: "asr-partition", name: "Partition Museum", interests: ["history", "culture"], lat: 31.6206, lng: 74.8751, hours: 2, feePerPerson: 20, slot: "afternoon", blurb: "Personal stories of the 1947 Partition in the old Town Hall.", wikiTitle: "Partition Museum" },
      { id: "asr-wagah", name: "Beating Retreat ceremony at Attari–Wagah", interests: ["culture", "history"], lat: 31.6047, lng: 74.5731, hours: 4, feePerPerson: 0, slot: "afternoon", blurb: "The theatrical daily border ceremony — arrive early for seats.", wikiTitle: "Wagah" },
      { id: "asr-kulchawalk", name: "Amritsari kulcha & lassi trail", interests: ["food"], lat: 31.625, lng: 74.875, hours: 2, feePerPerson: 400, slot: "morning", blurb: "Crisp stuffed kulchas, chole and glasses of lassi." },
      { id: "asr-gobindgarh", name: "Gobindgarh Fort evening show", interests: ["history", "culture"], lat: 31.631, lng: 74.862, hours: 2, feePerPerson: 200, slot: "evening", blurb: "An 18th-century fort with a light-and-sound show.", wikiTitle: "Gobindgarh Fort" },
      { id: "asr-heritage", name: "Heritage Street walk", interests: ["culture"], lat: 31.6215, lng: 74.877, hours: 1, feePerPerson: 0, slot: "evening", blurb: "The restored pedestrian approach to the temple." },
      { id: "asr-palki", name: "Golden Temple at night (Palki Sahib)", interests: ["spiritual"], lat: 31.62, lng: 74.8765, hours: 1.5, feePerPerson: 0, slot: "evening", blurb: "The nightly procession carrying the holy book to rest." },
    ],
    food: [
      { name: "Amritsari kulcha with chole", description: "Tandoor-baked stuffed bread with chickpeas and butter.", costPerPerson: 150 },
      { name: "Langar at the Golden Temple", description: "A free community meal served to everyone, every day.", costPerPerson: 0 },
      { name: "Amritsari fish fry", description: "Gram-flour battered river fish.", costPerPerson: 350 },
      { name: "Phirni", description: "Chilled ground-rice pudding in clay bowls.", costPerPerson: 60 },
    ],
    stays: {
      budget: { tier: "budget", name: "Guesthouse", area: "Near the Golden Temple", nightlyRate: 1_300 },
      mid: { tier: "mid", name: "Hotel", area: "Heritage Street", nightlyRate: 3_000 },
      comfort: { tier: "comfort", name: "Heritage-style hotel", area: "Queens Road", nightlyRate: 6_500 },
    },
  },

  goa: {
    id: "goa",
    tagline: "Beaches, Portuguese quarters and seafood shacks",
    interestScores: { beach: 3, nightlife: 3, food: 3, culture: 2, history: 2, nature: 2, adventure: 2, wellness: 1, spiritual: 1 },
    bestMonths: [10, 11, 0, 1, 2],
    costIndex: 1.2,
    roadFactor: 1.3,
    seasonNotes: [
      { months: [5, 6, 7, 8], note: "Monsoon: rough seas, swimming is unsafe and many beach shacks close." },
      { months: [11, 0], note: "Peak season — prices run higher around Christmas and New Year." },
    ],
    attractions: [
      { id: "goa-oldgoa", name: "Basilica of Bom Jesus & Old Goa churches", interests: ["history", "culture", "spiritual"], lat: 15.5009, lng: 73.9116, hours: 2, feePerPerson: 0, slot: "morning", blurb: "UNESCO-listed 16th-century churches of the Portuguese capital.", wikiTitle: "Basilica of Bom Jesus" },
      { id: "goa-fontainhas", name: "Fontainhas Latin Quarter walk", interests: ["culture", "history"], lat: 15.498, lng: 73.833, hours: 2, feePerPerson: 0, slot: "afternoon", blurb: "Pastel houses, balconies and bakeries in old Panaji.", wikiTitle: "Fontainhas" },
      { id: "goa-aguada", name: "Fort Aguada", interests: ["history", "nature"], lat: 15.492, lng: 73.773, hours: 1.5, feePerPerson: 25, slot: "afternoon", blurb: "A 17th-century Portuguese fort and lighthouse above the sea.", wikiTitle: "Fort Aguada" },
      { id: "goa-baga", name: "Calangute–Baga beach afternoon", interests: ["beach"], lat: 15.555, lng: 73.751, hours: 3, feePerPerson: 0, slot: "afternoon", blurb: "North Goa's liveliest stretch of sand.", wikiTitle: "Baga, Goa" },
      { id: "goa-anjuna", name: "Anjuna beach & flea market", interests: ["culture", "beach"], lat: 15.5738, lng: 73.7409, hours: 2, feePerPerson: 0, slot: "afternoon", blurb: "Rocky coves and, on Wednesdays in season, the famous flea market.", wikiTitle: "Anjuna" },
      { id: "goa-dudhsagar", name: "Dudhsagar Falls jeep trip", interests: ["nature", "adventure"], lat: 15.3144, lng: 74.3143, hours: 7, feePerPerson: 900, slot: "morning", months: [9, 10, 11, 0, 1, 2, 3, 4], blurb: "A four-tiered waterfall deep in the Western Ghats.", wikiTitle: "Dudhsagar Falls" },
      { id: "goa-watersports", name: "Water sports at Baga", interests: ["adventure", "beach"], lat: 15.56, lng: 73.752, hours: 2, feePerPerson: 1_500, slot: "morning", months: [9, 10, 11, 0, 1, 2, 3, 4], blurb: "Parasailing, jet-skis and banana boats." },
      { id: "goa-spice", name: "Spice plantation tour & lunch, Ponda", interests: ["nature", "food"], lat: 15.4, lng: 74.01, hours: 3.5, feePerPerson: 800, slot: "morning", blurb: "Walk through pepper and cardamom groves, then a buffet lunch." },
      { id: "goa-titos", name: "Tito's Lane nightlife, Baga", interests: ["nightlife"], lat: 15.557, lng: 73.754, hours: 3, feePerPerson: 1_500, slot: "evening", blurb: "Goa's best-known strip of clubs and bars." },
      { id: "goa-chapora", name: "Chapora Fort sunset", interests: ["history", "nature", "beach"], lat: 15.606, lng: 73.736, hours: 1.5, feePerPerson: 0, slot: "evening", blurb: "Crumbling fort walls above Vagator beach.", wikiTitle: "Chapora Fort" },
    ],
    food: [
      { name: "Fish curry rice thali", description: "Goa's everyday meal, with kokum-tangy curry.", costPerPerson: 300 },
      { name: "Pork vindaloo or chicken xacuti", description: "Classic Goan-Portuguese curries.", costPerPerson: 450 },
      { name: "Bebinca", description: "A layered coconut-and-egg dessert.", costPerPerson: 120 },
      { name: "Beach-shack seafood dinner", description: "Catch of the day, grilled or rechado-masala fried.", costPerPerson: 900 },
    ],
    stays: {
      budget: { tier: "budget", name: "Guesthouse", area: "Calangute", nightlyRate: 1_800 },
      mid: { tier: "mid", name: "Boutique hotel", area: "Candolim", nightlyRate: 4_500 },
      comfort: { tier: "comfort", name: "Beach resort", area: "North Goa", nightlyRate: 10_000 },
    },
  },

  munnar: {
    id: "munnar",
    tagline: "Rolling tea estates in the Western Ghats",
    interestScores: { nature: 3, wellness: 2, adventure: 2, food: 1, culture: 1, history: 1 },
    bestMonths: [8, 9, 10, 11, 0, 1, 2, 3, 4],
    costIndex: 1.0,
    roadFactor: 1.6,
    seasonNotes: [
      { months: [5, 6, 7], note: "Heavy monsoon rain — beautiful, but expect washed-out treks and road delays." },
      { months: [1, 2], note: "Eravikulam National Park usually closes for the Nilgiri tahr calving season." },
    ],
    attractions: [
      { id: "mnr-teamuseum", name: "Tata Tea Museum", interests: ["history", "culture"], lat: 10.096, lng: 77.059, hours: 1.5, feePerPerson: 150, slot: "afternoon", blurb: "How the high ranges became tea country, with a factory demonstration." },
      { id: "mnr-eravikulam", name: "Eravikulam National Park", interests: ["nature"], lat: 10.19, lng: 77.07, hours: 3, feePerPerson: 200, slot: "morning", months: [0, 3, 4, 5, 6, 7, 8, 9, 10, 11], blurb: "Grassland slopes home to the endangered Nilgiri tahr.", wikiTitle: "Eravikulam National Park" },
      { id: "mnr-mattupetty", name: "Mattupetty Dam & Echo Point", interests: ["nature"], lat: 10.106, lng: 77.123, hours: 2, feePerPerson: 50, slot: "afternoon", blurb: "A reservoir ringed by tea slopes, with boating.", wikiTitle: "Mattupetty Dam" },
      { id: "mnr-topstation", name: "Top Station viewpoint", interests: ["nature"], lat: 10.127, lng: 77.24, hours: 3, feePerPerson: 0, slot: "morning", blurb: "Views over the Tamil Nadu plains from the edge of the ghats.", wikiTitle: "Top Station" },
      { id: "mnr-teawalk", name: "Guided tea estate walk", interests: ["nature", "culture"], lat: 10.08, lng: 77.06, hours: 2, feePerPerson: 500, slot: "morning", blurb: "Walk the estate paths with a plucker's-eye view of tea." },
      { id: "mnr-attukad", name: "Attukad Waterfalls", interests: ["nature"], lat: 10.06, lng: 77.04, hours: 1.5, feePerPerson: 0, slot: "any", blurb: "A cascade in a forested valley, fullest after the rains." },
      { id: "mnr-kathakali", name: "Kathakali & Kalaripayattu show", interests: ["culture"], lat: 10.088, lng: 77.062, hours: 1.5, feePerPerson: 350, slot: "evening", blurb: "Kerala's classical dance-drama and martial art." },
      { id: "mnr-spice", name: "Spice garden tour", interests: ["nature", "food"], lat: 10.05, lng: 77.07, hours: 1.5, feePerPerson: 150, slot: "afternoon", blurb: "Cardamom, pepper and vanilla growing on the vine." },
      { id: "mnr-ayurveda", name: "Ayurvedic massage", interests: ["wellness"], lat: 10.089, lng: 77.06, hours: 1.5, feePerPerson: 1_500, slot: "afternoon", blurb: "A traditional oil massage at a licensed centre." },
      { id: "mnr-kolukkumalai", name: "Sunrise jeep to Kolukkumalai", interests: ["nature", "adventure"], lat: 10.07, lng: 77.23, hours: 5, feePerPerson: 1_200, slot: "morning", blurb: "Off-road ride to one of the world's highest tea estates." },
    ],
    food: [
      { name: "Kerala meals on a banana leaf", description: "Rice with sambar, avial, thoran and pickles.", costPerPerson: 200 },
      { name: "Appam with vegetable stew", description: "Lacy rice pancakes with coconut-milk stew.", costPerPerson: 180 },
      { name: "Puttu and kadala curry", description: "Steamed rice cylinders with black chickpea curry.", costPerPerson: 120 },
      { name: "Fresh estate tea", description: "Tea straight from the estates, often with cardamom.", costPerPerson: 50 },
    ],
    stays: {
      budget: { tier: "budget", name: "Homestay", area: "Munnar town", nightlyRate: 1_500 },
      mid: { tier: "mid", name: "Tea-estate view hotel", area: "Pallivasal", nightlyRate: 3_800 },
      comfort: { tier: "comfort", name: "Plantation resort", area: "Chithirapuram", nightlyRate: 8_500 },
    },
  },

  darjeeling: {
    id: "darjeeling",
    tagline: "Tea gardens with Kanchenjunga on the horizon",
    interestScores: { nature: 3, culture: 2, history: 2, food: 2, spiritual: 2, adventure: 1 },
    bestMonths: [2, 3, 4, 9, 10],
    costIndex: 0.95,
    roadFactor: 1.6,
    seasonNotes: [
      { months: [5, 6, 7, 8], note: "Monsoon clouds usually hide the mountains and roads see landslides." },
      { months: [11, 0, 1], note: "Cold but clear — the best mountain views, with chilly nights." },
    ],
    attractions: [
      { id: "djl-tigerhill", name: "Sunrise over Kanchenjunga from Tiger Hill", interests: ["nature"], lat: 26.999, lng: 88.283, hours: 3, feePerPerson: 50, slot: "morning", blurb: "The classic dawn view of the world's third-highest peak.", wikiTitle: "Tiger Hill, Darjeeling" },
      { id: "djl-batasia", name: "Batasia Loop & war memorial", interests: ["history", "nature"], lat: 27.015, lng: 88.247, hours: 1, feePerPerson: 20, slot: "morning", blurb: "A spiral of toy-train track with gardens and mountain views.", wikiTitle: "Batasia Loop" },
      { id: "djl-toytrain", name: "Toy train joy ride", interests: ["history", "culture"], lat: 27.04, lng: 88.264, hours: 2, feePerPerson: 1_500, slot: "afternoon", blurb: "A UNESCO-listed steam or diesel ride to Ghum and back.", wikiTitle: "Darjeeling Himalayan Railway" },
      { id: "djl-happyvalley", name: "Happy Valley Tea Estate tour", interests: ["nature", "food", "culture"], lat: 27.054, lng: 88.261, hours: 1.5, feePerPerson: 200, slot: "morning", blurb: "See how Darjeeling tea is plucked, withered and rolled." },
      { id: "djl-hmi", name: "Himalayan Mountaineering Institute & zoo", interests: ["history", "nature"], lat: 27.058, lng: 88.253, hours: 2.5, feePerPerson: 100, slot: "afternoon", blurb: "Everest expedition history and red pandas next door.", wikiTitle: "Himalayan Mountaineering Institute" },
      { id: "djl-mall", name: "Chowrasta & Mall Road walk", interests: ["culture", "food"], lat: 27.044, lng: 88.266, hours: 1.5, feePerPerson: 0, slot: "evening", blurb: "The town square, bookshops and tea houses." },
      { id: "djl-pagoda", name: "Japanese Peace Pagoda", interests: ["spiritual"], lat: 27.03, lng: 88.27, hours: 1, feePerPerson: 0, slot: "any", blurb: "A white stupa on a quiet hillside." },
      { id: "djl-ghoom", name: "Ghoom Monastery", interests: ["spiritual", "history"], lat: 27.01, lng: 88.25, hours: 1, feePerPerson: 0, slot: "morning", blurb: "A 19th-century monastery with a large Maitreya Buddha.", wikiTitle: "Ghum Monastery" },
      { id: "djl-ropeway", name: "Darjeeling ropeway", interests: ["nature", "adventure"], lat: 27.063, lng: 88.254, hours: 1.5, feePerPerson: 250, slot: "afternoon", blurb: "A cable-car ride over the tea gardens of the Rangeet valley." },
    ],
    food: [
      { name: "Momos and thukpa", description: "Himalayan dumplings and noodle soup.", costPerPerson: 200 },
      { name: "Tea tasting on Mall Road", description: "First- and second-flush Darjeeling teas side by side.", costPerPerson: 250 },
      { name: "Breakfast at a colonial-era bakery", description: "Darjeeling's old bakeries and tea rooms are an institution.", costPerPerson: 400 },
      { name: "Shaphaley", description: "Tibetan fried bread stuffed with meat or vegetables.", costPerPerson: 100 },
    ],
    stays: {
      budget: { tier: "budget", name: "Guesthouse", area: "Near Chowrasta", nightlyRate: 1_500 },
      mid: { tier: "mid", name: "Mountain-view hotel", area: "Off Mall Road", nightlyRate: 3_500 },
      comfort: { tier: "comfort", name: "Heritage hotel with Kanchenjunga views", area: "Mall Road", nightlyRate: 8_000 },
    },
  },

  coorg: {
    id: "coorg",
    tagline: "Coffee estates and misty hills in Karnataka",
    interestScores: { nature: 3, food: 2, adventure: 2, wellness: 2, culture: 1, history: 1, spiritual: 1 },
    bestMonths: [9, 10, 11, 0, 1, 2, 3, 4],
    costIndex: 1.1,
    roadFactor: 1.5,
    seasonNotes: [{ months: [5, 6, 7, 8], note: "Monsoon: lush and dramatic, but leeches on trails and heavy rain." }],
    attractions: [
      { id: "crg-abbey", name: "Abbey Falls", interests: ["nature"], lat: 12.455, lng: 75.719, hours: 1.5, feePerPerson: 30, slot: "morning", blurb: "A waterfall tucked between coffee and spice plantations.", wikiTitle: "Abbey Falls" },
      { id: "crg-rajaseat", name: "Raja's Seat sunset", interests: ["nature", "history"], lat: 12.418, lng: 75.737, hours: 1, feePerPerson: 20, slot: "evening", blurb: "The Kodava kings' favourite viewpoint over the valleys." },
      { id: "crg-fort", name: "Madikeri Fort", interests: ["history"], lat: 12.421, lng: 75.739, hours: 1, feePerPerson: 0, slot: "afternoon", blurb: "A 17th-century fort with a small museum.", wikiTitle: "Madikeri Fort" },
      { id: "crg-dubare", name: "Dubare Elephant Camp", interests: ["nature"], lat: 12.367, lng: 75.9, hours: 3, feePerPerson: 300, slot: "morning", blurb: "Watch elephants bathe in the Kaveri river." },
      { id: "crg-namdroling", name: "Namdroling Monastery, Bylakuppe", interests: ["spiritual", "culture"], lat: 12.43, lng: 75.966, hours: 2, feePerPerson: 0, slot: "afternoon", blurb: "A vast Tibetan monastery with golden Buddha statues.", wikiTitle: "Namdroling Monastery" },
      { id: "crg-coffee", name: "Coffee plantation walk & tasting", interests: ["nature", "food"], lat: 12.4, lng: 75.75, hours: 2, feePerPerson: 500, slot: "morning", blurb: "From cherry to cup on a working estate." },
      { id: "crg-mandalpatti", name: "Mandalpatti jeep ride", interests: ["nature", "adventure"], lat: 12.536, lng: 75.705, hours: 4, feePerPerson: 800, slot: "morning", blurb: "Off-road climb to a grassy ridge above the clouds." },
      { id: "crg-barapole", name: "Barapole river rafting", interests: ["adventure"], lat: 12.11, lng: 75.82, hours: 3, feePerPerson: 1_600, slot: "morning", months: [5, 6, 7, 8], blurb: "Monsoon-fed rapids through rainforest." },
      { id: "crg-talakaveri", name: "Talakaveri & Bhagamandala", interests: ["spiritual", "nature"], lat: 12.386, lng: 75.49, hours: 4, feePerPerson: 0, slot: "morning", blurb: "The source of the Kaveri, high in the Brahmagiri hills.", wikiTitle: "Talakaveri" },
    ],
    food: [
      { name: "Pandi curry with kadambuttu", description: "Kodava pork curry with steamed rice balls.", costPerPerson: 400 },
      { name: "Estate-grown filter coffee", description: "Coorg grows much of India's coffee.", costPerPerson: 60 },
      { name: "Akki roti", description: "Rice-flour flatbread with chutney.", costPerPerson: 100 },
      { name: "Bamboo shoot curry", description: "A seasonal Kodava speciality.", costPerPerson: 250 },
    ],
    stays: {
      budget: { tier: "budget", name: "Coffee-estate homestay", area: "Near Madikeri", nightlyRate: 1_800 },
      mid: { tier: "mid", name: "Plantation cottage", area: "Madikeri outskirts", nightlyRate: 4_200 },
      comfort: { tier: "comfort", name: "Rainforest resort", area: "Coorg hills", nightlyRate: 11_000 },
    },
  },

  pondicherry: {
    id: "pondicherry",
    tagline: "French Quarter lanes on the Bay of Bengal",
    interestScores: { culture: 3, food: 3, beach: 2, history: 2, spiritual: 2, wellness: 2, nightlife: 1, nature: 1, adventure: 1 },
    bestMonths: WINTER_SEASON,
    costIndex: 1.05,
    roadFactor: 1.3,
    seasonNotes: [
      { months: [9, 10], note: "North-east monsoon: expect heavy showers and occasional cyclone alerts." },
      { months: [3, 4, 5], note: "Hot and humid — plan beach time for early morning." },
    ],
    attractions: [
      { id: "pdy-whitetown", name: "White Town heritage walk", interests: ["history", "culture"], lat: 11.934, lng: 79.834, hours: 2, feePerPerson: 0, slot: "morning", blurb: "Mustard-yellow villas and bougainvillea in the French Quarter.", wikiTitle: "White Town, Pondicherry" },
      { id: "pdy-promenade", name: "Promenade Beach sunrise", interests: ["beach", "nature"], lat: 11.931, lng: 79.835, hours: 1, feePerPerson: 0, slot: "morning", blurb: "A seafront walk as the sun rises over the Bay of Bengal.", wikiTitle: "Promenade Beach" },
      { id: "pdy-auroville", name: "Auroville & Matrimandir viewing point", interests: ["spiritual", "culture"], lat: 12.007, lng: 79.811, hours: 3, feePerPerson: 0, slot: "morning", blurb: "The experimental township and its golden meditation dome.", wikiTitle: "Auroville" },
      { id: "pdy-ashram", name: "Sri Aurobindo Ashram", interests: ["spiritual"], lat: 11.936, lng: 79.834, hours: 1, feePerPerson: 0, slot: "morning", blurb: "A quiet courtyard around the founders' samadhi.", wikiTitle: "Sri Aurobindo Ashram" },
      { id: "pdy-paradise", name: "Paradise Beach via Chunnambar boat", interests: ["beach", "nature"], lat: 11.892, lng: 79.829, hours: 4, feePerPerson: 400, slot: "afternoon", blurb: "A backwater boat ride to a sandbar beach." },
      { id: "pdy-surf", name: "Surfing lesson at Serenity Beach", interests: ["adventure", "beach"], lat: 11.969, lng: 79.84, hours: 2, feePerPerson: 1_500, slot: "morning", blurb: "Beginner-friendly waves with local surf schools." },
      { id: "pdy-museum", name: "Pondicherry Museum", interests: ["history"], lat: 11.933, lng: 79.833, hours: 1, feePerPerson: 20, slot: "afternoon", blurb: "Roman-era finds from Arikamedu and French colonial pieces." },
      { id: "pdy-cafes", name: "French Quarter café and bakery trail", interests: ["food", "culture"], lat: 11.935, lng: 79.832, hours: 2, feePerPerson: 600, slot: "afternoon", blurb: "Croissants, crêpes and filter coffee in colonial villas." },
      { id: "pdy-basilica", name: "Basilica of the Sacred Heart", interests: ["history", "spiritual"], lat: 11.929, lng: 79.83, hours: 0.75, feePerPerson: 0, slot: "evening", blurb: "A Gothic-revival church with stained-glass windows.", wikiTitle: "Basilica of the Sacred Heart of Jesus, Puducherry" },
    ],
    food: [
      { name: "Franco-Tamil Creole dinner", description: "Dishes that blend French technique with Tamil spice.", costPerPerson: 800 },
      { name: "Filter coffee and croissant", description: "Pondicherry's bakeries keep French traditions alive.", costPerPerson: 250 },
      { name: "Seafood at a beach café", description: "Prawns and fish fry near the promenade.", costPerPerson: 600 },
      { name: "South Indian breakfast", description: "Idli, dosa and pongal at a Tamil Quarter mess.", costPerPerson: 120 },
    ],
    stays: {
      budget: { tier: "budget", name: "Guesthouse", area: "Tamil Quarter", nightlyRate: 1_600 },
      mid: { tier: "mid", name: "Heritage villa hotel", area: "White Town", nightlyRate: 4_200 },
      comfort: { tier: "comfort", name: "Boutique heritage hotel", area: "French Quarter", nightlyRate: 8_500 },
    },
  },

  hampi: {
    id: "hampi",
    tagline: "Boulder-strewn ruins of the Vijayanagara empire",
    interestScores: { history: 3, culture: 2, nature: 2, adventure: 2, spiritual: 2, food: 1 },
    bestMonths: WINTER_SEASON,
    costIndex: 0.8,
    roadFactor: 1.35,
    seasonNotes: [{ months: [3, 4, 5], note: "Scorching heat among the rocks — explore at dawn and dusk." }],
    attractions: [
      { id: "hmp-virupaksha", name: "Virupaksha Temple", interests: ["history", "spiritual"], lat: 15.335, lng: 76.46, hours: 1.5, feePerPerson: 0, slot: "morning", blurb: "A working temple older than the empire itself.", wikiTitle: "Virupaksha Temple, Hampi" },
      { id: "hmp-vittala", name: "Vittala Temple & stone chariot", interests: ["history"], lat: 15.343, lng: 76.475, hours: 2, feePerPerson: 40, slot: "morning", blurb: "Musical pillars and the iconic stone chariot.", wikiTitle: "Vittala Temple" },
      { id: "hmp-matanga", name: "Sunrise from Matanga Hill", interests: ["nature", "adventure"], lat: 15.338, lng: 76.464, hours: 2.5, feePerPerson: 0, slot: "morning", blurb: "A scramble up for the best sunrise over the ruins." },
      { id: "hmp-hemakuta", name: "Hemakuta Hill sunset", interests: ["nature", "history"], lat: 15.334, lng: 76.458, hours: 1, feePerPerson: 0, slot: "evening", blurb: "Small temples on granite slabs, glowing at dusk." },
      { id: "hmp-royal", name: "Royal Enclosure, Lotus Mahal & Elephant Stables", interests: ["history"], lat: 15.319, lng: 76.47, hours: 2.5, feePerPerson: 40, slot: "afternoon", blurb: "The palace quarter of the Vijayanagara kings.", wikiTitle: "Lotus Mahal" },
      { id: "hmp-coracle", name: "Coracle ride on the Tungabhadra", interests: ["nature", "adventure"], lat: 15.338, lng: 76.47, hours: 1, feePerPerson: 300, slot: "afternoon", months: [9, 10, 11, 0, 1, 2, 3, 4], blurb: "Spin down the river in a round bamboo boat." },
      { id: "hmp-anegundi", name: "Anegundi village & Anjanadri Hill", interests: ["spiritual", "nature", "culture"], lat: 15.35, lng: 76.49, hours: 3, feePerPerson: 0, slot: "afternoon", blurb: "Village life across the river and a 575-step temple climb." },
      { id: "hmp-bouldering", name: "Guided bouldering session", interests: ["adventure"], lat: 15.345, lng: 76.455, hours: 2.5, feePerPerson: 1_200, slot: "morning", blurb: "Hampi is one of the world's great bouldering spots." },
      { id: "hmp-museum", name: "Archaeological Museum, Kamalapura", interests: ["history"], lat: 15.313, lng: 76.475, hours: 1, feePerPerson: 20, slot: "afternoon", blurb: "Sculptures and a scale model of the old city." },
      { id: "hmp-bazaar", name: "Hampi Bazaar stroll", interests: ["culture"], lat: 15.3355, lng: 76.462, hours: 1, feePerPerson: 0, slot: "evening", blurb: "The long colonnaded market street facing Virupaksha." },
    ],
    food: [
      { name: "Thali at a riverside café", description: "Unlimited South Indian thali with a view of the boulders.", costPerPerson: 200 },
      { name: "Banana pancakes and chai", description: "A backpacker-café staple.", costPerPerson: 150 },
      { name: "Jolada rotti meal", description: "North Karnataka sorghum flatbread with curries.", costPerPerson: 180 },
    ],
    stays: {
      budget: { tier: "budget", name: "Guesthouse", area: "Hampi Bazaar", nightlyRate: 1_200 },
      mid: { tier: "mid", name: "Boutique stay", area: "Kamalapura", nightlyRate: 3_000 },
      comfort: { tier: "comfort", name: "Heritage resort", area: "Kamalapura", nightlyRate: 8_000 },
    },
  },
};

export function getGuide(id: string): DestinationGuide {
  const guide = GUIDES[id];
  if (!guide) throw new Error(`No guide for destination: ${id}`);
  return guide;
}
